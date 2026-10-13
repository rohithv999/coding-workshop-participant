"""Authentication (JWT) and role-based authorization."""

import os
from datetime import datetime, timedelta, timezone
from functools import wraps

import jwt

from core import db
from core.http import ApiError

ALGORITHM = "HS256"
ACCESS_TOKEN_MINUTES = 30
REFRESH_TOKEN_DAYS = 7

ROLES = ("admin", "manager", "employee")

# Every user column except password_hash - safe to return in API responses
PUBLIC_USER_COLUMNS = (
    "id, first_name, last_name, username, email, job_title, role, "
    "manager_id, hourly_rate, is_archived, created_at, updated_at"
)


def _secret():
    return os.getenv("JWT_SECRET") or db.get_setting("jwt_secret")


def _make_token(user, token_type, lifetime):
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user["id"]),
        "role": user["role"],
        "type": token_type,
        "iat": now,
        "exp": now + lifetime,
    }
    return jwt.encode(payload, _secret(), algorithm=ALGORITHM)


def create_tokens(user):
    """Return a new access token and refresh token for this user."""
    return {
        "access_token": _make_token(user, "access", timedelta(minutes=ACCESS_TOKEN_MINUTES)),
        "refresh_token": _make_token(user, "refresh", timedelta(days=REFRESH_TOKEN_DAYS)),
        "token_type": "Bearer",
        "expires_in": ACCESS_TOKEN_MINUTES * 60,
    }


def decode_token(token, expected_type):
    """Verify signature, expiry, and type. Raises 401 on any problem."""
    try:
        payload = jwt.decode(
            token,
            _secret(),
            algorithms=[ALGORITHM],
            options={"require": ["exp", "sub", "type"]},
        )
    except jwt.ExpiredSignatureError as exc:
        raise ApiError(401, "Token has expired") from exc
    except jwt.InvalidTokenError as exc:
        raise ApiError(401, "Invalid token") from exc
    if payload.get("type") != expected_type:
        raise ApiError(401, "Invalid token type")
    return payload


def load_active_user(user_id):
    """Fetch the user fresh from the database; reject missing or archived users."""
    with db.transaction() as cur:
        cur.execute(f"SELECT {PUBLIC_USER_COLUMNS} FROM users WHERE id = %s", (user_id,))
        user = cur.fetchone()
    if user is None or user["is_archived"]:
        raise ApiError(401, "User account is not active")
    return user


def _bearer_token(req):
    header = req.headers.get("authorization", "")
    scheme, _, token = header.partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        raise ApiError(401, "Missing or malformed Authorization header")
    return token.strip()


def require_auth(*allowed_roles):
    """
    Protect an endpoint. Usage:
        @require_auth()                    -> any logged-in user
        @require_auth("admin")             -> admins only
        @require_auth("admin", "manager")  -> admins and managers
    """
    def decorator(fn):
        @wraps(fn)
        def wrapper(req):
            payload = decode_token(_bearer_token(req), "access")
            user = load_active_user(int(payload["sub"]))
            if allowed_roles and user["role"] not in allowed_roles:
                raise ApiError(403, "You do not have permission to perform this action")
            req.user = user
            return fn(req)
        return wrapper
    return decorator