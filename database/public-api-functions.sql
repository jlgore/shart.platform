-- Public API Functions for SHART.CLOUD
-- These functions provide safe, controlled access to public data
-- while maintaining RLS security

-- Function to get public profile information
CREATE OR REPLACE FUNCTION public.get_public_profile(profile_username VARCHAR)
RETURNS TABLE (
    username VARCHAR(50),
    display_name VARCHAR(100),
    avatar_url TEXT,
    bio TEXT,
    github_username VARCHAR(100),
    bluesky_handle VARCHAR(100),
    website_url TEXT,
    total_points INTEGER,
    ctf_completions INTEGER,
    streak_days INTEGER,
    rank_position INTEGER,
    achievement_count INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        p.username,
        p.display_name,
        p.avatar_url,
        p.bio,
        p.github_username,
        p.bluesky_handle,
        p.website_url,
        us.total_points,
        us.ctf_completions,
        us.streak_days,
        us.rank_position,
        COALESCE(ach_count.achievement_count, 0)::INTEGER
    FROM public.profiles p
    JOIN public.user_stats us ON p.id = us.user_id
    LEFT JOIN (
        SELECT ua.user_id, COUNT(*) as achievement_count
        FROM public.user_achievements ua
        GROUP BY ua.user_id
    ) ach_count ON p.id = ach_count.user_id
    WHERE p.username = profile_username
        AND p.profile_visibility = 'public'
        AND p.show_progress = true
        AND p.deleted_at IS NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get public user achievements
CREATE OR REPLACE FUNCTION public.get_public_achievements(profile_username VARCHAR)
RETURNS TABLE (
    achievement_name VARCHAR(100),
    achievement_description TEXT,
    achievement_icon VARCHAR(50),
    achievement_category VARCHAR(50),
    achievement_difficulty VARCHAR(20),
    points INTEGER,
    earned_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        a.name,
        a.description,
        a.icon,
        a.category,
        a.difficulty,
        a.points,
        ua.earned_at
    FROM public.user_achievements ua
    JOIN public.achievements a ON ua.achievement_id = a.id
    JOIN public.profiles p ON ua.user_id = p.id
    WHERE p.username = profile_username
        AND p.profile_visibility = 'public'
        AND p.show_progress = true
        AND p.deleted_at IS NULL
    ORDER BY ua.earned_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get public CTF progress
CREATE OR REPLACE FUNCTION public.get_public_ctf_progress(profile_username VARCHAR)
RETURNS TABLE (
    challenge_id VARCHAR(100),
    status VARCHAR(20),
    completed_at TIMESTAMP WITH TIME ZONE,
    time_spent_minutes INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        cp.challenge_id,
        cp.status,
        cp.completed_at,
        cp.time_spent_minutes
    FROM public.ctf_progress cp
    JOIN public.profiles p ON cp.user_id = p.id
    WHERE p.username = profile_username
        AND p.profile_visibility = 'public'
        AND p.show_progress = true
        AND p.deleted_at IS NULL
        AND cp.status = 'completed'
    ORDER BY cp.completed_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get available achievements list
CREATE OR REPLACE FUNCTION public.get_available_achievements()
RETURNS TABLE (
    id UUID,
    name VARCHAR(100),
    description TEXT,
    icon VARCHAR(50),
    category VARCHAR(50),
    difficulty VARCHAR(20),
    points INTEGER,
    is_secret BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        a.id,
        a.name,
        a.description,
        a.icon,
        a.category,
        a.difficulty,
        a.points,
        a.is_secret
    FROM public.achievements a
    WHERE a.is_active = true
        AND (a.available_from IS NULL OR a.available_from <= NOW())
        AND (a.available_until IS NULL OR a.available_until > NOW())
    ORDER BY a.category, a.difficulty, a.points;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get public game sessions
CREATE OR REPLACE FUNCTION public.get_public_game_sessions()
RETURNS TABLE (
    session_code VARCHAR(10),
    name VARCHAR(200),
    description TEXT,
    game_type VARCHAR(50),
    host_username VARCHAR(50),
    max_participants INTEGER,
    current_participants INTEGER,
    scheduled_start TIMESTAMP WITH TIME ZONE,
    status VARCHAR(20)
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        gs.session_code,
        gs.name,
        gs.description,
        gs.game_type,
        p.username,
        gs.max_participants,
        COALESCE(participant_count.count, 0)::INTEGER,
        gs.scheduled_start,
        gs.status
    FROM public.game_sessions gs
    JOIN public.profiles p ON gs.host_user_id = p.id
    LEFT JOIN (
        SELECT gp.session_id, COUNT(*) as count
        FROM public.game_participants gp
        WHERE gp.is_active = true
        GROUP BY gp.session_id
    ) participant_count ON gs.id = participant_count.session_id
    WHERE gs.is_private = false
        AND gs.status IN ('created', 'waiting', 'active')
    ORDER BY gs.scheduled_start ASC NULLS LAST, gs.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get leaderboard by category
CREATE OR REPLACE FUNCTION public.get_category_leaderboard(
    category_name VARCHAR DEFAULT NULL,
    limit_count INTEGER DEFAULT 10
)
RETURNS TABLE (
    rank INTEGER,
    username VARCHAR(50),
    display_name VARCHAR(100),
    avatar_url TEXT,
    category_completions INTEGER,
    total_points INTEGER
) AS $$
BEGIN
    IF category_name IS NULL THEN
        -- Return overall leaderboard
        RETURN QUERY
        SELECT
            ROW_NUMBER() OVER (ORDER BY us.total_points DESC)::INTEGER,
            p.username,
            p.display_name,
            p.avatar_url,
            us.ctf_completions,
            us.total_points
        FROM public.profiles p
        JOIN public.user_stats us ON p.id = us.user_id
        WHERE p.profile_visibility = 'public'
            AND p.show_progress = true
            AND p.deleted_at IS NULL
        ORDER BY us.total_points DESC
        LIMIT limit_count;
    ELSE
        -- Return category-specific leaderboard
        RETURN QUERY
        SELECT
            ROW_NUMBER() OVER (ORDER BY category_stats.completions DESC, us.total_points DESC)::INTEGER,
            p.username,
            p.display_name,
            p.avatar_url,
            category_stats.completions,
            us.total_points
        FROM public.profiles p
        JOIN public.user_stats us ON p.id = us.user_id
        JOIN (
            SELECT
                cp.user_id,
                COUNT(*) as completions
            FROM public.ctf_progress cp
            WHERE cp.status = 'completed'
                AND cp.challenge_id LIKE '%' || category_name || '%'
            GROUP BY cp.user_id
        ) category_stats ON p.id = category_stats.user_id
        WHERE p.profile_visibility = 'public'
            AND p.show_progress = true
            AND p.deleted_at IS NULL
        ORDER BY category_stats.completions DESC, us.total_points DESC
        LIMIT limit_count;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get platform statistics
CREATE OR REPLACE FUNCTION public.get_platform_stats()
RETURNS TABLE (
    total_users INTEGER,
    active_users_today INTEGER,
    total_ctf_completions INTEGER,
    total_achievements_earned INTEGER,
    active_game_sessions INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        (SELECT COUNT(*)::INTEGER FROM public.profiles WHERE deleted_at IS NULL),
        (SELECT COUNT(*)::INTEGER FROM public.user_stats WHERE last_activity_date = CURRENT_DATE),
        (SELECT COUNT(*)::INTEGER FROM public.ctf_progress WHERE status = 'completed'),
        (SELECT COUNT(*)::INTEGER FROM public.user_achievements),
        (SELECT COUNT(*)::INTEGER FROM public.game_sessions WHERE status IN ('waiting', 'active'))
    ;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;