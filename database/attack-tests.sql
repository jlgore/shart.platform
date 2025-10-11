-- ATTACK SCENARIO TESTS for SHART.CLOUD RLS Policies
-- These tests attempt various privilege escalation attacks
-- ALL OF THESE SHOULD FAIL with the secure RLS policies

-- Setup test user
DO $$
DECLARE
    attacker_id UUID := 'attack-0000-0000-0000-000000000001';
BEGIN
    -- Create attacker profile
    INSERT INTO public.profiles (id, username, display_name, profile_visibility)
    VALUES (attacker_id, 'attacker', 'Evil User', 'public')
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.user_stats (user_id, total_points, ctf_completions)
    VALUES (attacker_id, 100, 1)
    ON CONFLICT (user_id) DO NOTHING;
END $$;

-- =============================================================================
-- ATTACK TEST 1: Try to award points to self
-- =============================================================================
SELECT 'ATTACK TEST 1: Trying to award points to self' as test_name;

-- This should FAIL
DO $$
DECLARE
    attacker_id UUID := 'attack-0000-0000-0000-000000000001';
BEGIN
    UPDATE public.user_stats
    SET total_points = 999999, ctf_completions = 100
    WHERE user_id = attacker_id;
EXCEPTION
    WHEN insufficient_privilege THEN
        RAISE NOTICE 'SUCCESS: Attack blocked - cannot modify user stats';
    WHEN OTHERS THEN
        RAISE NOTICE 'ATTACK SUCCEEDED: User was able to modify stats! CRITICAL VULNERABILITY';
END $$;

-- Verify attack failed
SELECT username, total_points, ctf_completions
FROM public.profiles p
JOIN public.user_stats us ON p.id = us.user_id
WHERE p.username = 'attacker';

-- =============================================================================
-- ATTACK TEST 2: Try to fake CTF completion
-- =============================================================================
SELECT 'ATTACK TEST 2: Trying to fake CTF completion' as test_name;

-- This should FAIL
DO $$
DECLARE
    attacker_id UUID := 'attack-0000-0000-0000-000000000001';
BEGIN
    INSERT INTO public.ctf_progress (user_id, challenge_id, status, completed_at)
    VALUES (attacker_id, 'fake-challenge-999', 'completed', NOW());
EXCEPTION
    WHEN insufficient_privilege THEN
        RAISE NOTICE 'SUCCESS: Attack blocked - cannot create CTF progress';
    WHEN OTHERS THEN
        RAISE NOTICE 'ATTACK SUCCEEDED: User created fake CTF completion! CRITICAL VULNERABILITY';
END $$;

-- Verify attack failed
SELECT COUNT(*) as fake_completions
FROM public.ctf_progress cp
JOIN public.profiles p ON cp.user_id = p.id
WHERE p.username = 'attacker' AND cp.challenge_id = 'fake-challenge-999';

-- =============================================================================
-- ATTACK TEST 3: Try to award achievement to self
-- =============================================================================
SELECT 'ATTACK TEST 3: Trying to award achievement to self' as test_name;

-- First create a test achievement
INSERT INTO public.achievements (name, description, category, points, conditions, is_active)
VALUES ('Test Achievement', 'Test', 'ctf', 500, '{"type": "test"}', true)
ON CONFLICT (name) DO NOTHING;

-- This should FAIL
DO $$
DECLARE
    attacker_id UUID := 'attack-0000-0000-0000-000000000001';
    achievement_id UUID;
BEGIN
    SELECT id INTO achievement_id FROM public.achievements WHERE name = 'Test Achievement';

    INSERT INTO public.user_achievements (user_id, achievement_id)
    VALUES (attacker_id, achievement_id);
EXCEPTION
    WHEN insufficient_privilege THEN
        RAISE NOTICE 'SUCCESS: Attack blocked - cannot award achievement to self';
    WHEN OTHERS THEN
        RAISE NOTICE 'ATTACK SUCCEEDED: User awarded achievement to self! CRITICAL VULNERABILITY';
END $$;

-- =============================================================================
-- ATTACK TEST 4: Try to manipulate game session scores
-- =============================================================================
SELECT 'ATTACK TEST 4: Trying to manipulate game scores' as test_name;

-- Setup a game session
DO $$
DECLARE
    attacker_id UUID := 'attack-0000-0000-0000-000000000001';
    session_id UUID;
