"""Workload API: weekly booked hours per employee, to spot over-allocation and free capacity."""

from datetime import date, timedelta

from core import db
from core.app import router
from core.auth import require_auth
from core.http import ApiError, response

HOURS_PER_DAY = 8
DEFAULT_WEEKS = 6
MAX_WEEKS = 26

# Booked hours per employee per weekday, grouped into weeks.
# Only active, non-archived projects count, matching the capacity check on assignments.
_WEEKLY_SQL = """
WITH days AS (
    SELECT d::date AS day
    FROM generate_series(%(start)s::date, %(end)s::date, INTERVAL '1 day') AS d
    WHERE EXTRACT(ISODOW FROM d) < 6
),
active_assignments AS (
    SELECT a.user_id, a.hours_per_day, a.start_date, a.end_date
    FROM project_assignments a
    JOIN projects p ON p.id = a.project_id
    WHERE p.status = 'active' AND NOT p.is_archived
),
daily AS (
    SELECT u.id AS user_id, days.day, COALESCE(SUM(aa.hours_per_day), 0) AS hours
    FROM users u
    CROSS JOIN days
    LEFT JOIN active_assignments aa
           ON aa.user_id = u.id AND days.day BETWEEN aa.start_date AND aa.end_date
    WHERE u.id = ANY(%(user_ids)s)
    GROUP BY u.id, days.day
)
SELECT user_id,
       date_trunc('week', day)::date AS week_start,
       SUM(hours) AS hours,
       MAX(hours) AS peak_day_hours,
       COUNT(*)   AS workdays
FROM daily
GROUP BY user_id, week_start
ORDER BY user_id, week_start
"""

_ASSIGNMENTS_SQL = """
SELECT a.user_id, p.id AS project_id, p.name AS project_name,
       a.hours_per_day, a.start_date, a.end_date
FROM project_assignments a
JOIN projects p ON p.id = a.project_id
WHERE p.status = 'active' AND NOT p.is_archived
  AND a.user_id = ANY(%(user_ids)s)
  AND a.start_date <= %(end)s AND a.end_date >= %(start)s
ORDER BY a.start_date, p.name
"""


def _percent(part, whole):
    return round(float(part) / float(whole) * 100) if whole else 0


@router.route("GET", "/workload")
@require_auth("admin", "manager")
def get_workload(req):
    query = req.query

    try:
        start = date.fromisoformat(query["start"]) if query.get("start") else date.today()
    except ValueError as exc:
        raise ApiError(400, "Validation failed", {"start": "must be a date (YYYY-MM-DD)"}) from exc
    start -= timedelta(days=start.weekday())  # snap to Monday

    weeks_raw = query.get("weeks", str(DEFAULT_WEEKS))
    if not weeks_raw.isdigit() or not 1 <= int(weeks_raw) <= MAX_WEEKS:
        raise ApiError(400, "Validation failed", {"weeks": f"must be between 1 and {MAX_WEEKS}"})
    weeks = int(weeks_raw)
    end = start + timedelta(weeks=weeks, days=-1)

    conditions, params = ["role = 'employee'", "NOT is_archived"], []
    if query.get("manager_id"):
        manager_id = str(req.user["id"]) if query["manager_id"] == "me" else query["manager_id"]
        if not manager_id.isdigit():
            raise ApiError(400, "Validation failed", {"manager_id": "must be an id or 'me'"})
        conditions.append("manager_id = %s")
        params.append(int(manager_id))

    with db.transaction() as cur:
        cur.execute(
            "SELECT id, first_name, last_name, username, job_title, manager_id FROM users "
            f"WHERE {' AND '.join(conditions)} ORDER BY last_name, first_name",
            params,
        )
        employees = cur.fetchall()
        user_ids = [e["id"] for e in employees]
        weekly, assignments = [], []
        if user_ids:
            sql_params = {"start": start, "end": end, "user_ids": user_ids}
            cur.execute(_WEEKLY_SQL, sql_params)
            weekly = cur.fetchall()
            cur.execute(_ASSIGNMENTS_SQL, sql_params)
            assignments = cur.fetchall()

    by_user = {e["id"]: {**e, "weeks": [], "assignments": []} for e in employees}
    for row in weekly:
        capacity = row["workdays"] * HOURS_PER_DAY
        by_user[row["user_id"]]["weeks"].append({
            "week_start": row["week_start"],
            "hours": row["hours"],
            "capacity": capacity,
            "utilization": _percent(row["hours"], capacity),
            "peak_day_hours": row["peak_day_hours"],
            "over_allocated": row["peak_day_hours"] > HOURS_PER_DAY,
        })
    for assignment in assignments:
        by_user[assignment["user_id"]]["assignments"].append(assignment)

    for employee in by_user.values():
        total = sum(w["hours"] for w in employee["weeks"])
        capacity = sum(w["capacity"] for w in employee["weeks"])
        employee["total_hours"] = total
        employee["total_capacity"] = capacity
        employee["utilization"] = _percent(total, capacity)
        employee["over_allocated"] = any(w["over_allocated"] for w in employee["weeks"])

    return response(200, {
        "start": start,
        "end": end,
        "weeks": [start + timedelta(weeks=i) for i in range(weeks)],
        "employees": list(by_user.values()),
    })
