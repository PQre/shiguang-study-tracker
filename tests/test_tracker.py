import csv
import io
from datetime import date, timedelta

import pytest
from fastapi.testclient import TestClient

from backend.main import create_app
from backend.stats import summarize, today_shanghai


@pytest.fixture
def client(tmp_path):
    with TestClient(create_app(tmp_path / "test.db")) as c:
        yield c


def make_plan(c, name="课程计划"):
    response = c.post("/api/plans", json={"name": name,
        "start_date": (today_shanghai()-timedelta(days=10)).isoformat(),
        "days": 28, "target_minutes": 45})
    assert response.status_code == 201
    return response.json()["id"]


def record(plan_id, offset=0, **extra):
    return {"plan_id": plan_id, "study_date": (today_shanghai()+timedelta(days=offset)).isoformat(),
        "topic": "接口设计", "minutes": 45, "takeaway": "明确重复与未来日期的错误响应。",
        "next_step": "增加边界用例", "shared": False} | extra


def test_empty_and_complete_knowledge_library(client):
    assert client.get("/api/stats").json()["days"] == 0
    lessons = client.get("/api/lessons").json()
    assert len(lessons) == 28
    assert {l["day"] for l in lessons} == set(range(1, 29))
    assert all(l["source"].startswith("https://hypersmart.feishu.cn/wiki/") for l in lessons)
    assert client.get("/").status_code == 200
    assert client.get("/static/vendor/vue.global.prod.js").status_code == 200


def test_record_create_read_edit_delete(client):
    p=make_plan(client)
    result=client.post("/api/records",json=record(p))
    assert result.status_code == 201
    rid=result.json()["id"]
    assert client.get("/api/stats").json()["minutes"] == 45
    assert client.put(f"/api/records/{rid}",json=record(p,minutes=60,shared=True)).status_code == 200
    stats=client.get("/api/stats").json()
    assert (stats["minutes"],stats["shared_days"]) == (60,1)
    assert client.delete(f"/api/records/{rid}").status_code == 204
    assert client.get("/api/records").json() == []


def test_duplicate_rejected_without_changing_data(client):
    p=make_plan(client)
    assert client.post("/api/records",json=record(p)).status_code == 201
    assert client.post("/api/records",json=record(p,minutes=90)).status_code == 409
    assert len(client.get("/api/records").json()) == 1
    assert client.get("/api/stats").json()["minutes"] == 45


def test_same_day_different_plans_deduplicates_global_days(client):
    p1=make_plan(client);p2=make_plan(client,"第二计划")
    client.post("/api/records",json=record(p1,shared=True))
    client.post("/api/records",json=record(p2,shared=True))
    global_stats=client.get("/api/stats").json()
    assert (global_stats["days"],global_stats["streak"],global_stats["shared_days"]) == (1,1,1)
    assert global_stats["minutes"] == 90
    assert client.get(f"/api/stats?plan_id={p1}").json()["minutes"] == 45


@pytest.mark.parametrize("extra",[{"minutes":0},{"minutes":721},{"minutes":1.5},
    {"minutes":True},{"topic":"   "},{"takeaway":"   "},{"study_date":"2026-02-30"},
    {"unexpected":"field"}])
def test_invalid_record_input(client,extra):
    p=make_plan(client)
    assert client.post("/api/records",json=record(p,**extra)).status_code == 422
    assert client.get("/api/records").json() == []


@pytest.mark.parametrize("offset",[1,-11])
def test_future_or_plan_outside_date_rejected(client,offset):
    p=make_plan(client)
    assert client.post("/api/records",json=record(p,offset)).status_code == 422


def test_missing_plan_and_negative_identifiers(client):
    assert client.post("/api/records",json=record(999)).status_code == 404
    for url in ["/api/stats?plan_id=999","/api/records?plan_id=999","/api/export.csv?plan_id=999"]:
        assert client.get(url).status_code == 404
    assert client.delete("/api/records/0").status_code == 422
    assert client.delete("/api/records/999").status_code == 404


def test_plan_interval_edit_and_delete_preserve_records(client):
    p=make_plan(client)
    rid=client.post("/api/records",json=record(p)).json()["id"]
    data={"name":"修改计划","start_date":(today_shanghai()+timedelta(days=1)).isoformat(),"days":28,"target_minutes":50}
    assert client.put(f"/api/plans/{p}",json=data).status_code == 409
    assert client.delete(f"/api/plans/{p}").status_code == 409
    data["start_date"]=today_shanghai().isoformat()
    assert client.put(f"/api/plans/{p}",json=data).status_code == 200
    assert client.get("/api/plans").json()[0]["progress"] == 4
    client.delete(f"/api/records/{rid}")
    assert client.delete(f"/api/plans/{p}").status_code == 204


def test_edit_cannot_collide_with_another_date(client):
    p=make_plan(client)
    rid=client.post("/api/records",json=record(p,-1)).json()["id"]
    client.post("/api/records",json=record(p))
    assert client.put(f"/api/records/{rid}",json=record(p)).status_code == 409
    assert len(client.get("/api/records").json()) == 2


def test_csv_chinese_formula_and_quoted_text(client):
    p=make_plan(client,"=危险公式")
    client.post("/api/records",json=record(p,topic="+SUM(1,2)",takeaway='中文,含"引号"\n换行',next_step=" @formula"))
    response=client.get("/api/export.csv")
    assert response.content.startswith(b"\xef\xbb\xbf")
    row=list(csv.reader(io.StringIO(response.content.decode("utf-8-sig"))))[1]
    assert row[0].startswith("'=") and row[2].startswith("'+") and row[5].startswith("'@")
    assert row[4]=='中文,含"引号"\n换行'


def test_cross_site_write_blocked_same_origin_allowed(client):
    data={"name":"计划","start_date":today_shanghai().isoformat(),"days":28,"target_minutes":45}
    assert client.post("/api/plans",json=data,headers={"Origin":"https://other.example"}).status_code == 403
    assert client.post("/api/plans",json=data,headers={"Origin":"http://testserver"}).status_code == 201


def test_database_persists_across_app_restart(tmp_path):
    path=tmp_path/"persistent.db"
    with TestClient(create_app(path)) as c:
        p=make_plan(c)
        c.post("/api/records",json=record(p))
    with TestClient(create_app(path)) as c:
        assert len(c.get("/api/records").json()) == 1
        assert c.get("/api/stats").json()["minutes"] == 45


@pytest.mark.parametrize("dates,expected",[
    ([],(0,0)),(["2026-10-13","2026-10-12","2026-10-11"],(3,3)),
    (["2026-10-10","2026-10-09"],(0,2)),
    (["2026-10-14","2026-10-13","2026-10-13","2026-10-10"],(2,2))])
def test_streak_rules(dates,expected):
    rows=[{"study_date":d,"minutes":20,"shared":False} for d in dates]
    stats=summarize(rows,date(2026,10,14))
    assert (stats["streak"],stats["longest_streak"]) == expected
