"""PostgreSQL connection management (reused across Lambda invocations)."""

import os
from contextlib import contextmanager

import psycopg
from psycopg.rows import dict_row

_conn = None


def _conninfo():
    # Built the same way as the workshop example, plus SSL in the cloud
    info = (
        f"host={os.getenv('POSTGRES_HOST', 'localhost')} "
        f"port={os.getenv('POSTGRES_PORT', '5432')} "
        f"user={os.getenv('POSTGRES_USER', 'test')} "
        f"password={os.getenv('POSTGRES_PASS', 'test')} "
        f"dbname={os.getenv('POSTGRES_NAME', 'test')} "
        f"connect_timeout=15"
    )
    if os.getenv("IS_LOCAL", "false") != "true":
        info += " sslmode=require"
    return info


def get_conn():
    global _conn
    if _conn is None or _conn.closed:
        _conn = psycopg.connect(_conninfo(), row_factory=dict_row)
    return _conn


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