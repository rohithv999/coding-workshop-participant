"""Projects API: admins create and archive; managers edit their own; employees view assigned."""

from datetime import date

from api.users import _ensure_active_manager
from core import db
from core.app import router
from core.auth import require_auth
from core.http import ApiError, response
from core.validation import Validator, path_id

MAX_BUDGET = 1_000_000_000
_STATUSES = ("active", "done")
_ARCHIVED_FILTERS = ("false", "true", "all")
_CREATE_FIELDS = {"name", "description", "manager_id", "start_date", "end_date", "budget"}

_MANAGER_EDITABLE = {"name", "description", "start_date", "end_date", "budget", "budget_reason"}
_ADMIN_EDITABLE = _MANAGER_EDITABLE | {"manager_id"}

# One query used everywhere, so every endpoint returns the same project shape
_PROJECT_SELECT = """
SELECT
    p.id, p.name, p.description, p.manager_id,
    m.first_name || ' ' || m.last_name AS manager_name,
    p.start_date, p.end_date, p.budget, p.status,
    p.is_archived, p.archived_at, p.created_at, p.updated_at,
    COALESCE(c.team_size, 0)        AS team_size,
    COALESCE(c.planned_hours, 0)    AS planned_hours,
    COALESCE(c.worked_hours, 0)     AS worked_hours,
    COALESCE(c.committed, 0)        AS budget_committed,
    COALESCE(c.spent, 0)            AS budget_spent,
    p.budget - COALESCE(c.spent, 0) AS budget_remaining,
    COALESCE(ms.total, 0)           AS milestones_total,
    COALESCE(ms.complete, 0)        AS milestones_complete
FROM projects p
JOIN users m ON m.id = p.manager_id
LEFT JOIN (
    SELECT project_id,
           COUNT(*)                         AS team_size,
           SUM(planned_hours)               AS planned_hours,
           SUM(worked_hours)                AS worked_hours,
           SUM(planned_hours * hourly_rate) AS committed,
           SUM(worked_hours * hourly_rate)  AS spent
    FROM assignment_costs
    GROUP BY project_id
) c ON c.project_id = p.id
LEFT JOIN (
    SELECT project_id,
           COUNT(*)                                    AS total,
           COUNT(*) FILTER (WHERE status = 'complete') AS complete
    FROM milestones
    GROUP BY project_id
) ms ON ms.project_id = p.id
"""


# ---------- shared helpers (also used by assignments and milestones) ----------

def _visibility(user):
    """SQL condition limiting projects to what this user may see."""
    if user["role"] == "admin":
        return "TRUE", []
    if user["role"] == "manager":
        return "p.manager_id = %s AND NOT p.is_archived", [user["id"]]
    return (
        "NOT p.is_archived AND EXISTS ("
        "SELECT 1 FROM project_assignments pa WHERE pa.project_id = p.id AND pa.user_id = %s)",
        [user["id"]],
    )


def _with_progress(project):
    total = project["milestones_total"]
    project["progress_percent"] = round(project["milestones_complete"] * 100 / total) if total else 0
    project["is_over_budget"] = project["budget_spent"] > project["budget"]
    project["is_overdue"] = project["status"] == "active" and project["end_date"] < date.today()
    return project


def fetch_visible_project(cur, project_id, user):
    """Load one project with its stats, or 404 if it doesn't exist or isn't visible."""
    condition, params = _visibility(user)
    cur.execute(f"{_PROJECT_SELECT} WHERE p.id = %s AND {condition}", [project_id, *params])
    project = cur.fetchone()
    if project is None:
        raise ApiError(404, "Project not found")
    return _with_progress(project)


def ensure_can_manage(user, project):
    """Only admins or the project's own manager may change it, and never while archived."""
    if user["role"] != "admin" and project["manager_id"] != user["id"]:
        raise ApiError(403, "Only this project's manager or an admin can do this")
    if project["is_archived"]:
        raise ApiError(409, "Archived projects are read-only. Unarchive it first.")


def _check_dates(start, end, field="end_date"):
    if start is not None and end is not None and end < start:
        raise ApiError(400, "Validation failed", {field: "must be on or after start_date"})


# ---------- endpoints ----------

