"""Users API: admins manage everyone; managers see employees and edit their own team."""

import psycopg

from api.auth import password_problems
from core import db
from core.app import router
from core.auth import PUBLIC_USER_COLUMNS, ROLES, require_auth
from core.http import ApiError, response
from core.security import generate_username, hash_password
from core.validation import Validator, path_id

_USERNAME_ATTEMPTS = 5

_ADMIN_EDITABLE = {
    "first_name", "last_name", "email", "job_title",
    "role", "manager_id", "hourly_rate",
}
_MANAGER_EDITABLE = {"first_name", "last_name", "email"}

_CREATE_FIELDS = {
    "first_name", "last_name", "email", "job_title",
    "role", "manager_id", "hourly_rate", "password",
}
_STATUS_FILTERS = ("active", "archived", "all")


# ---------- helpers ----------

def _fetch_user(cur, user_id):
    cur.execute(f"SELECT {PUBLIC_USER_COLUMNS} FROM users WHERE id = %s", (user_id,))
    user = cur.fetchone()
    if user is None:
        raise ApiError(404, "User not found")
    return user


def _ensure_active_manager(cur, manager_id):
    cur.execute("SELECT role, is_archived FROM users WHERE id = %s", (manager_id,))
    row = cur.fetchone()
    if row is None or row["role"] != "manager" or row["is_archived"]:
        raise ApiError(400, "Validation failed", {"manager_id": "must be an active manager"})


def _check_manager_rule(role, manager_id):
    """Employees need exactly one manager; admins and managers have none."""
    if role == "employee" and manager_id is None:
        raise ApiError(400, "Validation failed", {"manager_id": "is required for employees"})
    if role != "employee" and manager_id is not None:
        raise ApiError(400, "Validation failed", {"manager_id": "only employees can have a manager"})


def _can_view(viewer, user):
    if viewer["role"] == "admin" or viewer["id"] == user["id"]:
        return True
    if viewer["role"] == "manager":
        return user["role"] == "employee" and not user["is_archived"]
    return False


def _unique_username(cur):
    for _ in range(_USERNAME_ATTEMPTS):
        username = generate_username()
        cur.execute("SELECT 1 FROM users WHERE username = %s", (username,))
        if cur.fetchone() is None:
            return username
    raise ApiError(500, "Could not generate a unique username, please retry")


# ---------- endpoints ----------

@router.route("POST", "/users")
@require_auth("admin")
def create_user(req):
    data = req.json()
    v = Validator(data)
    v.reject_unknown(_CREATE_FIELDS)
    v.text("first_name", required=True, max_length=100)
    v.text("last_name", required=True, max_length=100)
    v.email("email", required=True)
    v.text("job_title", max_length=100)
    v.choice("role", ROLES, required=True)
    v.integer_id("manager_id", nullable=True)
    v.number("hourly_rate", minimum=0, maximum=10000)
    problems = password_problems(data.get("password"))
    if problems:
        v.add_error("password", "; ".join(problems))
    values = v.check()

    manager_id = values.get("manager_id")
    _check_manager_rule(values["role"], manager_id)

    with db.transaction() as cur:
        if manager_id is not None:
            _ensure_active_manager(cur, manager_id)
        try:
            cur.execute(
                f"""
                INSERT INTO users (first_name, last_name, username, password_hash, email,
                                   job_title, role, manager_id, hourly_rate)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING {PUBLIC_USER_COLUMNS}
                """,
                (
                    values["first_name"], values["last_name"], _unique_username(cur),
                    hash_password(data["password"]), values["email"],
                    values.get("job_title"), values["role"], manager_id,
                    values.get("hourly_rate", 0),
                ),
            )
        except psycopg.errors.UniqueViolation as exc:
            raise ApiError(409, "Email is already in use", {"email": "is already in use"}) from exc
        user = cur.fetchone()
    return response(201, user)


@router.route("GET", "/users")
@require_auth("admin", "manager")
def list_users(req):
    """
    Query params:
      search      - matches name, email, username, or job title
      role        - admin | manager | employee        (admins only)
      status      - active (default) | archived | all (admins only)
      manager_id  - a manager's id, or "me"
    """
    query = req.query
    conditions, params = [], []

    if req.user["role"] == "manager":
        # Managers only ever see active employees
        conditions.append("role = 'employee' AND NOT is_archived")
    else:
        status = query.get("status", "active")
        if status not in _STATUS_FILTERS:
            raise ApiError(400, "Validation failed", {"status": f"must be one of: {', '.join(_STATUS_FILTERS)}"})
        if status == "active":
            conditions.append("NOT is_archived")
        elif status == "archived":
            conditions.append("is_archived")
        if query.get("role"):
            if query["role"] not in ROLES:
                raise ApiError(400, "Validation failed", {"role": f"must be one of: {', '.join(ROLES)}"})
            conditions.append("role = %s")
            params.append(query["role"])

    if query.get("manager_id"):
        manager_id = str(req.user["id"]) if query["manager_id"] == "me" else query["manager_id"]
        if not manager_id.isdigit():
            raise ApiError(400, "Validation failed", {"manager_id": "must be an id or 'me'"})
        conditions.append("manager_id = %s")
        params.append(int(manager_id))

    if query.get("search", "").strip():
        conditions.append(
            "(first_name ILIKE %s OR last_name ILIKE %s OR email ILIKE %s "
            "OR username ILIKE %s OR job_title ILIKE %s)"
        )
        params.extend([f"%{query['search'].strip()}%"] * 5)

    where = f"WHERE {' AND '.join(conditions)}" if conditions else ""
    with db.transaction() as cur:
        cur.execute(
            f"SELECT {PUBLIC_USER_COLUMNS} FROM users {where} ORDER BY last_name, first_name",
            params,
        )
        users = cur.fetchall()
    return response(200, users)


