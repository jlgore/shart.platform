-- SECURE Row Level Security (RLS) Policies for SHART.CLOUD
-- Red-teamed policies that prevent users from awarding themselves points, achievements, or progress
-- Users can only modify profile data they control, not system-awarded progress

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ctf_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blog_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.log_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_events ENABLE ROW LEVEL SECURITY;

-- Drop all existing policies first
DROP POLICY IF EXISTS "Users can view accessible profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can view accessible user stats" ON public.user_stats;
DROP POLICY IF EXISTS "Users can insert their own stats" ON public.user_stats;
DROP POLICY IF EXISTS "Users can update their own stats" ON public.user_stats;
DROP POLICY IF EXISTS "Users can view their own CTF progress" ON public.ctf_progress;
DROP POLICY IF EXISTS "Users can insert their own CTF progress" ON public.ctf_progress;
DROP POLICY IF EXISTS "Users can update their own CTF progress" ON public.ctf_progress;
DROP POLICY IF EXISTS "Users can view their own blog progress" ON public.blog_progress;
DROP POLICY IF EXISTS "Users can insert their own blog progress" ON public.blog_progress;
DROP POLICY IF EXISTS "Users can update their own blog progress" ON public.blog_progress;
DROP POLICY IF EXISTS "Users can view their own log sessions" ON public.log_sessions;
DROP POLICY IF EXISTS "Users can insert their own log sessions" ON public.log_sessions;
DROP POLICY IF EXISTS "Users can update their own log sessions" ON public.log_sessions;
DROP POLICY IF EXISTS "Users can view active achievements" ON public.achievements;
DROP POLICY IF EXISTS "Service role can manage achievements" ON public.achievements;
DROP POLICY IF EXISTS "Users can view accessible user achievements" ON public.user_achievements;
DROP POLICY IF EXISTS "Service role can manage user achievements" ON public.user_achievements;
DROP POLICY IF EXISTS "Users can view public game sessions" ON public.game_sessions;
DROP POLICY IF EXISTS "Users can create their own game sessions" ON public.game_sessions;
DROP POLICY IF EXISTS "Hosts can update their own game sessions" ON public.game_sessions;
DROP POLICY IF EXISTS "Users can view game participants for accessible sessions" ON public.game_participants;
DROP POLICY IF EXISTS "Users can join game sessions" ON public.game_participants;
DROP POLICY IF EXISTS "Users can update their own participation" ON public.game_participants;
DROP POLICY IF EXISTS "Users can view events for accessible sessions" ON public.game_events;
DROP POLICY IF EXISTS "Users can create events for sessions they participate in" ON public.game_events;

-- PROFILES: Users can only modify personal info, not system fields
CREATE POLICY "Users can view accessible profiles" ON public.profiles
    FOR SELECT USING (
        auth.uid() = id
        OR (profile_visibility = 'public' AND deleted_at IS NULL)
        OR auth.jwt()->>'role' = 'service_role'
    );

CREATE POLICY "Users can insert their own profile" ON public.profiles
    FOR INSERT WITH CHECK (
        auth.uid() = id
        OR auth.jwt()->>'role' = 'service_role'
    );

-- SECURE: Users can only update personal profile fields, not system tracking
CREATE POLICY "Users can update personal profile data" ON public.profiles
    FOR UPDATE USING (auth.uid() = id)
    WITH CHECK (
        auth.uid() = id
        AND created_at = OLD.created_at  -- Cannot modify creation timestamp
        AND id = OLD.id                  -- Cannot change user ID
    );

CREATE POLICY "Service role can manage all profiles" ON public.profiles
    FOR ALL USING (auth.jwt()->>'role' = 'service_role');

-- USER STATS: READ ONLY for users - only system can modify points/completions
CREATE POLICY "Users can view accessible user stats" ON public.user_stats
    FOR SELECT USING (
        auth.uid() = user_id
        OR EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = user_id
            AND p.profile_visibility = 'public'
            AND p.show_progress = true
            AND p.deleted_at IS NULL
        )
        OR auth.jwt()->>'role' = 'service_role'
    );

