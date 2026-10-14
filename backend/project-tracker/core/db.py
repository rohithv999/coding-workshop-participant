"""PostgreSQL connection management (reused across Lambda invocations)."""

import logging
import os
import time
from contextlib import contextmanager
from pathlib import Path

import psycopg
from psycopg.rows import dict_row
from core.seed import seed_admin, seed_jwt_secret

_conn = None
logger = logging.getLogger(__name__)

# Aurora Serverless can pause when idle and take ~15-30s to resume. CloudFront gives up
# after 30s, so retry short attempts (3 x 8s + pauses ~ 26s) instead of one long wait.
CONNECT_TIMEOUT_SECONDS = 8
CONNECT_ATTEMPTS = 3


class DatabaseUnavailable(Exception):
    """The database can't be reached yet (e.g. resuming from an idle pause)."""


def _conninfo():
    # Built the same way as the workshop example, plus SSL in the cloud
    info = (
        f"host={os.getenv('POSTGRES_HOST', 'localhost')} "
        f"port={os.getenv('POSTGRES_PORT', '5432')} "
        f"user={os.getenv('POSTGRES_USER', 'test')} "
        f"password={os.getenv('POSTGRES_PASS', 'test')} "
        f"dbname={os.getenv('POSTGRES_NAME', 'test')} "
        f"connect_timeout={CONNECT_TIMEOUT_SECONDS}"
    )
    if os.getenv("IS_LOCAL", "false") != "true":
        info += " sslmode=require"
    return info


def get_conn():
    global _conn
    if _conn is not None and not _conn.closed:
        return _conn
    last_error = None
    for attempt in range(1, CONNECT_ATTEMPTS + 1):
        try:
            _conn = psycopg.connect(_conninfo(), row_factory=dict_row)
            return _conn
        except psycopg.OperationalError as exc:
            last_error = exc
            logger.warning("Database connection attempt %s/%s failed: %s", attempt, CONNECT_ATTEMPTS, exc)
            if attempt < CONNECT_ATTEMPTS:
                time.sleep(1)
    raise DatabaseUnavailable("Database is not reachable yet") from last_error


@contextmanager
def transaction():
    """Usage: with transaction() as cur: cur.execute(...)"""
    global _conn
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            yield cur
        conn.commit()
    except psycopg.OperationalError:
        _conn = None  # broken connection: reconnect next time
        raise
    except Exception:
        conn.rollback()
        raise


def ping():
    with transaction() as cur:
        cur.execute("SELECT version() AS version")
        return cur.fetchone()["version"]



_SCHEMA_FILE = Path(__file__).with_name("schema.sql")
_schema_ready = False


def ensure_schema():
    """Create tables if missing. Runs once per Lambda container."""
    global _schema_ready
    if _schema_ready:
        return
    sql = _SCHEMA_FILE.read_text(encoding="utf-8")
    with transaction() as cur:
        # Lock so two Lambdas starting at the same time don't both run it at once
        cur.execute("SELECT pg_advisory_xact_lock(424242)")
        cur.execute(sql)
        seed_admin(cur)
        seed_jwt_secret(cur)
    _schema_ready = True



_settings_cache = {}


def get_setting(key):
    """Read a value from app_settings (cached per Lambda container)."""
    if key not in _settings_cache:
        with transaction() as cur:
            cur.execute("SELECT value FROM app_settings WHERE key = %s", (key,))
            row = cur.fetchone()
        if row is None:
            raise RuntimeError(f"Missing app setting: {key}")
        _settings_cache[key] = row["value"]
    return _settings_cache[key]