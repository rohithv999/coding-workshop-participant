"""Project costs API: non-labor spending (technology, licenses, travel...) that counts toward the budget."""

from decimal import Decimal

from api.projects import ensure_can_manage, fetch_visible_project
from core import audit, db
from core.app import router
from core.auth import require_auth
from core.http import ApiError, response
from core.validation import Validator, path_id

CATEGORIES = ("technology", "software", "hardware", "services", "travel", "other")
MAX_AMOUNT = 100_000_000
_FIELDS = {"category", "description", "amount", "cost_date"}
_AUDIT_FIELDS = ("category", "description", "amount", "cost_date")

_SELECT = """
SELECT c.id, c.project_id, c.category, c.description, c.amount, c.cost_date,
       c.created_by, u.first_name || ' ' || u.last_name AS created_by_name,
       c.created_at, c.updated_at
FROM project_costs c
JOIN users u ON u.id = c.created_by
"""


def _validate(data, partial=False):
    v = Validator(data, partial=partial)
    v.reject_unknown(_FIELDS)
    v.choice("category", CATEGORIES, required=True)
    v.text("description", required=True, max_length=255)
    v.number("amount", required=True, minimum=Decimal("0.01"), maximum=MAX_AMOUNT)
    v.date("cost_date", required=True)
    return v.check()


def _fetch_cost(cur, project_id, cost_id):
    cur.execute(f"{_SELECT} WHERE c.project_id = %s AND c.id = %s", (project_id, cost_id))
    cost = cur.fetchone()
    if cost is None:
        raise ApiError(404, "Cost not found")
    return cost


def _label(cost, project):
    return f"{cost['description']} on {project['name']}"


@router.route("GET", "/projects/{id}/costs")
@require_auth("admin", "manager")
def list_costs(req):
    project_id = path_id(req)
    with db.transaction() as cur:
        fetch_visible_project(cur, project_id, req.user)  # 404 if not visible
        cur.execute(f"{_SELECT} WHERE c.project_id = %s ORDER BY c.cost_date DESC, c.id DESC", (project_id,))
        costs = cur.fetchall()
    return response(200, costs)


@router.route("POST", "/projects/{id}/costs")
@require_auth("admin", "manager")
def create_cost(req):
    project_id = path_id(req)
    values = _validate(req.json())
    with db.transaction() as cur:
        project = fetch_visible_project(cur, project_id, req.user)
        ensure_can_manage(req.user, project)
        cur.execute(
            """
            INSERT INTO project_costs (project_id, category, description, amount, cost_date, created_by)
            VALUES (%s, %s, %s, %s, %s, %s)
            RETURNING id
            """,
            (project_id, values["category"], values["description"], values["amount"],
             values["cost_date"], req.user["id"]),
        )
        cost = _fetch_cost(cur, project_id, cur.fetchone()["id"])
        audit.record(
            cur, req.user, "create", "cost", cost["id"], _label(cost, project),
            audit.snapshot(cost, _AUDIT_FIELDS), project_id=project_id,
        )
    return response(201, cost)


@router.route("PUT", "/projects/{id}/costs/{cost_id}")
@require_auth("admin", "manager")
def update_cost(req):
    project_id = path_id(req)
    cost_id = path_id(req, "cost_id")
    values = _validate(req.json(), partial=True)
    if not values:
        raise ApiError(400, "No fields to update")
    with db.transaction() as cur:
        project = fetch_visible_project(cur, project_id, req.user)
        ensure_can_manage(req.user, project)
        current = _fetch_cost(cur, project_id, cost_id)
        # Field names come from the allow-list above, never from user input
        set_clause = ", ".join(f"{field} = %s" for field in values)
        cur.execute(
            f"UPDATE project_costs SET {set_clause}, updated_at = NOW() WHERE id = %s",
            (*values.values(), cost_id),
        )
        updated = _fetch_cost(cur, project_id, cost_id)
        changes = audit.diff(current, values)
        if changes:
            audit.record(
                cur, req.user, "update", "cost", cost_id, _label(updated, project), changes,
                project_id=project_id,
            )
    return response(200, updated)


@router.route("DELETE", "/projects/{id}/costs/{cost_id}")
@require_auth("admin", "manager")
def delete_cost(req):
    """Remove a cost entered by mistake. The audit log keeps a full record of it."""
    project_id = path_id(req)
    cost_id = path_id(req, "cost_id")
    with db.transaction() as cur:
        project = fetch_visible_project(cur, project_id, req.user)
        ensure_can_manage(req.user, project)
        current = _fetch_cost(cur, project_id, cost_id)
        cur.execute("DELETE FROM project_costs WHERE id = %s", (cost_id,))
        audit.record(
            cur, req.user, "delete", "cost", cost_id, _label(current, project),
            audit.snapshot(current, _AUDIT_FIELDS), project_id=project_id,
        )
    return response(204)
