"""Shared test setup: import path, a fresh test database, and API helpers.

Tests call the real Lambda handler() with AWS-shaped events, against a real PostgreSQL
database that is created fresh for each test run and dropped afterwards.
"""

import itertools
import json
import os
import sys
import uuid
from datetime import date, timedelta
from pathlib import Path

import pytest

# Make the service's code (and its bundled libraries: psycopg, PyJWT) importable
SERVICE_DIR = Path(__file__).resolve().parents[1] / "project-tracker"
sys.path.insert(0, str(SERVICE_DIR))

import psycopg  # noqa: E402  (must come after the path setup above)

TEST_DB = "project_tracker_test"
ADMIN_PASSWORD = "AdminPass123"
PG = {
    "host": os.getenv("TEST_POSTGRES_HOST", "172.17.0.1"),
    "port": os.getenv("TEST_POSTGRES_PORT", "5432"),
    "user": os.getenv("TEST_POSTGRES_USER", "postgres"),
    "password": os.getenv("TEST_POSTGRES_PASS", "postgres123"),
}

# Point the app at the test database BEFORE any app module is imported
os.environ.update({
    "IS_LOCAL": "true",
    "POSTGRES_HOST": PG["host"],
    "POSTGRES_PORT": PG["port"],
    "POSTGRES_USER": PG["user"],
    "POSTGRES_PASS": PG["password"],
    "POSTGRES_NAME": TEST_DB,
    "ADMIN_PASSWORD": ADMIN_PASSWORD,
})


def _admin_connection():
    return psycopg.connect(dbname="postgres", autocommit=True, connect_timeout=10, **PG)


@pytest.fixture(scope="session", autouse=True)
def test_database():
    """Create a clean database for the whole run; drop it afterwards."""
    with _admin_connection() as conn:
        conn.execute(f"DROP DATABASE IF EXISTS {TEST_DB} WITH (FORCE)")
        conn.execute(f"CREATE DATABASE {TEST_DB}")
    yield
    from core import db  # pylint: disable=import-outside-toplevel
    if db._conn is not None:  # pylint: disable=protected-access
        db._conn.close()  # pylint: disable=protected-access
    with _admin_connection() as conn:
        conn.execute(f"DROP DATABASE IF EXISTS {TEST_DB} WITH (FORCE)")


# ---------- calling the API ----------

def make_event(method, path, body=None, token=None, query=None):
    """Build a Lambda Function URL event (payload format 2.0), like AWS sends."""
    headers = {"content-type": "application/json"}
    if token:
        headers["authorization"] = f"Bearer {token}"
    return {
        "rawPath": path,
        "requestContext": {"http": {"method": method}},
        "headers": headers,
        "queryStringParameters": query,
        "body": json.dumps(body) if body is not None else None,
        "isBase64Encoded": False,
    }


class ApiClient:
    """Calls the real handler. Returns (status_code, parsed_json_or_None)."""

    def __init__(self, token=None, user=None):
        self.token = token
        self.user = user

    def call(self, method, path, body=None, query=None):
        from function import handler  # pylint: disable=import-outside-toplevel
        result = handler(make_event(method, path, body, self.token, query))
        data = json.loads(result["body"]) if result.get("body") else None
        return result["statusCode"], data

    def get(self, path, query=None):
        return self.call("GET", path, query=query)

    def post(self, path, body=None):
        return self.call("POST", path, body)

    def put(self, path, body=None):
        return self.call("PUT", path, body)

    def delete(self, path):
        return self.call("DELETE", path)


def login(username, password):
    client = ApiClient()
    status, data = client.post("/auth/login", {"username": username, "password": password})
    assert status == 200, data
    client.token = data["access_token"]
    client.user = data["user"]
    return client


# ---------- test data helpers ----------

_counter = itertools.count(1)


def unique(prefix="t"):
    """Unique names, so tests never collide with each other's data."""
    return f"{prefix}{next(_counter)}{uuid.uuid4().hex[:4]}"


TODAY = date.today()


def iso(days_from_today=0):
    return (TODAY + timedelta(days=days_from_today)).isoformat()


@pytest.fixture
def api():
    """A client with no login."""
    return ApiClient()


@pytest.fixture(scope="session")
def admin(test_database):  # pylint: disable=unused-argument,redefined-outer-name
    """The seeded admin1 account, logged in."""
    return login("admin1", ADMIN_PASSWORD)


@pytest.fixture
def create_user(admin):  # pylint: disable=redefined-outer-name
    """Factory: create_user("manager") or create_user("employee", manager_id=...). Returns a logged-in client."""
    def _create(role="employee", manager_id=None, password="Password123", **extra):
        tag = unique("u")
        body = {
            "first_name": "Test",
            "last_name": tag,
            "email": f"{tag}@test.local",
            "role": role,
            "password": password,
            **extra,
        }
        if role == "employee":
            body["manager_id"] = manager_id
        status, data = admin.post("/users", body)
        assert status == 201, data
        return login(data["username"], password)
    return _create


@pytest.fixture
def manager(create_user):  # pylint: disable=redefined-outer-name
    return create_user("manager", hourly_rate=80)


@pytest.fixture
def employee(create_user, manager):  # pylint: disable=redefined-outer-name
    return create_user("employee", manager_id=manager.user["id"], hourly_rate=50)


@pytest.fixture
def project(admin, manager):  # pylint: disable=redefined-outer-name
    """An active project managed by `manager`, running from 30 days ago to 90 days ahead."""
    status, data = admin.post("/projects", {
        "name": unique("Project "),
        "manager_id": manager.user["id"],
        "start_date": iso(-30),
        "end_date": iso(90),
        "budget": 100000,
    })
    assert status == 201, data
    return data
