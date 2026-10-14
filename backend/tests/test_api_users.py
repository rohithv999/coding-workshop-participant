"""Integration tests: user management and role-based access (api/users.py)."""

from conftest import unique


def test_employees_cannot_list_users(employee):
    assert employee.get("/users")[0] == 403


def test_managers_only_see_active_employees(manager, employee):
    status, users = manager.get("/users")
    assert status == 200
    assert users, "expected at least one employee"
    assert all(u["role"] == "employee" and not u["is_archived"] for u in users)
    assert employee.user["id"] in [u["id"] for u in users]


def test_admin_creates_users_with_generated_usernames(admin, manager):
    tag = unique("u")
    status, user = admin.post("/users", {
        "first_name": "New", "last_name": tag, "email": f"{tag}@test.local",
        "role": "employee", "manager_id": manager.user["id"], "password": "Password123",
    })
    assert status == 201
    assert len(user["username"]) == 6
    assert "password_hash" not in user


def test_employees_must_have_an_active_manager(admin, employee):
    tag = unique("u")
    base = {"first_name": "A", "last_name": tag, "role": "employee", "password": "Password123"}

    status, data = admin.post("/users", {**base, "email": f"{tag}a@test.local"})
    assert status == 400 and "manager_id" in data["details"]

    # Pointing at an employee instead of a manager is rejected too
    status, data = admin.post("/users", {**base, "email": f"{tag}b@test.local", "manager_id": employee.user["id"]})
    assert status == 400 and data["details"]["manager_id"] == "must be an active manager"


def test_duplicate_emails_are_rejected_case_insensitively(admin, employee):
    status, data = admin.post("/users", {
        "first_name": "Copy", "last_name": "Cat", "email": employee.user["email"].upper(),
        "role": "manager", "password": "Password123",
    })
    assert status == 409
    assert "email" in data["details"]


def test_managers_edit_only_their_own_team_and_only_safe_fields(create_user, manager, employee):
    status, data = manager.put(f"/users/{employee.user['id']}", {"first_name": "Edited"})
    assert status == 200 and data["first_name"] == "Edited"

    status, data = manager.put(f"/users/{employee.user['id']}", {"hourly_rate": 999})
    assert status == 400 and "hourly_rate" in data["details"]

    other_manager = create_user("manager")
    status, data = other_manager.put(f"/users/{employee.user['id']}", {"first_name": "Nope"})
    assert status == 403


def test_managers_and_employees_cannot_create_or_archive_users(manager, employee):
    for client in (manager, employee):
        assert client.post("/users", {})[0] == 403
        assert client.delete(f"/users/{employee.user['id']}")[0] == 403


def test_manager_with_a_team_cannot_be_archived(admin, manager, employee):  # pylint: disable=unused-argument
    status, data = admin.delete(f"/users/{manager.user['id']}")
    assert status == 409
    assert data["details"]["active_employees"] >= 1


def test_admin_cannot_archive_themselves(admin):
    status, _ = admin.delete(f"/users/{admin.user['id']}")
    assert status == 400


def test_hidden_users_return_404_not_403(employee, manager):
    # An employee asking for their manager's profile shouldn't even learn it exists
    status, _ = employee.get(f"/users/{manager.user['id']}")
    assert status == 404
