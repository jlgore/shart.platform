-- Lab infrastructure tables
-- Run against the shared shart-ctf-db D1 database

-- Active/historical lab sessions
CREATE TABLE IF NOT EXISTS lab_sessions (
  session_id    TEXT PRIMARY KEY,          -- {userId}:{labId}:{attemptId}
  user_id       TEXT NOT NULL,
  lab_id        TEXT NOT NULL,
  attempt_id    TEXT NOT NULL,
  container_key TEXT NOT NULL,             -- same as session_id, used for DO routing
  started_at    INTEGER NOT NULL,          -- unix timestamp
  expires_at    INTEGER NOT NULL,          -- started_at + lab time limit
  last_active_at INTEGER NOT NULL,
  status        TEXT NOT NULL DEFAULT 'active'  -- active | sleeping | completed | expired
    CHECK (status IN ('active', 'sleeping', 'completed', 'expired'))
);

CREATE INDEX IF NOT EXISTS lab_sessions_user_id ON lab_sessions(user_id);
CREATE INDEX IF NOT EXISTS lab_sessions_status ON lab_sessions(status);

-- Successful lab completions
CREATE TABLE IF NOT EXISTS lab_completions (
  completion_id  TEXT PRIMARY KEY,
  session_id     TEXT NOT NULL REFERENCES lab_sessions(session_id),
  user_id        TEXT NOT NULL,
  lab_id         TEXT NOT NULL,
  completed_at   INTEGER NOT NULL,
  checks_passed  INTEGER NOT NULL DEFAULT 0,
  checks_total   INTEGER NOT NULL DEFAULT 0,
  score          REAL NOT NULL DEFAULT 0.0
);

CREATE INDEX IF NOT EXISTS lab_completions_user_id ON lab_completions(user_id);
CREATE INDEX IF NOT EXISTS lab_completions_lab_id ON lab_completions(lab_id);

-- Container lifecycle events for internal billing estimation
CREATE TABLE IF NOT EXISTS usage_events (
  event_id      TEXT PRIMARY KEY,
  session_id    TEXT NOT NULL REFERENCES lab_sessions(session_id),
  event_type    TEXT NOT NULL              -- started | sleeping | woke
    CHECK (event_type IN ('started', 'sleeping', 'woke')),
  occurred_at   INTEGER NOT NULL,
  instance_type TEXT NOT NULL DEFAULT 'standard'
);

CREATE INDEX IF NOT EXISTS usage_events_session_id ON usage_events(session_id);
CREATE INDEX IF NOT EXISTS usage_events_occurred_at ON usage_events(occurred_at);
