import asyncio
import base64
import json

import httpx
import pytest
from fastapi.testclient import TestClient

from backend import ai
from backend.main import create_app


@pytest.fixture(autouse=True)
def configured(monkeypatch):
    for name, value in {"BASE_URL":"https://model.example/v1", "MODEL":"vision-model",
                        "API_KEY":"unit-test-key", "ACCESS_TOKEN":"unit-access",
                        "ALLOWED_ORIGINS":"https://pqre.github.io", "RESPONSE_FORMAT":"json_object"}.items():
        monkeypatch.setenv("TRACKER_AI_"+name, value)
    ai._recent.clear()


@pytest.fixture
def client():
    with TestClient(ai.create_ai_app(), base_url="http://127.0.0.1", client=("127.0.0.1", 50000)) as c:
        c.headers["Authorization"] = "Bearer unit-access"
        yield c


def draft(**changes):
    return {"study_date":None,"minutes":None,"topic":"Vue组件通信","takeaway":None,
            "next_step":None,"warnings":["材料没有明确学习时长，请核对。"]} | changes


def mock_model(monkeypatch, content):
    calls=[]
    async def fake(config,messages,schema=None):
        calls.append((config,messages,schema))
        return content if isinstance(content,str) else json.dumps(content,ensure_ascii=False)
    monkeypatch.setattr(ai,"completion",fake)
    return calls


def test_status_never_exposes_provider_secrets(client):
    response=client.get("/api/ai/status")
    assert response.json()=={"configured":True,"token_required":True}
    assert "unit-" not in response.text and "model.example" not in response.text
    assert response.headers["cache-control"]=="no-store"


def test_extract_is_preview_only_and_preserves_unknowns(client,monkeypatch):
    calls=mock_model(monkeypatch,draft())
    response=client.post("/api/ai/extract",json={"text":"学习了Vue的props和emit"})
    assert response.status_code==200
    assert response.json()["minutes"] is None
    assert response.json()["takeaway"] is None
    assert calls[0][1][-1]["content"][0]["text"]=="学习了Vue的props和emit"
    assert client.get("/api/records").status_code==404  # AI-only service exposes no database API.


def test_extract_sends_image_content_to_vision_model(client,monkeypatch):
    calls=mock_model(monkeypatch,draft())
    image="data:image/png;base64,"+base64.b64encode(b"\x89PNG\r\n\x1a\nimage-fixture").decode()
    response=client.post("/api/ai/extract",json={"images":[image]})
    assert response.status_code==200
    assert calls[0][1][-1]["content"][1]=={"type":"image_url","image_url":{"url":image}}


@pytest.mark.parametrize("body",[{}, {"text":" "}, {"images":["https://remote.test/photo.png"]},
    {"images":["data:image/png;base64,SGVsbG8="]}, {"text":"x"*12001},
    {"text":"notes","api_key":"do-not-accept-client-keys"}])
def test_invalid_material_never_calls_provider(client,monkeypatch,body):
    calls=mock_model(monkeypatch,draft())
    response=client.post("/api/ai/extract",json=body)
    assert response.status_code==422 and not calls
    assert "do-not-accept-client-keys" not in response.text


@pytest.mark.parametrize("result",[draft(minutes=1.5),draft(minutes=True),draft(minutes=0),
                                  draft(topic="x"*121),{"topic":"missing fields"}])
def test_invalid_model_output_is_not_applied(client,monkeypatch,result):
    mock_model(monkeypatch,result)
    assert client.post("/api/ai/extract",json={"text":"学习笔记"}).status_code==502


def test_future_date_is_flagged_without_fabricating_replacement(client,monkeypatch):
    mock_model(monkeypatch,draft(study_date="9999-01-01"))
    result=client.post("/api/ai/extract",json={"text":"笔记"}).json()
    assert result["study_date"] is None
    assert "晚于今天" in result["warnings"][-1]


