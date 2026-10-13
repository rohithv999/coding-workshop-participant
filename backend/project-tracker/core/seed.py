"""Initial data: creates a default admin if none exists."""

import os

from core.security import hash_password

DEFAULT_ADMIN = {
    "first_name": "System",
    "last_name": "Admin",
    "username": "admin1",
    "email": "admin@acme.com",
    "job_title": "Administrator",
}


def seed_admin(cur):
    """Insert the default admin only if there are no admins yet."""
    cur.execute("SELECT 1 FROM users WHERE role = 'admin' LIMIT 1")
    if cur.fetchone():
        return

    password = os.getenv("ADMIN_PASSWORD", "ChangeMe123!")
    cur.execute(
        """
        INSERT INTO users (first_name, last_name, username, password_hash,
                           email, job_title, role)
        VALUES (%s, %s, %s, %s, %s, %s, 'admin')
        ON CONFLICT (username) DO NOTHING
        """,
        (
            DEFAULT_ADMIN["first_name"],
            DEFAULT_ADMIN["last_name"],
            DEFAULT_ADMIN["username"],
            hash_password(password),
            DEFAULT_ADMIN["email"],
            DEFAULT_ADMIN["job_title"],
        ),
    )