"""Audit log API: admins can read the append-only change history."""

from core import db
from core.app import router
from core.auth import require_auth
from core.http import ApiError, response

ENTITY_TYPES = ("user", "project", "assignment", "milestone")
_DEFAULT_LIMIT = 50
_MAX_LIMIT = 200
_ID_FILTERS = ("actor_id", "project_id", "entity_id")


def _positive_int(query, name):
    value = query.get(name)
    if value in (None, ""):
        return None
    if not value.isdigit() or int(value) < 1:
        raise ApiError(400, "Validation failed", {name: "must be a positive whole number"})
    return int(value)


@router.route("GET", "/audit-log")
@require_auth("admin")
def list_audit_log(req):
    """
    Newest first. Query params:
      entity_type             - user | project | assignment | milestone
      action                  - create | update | archive | unarchive | delete | end | complete | reopen | change_password
      actor_id, project_id, entity_id
      search                  - matches the entry label or the actor's name
      limit                   - 1-200 (default 50)
      before                  - cursor: entries older than this id (use next_cursor from the previous page)
    """
    query = req.query
    conditions, params = [], []

    if query.get("entity_type"):
        if query["entity_type"] not in ENTITY_TYPES:
            raise ApiError(400, "Validation failed", {"entity_type": f"must be one of: {', '.join(ENTITY_TYPES)}"})
        conditions.append("entity_type = %s")
        params.append(query["entity_type"])

    if query.get("action"):
        conditions.append("action = %s")
        params.append(query["action"][:30])

    # Column names come from the fixed tuple above, never from user input
    for name in _ID_FILTERS:
        value = _positive_int(query, name)
        if value is not None:
            conditions.append(f"{name} = %s")
            params.append(value)

    before = _positive_int(query, "before")
    if before is not None:
        conditions.append("id < %s")
        params.append(before)

    if query.get("search", "").strip():
        conditions.append("(entity_label ILIKE %s OR actor_name ILIKE %s)")
        params.extend([f"%{query['search'].strip()}%"] * 2)

    limit = min(_positive_int(query, "limit") or _DEFAULT_LIMIT, _MAX_LIMIT)
    where = f"WHERE {' AND '.join(conditions)}" if conditions else ""

    with db.transaction() as cur:
        # Fetch one extra row to know whether another page exists
        cur.execute(
            f"""
            SELECT id, actor_id, actor_name, actor_role, action, entity_type, entity_id,
                   entity_label, project_id, changes, created_at
            FROM audit_log {where}
            ORDER BY id DESC
            LIMIT %s
            """,
            [*params, limit + 1],
        )
        rows = cur.fetchall()

    has_more = len(rows) > limit
    items = rows[:limit]
    return response(200, {"items": items, "next_cursor": items[-1]["id"] if has_more else None})
