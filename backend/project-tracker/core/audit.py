"""Audit log: an append-only record of who changed what.
Always call record() with the same cursor as the change, so both commit or roll back together.
"""

import json
from datetime import date, datetime
from decimal import Decimal

_HIDDEN_FIELDS = {"password", "password_hash"}


def _json_safe(value):
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    return value


def diff(before, updates):
    """Return {field: {"from": old, "to": new}} for fields whose value actually changes."""
    changes = {}
    for field, new in updates.items():
        if field in _HIDDEN_FIELDS:
            continue
        old = before.get(field)
        if _json_safe(old) != _json_safe(new):
            changes[field] = {"from": _json_safe(old), "to": _json_safe(new)}
    return changes


def snapshot(values, fields):
    """Pick key fields from a newly created record, for 'create' entries."""
    return {
        field: _json_safe(values.get(field))
        for field in fields
        if field in values and field not in _HIDDEN_FIELDS
    }


def record(cur, actor, action, entity_type, entity_id, label, changes=None, project_id=None):
    """Insert one audit entry. `actor` is the logged-in user (req.user)."""
    cur.execute(
        """
        INSERT INTO audit_log (actor_id, actor_name, actor_role, action, entity_type,
                               entity_id, entity_label, project_id, changes)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb)
        """,
        (
            actor["id"] if actor else None,
            f"{actor['first_name']} {actor['last_name']}" if actor else "System",
            actor["role"] if actor else None,
            action,
            entity_type,
            entity_id,
            label,
            project_id,
            json.dumps(changes) if changes else None,
        ),
    )
