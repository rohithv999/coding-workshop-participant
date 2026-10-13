-- Project Tracker schema. Safe to run repeatedly (IF NOT EXISTS).

CREATE TABLE IF NOT EXISTS users (
    id            SERIAL PRIMARY KEY,
    first_name    VARCHAR(100) NOT NULL,
    last_name     VARCHAR(100) NOT NULL,
    username      VARCHAR(6)   NOT NULL UNIQUE CHECK (char_length(username) = 6),
    password_hash TEXT         NOT NULL,
    email         VARCHAR(255) NOT NULL UNIQUE,
    job_title     VARCHAR(100),
    role          VARCHAR(20)  NOT NULL CHECK (role IN ('admin', 'manager', 'employee')),
    manager_id    INTEGER REFERENCES users(id),
    hourly_rate   NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (hourly_rate >= 0),
    is_archived   BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS projects (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(200) NOT NULL,
    description TEXT,
    manager_id  INTEGER      NOT NULL REFERENCES users(id),
    start_date  DATE         NOT NULL,
    end_date    DATE         NOT NULL,
    budget      NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (budget >= 0),
    status      VARCHAR(20)  NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'done')),
    is_archived BOOLEAN      NOT NULL DEFAULT FALSE,
    archived_at TIMESTAMPTZ,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CHECK (end_date >= start_date)
);

CREATE TABLE IF NOT EXISTS project_assignments (
    id            SERIAL PRIMARY KEY,
    project_id    INTEGER NOT NULL REFERENCES projects(id),
    user_id       INTEGER NOT NULL REFERENCES users(id),
    hours_per_day NUMERIC(4, 2) NOT NULL DEFAULT 8 CHECK (hours_per_day > 0 AND hours_per_day <= 8),
    start_date    DATE    NOT NULL,
    end_date      DATE    NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (project_id, user_id),
    CHECK (end_date >= start_date)
);

CREATE TABLE IF NOT EXISTS milestones (
    id           SERIAL PRIMARY KEY,
    project_id   INTEGER      NOT NULL REFERENCES projects(id),
    name         VARCHAR(200) NOT NULL,
    description  TEXT,
    start_date   DATE         NOT NULL,
    end_date     DATE         NOT NULL,
    status       VARCHAR(20)  NOT NULL DEFAULT 'not_started'
                 CHECK (status IN ('not_started', 'in_progress', 'complete')),
    completed_at TIMESTAMPTZ,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CHECK (end_date >= start_date)
);

CREATE TABLE IF NOT EXISTS budget_adjustments (
    id         SERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES projects(id),
    old_amount NUMERIC(12, 2) NOT NULL,
    new_amount NUMERIC(12, 2) NOT NULL,
    reason     TEXT,
    changed_by INTEGER NOT NULL REFERENCES users(id),
    changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes on foreign keys and common filters
CREATE INDEX IF NOT EXISTS idx_users_manager        ON users(manager_id);
CREATE INDEX IF NOT EXISTS idx_projects_manager     ON projects(manager_id);
CREATE INDEX IF NOT EXISTS idx_assignments_project  ON project_assignments(project_id);
CREATE INDEX IF NOT EXISTS idx_assignments_user     ON project_assignments(user_id);
CREATE INDEX IF NOT EXISTS idx_milestones_project   ON milestones(project_id);
CREATE INDEX IF NOT EXISTS idx_budget_adj_project   ON budget_adjustments(project_id);


-- Application settings (e.g. the JWT signing secret)
CREATE TABLE IF NOT EXISTS app_settings (
    key        VARCHAR(100) PRIMARY KEY,
    value      TEXT         NOT NULL,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);