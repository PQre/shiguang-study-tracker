import csv
import io
import json
import os
import sqlite3
from contextlib import asynccontextmanager
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import urlparse

from fastapi import FastAPI, HTTPException, Path as ApiPath, Query, Request, Response
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .database import connection, initialize, read_records
from .models import PlanInput, RecordInput
from .stats import summarize, today_shanghai
from .ai import install_ai, ai_origin_allowed

ROOT = Path(__file__).resolve().parents[1]
FRONTEND = ROOT / "frontend"


def utc_now():
    return datetime.now(timezone.utc).isoformat()


def require_plan(db, plan_id):
    plan = db.execute("SELECT * FROM plans WHERE id=?", (plan_id,)).fetchone()
    if plan is None:
        raise HTTPException(404, "学习计划不存在")
    return dict(plan)


def validate_record(db, data):
    plan = require_plan(db, data.plan_id)
    start = date.fromisoformat(plan["start_date"])
    end = start + timedelta(days=plan["days"] - 1)
    if data.study_date > today_shanghai():
        raise HTTPException(422, "学习日期不能晚于北京时间今天")
    if not start <= data.study_date <= end:
        raise HTTPException(422, "学习日期必须在计划的日期范围内")


def create_app(db_path=None, demo=False):
    path = Path(db_path or os.getenv("TRACKER_DB", str(ROOT / "data" / "tracker.db")))

    @asynccontextmanager
    async def lifespan(app):
        initialize(path)
        yield

    app = FastAPI(title="学习打卡追踪器", version="1.0.0", lifespan=lifespan)
    app.state.db_path = path

    @app.middleware("http")
    async def same_origin(request: Request, call_next):
        if request.method in {"POST", "PUT", "DELETE", "PATCH"}:
            origin = request.headers.get("origin")
            # 浏览器跨站请求不得写入本地数据。无 Origin 的 CLI /测试客户端可以访问。
            if origin and urlparse(origin).netloc != request.headers.get("host") and not ai_origin_allowed(request):
                return Response('{"detail":"禁止跨站写入请求"}', status_code=403,
                                media_type="application/json")
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        return response

    @app.get("/api/health")
    def health():
        return {"status": "ok", "today": today_shanghai().isoformat(), "demo": demo}

    @app.get("/api/lessons")
    def lessons():
        return json.loads((FRONTEND / "lessons.json").read_text(encoding="utf-8"))

    @app.get("/api/plans")
    def plans():
        with connection(path) as db:
            rows = db.execute("""SELECT p.*,count(r.id) AS completed_days FROM plans p
                LEFT JOIN records r ON p.id=r.plan_id GROUP BY p.id ORDER BY p.id DESC""").fetchall()
            return [dict(r) | {"progress": round(r["completed_days"] / r["days"] * 100)} for r in rows]

    @app.post("/api/plans", status_code=201)
    def create_plan(data: PlanInput):
        try:
            data.start_date + timedelta(days=data.days - 1)
        except OverflowError:
            raise HTTPException(422, "计划结束日期超出支持范围")
        with connection(path) as db:
            cursor = db.execute("INSERT INTO plans(name,start_date,days,target_minutes,created_at) VALUES(?,?,?,?,?)",
                                (data.name, data.start_date.isoformat(), data.days, data.target_minutes, utc_now()))
            return require_plan(db, cursor.lastrowid)

    @app.put("/api/plans/{plan_id}")
    def edit_plan(data: PlanInput, plan_id: int = ApiPath(gt=0)):
        try:
            end = data.start_date + timedelta(days=data.days - 1)
        except OverflowError:
            raise HTTPException(422, "计划结束日期超出支持范围")
        with connection(path) as db:
            require_plan(db, plan_id)
            dates = [date.fromisoformat(r["study_date"]) for r in read_records(db, plan_id)]
            if any(not data.start_date <= d <= end for d in dates):
                raise HTTPException(409, "新的计划日期范围不能排除已有打卡记录")
            db.execute("UPDATE plans SET name=?,start_date=?,days=?,target_minutes=? WHERE id=?",
                       (data.name, data.start_date.isoformat(), data.days, data.target_minutes, plan_id))
            return require_plan(db, plan_id)

    @app.delete("/api/plans/{plan_id}", status_code=204)
    def delete_plan(plan_id: int = ApiPath(gt=0)):
        with connection(path) as db:
            require_plan(db, plan_id)
            if db.execute("SELECT 1 FROM records WHERE plan_id=?", (plan_id,)).fetchone():
                raise HTTPException(409, "该计划有打卡记录，请先处理记录")
            db.execute("DELETE FROM plans WHERE id=?", (plan_id,))
        return Response(status_code=204)

    @app.get("/api/records")
    def records(plan_id: int | None = Query(default=None, gt=0)):
        with connection(path) as db:
            if plan_id is not None:
                require_plan(db, plan_id)
            return read_records(db, plan_id)

    @app.post("/api/records", status_code=201)
    def create_record(data: RecordInput):
        with connection(path) as db:
            validate_record(db, data)
            try:
                cursor = db.execute("""INSERT INTO records
                    (plan_id,study_date,topic,minutes,takeaway,next_step,shared,created_at) VALUES(?,?,?,?,?,?,?,?)""",
                    (data.plan_id, data.study_date.isoformat(), data.topic, data.minutes,
                     data.takeaway, data.next_step, int(data.shared), utc_now()))
            except sqlite3.IntegrityError:
                raise HTTPException(409, "这个计划当天已经打卡，请编辑原记录")
            return next(r for r in read_records(db, data.plan_id) if r["id"] == cursor.lastrowid)

    @app.put("/api/records/{record_id}")
    def edit_record(data: RecordInput, record_id: int = ApiPath(gt=0)):
        with connection(path) as db:
            if not db.execute("SELECT 1 FROM records WHERE id=?", (record_id,)).fetchone():
                raise HTTPException(404, "打卡记录不存在")
            validate_record(db, data)
            try:
                db.execute("""UPDATE records SET plan_id=?,study_date=?,topic=?,minutes=?,
                    takeaway=?,next_step=?,shared=? WHERE id=?""",
                    (data.plan_id, data.study_date.isoformat(), data.topic, data.minutes,
                     data.takeaway, data.next_step, int(data.shared), record_id))
            except sqlite3.IntegrityError:
                raise HTTPException(409, "这个计划当天已经有另一条打卡")
            return next(r for r in read_records(db, data.plan_id) if r["id"] == record_id)

    @app.delete("/api/records/{record_id}", status_code=204)
    def delete_record(record_id: int = ApiPath(gt=0)):
        with connection(path) as db:
            cursor = db.execute("DELETE FROM records WHERE id=?", (record_id,))
            if not cursor.rowcount:
                raise HTTPException(404, "打卡记录不存在")
        return Response(status_code=204)

    @app.get("/api/stats")
    def stats(plan_id: int | None = Query(default=None, gt=0)):
        with connection(path) as db:
            if plan_id is not None:
                require_plan(db, plan_id)
            return summarize(read_records(db, plan_id))

    @app.get("/api/export.csv")
    def export(plan_id: int | None = Query(default=None, gt=0)):
        with connection(path) as db:
            if plan_id is not None:
                require_plan(db, plan_id)
            rows = read_records(db, plan_id)
        output = io.StringIO(newline="")
        writer = csv.writer(output)
        writer.writerow(["计划", "日期", "主题", "学习分钟", "收获", "下一步", "自述已上传分享"])

        def safe(value):
            text = str(value)
            return "'" + text if text.lstrip().startswith(("=", "+", "-", "@")) else text

        for r in rows:
            writer.writerow([safe(r["plan_name"]), r["study_date"], safe(r["topic"]), r["minutes"],
                             safe(r["takeaway"]), safe(r["next_step"]), "是" if r["shared"] else "否"])
        return Response("\ufeff" + output.getvalue(), media_type="text/csv; charset=utf-8",
                        headers={"Content-Disposition": 'attachment; filename="learning-records.csv"'})

    @app.get("/")
    def index():
        return FileResponse(FRONTEND / "index.html")

    app.mount("/static", StaticFiles(directory=FRONTEND), name="static")
    install_ai(app)
    return app


app = create_app()