-- CRITICAL: Only service role can modify user stats (points, completions, etc.)
CREATE POLICY "Only service role can manage user stats" ON public.user_stats
    FOR ALL USING (auth.jwt()->>'role' = 'service_role');

-- CTF PROGRESS: READ ONLY for users - only system can award completions
CREATE POLICY "Users can view their own CTF progress" ON public.ctf_progress
    FOR SELECT USING (auth.uid() = user_id);

-- CRITICAL: Only service role can manage CTF progress
CREATE POLICY "Only service role can manage CTF progress" ON public.ctf_progress
    FOR ALL USING (auth.jwt()->>'role' = 'service_role');

-- BLOG PROGRESS: Users can track their own reading, but not fake completion times
CREATE POLICY "Users can view their own blog progress" ON public.blog_progress
    FOR SELECT USING (auth.uid() = user_id);

-- Users can insert blog progress but with restrictions
CREATE POLICY "Users can track blog reading" ON public.blog_progress
    FOR INSERT WITH CHECK (
        auth.uid() = user_id
        AND read_at <= NOW()  -- Cannot backdate reads to the future
    );

-- Service role has full control
CREATE POLICY "Service role can manage blog progress" ON public.blog_progress
    FOR ALL USING (auth.jwt()->>'role' = 'service_role');

-- LOG SESSIONS: Users can start sessions but system manages completion/scoring
CREATE POLICY "Users can view their own log sessions" ON public.log_sessions
    FOR SELECT USING (auth.uid() = user_id);

-- Users can start log sessions
CREATE POLICY "Users can start log sessions" ON public.log_sessions
    FOR INSERT WITH CHECK (
        auth.uid() = user_id
        AND started_at <= NOW()  -- Cannot future-date sessions
        AND ended_at IS NULL     -- Cannot insert pre-completed sessions
        AND queries_executed = 0 -- Cannot start with fake query counts
        AND files_analyzed = 0   -- Cannot start with fake file counts
    );

-- Users can update session metadata but not scoring fields
CREATE POLICY "Users can update log session metadata" ON public.log_sessions
    FOR UPDATE USING (auth.uid() = user_id)
    WITH CHECK (
        auth.uid() = user_id
        AND user_id = OLD.user_id  -- Cannot change owner
        AND id = OLD.id            -- Cannot change ID
        AND started_at = OLD.started_at  -- Cannot modify start time
        -- Queries and files can only be updated by service role
        AND queries_executed = OLD.queries_executed
        AND files_analyzed = OLD.files_analyzed
    );

CREATE POLICY "Service role can manage log sessions" ON public.log_sessions
    FOR ALL USING (auth.jwt()->>'role' = 'service_role');

-- ACHIEVEMENTS: READ ONLY for users
CREATE POLICY "Users can view active achievements" ON public.achievements
    FOR SELECT USING (
        is_active = true
        OR auth.jwt()->>'role' = 'service_role'
    );

CREATE POLICY "Only service role can manage achievements" ON public.achievements
    FOR ALL USING (auth.jwt()->>'role' = 'service_role');

-- USER ACHIEVEMENTS: READ ONLY for users - only system can award
CREATE POLICY "Users can view accessible user achievements" ON public.user_achievements
    FOR SELECT USING (
        auth.uid() = user_id
        OR EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = user_id
            AND p.profile_visibility = 'public'
            AND p.show_progress = true
            AND p.deleted_at IS NULL
        )
        OR auth.jwt()->>'role' = 'service_role'
    );

-- CRITICAL: Only service role can award achievements
CREATE POLICY "Only service role can manage user achievements" ON public.user_achievements
    FOR ALL USING (auth.jwt()->>'role' = 'service_role');

-- GAME SESSIONS: Users can create and manage their sessions
CREATE POLICY "Users can view accessible game sessions" ON public.game_sessions
    FOR SELECT USING (
        is_private = false
        OR host_user_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM public.game_participants gp
            WHERE gp.session_id = id AND gp.user_id = auth.uid()
        )
        OR auth.jwt()->>'role' = 'service_role'
    );

