import json
from datetime import timedelta
from pathlib import Path

from backend.database import connection, initialize
from backend.main import utc_now
from backend.stats import today_shanghai


def seed_demo(path):
    initialize(path)
    with connection(path) as db:
        if db.execute("SELECT 1 FROM plans").fetchone():
            return
        today = today_shanghai()
        start = today - timedelta(days=9)
        cursor = db.execute("INSERT INTO plans(name,start_date,days,target_minutes,created_at) VALUES(?,?,?,?,?)",
                            ("四周生成式开发 · 演示", start.isoformat(), 28, 45, utc_now()))
        lessons = json.loads((Path(__file__).parent / "frontend" / "lessons.json").read_text(encoding="utf-8"))
        for i in [0, 1, 3, 5, 6, 7, 8, 9]:
            lesson = lessons[i]
            db.execute("""INSERT INTO records
                (plan_id,study_date,topic,minutes,takeaway,next_step,shared,created_at) VALUES(?,?,?,?,?,?,?,?)""",
                (cursor.lastrowid, (start + timedelta(days=i)).isoformat(), lesson["title"],
                 [40, 55, 35, 65, 45, 60, 50, 45][[0,1,3,5,6,7,8,9].index(i)],
                 "演示示例：" + lesson["example"], "演示示例：" + lesson["practice"], int(i < 8), utc_now()))