@router.route("POST", "/projects")
@require_auth("admin")
def create_project(req):
    v = Validator(req.json())
    v.reject_unknown(_CREATE_FIELDS)
    v.text("name", required=True, max_length=200)
    v.text("description", max_length=5000)
    v.integer_id("manager_id", required=True)
    v.date("start_date", required=True)
    v.date("end_date", required=True)
    v.number("budget", minimum=0, maximum=MAX_BUDGET)
    values = v.check()
    _check_dates(values["start_date"], values["end_date"])

    with db.transaction() as cur:
        _ensure_active_manager(cur, values["manager_id"])
        cur.execute(
            """
            INSERT INTO projects (name, description, manager_id, start_date, end_date, budget)
            VALUES (%s, %s, %s, %s, %s, %s)
            RETURNING id
            """,
            (
                values["name"], values.get("description"), values["manager_id"],
                values["start_date"], values["end_date"], values.get("budget", 0),
            ),
        )
        project = fetch_visible_project(cur, cur.fetchone()["id"], req.user)
    return response(201, project)


@router.route("GET", "/projects")
@require_auth()
def list_projects(req):
    """
    Query params:
      search      - matches name or description
      status      - active | done
      manager_id  - a manager's id, or "me"
      archived    - false (default) | true | all   (admins only for true/all)
    """
    query = req.query
    condition, params = _visibility(req.user)
    conditions = [condition]

    archived = query.get("archived", "false")
    if archived not in _ARCHIVED_FILTERS:
        raise ApiError(400, "Validation failed", {"archived": "must be one of: false, true, all"})
    if archived != "false" and req.user["role"] != "admin":
        raise ApiError(403, "Only admins can view archived projects")
    if archived == "false":
        conditions.append("NOT p.is_archived")
    elif archived == "true":
        conditions.append("p.is_archived")

    if query.get("status"):
        if query["status"] not in _STATUSES:
            raise ApiError(400, "Validation failed", {"status": "must be one of: active, done"})
        conditions.append("p.status = %s")
        params.append(query["status"])

    if query.get("manager_id"):
        manager_id = str(req.user["id"]) if query["manager_id"] == "me" else query["manager_id"]
        if not manager_id.isdigit():
            raise ApiError(400, "Validation failed", {"manager_id": "must be an id or 'me'"})
        conditions.append("p.manager_id = %s")
        params.append(int(manager_id))

    if query.get("search", "").strip():
        conditions.append("(p.name ILIKE %s OR p.description ILIKE %s)")
        params.extend([f"%{query['search'].strip()}%"] * 2)

    with db.transaction() as cur:
        cur.execute(
            f"{_PROJECT_SELECT} WHERE {' AND '.join(conditions)} "
            "ORDER BY p.status, p.end_date, p.name",
            params,
        )
        projects = [_with_progress(row) for row in cur.fetchall()]
    return response(200, projects)


@router.route("GET", "/projects/{id}")
@require_auth()
def get_project(req):
    with db.transaction() as cur:
        project = fetch_visible_project(cur, path_id(req), req.user)
    return response(200, project)



@router.route("PUT", "/projects/{id}")
@require_auth("admin", "manager")
def update_project(req):
    project_id = path_id(req)
    is_admin = req.user["role"] == "admin"

    v = Validator(req.json(), partial=True)
    v.reject_unknown(_ADMIN_EDITABLE if is_admin else _MANAGER_EDITABLE)
    v.text("name", required=True, max_length=200)
    v.text("description", max_length=5000)
    v.integer_id("manager_id", required=True)
    v.date("start_date", required=True)
    v.date("end_date", required=True)
    v.number("budget", minimum=0, maximum=MAX_BUDGET)
    v.text("budget_reason", max_length=500)
    values = v.check()
    reason = values.pop("budget_reason", None)
    if not values:
        raise ApiError(400, "No fields to update")

    with db.transaction() as cur:
        project = fetch_visible_project(cur, project_id, req.user)
        ensure_can_manage(req.user, project)
        _check_dates(
            values.get("start_date", project["start_date"]),
            values.get("end_date", project["end_date"]),
        )
        if values.get("manager_id", project["manager_id"]) != project["manager_id"]:
            _ensure_active_manager(cur, values["manager_id"])

        # Every budget change is recorded: old value, new value, who, and why
        if "budget" in values and values["budget"] != project["budget"]:
            cur.execute(
                """
                INSERT INTO budget_adjustments (project_id, old_amount, new_amount, reason, changed_by)
                VALUES (%s, %s, %s, %s, %s)
                """,
                (project_id, project["budget"], values["budget"], reason, req.user["id"]),
            )

        set_clause = ", ".join(f"{field} = %s" for field in values)
        cur.execute(
            f"UPDATE projects SET {set_clause}, updated_at = NOW() WHERE id = %s",
            (*values.values(), project_id),
        )
        updated = fetch_visible_project(cur, project_id, req.user)
    return response(200, updated)


