from datetime import date, datetime, timedelta, timezone

SHANGHAI = timezone(timedelta(hours=8))


def today_shanghai():
    return datetime.now(SHANGHAI).date()


def summarize(records, today=None):
    today = today or today_shanghai()
    days = sorted({date.fromisoformat(r["study_date"]) for r in records})
    longest = current = 0
    previous = None
    for day in days:
        current = current + 1 if previous and day == previous + timedelta(days=1) else 1
        longest = max(longest, current)
        previous = day
    streak = 0
    day_set = set(days)
    if days and days[-1] >= today - timedelta(days=1):
        cursor = days[-1]
        while cursor in day_set:
            streak += 1
            cursor -= timedelta(days=1)
    by_day = {}
    for r in records:
        by_day[r["study_date"]] = by_day.get(r["study_date"], 0) + r["minutes"]
    return {
        "days": len(days), "minutes": sum(r["minutes"] for r in records),
        "streak": streak, "longest_streak": longest,
        "shared_days": len({r["study_date"] for r in records if r["shared"]}),
        "daily": [{"date": d, "minutes": m} for d, m in sorted(by_day.items())],
        "recent": records[:5],
    }
