"""Integration tests: login, tokens, and self-service profile (api/auth.py)."""

from conftest import login


def test_bad_logins_all_get_the_same_vague_message(api, employee):
    for body in [
        {"username": employee.user["username"], "password": "WrongPass1"},
        {"username": "nosuch", "password": "Password123"},
    ]:
        status, data = api.post("/auth/login", body)
        assert status == 401
        assert data["error"] == "Invalid username or password"


def test_missing_login_fields_are_listed(api):
    status, data = api.post("/auth/login", {})
    assert status == 400
    assert set(data["details"]) == {"username", "password"}


def test_responses_never_include_password_hashes(employee):
    assert "password_hash" not in employee.user
    status, me = employee.get("/auth/me")
    assert status == 200
    assert "password_hash" not in me


def test_protected_routes_need_a_valid_token(api):
    assert api.get("/auth/me")[0] == 401
    api.token = "not-a-real-token"
    status, data = api.get("/auth/me")
    assert status == 401
    assert data["error"] == "Invalid token"


def test_refresh_gives_new_tokens_but_token_types_cannot_be_swapped(api, employee):
    status, first = api.post("/auth/login", {"username": employee.user["username"], "password": "Password123"})
    assert status == 200

    status, refreshed = api.post("/auth/refresh", {"refresh_token": first["refresh_token"]})
    assert status == 200
    assert refreshed["access_token"]

    # An access token can't be used to refresh...
    status, data = api.post("/auth/refresh", {"refresh_token": first["access_token"]})
    assert status == 401 and data["error"] == "Invalid token type"

    # ...and a refresh token can't be used to call the API
    api.token = first["refresh_token"]
    status, data = api.get("/auth/me")
    assert status == 401 and data["error"] == "Invalid token type"


def test_archiving_a_user_locks_them_out_immediately(admin, create_user, manager):
    worker = create_user("employee", manager_id=manager.user["id"])
    assert worker.get("/auth/me")[0] == 200

    assert admin.delete(f"/users/{worker.user['id']}")[0] == 204

    status, data = worker.get("/auth/me")  # their existing token stops working
    assert status == 401 and data["error"] == "User account is not active"


def test_users_can_change_their_name_but_not_their_role(employee):
    status, data = employee.put("/auth/me", {"first_name": "Renamed"})
    assert status == 200 and data["first_name"] == "Renamed"

    status, data = employee.put("/auth/me", {"role": "admin"})
    assert status == 400
    assert data["details"]["role"] == "cannot be changed here"


def test_change_password_requires_the_current_one(employee):
    status, data = employee.post("/auth/change-password", {"current_password": "Wrong123", "new_password": "NewPass456"})
    assert status == 400 and data["details"]["current_password"] == "is incorrect"

    status, data = employee.post("/auth/change-password", {"current_password": "Password123", "new_password": "short"})
    assert status == 400 and "new_password" in data["details"]

    status, _ = employee.post("/auth/change-password", {"current_password": "Password123", "new_password": "NewPass456"})
    assert status == 204
    assert login(employee.user["username"], "NewPass456").user["id"] == employee.user["id"]