BEGIN
    -- Create game session
    INSERT INTO public.game_sessions (host_user_id, session_code, name, game_type, status)
    VALUES (attacker_id, 'TEST01', 'Test Game', 'ctf_race', 'created')
    RETURNING id INTO session_id;

    -- Join the session
    INSERT INTO public.game_participants (session_id, user_id, score, rank_position)
    VALUES (session_id, attacker_id, 0, NULL);

EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Setup failed: %', SQLERRM;
END $$;

-- Try to boost score - This should FAIL
DO $$
DECLARE
    attacker_id UUID := 'attack-0000-0000-0000-000000000001';
BEGIN
    UPDATE public.game_participants
    SET score = 999999, rank_position = 1
    WHERE user_id = attacker_id;
EXCEPTION
    WHEN insufficient_privilege THEN
        RAISE NOTICE 'SUCCESS: Attack blocked - cannot modify game scores';
    WHEN OTHERS THEN
        RAISE NOTICE 'ATTACK SUCCEEDED: User modified game scores! CRITICAL VULNERABILITY';
END $$;

-- =============================================================================
-- ATTACK TEST 5: Try to create point-awarding game events
-- =============================================================================
SELECT 'ATTACK TEST 5: Trying to create point-awarding events' as test_name;

-- This should FAIL
DO $$
DECLARE
    attacker_id UUID := 'attack-0000-0000-0000-000000000001';
    session_id UUID;
BEGIN
    SELECT gs.id INTO session_id
    FROM public.game_sessions gs
    WHERE gs.host_user_id = attacker_id
    LIMIT 1;

    INSERT INTO public.game_events (session_id, user_id, event_type, points_awarded)
    VALUES (session_id, attacker_id, 'complete', 1000);
EXCEPTION
    WHEN insufficient_privilege THEN
        RAISE NOTICE 'SUCCESS: Attack blocked - cannot create point-awarding events';
    WHEN OTHERS THEN
        RAISE NOTICE 'ATTACK SUCCEEDED: User created point-awarding event! CRITICAL VULNERABILITY';
END $$;

-- =============================================================================
-- ATTACK TEST 6: Try to modify other users' data
-- =============================================================================
SELECT 'ATTACK TEST 6: Trying to access other users data' as test_name;

-- Create victim user
DO $$
DECLARE
    victim_id UUID := 'victim-0000-0000-0000-000000000001';
BEGIN
    INSERT INTO public.profiles (id, username, display_name, profile_visibility)
    VALUES (victim_id, 'victim', 'Victim User', 'public')
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.user_stats (user_id, total_points, ctf_completions)
    VALUES (victim_id, 5000, 20)
    ON CONFLICT (user_id) DO NOTHING;
END $$;

-- Try to steal victim's points - This should FAIL
DO $$
DECLARE
    victim_id UUID := 'victim-0000-0000-0000-000000000001';
    attacker_id UUID := 'attack-0000-0000-0000-000000000001';
BEGIN
    -- Try to transfer points
    UPDATE public.user_stats
    SET total_points = 0
    WHERE user_id = victim_id;

    UPDATE public.user_stats
    SET total_points = 10000
    WHERE user_id = attacker_id;
EXCEPTION
    WHEN insufficient_privilege THEN
        RAISE NOTICE 'SUCCESS: Attack blocked - cannot modify other users stats';
    WHEN OTHERS THEN
        RAISE NOTICE 'ATTACK SUCCEEDED: User modified other users data! CRITICAL VULNERABILITY';
END $$;

-- =============================================================================
-- ATTACK TEST 7: Try to backdate progress for streaks
-- =============================================================================
SELECT 'ATTACK TEST 7: Trying to backdate blog progress' as test_name;

-- This should FAIL or be restricted
DO $$
DECLARE
    attacker_id UUID := 'attack-0000-0000-0000-000000000001';
BEGIN
    INSERT INTO public.blog_progress (user_id, post_slug, read_at)
    VALUES (attacker_id, 'fake-post', NOW() + INTERVAL '1 day');  -- Future date
EXCEPTION
    WHEN check_violation THEN
        RAISE NOTICE 'SUCCESS: Attack blocked - cannot future-date blog reads';
    WHEN insufficient_privilege THEN
        RAISE NOTICE 'SUCCESS: Attack blocked - insufficient privileges';
    WHEN OTHERS THEN
        RAISE NOTICE 'ATTACK SUCCEEDED: User backdated blog progress! VULNERABILITY';
END $$;