CREATE POLICY "Users can create game sessions" ON public.game_sessions
    FOR INSERT WITH CHECK (
        auth.uid() = host_user_id
        AND session_code IS NOT NULL  -- Must have valid session code
        AND status = 'created'         -- Must start in created status
    );

-- Hosts can update their sessions but with restrictions
CREATE POLICY "Hosts can update their game sessions" ON public.game_sessions
    FOR UPDATE USING (auth.uid() = host_user_id)
    WITH CHECK (
        auth.uid() = host_user_id
        AND host_user_id = OLD.host_user_id  -- Cannot change host
        AND id = OLD.id                      -- Cannot change ID
        AND session_code = OLD.session_code  -- Cannot change session code
        AND created_at = OLD.created_at      -- Cannot modify creation time
    );

CREATE POLICY "Service role can manage all game sessions" ON public.game_sessions
    FOR ALL USING (auth.jwt()->>'role' = 'service_role');

-- GAME PARTICIPANTS: Users can join but cannot manipulate scores
CREATE POLICY "Users can view participants for accessible sessions" ON public.game_participants
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.game_sessions gs
            WHERE gs.id = session_id
            AND (
                gs.is_private = false
                OR gs.host_user_id = auth.uid()
                OR EXISTS (
                    SELECT 1 FROM public.game_participants gp2
                    WHERE gp2.session_id = gs.id AND gp2.user_id = auth.uid()
                )
            )
        )
        OR auth.jwt()->>'role' = 'service_role'
    );

CREATE POLICY "Users can join game sessions" ON public.game_participants
    FOR INSERT WITH CHECK (
        auth.uid() = user_id
        AND score = 0           -- Cannot start with points
        AND rank_position IS NULL  -- Cannot set initial rank
        AND role = 'participant'   -- Cannot make themselves moderator/host
    );

-- CRITICAL: Users cannot update their own scores - only basic participation status
CREATE POLICY "Users can update basic participation status" ON public.game_participants
    FOR UPDATE USING (auth.uid() = user_id)
    WITH CHECK (
        auth.uid() = user_id
        AND user_id = OLD.user_id
        AND session_id = OLD.session_id
        AND joined_at = OLD.joined_at
        -- CRITICAL: Cannot modify scoring fields
        AND score = OLD.score
        AND rank_position = OLD.rank_position
        AND role = OLD.role  -- Cannot promote themselves
    );

CREATE POLICY "Service role can manage all game participants" ON public.game_participants
    FOR ALL USING (auth.jwt()->>'role' = 'service_role');

-- GAME EVENTS: Heavily restricted - users cannot award themselves points
CREATE POLICY "Users can view events for accessible sessions" ON public.game_events
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.game_sessions gs
            WHERE gs.id = session_id
            AND (
                gs.is_private = false
                OR gs.host_user_id = auth.uid()
                OR EXISTS (
                    SELECT 1 FROM public.game_participants gp
                    WHERE gp.session_id = gs.id AND gp.user_id = auth.uid()
                )
            )
        )
        OR auth.jwt()->>'role' = 'service_role'
    );

-- CRITICAL: Users can only create non-scoring events
CREATE POLICY "Users can create basic game events" ON public.game_events
    FOR INSERT WITH CHECK (
        auth.uid() = user_id
        AND EXISTS (
            SELECT 1 FROM public.game_participants gp
            WHERE gp.session_id = game_events.session_id
            AND gp.user_id = auth.uid()
            AND gp.is_active = true
        )
        AND points_awarded = 0  -- CRITICAL: Cannot award points to themselves
        AND event_type IN ('join', 'leave', 'chat', 'submit')  -- Only basic event types
        AND timestamp <= NOW()  -- Cannot future-date events
    );

-- Only service role can create scoring events and manage all events
CREATE POLICY "Service role can manage all game events" ON public.game_events
    FOR ALL USING (auth.jwt()->>'role' = 'service_role');