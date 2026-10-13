"""Assignments API: put employees on projects with hours/day and dates."""

from datetime import date

import psycopg

from api.projects import ensure_can_manage, fetch_visible_project
from core import db
from core.app import router
from core.auth import require_auth
from core.http import ApiError, response
from core.validation import Validator, path_id

MAX_HOURS_PER_DAY = 8
_CREATE_FIELDS = {"user_id", "hours_per_day", "start_date", "end_date"}
_UPDATE_FIELDS = {"hours_per_day", "start_date", "end_date"}
_COST_FIELDS = ("hourly_rate", "planned_cost", "worked_cost")

_ASSIGNMENT_SELECT = """
SELECT
    a.id, a.project_id, a.user_id,
    u.first_name || ' ' || u.last_name AS user_name,
    u.username, u.job_title, u.is_archived AS user_is_archived,
    a.hours_per_day, a.start_date, a.end_date,
    c.planned_hours, c.worked_hours, c.hourly_rate,
    c.planned_hours * c.hourly_rate AS planned_cost,
    c.worked_hours  * c.hourly_rate AS worked_cost,
    a.created_at
FROM project_assignments a
JOIN users u            ON u.id = a.user_id
JOIN assignment_costs c ON c.assignment_id = a.id
"""


# ---------- helpers ----------

def _hide_costs_for(user, rows):
    """Employees can see who's on the project, but not anyone's pay."""
    if user["role"] == "employee":
        for row in rows:
            for field in _COST_FIELDS:
                row.pop(field, None)
    return rows


def _fetch_assignment(cur, project_id, assignment_id):
    cur.execute(f"{_ASSIGNMENT_SELECT} WHERE a.project_id = %s AND a.id = %s", (project_id, assignment_id))
    row = cur.fetchone()
    if row is None:
        raise ApiError(404, "Assignment not found")
    return row


def _ensure_active_employee(cur, user_id):
    cur.execute("SELECT role, is_archived FROM users WHERE id = %s", (user_id,))
    row = cur.fetchone()
    if row is None or row["role"] != "employee" or row["is_archived"]:
        raise ApiError(400, "Validation failed", {"user_id": "must be an active employee"})


def _check_dates_within_project(start, end, project):
    errors = {}
    if end < start:
        errors["end_date"] = "must be on or after start_date"
    if start < project["start_date"]:
        errors["start_date"] = f"must be on or after the project start ({project['start_date']})"
    if end > project["end_date"]:
        errors["end_date"] = f"must be on or before the project end ({project['end_date']})"
    if errors:
        raise ApiError(400, "Validation failed", errors)


def _check_capacity(cur, user_id, start, end, hours, exclude_assignment_id=None):
    """Enforce the 8h/day limit across overlapping assignments on active projects."""
    cur.execute(
        """
        SELECT COALESCE(SUM(a.hours_per_day), 0) AS booked
        FROM project_assignments a
        JOIN projects p ON p.id = a.project_id
        WHERE a.user_id = %s
          AND NOT p.is_archived AND p.status = 'active'
          AND a.start_date <= %s AND a.end_date >= %s
          AND a.id <> COALESCE(%s, -1)
        """,
        (user_id, end, start, exclude_assignment_id),
    )
    booked = cur.fetchone()["booked"]
    if booked + hours > MAX_HOURS_PER_DAY:
        raise ApiError(
            409,
            f"This would exceed {MAX_HOURS_PER_DAY} hours/day for this employee",
            {
                "already_booked_hours_per_day": booked,
                "requested_hours_per_day": hours,
                "available_hours_per_day": max(MAX_HOURS_PER_DAY - booked, 0),
            },
        )


def _validate_assignment_body(data, partial=False):
    v = Validator(data, partial=partial)
    v.reject_unknown(_UPDATE_FIELDS if partial else _CREATE_FIELDS)
    if not partial:
        v.integer_id("user_id", required=True)
    v.number("hours_per_day", minimum=0.5, maximum=MAX_HOURS_PER_DAY)
    v.date("start_date", required=not partial)
    v.date("end_date", required=not partial)
    return v.check()


def _insert_assignment(cur, project_id, user_id, hours, start, end):
    try:
        cur.execute(
            """
            INSERT INTO project_assignments (project_id, user_id, hours_per_day, start_date, end_date)
            VALUES (%s, %s, %s, %s, %s)
            RETURNING id
            """,
            (project_id, user_id, hours, start, end),
        )
    except psycopg.errors.UniqueViolation as exc:
        raise ApiError(409, "This employee is already assigned to this project") from exc
    return cur.fetchone()["id"]


# ---------- endpoints ----------

@router.route("GET", "/projects/{id}/assignments")
@require_auth()
def list_assignments(req):
    project_id = path_id(req)
    with db.transaction() as cur:
        fetch_visible_project(cur, project_id, req.user)  # 404 if not visible
        cur.execute(f"{_ASSIGNMENT_SELECT} WHERE a.project_id = %s ORDER BY u.last_name, u.first_name", (project_id,))
        rows = cur.fetchall()
    return response(200, _hide_costs_for(req.user, rows))