-- =============================================================================
-- ATTACK TEST 8: Try to modify system-managed session data
-- =============================================================================
SELECT 'ATTACK TEST 8: Trying to modify system session data' as test_name;

-- Create a log session
DO $$
DECLARE
    attacker_id UUID := 'attack-0000-0000-0000-000000000001';
    session_id UUID;
BEGIN
    INSERT INTO public.log_sessions (user_id, session_name, queries_executed, files_analyzed)
    VALUES (attacker_id, 'Test Session', 0, 0)
    RETURNING id INTO session_id;

    -- Try to fake high activity - This should FAIL
    UPDATE public.log_sessions
    SET queries_executed = 1000, files_analyzed = 500
    WHERE id = session_id;
EXCEPTION
    WHEN insufficient_privilege THEN
        RAISE NOTICE 'SUCCESS: Attack blocked - cannot modify session stats';
    WHEN check_violation THEN
        RAISE NOTICE 'SUCCESS: Attack blocked - check constraint violation';
    WHEN OTHERS THEN
        RAISE NOTICE 'ATTACK SUCCEEDED: User modified session stats! VULNERABILITY';
END $$;

-- =============================================================================
-- FINAL VERIFICATION: Check all critical data is still secure
-- =============================================================================
SELECT 'FINAL VERIFICATION: Checking data integrity' as test_name;

-- Verify attacker still has original stats
SELECT
    'Attacker Points Check' as check_type,
    CASE
        WHEN total_points <= 100 THEN 'SECURE: Points not inflated'
        ELSE 'COMPROMISED: Points were modified!'
    END as result,
    total_points
FROM public.user_stats us
JOIN public.profiles p ON us.user_id = p.id
WHERE p.username = 'attacker';

-- Verify no fake CTF completions
SELECT
    'Fake CTF Check' as check_type,
    CASE
        WHEN COUNT(*) = 0 THEN 'SECURE: No fake CTF completions'
        ELSE 'COMPROMISED: Fake CTF completions exist!'
    END as result,
    COUNT(*) as fake_count
FROM public.ctf_progress cp
JOIN public.profiles p ON cp.user_id = p.id
WHERE p.username = 'attacker' AND cp.challenge_id LIKE 'fake-%';

-- Verify no self-awarded achievements
SELECT
    'Self-Achievement Check' as check_type,
    CASE
        WHEN COUNT(*) = 0 THEN 'SECURE: No self-awarded achievements'
        ELSE 'COMPROMISED: Self-awarded achievements exist!'
    END as result,
    COUNT(*) as achievement_count
FROM public.user_achievements ua
JOIN public.profiles p ON ua.user_id = p.id
JOIN public.achievements a ON ua.achievement_id = a.id
WHERE p.username = 'attacker' AND a.name = 'Test Achievement';

-- Cleanup test data
DO $$
BEGIN
    DELETE FROM public.game_events WHERE user_id IN (
        'attack-0000-0000-0000-000000000001',
        'victim-0000-0000-0000-000000000001'
    );

    DELETE FROM public.game_participants WHERE user_id IN (
        'attack-0000-0000-0000-000000000001',
        'victim-0000-0000-0000-000000000001'
    );

    DELETE FROM public.game_sessions WHERE host_user_id IN (
        'attack-0000-0000-0000-000000000001',
        'victim-0000-0000-0000-000000000001'
    );

    DELETE FROM public.log_sessions WHERE user_id IN (
        'attack-0000-0000-0000-000000000001',
        'victim-0000-0000-0000-000000000001'
    );

    DELETE FROM public.blog_progress WHERE user_id IN (
        'attack-0000-0000-0000-000000000001',
        'victim-0000-0000-0000-000000000001'
    );

    DELETE FROM public.ctf_progress WHERE user_id IN (
        'attack-0000-0000-0000-000000000001',
        'victim-0000-0000-0000-000000000001'
    );

    DELETE FROM public.user_achievements WHERE user_id IN (
        'attack-0000-0000-0000-000000000001',
        'victim-0000-0000-0000-000000000001'
    );

    DELETE FROM public.user_stats WHERE user_id IN (
        'attack-0000-0000-0000-000000000001',
        'victim-0000-0000-0000-000000000001'
    );

    DELETE FROM public.profiles WHERE id IN (
        'attack-0000-0000-0000-000000000001',
        'victim-0000-0000-0000-000000000001'
    );

    DELETE FROM public.achievements WHERE name = 'Test Achievement';
END $$;