-- SHART.CLOUD Database Schema
-- Supabase/PostgreSQL Schema for User Progress, Achievements, and Multiplayer Sessions

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enable RLS (Row Level Security)
ALTER DATABASE postgres SET row_security = on;

-- Core user management (extends Supabase auth.users)
CREATE TABLE public.profiles (
    id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    display_name VARCHAR(100),
    avatar_url TEXT,
    bio TEXT,
    github_username VARCHAR(100),
    bluesky_handle VARCHAR(100),
    website_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,

    -- Profile customization
    preferred_theme VARCHAR(20) DEFAULT 'dark' CHECK (preferred_theme IN ('dark', 'light')),
    timezone VARCHAR(50) DEFAULT 'UTC',

    -- Privacy settings
    profile_visibility VARCHAR(20) DEFAULT 'public' CHECK (profile_visibility IN ('public', 'private')),
    show_progress BOOLEAN DEFAULT true,

    -- Soft delete
    deleted_at TIMESTAMP WITH TIME ZONE
);

-- User statistics and rankings
CREATE TABLE public.user_stats (
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE PRIMARY KEY,
    total_points INTEGER DEFAULT 0,
    ctf_completions INTEGER DEFAULT 0,
    blog_reads INTEGER DEFAULT 0,
    log_sessions INTEGER DEFAULT 0,
    streak_days INTEGER DEFAULT 0,
    longest_streak INTEGER DEFAULT 0,
    last_activity_date DATE,
    rank_position INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- CTF challenge progress tracking
CREATE TABLE public.ctf_progress (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    challenge_id VARCHAR(100) NOT NULL, -- Maps to your CTF collection slug
    status VARCHAR(20) DEFAULT 'not_started' CHECK (status IN ('not_started', 'in_progress', 'completed', 'abandoned')),
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    time_spent_minutes INTEGER DEFAULT 0,
    hints_used INTEGER DEFAULT 0,
    attempts INTEGER DEFAULT 0,
    last_attempt_at TIMESTAMP WITH TIME ZONE,
    completion_data JSONB, -- Store solution details, notes, etc.
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,

    UNIQUE(user_id, challenge_id)
);

-- Blog post reading progress
CREATE TABLE public.blog_progress (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    post_slug VARCHAR(200) NOT NULL, -- Maps to your blog collection slug
    read_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    read_duration_seconds INTEGER,
    scroll_percentage INTEGER DEFAULT 0,

    UNIQUE(user_id, post_slug)
);

-- Log Lab session tracking
CREATE TABLE public.log_sessions (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    session_name VARCHAR(200),
    pack_id VARCHAR(100), -- Maps to your logPacks collection
    started_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    ended_at TIMESTAMP WITH TIME ZONE,
    queries_executed INTEGER DEFAULT 0,
    files_analyzed INTEGER DEFAULT 0,
    insights_discovered JSONB DEFAULT '[]'::jsonb,
    session_data JSONB DEFAULT '{}'::jsonb -- Store queries, results, etc.
);

-- Achievement definitions
CREATE TABLE public.achievements (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    description TEXT NOT NULL,
    icon VARCHAR(50), -- Icon identifier/emoji
    category VARCHAR(50) NOT NULL, -- 'ctf', 'blog', 'log_lab', 'community', 'streak'
    difficulty VARCHAR(20) DEFAULT 'easy' CHECK (difficulty IN ('easy', 'medium', 'hard', 'legendary')),
    points INTEGER DEFAULT 0,

    -- Achievement conditions (flexible JSONB for different types)
    conditions JSONB NOT NULL, -- e.g., {"type": "ctf_complete", "count": 5, "category": "aws"}

    -- Visibility and availability
    is_secret BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    available_from TIMESTAMP WITH TIME ZONE,
    available_until TIMESTAMP WITH TIME ZONE,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- User achievements (many-to-many)
CREATE TABLE public.user_achievements (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    achievement_id UUID REFERENCES public.achievements(id) ON DELETE CASCADE NOT NULL,
    earned_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    progress_data JSONB DEFAULT '{}'::jsonb, -- Store progress toward achievement

    UNIQUE(user_id, achievement_id)
);

-- Multiplayer game session management
CREATE TABLE public.game_sessions (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    session_code VARCHAR(10) UNIQUE NOT NULL, -- Short joinable code
    name VARCHAR(200) NOT NULL,
    description TEXT,
    game_type VARCHAR(50) NOT NULL, -- 'ctf_race', 'log_hunt', 'knowledge_quiz', etc.
    host_user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,

    -- Session configuration
    max_participants INTEGER DEFAULT 10,
    is_private BOOLEAN DEFAULT false,
    password_hash TEXT, -- For private sessions

    -- Timing
    scheduled_start TIMESTAMP WITH TIME ZONE,
    actual_start TIMESTAMP WITH TIME ZONE,
    ended_at TIMESTAMP WITH TIME ZONE,
    duration_minutes INTEGER DEFAULT 60,

    -- Game-specific settings
    game_config JSONB DEFAULT '{}'::jsonb,

    -- Status
    status VARCHAR(20) DEFAULT 'created' CHECK (status IN ('created', 'waiting', 'active', 'paused', 'completed', 'cancelled')),

    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Multiplayer session participants
CREATE TABLE public.game_participants (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    session_id UUID REFERENCES public.game_sessions(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    left_at TIMESTAMP WITH TIME ZONE,
    role VARCHAR(20) DEFAULT 'participant' CHECK (role IN ('host', 'moderator', 'participant')),
    score INTEGER DEFAULT 0,
    rank_position INTEGER,
    is_active BOOLEAN DEFAULT true,

    -- Game-specific participant data
    game_data JSONB DEFAULT '{}'::jsonb,

    UNIQUE(session_id, user_id)
);

-- Real-time game events and actions
CREATE TABLE public.game_events (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    session_id UUID REFERENCES public.game_sessions(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    event_type VARCHAR(50) NOT NULL, -- 'join', 'leave', 'submit', 'hint', 'complete', etc.
    event_data JSONB DEFAULT '{}'::jsonb,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,

    -- For scoring and leaderboards
    points_awarded INTEGER DEFAULT 0
);

-- Leaderboards (regular view that respects RLS)
CREATE OR REPLACE VIEW public.global_leaderboard AS
SELECT
    p.id,
    p.username,
    p.display_name,
    p.avatar_url,
    us.total_points,
    us.ctf_completions,
    us.streak_days,
    us.rank_position,
    ROW_NUMBER() OVER (ORDER BY us.total_points DESC, us.ctf_completions DESC) AS current_rank
FROM public.profiles p
JOIN public.user_stats us ON p.id = us.user_id
WHERE p.profile_visibility = 'public'
    AND p.show_progress = true
    AND p.deleted_at IS NULL
ORDER BY us.total_points DESC, us.ctf_completions DESC;

-- Enable RLS on the view
ALTER VIEW public.global_leaderboard SET (security_invoker = true);

-- Create a cached leaderboard table for better performance
CREATE TABLE public.leaderboard_cache (
    id UUID PRIMARY KEY,
    username VARCHAR(50),
    display_name VARCHAR(100),
    avatar_url TEXT,
    total_points INTEGER,
    ctf_completions INTEGER,
    streak_days INTEGER,
    current_rank INTEGER,
    cached_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS on the cache table
ALTER TABLE public.leaderboard_cache ENABLE ROW LEVEL SECURITY;

-- Cache table RLS policy - anyone can read the cached leaderboard
CREATE POLICY "Anyone can view leaderboard cache" ON public.leaderboard_cache
    FOR SELECT USING (true);

-- Only service role can update the cache
CREATE POLICY "Service role can manage leaderboard cache" ON public.leaderboard_cache
    FOR ALL USING (auth.jwt()->>'role' = 'service_role');

-- Create indexes for performance
CREATE INDEX idx_profiles_username ON public.profiles(username);
CREATE INDEX idx_profiles_created_at ON public.profiles(created_at);
CREATE INDEX idx_ctf_progress_user_challenge ON public.ctf_progress(user_id, challenge_id);
CREATE INDEX idx_ctf_progress_status ON public.ctf_progress(status);
CREATE INDEX idx_blog_progress_user_post ON public.blog_progress(user_id, post_slug);
CREATE INDEX idx_log_sessions_user_id ON public.log_sessions(user_id);
CREATE INDEX idx_log_sessions_started_at ON public.log_sessions(started_at);
CREATE INDEX idx_user_achievements_user_id ON public.user_achievements(user_id);
CREATE INDEX idx_user_achievements_earned_at ON public.user_achievements(earned_at);
CREATE INDEX idx_game_sessions_status ON public.game_sessions(status);
CREATE INDEX idx_game_sessions_host_user ON public.game_sessions(host_user_id);
CREATE INDEX idx_game_participants_session_user ON public.game_participants(session_id, user_id);
CREATE INDEX idx_game_events_session_timestamp ON public.game_events(session_id, timestamp);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = TIMEZONE('utc'::text, NOW());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at triggers
CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER user_stats_updated_at BEFORE UPDATE ON public.user_stats
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER ctf_progress_updated_at BEFORE UPDATE ON public.ctf_progress
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER achievements_updated_at BEFORE UPDATE ON public.achievements
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER game_sessions_updated_at BEFORE UPDATE ON public.game_sessions
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();