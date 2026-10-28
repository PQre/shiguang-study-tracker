"""python run.py；--demo 使用独立演示库，不改真实学习记录。"""
import argparse
import importlib.util
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
if (ROOT / ".deps").exists():
    sys.path.insert(0, str(ROOT / ".deps"))
if importlib.util.find_spec("uvicorn") is None:
    raise SystemExit("请先运行 python -m pip install -r requirements.txt")

import uvicorn
from backend.main import create_app

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--demo", action="store_true")
    parser.add_argument("--ai-only", action="store_true", help="仅运行AI服务，不开放打卡数据库接口")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8000)
    args = parser.parse_args()
    if args.ai_only:
        from backend.ai import create_ai_app
        print(f"拾光AI服务：http://{args.host}:{args.port}/api/ai/status", flush=True)
        uvicorn.run(create_ai_app(), host=args.host, port=args.port)
        raise SystemExit(0)
    if args.demo:
        from seed_demo import seed_demo
        seed_demo(ROOT / "data" / "demo.db")
    db = ROOT / "data" / ("demo.db" if args.demo else "tracker.db")
    print(f"学习打卡追踪器：http://{args.host}:{args.port}", flush=True)
    print("数据模式：" + ("演示示例，不是本人学习证据" if args.demo else "真实个人记录"), flush=True)
    uvicorn.run(create_app(db, demo=args.demo), host=args.host, port=args.port)
