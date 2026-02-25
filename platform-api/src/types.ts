// Cloudflare Worker environment bindings
export interface Env {
  DB: D1Database;
  BETTER_AUTH_SECRET: string;
  INSTANCE_SECRET_SALT: string;
  ENVIRONMENT?: string;
}

// Database table types (matching schema.sql)
export interface User {
  id: string;
  name: string | null;
  email: string;
  emailVerified: number;
  image: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Session {
  id: string;
  userId: string;
  token: string;
  expiresAt: string;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Account {
  id: string;
  userId: string;
  accountId: string;
  providerId: string;
  accessToken: string | null;
  refreshToken: string | null;
  accessTokenExpiresAt: string | null;
  refreshTokenExpiresAt: string | null;
  scope: string | null;
  idToken: string | null;
  password: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PlayerProfile {
  user_id: string;
  display_name: string | null;
  total_points: number;
  created_at: string;
  updated_at: string;
}

export interface Instance {
  id: string;
  user_id: string;
  instance_secret: string;
  flag_key: string | null;
  ctf_slug: string;
  registered_at: string;
  last_seen_at: string | null;
  is_active: number;
}

export interface CtfChallenge {
  id: string;
  ctf_slug: string;
  description: string;
  base_points: number;
  phase_number: number;
  created_at: string;
}

export interface FlagSubmission {
  id: string;
  instance_id: string;
  user_id: string;
  challenge_id: string;
  submitted_value: string;
  accepted: number;
  points_awarded: number;
  submitted_at: string;
}

export interface Ctf {
  slug: string;
  name: string;
  description: string | null;
  is_active: number;
  created_at: string;
}

export interface Phase {
  id: string;
  ctf_slug: string;
  phase_number: number;
  name: string;
  description: string | null;
}

export interface Question {
  id: string;
  phase_id: string;
  question_number: number;
  question_text: string;
  answer: string;
  base_points: number;
  hints: string; // JSON array
  created_at: string;
}

export interface Submission {
  id: string;
  user_id: string;
  question_id: string;
  submitted_answer: string;
  is_correct: number;
  hints_used: number;
  points_awarded: number;
  submitted_at: string;
}

export interface UnlockedHint {
  id: string;
  user_id: string;
  question_id: string;
  hint_index: number;
  unlocked_at: string;
}

export interface HoneytokenTrip {
  id: string;
  instance_id: string;
  user_id: string;
  token_name: string;
  token_path: string | null;
  tripped_at: string;
  metadata: string; // JSON
}

export interface RateLimit {
  bucket_key: string;
  scope: string;
  identifier: string;
  bucket_start: number;
  window_ms: number;
  count: number;
  expires_at: string;
  updated_at: string;
}

export interface Achievement {
  id: string;
  ctf_slug: string;
  name: string;
  description: string;
  icon: string | null;
  points: number;
  condition_type: string;
  condition_value: string; // JSON
  is_secret: number;
  created_at: string;
}

export interface UserAchievement {
  id: string;
  user_id: string;
  achievement_id: string;
  earned_at: string;
}

export interface CourseProgress {
  id: string;
  user_id: string;
  course_slug: string;
  completed_docs: string; // JSON array stored as text
  last_doc_path: string | null;
  updated_at: number;
}

// Kysely database interface
export interface Database {
  users: User;
  sessions: Session;
  accounts: Account;
  verifications: {
    id: string;
    identifier: string;
    value: string;
    expiresAt: string;
    createdAt: string;
    updatedAt: string;
  };
  player_profiles: PlayerProfile;
  instances: Instance;
  ctfs: Ctf;
  phases: Phase;
  questions: Question;
  submissions: Submission;
  unlocked_hints: UnlockedHint;
  honeytoken_trips: HoneytokenTrip;
  rate_limits: RateLimit;
  achievements: Achievement;
  user_achievements: UserAchievement;
  course_progress: CourseProgress;
  ctf_challenges: CtfChallenge;
  ctf_flag_submissions: FlagSubmission;
}

// API response types
export interface Hint {
  text: string;
  cost: number;
}

export interface QuestionWithProgress {
  id: string;
  phase_id: string;
  phase_number: number;
  phase_name: string;
  question_number: number;
  question_text: string;
  base_points: number;
  hints: Array<{
    index: number;
    cost: number;
    text: string | null; // null if not unlocked
    unlocked: boolean;
  }>;
  is_answered: boolean;
  points_awarded: number | null;
}

export interface PlayerStatus {
  user_id: string;
  display_name: string | null;
  total_points: number;
  questions_answered: number;
  questions_total: number;
  honeytoken_trips: Array<{
    token_name: string;
    tripped_at: string;
  }>;
  achievements: Array<{
    id: string;
    name: string;
    description: string;
    icon: string | null;
    points: number;
    earned_at: string;
  }>;
  ghost_protocol_eligible: boolean;
}

export interface LeaderboardEntry {
  rank: number;
  user_id?: string; // only returned for the authenticated user's own entry
  display_name: string;
  total_points: number;
  questions_answered: number;
  achievements_count: number;
}
