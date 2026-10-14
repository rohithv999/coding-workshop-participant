"""Integration tests: the append-only audit log (core/audit.py, api/audit_log.py)."""

import psycopg
import pytest

from core import db


def test_changes_are_logged_with_before_and_after_values(admin, manager, project):
    manager.put(f"/projects/{project['id']}", {"name": "Renamed project"})

    status, page = admin.get("/audit-log", {"entity_type": "project", "project_id": str(project["id"])})
    assert status == 200
    latest = page["items"][0]
    assert latest["action"] == "update"
    assert latest["actor_id"] == manager.user["id"]
    assert latest["changes"]["name"] == {"from": project["name"], "to": "Renamed project"}


def test_saving_without_changes_is_not_logged(admin, manager, project):
    _, before = admin.get("/audit-log", {"project_id": str(project["id"])})
    manager.put(f"/projects/{project['id']}", {"name": project["name"]})   # same value
    _, after = admin.get("/audit-log", {"project_id": str(project["id"])})
    assert len(after["items"]) == len(before["items"])


def test_password_changes_are_logged_without_values(admin, employee):
    employee.post("/auth/change-password", {"current_password": "Password123", "new_password": "NewPass456"})
    _, page = admin.get("/audit-log", {"action": "change_password", "actor_id": str(employee.user["id"])})
    assert page["items"][0]["changes"] is None


def test_only_admins_can_read_the_audit_log(manager, employee):
    assert manager.get("/audit-log")[0] == 403
    assert employee.get("/audit-log")[0] == 403


def test_cursor_pagination_has_no_gaps_or_duplicates(admin, project):  # pylint: disable=unused-argument
    _, first = admin.get("/audit-log", {"limit": "2"})
    _, second = admin.get("/audit-log", {"limit": "2", "before": str(first["next_cursor"])})
    first_ids = [e["id"] for e in first["items"]]
    second_ids = [e["id"] for e in second["items"]]
    assert first_ids == sorted(first_ids, reverse=True)
    assert second_ids[0] < first_ids[-1]
    assert not set(first_ids) & set(second_ids)


@pytest.mark.parametrize("statement", ["DELETE FROM audit_log", "TRUNCATE audit_log", "UPDATE audit_log SET action = 'x'"])
def test_the_database_refuses_to_change_history(project, statement):  # pylint: disable=unused-argument
    with pytest.raises(psycopg.errors.RaiseException, match="append-only"):
        with db.transaction() as cur:
            cur.execute(statement)