@router.route("GET", "/users/{id}")
@require_auth()
def get_user(req):
    with db.transaction() as cur:
        user = _fetch_user(cur, path_id(req))
    if not _can_view(req.user, user):
        raise ApiError(404, "User not found")
    return response(200, user)



# ---------- update / archive helpers ----------

def _ensure_no_dependents(cur, manager_id, action):
    """A manager can't stop being a manager while projects or employees depend on them."""
    cur.execute(
        """
        SELECT
          (SELECT COUNT(*) FROM projects WHERE manager_id = %s AND NOT is_archived) AS active_projects,
          (SELECT COUNT(*) FROM users    WHERE manager_id = %s AND NOT is_archived) AS active_employees
        """,
        (manager_id, manager_id),
    )
    deps = cur.fetchone()
    if deps["active_projects"] or deps["active_employees"]:
        raise ApiError(
            409,
            f"Reassign this manager's projects and employees before {action}",
            {"active_projects": deps["active_projects"], "active_employees": deps["active_employees"]},
        )


def _apply_admin_rules(cur, actor, user, values):
    """Validate role/manager changes made by an admin. Adjusts `values` in place."""
    new_role = values.get("role", user["role"])
    if user["id"] == actor["id"] and new_role != user["role"]:
        raise ApiError(400, "Validation failed", {"role": "you cannot change your own role"})

    if "manager_id" in values:
        new_manager = values["manager_id"]
    elif new_role == "employee":
        new_manager = user["manager_id"]
    else:
        new_manager = None  # promoted out of employee: drop the manager link

    _check_manager_rule(new_role, new_manager)
    if new_manager is not None:
        _ensure_active_manager(cur, new_manager)
    if user["role"] == "manager" and new_role != "manager":
        _ensure_no_dependents(cur, user["id"], "changing their role")

    if new_manager != user["manager_id"]:
        values["manager_id"] = new_manager


# ---------- update / archive endpoints ----------

@router.route("PUT", "/users/{id}")
@require_auth("admin", "manager")
def update_user(req):
    user_id = path_id(req)
    is_admin = req.user["role"] == "admin"

    v = Validator(req.json(), partial=True)
    v.reject_unknown(_ADMIN_EDITABLE if is_admin else _MANAGER_EDITABLE)
    v.text("first_name", required=True, max_length=100)
    v.text("last_name", required=True, max_length=100)
    v.email("email", required=True)
    v.text("job_title", max_length=100)
    v.choice("role", ROLES)
    v.integer_id("manager_id", nullable=True)
    v.number("hourly_rate", minimum=0, maximum=10000)
    values = v.check()
    if not values:
        raise ApiError(400, "No fields to update")

    with db.transaction() as cur:
        user = _fetch_user(cur, user_id)
        if is_admin:
            _apply_admin_rules(cur, req.user, user, values)
        else:
            if not _can_view(req.user, user):
                raise ApiError(404, "User not found")
            if user["manager_id"] != req.user["id"]:
                raise ApiError(403, "You can only edit employees on your own team")

        # Field names come from the allow-lists above, never from user input
        set_clause = ", ".join(f"{field} = %s" for field in values)
        try:
            cur.execute(
                f"UPDATE users SET {set_clause}, updated_at = NOW() "
                f"WHERE id = %s RETURNING {PUBLIC_USER_COLUMNS}",
                (*values.values(), user_id),
            )
        except psycopg.errors.UniqueViolation as exc:
            raise ApiError(409, "Email is already in use", {"email": "is already in use"}) from exc
        updated = cur.fetchone()
    return response(200, updated)


@router.route("DELETE", "/users/{id}")
@require_auth("admin")
def archive_user(req):
    """Soft delete: the user is archived, never removed."""
    user_id = path_id(req)
    if user_id == req.user["id"]:
        raise ApiError(400, "You cannot archive your own account")

    with db.transaction() as cur:
        user = _fetch_user(cur, user_id)
        if not user["is_archived"]:
            if user["role"] == "manager":
                _ensure_no_dependents(cur, user_id, "archiving them")
            cur.execute(
                "UPDATE users SET is_archived = TRUE, updated_at = NOW() WHERE id = %s",
                (user_id,),
            )
    return response(204)


@router.route("POST", "/users/{id}/unarchive")
@require_auth("admin")
def unarchive_user(req):
    user_id = path_id(req)
    with db.transaction() as cur:
        user = _fetch_user(cur, user_id)
        if user["role"] == "employee":
            cur.execute("SELECT is_archived FROM users WHERE id = %s", (user["manager_id"],))
            manager = cur.fetchone()
            if manager is None or manager["is_archived"]:
                raise ApiError(
                    409,
                    "This employee's manager is archived. Assign an active manager first.",
                    {"manager_id": "must be an active manager"},
                )
        cur.execute(
            f"UPDATE users SET is_archived = FALSE, updated_at = NOW() "
            f"WHERE id = %s RETURNING {PUBLIC_USER_COLUMNS}",
            (user_id,),
        )
        restored = cur.fetchone()
    return response(200, restored)