@router.route("POST", "/projects/{id}/complete")
@require_auth("admin", "manager")
def complete_project(req):
    """A project is done only when it has milestones and every one is complete."""
    project_id = path_id(req)
    with db.transaction() as cur:
        project = fetch_visible_project(cur, project_id, req.user)
        ensure_can_manage(req.user, project)
        if project["status"] == "done":
            raise ApiError(409, "Project is already done")
        if project["milestones_total"] == 0:
            raise ApiError(409, "Add at least one milestone before marking the project done")
        if project["milestones_complete"] < project["milestones_total"]:
            raise ApiError(
                409,
                "All milestones must be complete before the project can be marked done",
                {
                    "milestones_total": project["milestones_total"],
                    "milestones_complete": project["milestones_complete"],
                },
            )
        cur.execute(
            "UPDATE projects SET status = 'done', updated_at = NOW() WHERE id = %s",
            (project_id,),
        )
        updated = fetch_visible_project(cur, project_id, req.user)
    return response(200, updated)


@router.route("POST", "/projects/{id}/reopen")
@require_auth("admin", "manager")
def reopen_project(req):
    """Undo 'done' if it was marked by mistake."""
    project_id = path_id(req)
    with db.transaction() as cur:
        project = fetch_visible_project(cur, project_id, req.user)
        ensure_can_manage(req.user, project)
        if project["status"] == "active":
            raise ApiError(409, "Project is already active")
        cur.execute(
            "UPDATE projects SET status = 'active', updated_at = NOW() WHERE id = %s",
            (project_id,),
        )
        updated = fetch_visible_project(cur, project_id, req.user)
    return response(200, updated)


@router.route("DELETE", "/projects/{id}")
@require_auth("admin")
def archive_project(req):
    """Soft delete: hidden from managers and employees, kept for history."""
    project_id = path_id(req)
    with db.transaction() as cur:
        project = fetch_visible_project(cur, project_id, req.user)
        if not project["is_archived"]:
            cur.execute(
                "UPDATE projects SET is_archived = TRUE, archived_at = NOW(), updated_at = NOW() "
                "WHERE id = %s",
                (project_id,),
            )
    return response(204)


@router.route("POST", "/projects/{id}/unarchive")
@require_auth("admin")
def unarchive_project(req):
    """Restore a project. If its manager was archived meanwhile, pass a new manager_id."""
    project_id = path_id(req)
    v = Validator(req.json(), partial=True)
    v.reject_unknown({"manager_id"})
    v.integer_id("manager_id", required=True)
    values = v.check()

    with db.transaction() as cur:
        project = fetch_visible_project(cur, project_id, req.user)
        if not project["is_archived"]:
            raise ApiError(409, "Project is not archived")

        manager_id = values.get("manager_id", project["manager_id"])
        cur.execute("SELECT role, is_archived FROM users WHERE id = %s", (manager_id,))
        manager = cur.fetchone()
        if manager is None or manager["role"] != "manager" or manager["is_archived"]:
            raise ApiError(
                409,
                "This project's manager is no longer active. Provide an active manager_id.",
                {"manager_id": "must be an active manager"},
            )
        cur.execute(
            "UPDATE projects SET is_archived = FALSE, archived_at = NULL, manager_id = %s, "
            "updated_at = NOW() WHERE id = %s",
            (manager_id, project_id),
        )
        restored = fetch_visible_project(cur, project_id, req.user)
    return response(200, restored)


@router.route("GET", "/projects/{id}/budget-history")
@require_auth("admin", "manager")
def budget_history(req):
    project_id = path_id(req)
    with db.transaction() as cur:
        fetch_visible_project(cur, project_id, req.user)  # 404 if not visible
        cur.execute(
            """
            SELECT b.id, b.old_amount, b.new_amount, b.reason, b.changed_at, b.changed_by,
                   u.first_name || ' ' || u.last_name AS changed_by_name
            FROM budget_adjustments b
            JOIN users u ON u.id = b.changed_by
            WHERE b.project_id = %s
            ORDER BY b.changed_at DESC
            """,
            (project_id,),
        )
        history = cur.fetchall()
    return response(200, history)