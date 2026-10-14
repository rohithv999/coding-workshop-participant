"""Smoke tests: prove the test setup itself works."""


def test_health_check_reaches_the_test_database(api):
    status, data = api.get("/health")
    assert status == 200
    assert data["status"] == "ok"


def test_seeded_admin_can_log_in(admin):
    assert admin.user["username"] == "admin1"
    assert admin.user["role"] == "admin"


def test_fixtures_create_linked_users_and_projects(manager, employee, project):
    assert employee.user["manager_id"] == manager.user["id"]
    assert project["manager_id"] == manager.user["id"]
    assert project["status"] == "active"
