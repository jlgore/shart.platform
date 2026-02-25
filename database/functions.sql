-- Database functions for SHART.CLOUD platform
-- These functions handle common operations and business logic

-- Function to create a profile when a user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, username, display_name)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'username', 'user_' || SUBSTRING(NEW.id::text, 1, 8)),
        COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.email)
    );

    INSERT INTO public.user_stats (user_id)
    VALUES (NEW.id);

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for new user signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Function to update user activity and maintain streaks
CREATE OR REPLACE FUNCTION public.update_user_activity(p_user_id UUID)
RETURNS VOID AS $$
DECLARE
    last_activity DATE;
    current_streak INTEGER;
    longest_streak INTEGER;
BEGIN
    SELECT last_activity_date, streak_days, longest_streak
    INTO last_activity, current_streak, longest_streak
    FROM public.user_stats
    WHERE user_id = p_user_id;

    -- If no activity recorded or activity was yesterday, increment streak
    IF last_activity IS NULL OR last_activity = CURRENT_DATE - INTERVAL '1 day' THEN
        current_streak := COALESCE(current_streak, 0) + 1;
        longest_streak := GREATEST(COALESCE(longest_streak, 0), current_streak);
    -- If activity was more than 1 day ago, reset streak
    ELSIF last_activity < CURRENT_DATE - INTERVAL '1 day' THEN
        current_streak := 1;
    END IF;

    UPDATE public.user_stats
    SET
        last_activity_date = CURRENT_DATE,
        streak_days = current_streak,
        longest_streak = longest_streak,
        updated_at = NOW()
    WHERE user_id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to award points to a user
