import sqlite3
from contextlib import contextmanager
from pathlib import Path

SCHEMA = """
CREATE TABLE IF NOT EXISTS plans (
 id INTEGER PRIMARY KEY, name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 60),
 start_date TEXT NOT NULL, days INTEGER NOT NULL CHECK(days BETWEEN 1 AND 90),
 target_minutes INTEGER NOT NULL CHECK(target_minutes BETWEEN 5 AND 480),
 created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS records (
 id INTEGER PRIMARY KEY,
 plan_id INTEGER NOT NULL REFERENCES plans(id) ON DELETE RESTRICT,
 study_date TEXT NOT NULL, topic TEXT NOT NULL,
 minutes INTEGER NOT NULL CHECK(minutes BETWEEN 1 AND 720),
 takeaway TEXT NOT NULL, next_step TEXT NOT NULL DEFAULT '',
 shared INTEGER NOT NULL DEFAULT 0 CHECK(shared IN (0,1)), created_at TEXT NOT NULL,
 UNIQUE(plan_id, study_date)
);
CREATE INDEX IF NOT EXISTS idx_records_date ON records(study_date);
"""


@contextmanager
def connection(path: Path):
    db = sqlite3.connect(path, timeout=10)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA foreign_keys=ON")
    try:
        with db:
            yield db
    finally:
        db.close()


def initialize(path: Path):
    path.parent.mkdir(parents=True, exist_ok=True)
    with connection(path) as db:
        db.execute("PRAGMA journal_mode=WAL")
        db.executescript(SCHEMA)


def read_records(db, plan_id=None):
    sql = "SELECT r.*, p.name AS plan_name FROM records r JOIN plans p ON p.id=r.plan_id"
    params = ()
    if plan_id is not None:
        sql += " WHERE r.plan_id=?"
        params = (plan_id,)
    sql += " ORDER BY r.study_date DESC, r.id DESC"
    return [dict(r) | {"shared": bool(r["shared"])} for r in db.execute(sql, params)]
