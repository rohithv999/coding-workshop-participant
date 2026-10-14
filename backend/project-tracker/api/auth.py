"""Auth endpoints: login, refresh, current user, change password."""

from core import audit, db
from core.app import router
from core.auth import (
    PUBLIC_USER_COLUMNS,
    create_tokens,
    decode_token,
    load_active_user,
    require_auth,
)
from core.http import ApiError, response
from core.security import hash_password, verify_password

MIN_PASSWORD_LENGTH = 8
_INVALID_LOGIN = "Invalid username or password"
_SELF_EDITABLE_FIELDS = {"first_name", "last_name"}


def password_problems(password):
    """Return a list of reasons the password is too weak (empty list = OK)."""
    if not isinstance(password, str) or len(password) < MIN_PASSWORD_LENGTH:
        return [f"must be at least {MIN_PASSWORD_LENGTH} characters"]
    problems = []
    if not any(c.isalpha() for c in password):
        problems.append("must contain a letter")
    if not any(c.isdigit() for c in password):
        problems.append("must contain a number")
    return problems


def _required_text(data, field, errors):
    value = data.get(field)
    if not isinstance(value, str) or not value.strip():
        errors[field] = "is required"
        return None
    return value.strip()


@router.route("POST", "/auth/login")
def login(req):
    data = req.json()
    errors = {}
    username = _required_text(data, "username", errors)
    password = data.get("password")
    if not isinstance(password, str) or not password:
        errors["password"] = "is required"
    if errors:
        raise ApiError(400, "Validation failed", errors)

    with db.transaction() as cur:
        cur.execute(
            f"SELECT {PUBLIC_USER_COLUMNS}, password_hash FROM users WHERE username = %s",
            (username.lower(),),
        )
        user = cur.fetchone()

    # Same message for every failure so attackers can't tell which part was wrong
    if user is None or user["is_archived"] or not verify_password(password, user["password_hash"]):
        raise ApiError(401, _INVALID_LOGIN)

    user.pop("password_hash")
    return response(200, {"user": user, **create_tokens(user)})


@router.route("POST", "/auth/refresh")
def refresh(req):
    errors = {}
    token = _required_text(req.json(), "refresh_token", errors)
    if errors:
        raise ApiError(400, "Validation failed", errors)
    payload = decode_token(token, "refresh")
    user = load_active_user(int(payload["sub"]))
    return response(200, {"user": user, **create_tokens(user)})


@router.route("GET", "/auth/me")
@require_auth()
def get_me(req):
    return response(200, req.user)


@router.route("PUT", "/auth/me")
@require_auth()
def update_me(req):
    data = req.json()
    errors = {f: "cannot be changed here" for f in sorted(set(data) - _SELF_EDITABLE_FIELDS)}
    updates = {}
    for field in sorted(_SELF_EDITABLE_FIELDS & set(data)):
        value = data[field]
        if not isinstance(value, str) or not value.strip():
            errors[field] = "must be a non-empty string"
        elif len(value.strip()) > 100:
            errors[field] = "must be at most 100 characters"
        else:
            updates[field] = value.strip()
    if errors:
        raise ApiError(400, "Validation failed", errors)
    if not updates:
        raise ApiError(400, "Provide first_name and/or last_name")

    # Field names come from our allow-list above, never from user input
    set_clause = ", ".join(f"{field} = %s" for field in updates)
    with db.transaction() as cur:
        cur.execute(
            f"UPDATE users SET {set_clause}, updated_at = NOW() "
            f"WHERE id = %s RETURNING {PUBLIC_USER_COLUMNS}",
            (*updates.values(), req.user["id"]),
        )
        user = cur.fetchone()
        changes = audit.diff(req.user, updates)
        if changes:
            label = f"{user['first_name']} {user['last_name']}"
            audit.record(cur, req.user, "update", "user", user["id"], label, changes)
    return response(200, user)


@router.route("POST", "/auth/change-password")
@require_auth()
def change_password(req):
    data = req.json()
    errors = {}
    current = data.get("current_password")
    new = data.get("new_password")
    if not isinstance(current, str) or not current:
        errors["current_password"] = "is required"
    problems = password_problems(new)
    if problems:
        errors["new_password"] = "; ".join(problems)
    if errors:
        raise ApiError(400, "Validation failed", errors)

    with db.transaction() as cur:
        cur.execute("SELECT password_hash FROM users WHERE id = %s", (req.user["id"],))
        row = cur.fetchone()
        if not verify_password(current, row["password_hash"]):
            raise ApiError(400, "Validation failed", {"current_password": "is incorrect"})
        cur.execute(
            "UPDATE users SET password_hash = %s, updated_at = NOW() WHERE id = %s",
            (hash_password(new), req.user["id"]),
        )
        label = f"{req.user['first_name']} {req.user['last_name']}"
        audit.record(cur, req.user, "change_password", "user", req.user["id"], label)
    return response(204)