def test_chat_passes_bounded_evidence_and_returns_sources(client,monkeypatch):
    calls=mock_model(monkeypatch,"根据[2026-10-20 · 接口设计]，我们可以先复习状态码。")
    evidence={"id":7,"study_date":"2026-10-20","topic":"接口设计","takeaway":"409表示业务冲突","next_step":"补充边界测试"}
    response=client.post("/api/ai/chat",json={"question":"帮我复习接口设计","records":[evidence],
        "history":[{"role":"user","content":"我想复习"}]})
    assert response.status_code==200
    assert response.json()["sources"]==[{"id":7,"study_date":"2026-10-20","topic":"接口设计"}]
    assert "409表示业务冲突" in calls[0][1][1]["content"]
    assert calls[0][1][-1]["content"]=="帮我复习接口设计"


def test_cors_is_ai_only_and_never_relaxes_record_writes(tmp_path,monkeypatch):
    mock_model(monkeypatch,draft())
    with TestClient(create_app(tmp_path/"db.sqlite")) as c:
        headers={"Origin":"https://pqre.github.io","Authorization":"Bearer unit-access"}
        response=c.post("/api/ai/extract",json={"text":"笔记"},headers=headers)
        assert response.status_code==200
        assert response.headers["access-control-allow-origin"]==headers["Origin"]
        assert c.post("/api/plans",json={},headers=headers).status_code==403
        assert c.post("/api/ai/extract",json={"text":"笔记"},headers=headers|{"Origin":"https://evil.test"}).status_code==403


def test_auth_config_and_rate_failures(client,monkeypatch):
    calls=mock_model(monkeypatch,draft())
    assert client.post("/api/ai/extract",json={"text":"x"},headers={"Authorization":"Bearer wrong"}).status_code==401
    monkeypatch.setenv("TRACKER_AI_API_KEY","")
    assert client.post("/api/ai/extract",json={"text":"x"}).status_code==503
    monkeypatch.setenv("TRACKER_AI_API_KEY","unit-test-key")
    for _ in range(12):
        assert client.post("/api/ai/extract",json={"text":"x"}).status_code==200
    assert client.post("/api/ai/extract",json={"text":"x"}).status_code==429
    assert len(calls)==12


def test_remote_gateway_cannot_run_without_access_token(monkeypatch):
    monkeypatch.setenv("TRACKER_AI_ACCESS_TOKEN","")
    with TestClient(ai.create_ai_app(),base_url="https://service.test",client=("203.0.113.1",50000)) as c:
        assert c.post("/api/ai/extract",json={"text":"x"}).status_code==503


def test_status_rejects_incorrect_connection_token(client):
    assert client.get("/api/ai/status",headers={"Authorization":"Bearer incorrect"}).status_code==401


def test_body_limit_and_chat_count_are_enforced(client,monkeypatch):
    calls=mock_model(monkeypatch,draft())
    monkeypatch.setattr(ai,"BODY_LIMIT",128)
    assert client.post("/api/ai/extract",json={"text":"x"*200}).status_code==413
    monkeypatch.setattr(ai,"BODY_LIMIT",1024*1024)
    record={"id":1,"study_date":"2026-10-20","topic":"接口","takeaway":"收获"}
    assert client.post("/api/ai/chat",json={"question":"复习","records":[record]*7}).status_code==422
    assert not calls


def test_provider_request_and_redacted_error_handling(monkeypatch):
    original_client=httpx.AsyncClient
    captured=[]
    def handle(request):
        captured.append(request)
        return httpx.Response(200,json={"choices":[{"message":{"content":"test answer"},"finish_reason":"stop"}]})
    monkeypatch.setattr(ai.httpx,"AsyncClient",lambda **kw: original_client(transport=httpx.MockTransport(handle),**kw))
    result=asyncio.run(ai.completion(ai.settings(),[{"role":"user","content":"notes"}],ai.Draft.model_json_schema()))
    assert result=="test answer"
    assert str(captured[0].url)=="https://model.example/v1/chat/completions"
    assert captured[0].headers["authorization"]=="Bearer unit-test-key"
    assert json.loads(captured[0].content)["response_format"]=={"type":"json_object"}
