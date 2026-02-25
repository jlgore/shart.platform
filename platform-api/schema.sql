-- SHART.PLATFORM CTF D1 Schema
-- SQLite-compatible schema for Better Auth + CTF functionality

-- ============================================================================
-- BETTER AUTH TABLES
-- These are managed by Better Auth but we define them for D1 migrations
-- ============================================================================

CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT,
    email TEXT UNIQUE NOT NULL,
    emailVerified INTEGER DEFAULT 0,
    image TEXT,
    createdAt TEXT DEFAULT (datetime('now')),
    updatedAt TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token TEXT UNIQUE NOT NULL,
    expiresAt TEXT NOT NULL,
    ipAddress TEXT,
    userAgent TEXT,
    createdAt TEXT DEFAULT (datetime('now')),
    updatedAt TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS accounts (
    id TEXT PRIMARY KEY,
    userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    accountId TEXT NOT NULL,
    providerId TEXT NOT NULL,
    accessToken TEXT,
    refreshToken TEXT,
    accessTokenExpiresAt TEXT,
    refreshTokenExpiresAt TEXT,
    scope TEXT,
    idToken TEXT,
    password TEXT,
    createdAt TEXT DEFAULT (datetime('now')),
    updatedAt TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS verifications (
    id TEXT PRIMARY KEY,
    identifier TEXT NOT NULL,
    value TEXT NOT NULL,
    expiresAt TEXT NOT NULL,
    createdAt TEXT DEFAULT (datetime('now')),
    updatedAt TEXT DEFAULT (datetime('now'))
);

-- ============================================================================
-- CTF PLATFORM TABLES
-- ============================================================================

-- Extended user profile for CTF
CREATE TABLE IF NOT EXISTS player_profiles (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    display_name TEXT,
    total_points INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

-- VM instance registrations
CREATE TABLE IF NOT EXISTS instances (
    id TEXT PRIMARY KEY,  -- UUID generated on registration
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    instance_secret TEXT NOT NULL,  -- For telemetry auth (hashed)
    flag_key TEXT,                  -- For per-instance flag derivation (plaintext, server-side only)
    ctf_slug TEXT NOT NULL DEFAULT 'shart-cloud',  -- Which CTF this instance is for
    registered_at TEXT DEFAULT (datetime('now')),
    last_seen_at TEXT,
    is_active INTEGER DEFAULT 1
);

-- CTF challenges (maps challenge IDs to point values and metadata)
CREATE TABLE IF NOT EXISTS ctf_challenges (
    id TEXT PRIMARY KEY,              -- e.g. "read-postgres-creds"
    ctf_slug TEXT NOT NULL REFERENCES ctfs(slug) ON DELETE CASCADE,
    description TEXT NOT NULL,
    base_points INTEGER NOT NULL DEFAULT 100,
    phase_number INTEGER NOT NULL DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now'))
);

-- Flag submissions via kubectl Flag CRD
CREATE TABLE IF NOT EXISTS ctf_flag_submissions (
    id TEXT PRIMARY KEY,
    instance_id TEXT NOT NULL REFERENCES instances(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    challenge_id TEXT NOT NULL,       -- matches ctf_challenges.id
    submitted_value TEXT NOT NULL,
    accepted INTEGER NOT NULL DEFAULT 0,
    points_awarded INTEGER NOT NULL DEFAULT 0,
    submitted_at TEXT DEFAULT (datetime('now'))
);

-- CTF definitions (which CTFs exist)
CREATE TABLE IF NOT EXISTS ctfs (
    slug TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now'))
);

-- Question phases
CREATE TABLE IF NOT EXISTS phases (
    id TEXT PRIMARY KEY,
    ctf_slug TEXT NOT NULL REFERENCES ctfs(slug) ON DELETE CASCADE,
    phase_number INTEGER NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    UNIQUE(ctf_slug, phase_number)
);

-- Questions
CREATE TABLE IF NOT EXISTS questions (
    id TEXT PRIMARY KEY,
    phase_id TEXT NOT NULL REFERENCES phases(id) ON DELETE CASCADE,
    question_number INTEGER NOT NULL,
    question_text TEXT NOT NULL,
    answer TEXT NOT NULL,  -- Exact match expected
    base_points INTEGER NOT NULL DEFAULT 10,
    hints TEXT DEFAULT '[]',  -- JSON array of {text: string, cost: number}
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(phase_id, question_number)
);

-- User submissions (answer attempts)
CREATE TABLE IF NOT EXISTS submissions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    question_id TEXT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    submitted_answer TEXT NOT NULL,
    is_correct INTEGER NOT NULL,
    hints_used INTEGER DEFAULT 0,  -- Number of hints unlocked before this submission
    points_awarded INTEGER DEFAULT 0,  -- Only set if correct
    submitted_at TEXT DEFAULT (datetime('now'))
);

-- Track which hints a user has unlocked
CREATE TABLE IF NOT EXISTS unlocked_hints (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    question_id TEXT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    hint_index INTEGER NOT NULL,  -- Which hint (0, 1, 2, etc.)
    unlocked_at TEXT DEFAULT (datetime('now')),
    UNIQUE(user_id, question_id, hint_index)
);

-- Honeytoken trips from VM telemetry
CREATE TABLE IF NOT EXISTS honeytoken_trips (
    id TEXT PRIMARY KEY,
    instance_id TEXT NOT NULL REFERENCES instances(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_name TEXT NOT NULL,  -- e.g., "fake-aws-creds", "decoy-database"
    token_path TEXT,  -- Where it was found
    tripped_at TEXT DEFAULT (datetime('now')),
    metadata TEXT DEFAULT '{}'  -- JSON with extra context
);

-- Durable rate limiting buckets (windowed counters)
CREATE TABLE IF NOT EXISTS rate_limits (
    bucket_key TEXT PRIMARY KEY,   -- scope:identifier:window_start_ms
    scope TEXT NOT NULL,
    identifier TEXT NOT NULL,
    bucket_start INTEGER NOT NULL,
    window_ms INTEGER NOT NULL,
    count INTEGER NOT NULL DEFAULT 0,
    expires_at TEXT NOT NULL,
    updated_at TEXT DEFAULT (datetime('now'))
);

-- Achievement definitions
CREATE TABLE IF NOT EXISTS achievements (
    id TEXT PRIMARY KEY,
    ctf_slug TEXT NOT NULL REFERENCES ctfs(slug) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    icon TEXT,  -- Emoji or icon identifier
    points INTEGER DEFAULT 0,
    condition_type TEXT NOT NULL,  -- 'no_honeytokens', 'complete_phase', 'speed_run', etc.
    condition_value TEXT DEFAULT '{}',  -- JSON with condition specifics
    is_secret INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
);

-- User achievements
CREATE TABLE IF NOT EXISTS user_achievements (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    achievement_id TEXT NOT NULL REFERENCES achievements(id) ON DELETE CASCADE,
    earned_at TEXT DEFAULT (datetime('now')),
    UNIQUE(user_id, achievement_id)
);

-- Course reading progress
CREATE TABLE IF NOT EXISTS course_progress (
  id TEXT NOT NULL DEFAULT (lower(hex(randomblob(16)))),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_slug TEXT NOT NULL,
  completed_docs TEXT NOT NULL DEFAULT '[]',
  last_doc_path TEXT,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (user_id, course_slug)
);

-- ============================================================================
-- INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(userId);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
CREATE INDEX IF NOT EXISTS idx_accounts_user_id ON accounts(userId);
CREATE INDEX IF NOT EXISTS idx_instances_user_id ON instances(user_id);
CREATE INDEX IF NOT EXISTS idx_instances_secret ON instances(instance_secret);
CREATE INDEX IF NOT EXISTS idx_questions_phase_id ON questions(phase_id);
CREATE INDEX IF NOT EXISTS idx_submissions_user_question ON submissions(user_id, question_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_submissions_one_correct_per_user_question
    ON submissions(user_id, question_id)
    WHERE is_correct = 1;
CREATE INDEX IF NOT EXISTS idx_submissions_correct ON submissions(user_id, is_correct);
CREATE INDEX IF NOT EXISTS idx_unlocked_hints_user_question ON unlocked_hints(user_id, question_id);
CREATE INDEX IF NOT EXISTS idx_honeytoken_trips_user ON honeytoken_trips(user_id);
CREATE INDEX IF NOT EXISTS idx_honeytoken_trips_instance ON honeytoken_trips(instance_id);
CREATE INDEX IF NOT EXISTS idx_rate_limits_expires_at ON rate_limits(expires_at);
CREATE INDEX IF NOT EXISTS idx_user_achievements_user ON user_achievements(user_id);
CREATE INDEX IF NOT EXISTS idx_player_profiles_points ON player_profiles(total_points DESC);
CREATE INDEX IF NOT EXISTS idx_course_progress_user ON course_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_flag_submissions_instance ON ctf_flag_submissions(instance_id);
CREATE INDEX IF NOT EXISTS idx_flag_submissions_instance_challenge ON ctf_flag_submissions(instance_id, challenge_id);
-- One accepted submission per instance per challenge
CREATE UNIQUE INDEX IF NOT EXISTS idx_flag_submissions_one_accepted
    ON ctf_flag_submissions(instance_id, challenge_id)
    WHERE accepted = 1;

-- ============================================================================
-- SEED DATA
-- ============================================================================

-- Insert the shart-cloud CTF
INSERT OR IGNORE INTO ctfs (slug, name, description, is_active) VALUES 
    ('shart-cloud', 'shart.cloud CTF', 'Exploit misconfigurations, escape containers, and pwn the cloud.', 1);

-- Insert phases for shart-cloud
INSERT OR IGNORE INTO phases (id, ctf_slug, phase_number, name, description) VALUES
    ('shart-cloud-phase-1', 'shart-cloud', 1, 'Reconnaissance', 'Enumerate the environment and find your footing'),
    ('shart-cloud-phase-2', 'shart-cloud', 2, 'Privilege Escalation', 'From reader to root'),
    ('shart-cloud-phase-3', 'shart-cloud', 3, 'The Heist', 'Access the crown jewels'),
    ('shart-cloud-phase-4', 'shart-cloud', 4, 'Total Compromise', 'Full infrastructure takeover');

-- Insert CTF challenges (matching GymSession check IDs)
INSERT OR IGNORE INTO ctf_challenges (id, ctf_slug, description, base_points, phase_number) VALUES
    ('read-postgres-creds',    'shart-cloud', 'Access the postgres database credentials',              150, 1),
    ('read-minio-creds',       'shart-cloud', 'Access MinIO storage credentials',                     150, 1),
    ('exec-into-backup-pod',   'shart-cloud', 'Exec into a pod using the backup-operator SA',         200, 2),
    ('created-pod-kube-system','shart-cloud', 'Create a pod in kube-system (privilege escalation)',   250, 2),
    ('read-shop-customer-data','shart-cloud', 'Access the shop customer data ConfigMap',              200, 3),
    ('read-emergency-key',     'shart-cloud', 'Access the emergency admin key in customer-backup',    300, 3);

-- Insert achievements
INSERT OR IGNORE INTO achievements (id, ctf_slug, name, description, icon, points, condition_type, condition_value, is_secret) VALUES
    ('ghost-protocol', 'shart-cloud', 'Ghost Protocol', 'Complete the CTF without tripping any honeytokens', '👻', 100, 'no_honeytokens', '{}', 0),
    ('speed-demon', 'shart-cloud', 'Speed Demon', 'Complete all phases in under 2 hours', '⚡', 50, 'speed_run', '{"max_minutes": 120}', 0),
    ('no-hints', 'shart-cloud', 'Big Brain', 'Complete the CTF without using any hints', '🧠', 75, 'no_hints', '{}', 0),
    ('phase-1-complete', 'shart-cloud', 'Recon Expert', 'Complete Phase 1: Reconnaissance', '🔍', 25, 'complete_phase', '{"phase": 1}', 0),
    ('phase-2-complete', 'shart-cloud', 'Privilege Climber', 'Complete Phase 2: Privilege Escalation', '🪜', 25, 'complete_phase', '{"phase": 2}', 0),
    ('phase-3-complete', 'shart-cloud', 'Master Thief', 'Complete Phase 3: The Heist', '💎', 25, 'complete_phase', '{"phase": 3}', 0),
    ('phase-4-complete', 'shart-cloud', 'Total Domination', 'Complete Phase 4: Total Compromise', '👑', 50, 'complete_phase', '{"phase": 4}', 0),
    ('first-blood', 'shart-cloud', 'First Blood', 'Be the first to complete the CTF', '🩸', 200, 'first_completion', '{}', 1);
