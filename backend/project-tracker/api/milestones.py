"""Milestones API: deliverables within a project, each with dates and a status."""

from datetime import date, datetime, timezone

from api.assignments import _check_dates_within_project
from api.projects import ensure_can_manage, fetch_visible_project
from core import db
from core.app import router
from core.auth import require_auth
from core.http import ApiError, response
from core.validation import Validator, path_id

STATUSES = ("not_started", "in_progress", "complete")
_FIELDS = {"name", "description", "start_date", "end_date", "status"}
_COLUMNS = (
    "id, project_id, name, description, start_date, end_date, "
    "status, completed_at, created_at, updated_at"
)


# ---------- helpers ----------

def _with_flags(milestone):
    milestone["is_overdue"] = (
        milestone["status"] != "complete" and milestone["end_date"] < date.today()
    )
    return milestone


def _fetch_milestone(cur, project_id, milestone_id):
    cur.execute(
        f"SELECT {_COLUMNS} FROM milestones WHERE project_id = %s AND id = %s",
        (project_id, milestone_id),
    )
    milestone = cur.fetchone()
    if milestone is None:
        raise ApiError(404, "Milestone not found")
    return milestone


def _validate(data, partial=False):
    v = Validator(data, partial=partial)
    v.reject_unknown(_FIELDS)
    v.text("name", required=True, max_length=200)
    v.text("description", max_length=5000)
    v.date("start_date", required=True)
    v.date("end_date", required=True)
    v.choice("status", STATUSES)
    return v.check()


def _ensure_editable(user, project):
    ensure_can_manage(user, project)
    if project["status"] == "done":
        raise ApiError(409, "This project is done. Reopen it to change milestones.")


def _completed_at(new_status, current_completed_at=None):
    """Keep the original completion time; clear it if no longer complete."""
    if new_status != "complete":
        return None
    return current_completed_at or datetime.now(timezone.utc)


# ---------- endpoints ----------

@router.route("GET", "/projects/{id}/milestones")
@require_auth()
def list_milestones(req):
    project_id = path_id(req)
    with db.transaction() as cur:
        fetch_visible_project(cur, project_id, req.user)  # 404 if not visible
        cur.execute(
            f"SELECT {_COLUMNS} FROM milestones WHERE project_id = %s "
            "ORDER BY start_date, end_date, id",
            (project_id,),
        )
        milestones = [_with_flags(row) for row in cur.fetchall()]
    return response(200, milestones)


@router.route("POST", "/projects/{id}/milestones")
@require_auth("admin", "manager")
def create_milestone(req):
    project_id = path_id(req)
    values = _validate(req.json())
    status = values.get("status", "not_started")

    with db.transaction() as cur:
        project = fetch_visible_project(cur, project_id, req.user)
        _ensure_editable(req.user, project)
        _check_dates_within_project(values["start_date"], values["end_date"], project)
        cur.execute(
            f"""
            INSERT INTO milestones (project_id, name, description, start_date, end_date,
                                    status, completed_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            RETURNING {_COLUMNS}
            """,
            (
                project_id, values["name"], values.get("description"),
                values["start_date"], values["end_date"], status, _completed_at(status),
            ),
        )
        milestone = _with_flags(cur.fetchone())
    return response(201, milestone)


@router.route("PUT", "/projects/{id}/milestones/{milestone_id}")
@require_auth("admin", "manager")
def update_milestone(req):
    project_id = path_id(req)
    milestone_id = path_id(req, "milestone_id")
    values = _validate(req.json(), partial=True)
    if not values:
        raise ApiError(400, "No fields to update")

    with db.transaction() as cur:
        project = fetch_visible_project(cur, project_id, req.user)
        _ensure_editable(req.user, project)
        current = _fetch_milestone(cur, project_id, milestone_id)

        _check_dates_within_project(
            values.get("start_date", current["start_date"]),
            values.get("end_date", current["end_date"]),
            project,
        )
        if "status" in values:
            values["completed_at"] = _completed_at(values["status"], current["completed_at"])

        # Field names come from the allow-list above (plus completed_at), never from user input
        set_clause = ", ".join(f"{field} = %s" for field in values)
        cur.execute(
            f"UPDATE milestones SET {set_clause}, updated_at = NOW() "
            f"WHERE id = %s RETURNING {_COLUMNS}",
            (*values.values(), milestone_id),
        )
        milestone = _with_flags(cur.fetchone())
    return response(200, milestone)


@router.route("DELETE", "/projects/{id}/milestones/{milestone_id}")
@require_auth("admin", "manager")
def delete_milestone(req):
    """Only milestones that haven't started can be removed (i.e. created by mistake)."""
    project_id = path_id(req)
    milestone_id = path_id(req, "milestone_id")
    with db.transaction() as cur:
        project = fetch_visible_project(cur, project_id, req.user)
        _ensure_editable(req.user, project)
        current = _fetch_milestone(cur, project_id, milestone_id)
        if current["status"] != "not_started":
            raise ApiError(409, "Only milestones that haven't started can be deleted")
        cur.execute("DELETE FROM milestones WHERE id = %s", (milestone_id,))
    return response(204)