CREATE OR REPLACE FUNCTION public.award_points(p_user_id UUID, p_points INTEGER)
RETURNS VOID AS $$
BEGIN
    UPDATE public.user_stats
    SET
        total_points = total_points + p_points,
        updated_at = NOW()
    WHERE user_id = p_user_id;

    -- Update user activity
    PERFORM public.update_user_activity(p_user_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check and award achievements
CREATE OR REPLACE FUNCTION public.check_achievements(p_user_id UUID)
RETURNS INTEGER AS $$
DECLARE
    achievement_record RECORD;
    user_progress RECORD;
    achievements_awarded INTEGER := 0;
    condition_met BOOLEAN;
BEGIN
    -- Get user's current stats and progress
    SELECT us.*, p.created_at as user_created_at
    INTO user_progress
    FROM public.user_stats us
    JOIN public.profiles p ON us.user_id = p.id
    WHERE us.user_id = p_user_id;

    -- Loop through all active achievements user doesn't have
    FOR achievement_record IN
        SELECT a.*
        FROM public.achievements a
        WHERE a.is_active = true
        AND NOT EXISTS (
            SELECT 1 FROM public.user_achievements ua
            WHERE ua.user_id = p_user_id AND ua.achievement_id = a.id
        )
    LOOP
        condition_met := false;

        -- Check different achievement conditions
        CASE achievement_record.conditions->>'type'
            WHEN 'ctf_complete' THEN
                IF achievement_record.conditions ? 'category' THEN
                    -- Category-specific CTF completion
                    SELECT COUNT(*) >= (achievement_record.conditions->>'count')::integer
                    INTO condition_met
                    FROM public.ctf_progress cp
                    WHERE cp.user_id = p_user_id
                    AND cp.status = 'completed'
                    AND cp.challenge_id LIKE '%' || (achievement_record.conditions->>'category') || '%';
                ELSE
                    -- General CTF completion count
                    SELECT user_progress.ctf_completions >= (achievement_record.conditions->>'count')::integer
                    INTO condition_met;
                END IF;

            WHEN 'blog_read' THEN
                SELECT COUNT(*) >= (achievement_record.conditions->>'count')::integer
                INTO condition_met
                FROM public.blog_progress bp
                WHERE bp.user_id = p_user_id;

            WHEN 'log_session_complete' THEN
                SELECT user_progress.log_sessions >= (achievement_record.conditions->>'count')::integer
                INTO condition_met;

            WHEN 'daily_streak' THEN
                SELECT user_progress.streak_days >= (achievement_record.conditions->>'days')::integer
                INTO condition_met;

            WHEN 'total_points' THEN
                SELECT user_progress.total_points >= (achievement_record.conditions->>'points')::integer
                INTO condition_met;

            WHEN 'early_signup' THEN
                SELECT user_progress.user_created_at <= (achievement_record.conditions->>'before')::timestamp
                INTO condition_met;

            WHEN 'multiplayer_join' THEN
                SELECT COUNT(*) >= (achievement_record.conditions->>'count')::integer
                INTO condition_met
                FROM public.game_participants gp
                WHERE gp.user_id = p_user_id;

            ELSE
                condition_met := false;
        END CASE;

        -- Award achievement if condition is met
        IF condition_met THEN
            INSERT INTO public.user_achievements (user_id, achievement_id)
            VALUES (p_user_id, achievement_record.id);

            -- Award points if the achievement has them
            IF achievement_record.points > 0 THEN
                PERFORM public.award_points(p_user_id, achievement_record.points);
            END IF;

            achievements_awarded := achievements_awarded + 1;
        END IF;
    END LOOP;

    RETURN achievements_awarded;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to complete a CTF challenge
CREATE OR REPLACE FUNCTION public.complete_ctf_challenge(
    p_user_id UUID,
    p_challenge_id VARCHAR,
    p_time_spent_minutes INTEGER DEFAULT NULL,
    p_hints_used INTEGER DEFAULT 0,
    p_completion_data JSONB DEFAULT '{}'
)
RETURNS VOID AS $$
BEGIN
    -- Update or insert CTF progress
    INSERT INTO public.ctf_progress (
        user_id, challenge_id, status, completed_at,
        time_spent_minutes, hints_used, completion_data
    )
    VALUES (
        p_user_id, p_challenge_id, 'completed', NOW(),
        p_time_spent_minutes, p_hints_used, p_completion_data
    )
    ON CONFLICT (user_id, challenge_id)
    DO UPDATE SET
        status = 'completed',
        completed_at = NOW(),
        time_spent_minutes = COALESCE(p_time_spent_minutes, ctf_progress.time_spent_minutes),
        hints_used = p_hints_used,
        completion_data = p_completion_data,
        updated_at = NOW();

    -- Update user stats
    UPDATE public.user_stats
    SET
        ctf_completions = ctf_completions + 1,
        updated_at = NOW()
    WHERE user_id = p_user_id;

    -- Award base points for completion (could be dynamic based on difficulty)
    PERFORM public.award_points(p_user_id, 100);

    -- Check for new achievements
    PERFORM public.check_achievements(p_user_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to record blog reading
CREATE OR REPLACE FUNCTION public.record_blog_read(
    p_user_id UUID,
    p_post_slug VARCHAR,
    p_read_duration_seconds INTEGER DEFAULT NULL,
    p_scroll_percentage INTEGER DEFAULT 100
)
RETURNS VOID AS $$
BEGIN
    INSERT INTO public.blog_progress (
        user_id, post_slug, read_duration_seconds, scroll_percentage
    )
    VALUES (
        p_user_id, p_post_slug, p_read_duration_seconds, p_scroll_percentage
    )
    ON CONFLICT (user_id, post_slug) DO NOTHING;

    -- Update user stats
    UPDATE public.user_stats
    SET
        blog_reads = blog_reads + 1,
        updated_at = NOW()
    WHERE user_id = p_user_id;

    -- Award points for reading
    PERFORM public.award_points(p_user_id, 25);

    -- Check for achievements
    PERFORM public.check_achievements(p_user_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to start a log analysis session
CREATE OR REPLACE FUNCTION public.start_log_session(
    p_user_id UUID,
    p_session_name VARCHAR DEFAULT NULL,
    p_pack_id VARCHAR DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    session_id UUID;
BEGIN
    INSERT INTO public.log_sessions (user_id, session_name, pack_id)
    VALUES (p_user_id, p_session_name, p_pack_id)
    RETURNING id INTO session_id;

    PERFORM public.update_user_activity(p_user_id);

    RETURN session_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to complete a log analysis session
CREATE OR REPLACE FUNCTION public.complete_log_session(
    p_session_id UUID,
    p_queries_executed INTEGER DEFAULT 0,
    p_files_analyzed INTEGER DEFAULT 0,
    p_insights_discovered JSONB DEFAULT '[]'
)
RETURNS VOID AS $$
DECLARE
    p_user_id UUID;
BEGIN
    -- Update the session
    UPDATE public.log_sessions
    SET
        ended_at = NOW(),
        queries_executed = p_queries_executed,
        files_analyzed = p_files_analyzed,
        insights_discovered = p_insights_discovered
    WHERE id = p_session_id
    RETURNING user_id INTO p_user_id;

    -- Update user stats
    UPDATE public.user_stats
    SET
        log_sessions = log_sessions + 1,
        updated_at = NOW()
    WHERE user_id = p_user_id;

    -- Award points based on activity
    PERFORM public.award_points(p_user_id, 50 + (p_queries_executed * 2) + (p_files_analyzed * 5));

    -- Check for achievements
    PERFORM public.check_achievements(p_user_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to generate a unique game session code
CREATE OR REPLACE FUNCTION public.generate_session_code()
RETURNS VARCHAR AS $$
DECLARE
    chars TEXT := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    result VARCHAR := '';
    i INTEGER;
BEGIN
    FOR i IN 1..6 LOOP
        result := result || substr(chars, floor(random() * length(chars) + 1)::integer, 1);
    END LOOP;

    -- Check if code already exists, regenerate if needed
    WHILE EXISTS (SELECT 1 FROM public.game_sessions WHERE session_code = result) LOOP
        result := '';
        FOR i IN 1..6 LOOP
            result := result || substr(chars, floor(random() * length(chars) + 1)::integer, 1);
        END LOOP;
    END LOOP;

    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to refresh the leaderboard cache
CREATE OR REPLACE FUNCTION public.refresh_leaderboard_cache()
RETURNS VOID AS $$
BEGIN
    -- Clear existing cache
    DELETE FROM public.leaderboard_cache;

    -- Rebuild cache from current data
    INSERT INTO public.leaderboard_cache (
        id, username, display_name, avatar_url,
        total_points, ctf_completions, streak_days, current_rank
    )
    SELECT
        p.id,
        p.username,
        p.display_name,
        p.avatar_url,
        us.total_points,
        us.ctf_completions,
        us.streak_days,
        ROW_NUMBER() OVER (ORDER BY us.total_points DESC, us.ctf_completions DESC) AS current_rank
    FROM public.profiles p
    JOIN public.user_stats us ON p.id = us.user_id
    WHERE p.profile_visibility = 'public'
        AND p.show_progress = true
        AND p.deleted_at IS NULL
    ORDER BY us.total_points DESC, us.ctf_completions DESC
    LIMIT 100; -- Cache top 100 for performance

    -- Update rank positions in user_stats
    UPDATE public.user_stats
    SET rank_position = lc.current_rank
    FROM public.leaderboard_cache lc
    WHERE user_stats.user_id = lc.id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get public leaderboard (safe for client access)
CREATE OR REPLACE FUNCTION public.get_public_leaderboard(limit_count INTEGER DEFAULT 10)
RETURNS TABLE (
    rank INTEGER,
    username VARCHAR(50),
    display_name VARCHAR(100),
    avatar_url TEXT,
    total_points INTEGER,
    ctf_completions INTEGER,
    streak_days INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        lc.current_rank::INTEGER,
        lc.username,
        lc.display_name,
        lc.avatar_url,
        lc.total_points,
        lc.ctf_completions,
        lc.streak_days
    FROM public.leaderboard_cache lc
    ORDER BY lc.current_rank
    LIMIT limit_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;