@router.route("POST", "/projects/{id}/assignments")
@require_auth("admin", "manager")
def create_assignment(req):
    project_id = path_id(req)
    values = _validate_assignment_body(req.json())
    hours = values.get("hours_per_day", MAX_HOURS_PER_DAY)

    with db.transaction() as cur:
        project = fetch_visible_project(cur, project_id, req.user)
        ensure_can_manage(req.user, project)
        _ensure_active_employee(cur, values["user_id"])
        _check_dates_within_project(values["start_date"], values["end_date"], project)
        _check_capacity(cur, values["user_id"], values["start_date"], values["end_date"], hours)
        new_id = _insert_assignment(
            cur, project_id, values["user_id"], hours, values["start_date"], values["end_date"]
        )
        assignment = _fetch_assignment(cur, project_id, new_id)
    return response(201, assignment)



@router.route("POST", "/projects/{id}/assignments/team")
@require_auth("admin", "manager")
def assign_team(req):
    """
    Assign every active employee reporting to a manager.
    Managers assign their own team; admins may pass manager_id (defaults to the project's manager).
    People already on the project or without free hours are skipped, with a reason.
    """
    project_id = path_id(req)
    v = Validator(req.json())
    v.reject_unknown({"manager_id", "hours_per_day", "start_date", "end_date"})
    v.integer_id("manager_id")
    v.number("hours_per_day", minimum=0.5, maximum=MAX_HOURS_PER_DAY)
    v.date("start_date", required=True)
    v.date("end_date", required=True)
    values = v.check()
    hours = values.get("hours_per_day", MAX_HOURS_PER_DAY)

    with db.transaction() as cur:
        project = fetch_visible_project(cur, project_id, req.user)
        ensure_can_manage(req.user, project)
        _check_dates_within_project(values["start_date"], values["end_date"], project)

        if req.user["role"] == "manager":
            team_manager_id = req.user["id"]
            if values.get("manager_id", team_manager_id) != team_manager_id:
                raise ApiError(403, "Managers can only assign their own team")
        else:
            team_manager_id = values.get("manager_id", project["manager_id"])

        cur.execute(
            """
            SELECT id, first_name || ' ' || last_name AS user_name
            FROM users
            WHERE manager_id = %s AND role = 'employee' AND NOT is_archived
            ORDER BY last_name, first_name
            """,
            (team_manager_id,),
        )
        members = cur.fetchall()
        if not members:
            raise ApiError(400, "This manager has no active employees to assign")

        assigned, skipped = [], []
        for member in members:
            cur.execute(
                "SELECT 1 FROM project_assignments WHERE project_id = %s AND user_id = %s",
                (project_id, member["id"]),
            )
            if cur.fetchone():
                skipped.append({**member, "reason": "already assigned"})
                continue
            try:
                _check_capacity(cur, member["id"], values["start_date"], values["end_date"], hours)
            except ApiError as exc:
                skipped.append({**member, "reason": exc.message, **(exc.details or {})})
                continue
            new_id = _insert_assignment(
                cur, project_id, member["id"], hours, values["start_date"], values["end_date"]
            )
            assigned.append(_fetch_assignment(cur, project_id, new_id))

    return response(201 if assigned else 200, {"assigned": assigned, "skipped": skipped})


@router.route("PUT", "/projects/{id}/assignments/{assignment_id}")
@require_auth("admin", "manager")
def update_assignment(req):
    project_id = path_id(req)
    assignment_id = path_id(req, "assignment_id")
    values = _validate_assignment_body(req.json(), partial=True)
    if not values:
        raise ApiError(400, "No fields to update")

    with db.transaction() as cur:
        project = fetch_visible_project(cur, project_id, req.user)
        ensure_can_manage(req.user, project)
        current = _fetch_assignment(cur, project_id, assignment_id)

        start = values.get("start_date", current["start_date"])
        end = values.get("end_date", current["end_date"])
        hours = values.get("hours_per_day", current["hours_per_day"])
        _check_dates_within_project(start, end, project)
        _check_capacity(cur, current["user_id"], start, end, hours, exclude_assignment_id=assignment_id)

        set_clause = ", ".join(f"{field} = %s" for field in values)
        cur.execute(
            f"UPDATE project_assignments SET {set_clause} WHERE id = %s",
            (*values.values(), assignment_id),
        )
        updated = _fetch_assignment(cur, project_id, assignment_id)
    return response(200, updated)


@router.route("DELETE", "/projects/{id}/assignments/{assignment_id}")
@require_auth("admin", "manager")
def remove_assignment(req):
    """
    Not started yet -> removed (nothing was worked).
    Already started -> ended today, so hours already worked still count toward the budget.
    """
    project_id = path_id(req)
    assignment_id = path_id(req, "assignment_id")
    with db.transaction() as cur:
        project = fetch_visible_project(cur, project_id, req.user)
        ensure_can_manage(req.user, project)
        current = _fetch_assignment(cur, project_id, assignment_id)

        today = date.today()
        if current["start_date"] > today:
            cur.execute("DELETE FROM project_assignments WHERE id = %s", (assignment_id,))
        elif current["end_date"] > today:
            cur.execute(
                "UPDATE project_assignments SET end_date = %s WHERE id = %s",
                (today, assignment_id),
            )
    return response(204)