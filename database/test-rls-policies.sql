-- Test queries to validate RLS policies are working correctly
-- Run these as different users to ensure proper access control

-- Test 1: Create test users and profiles
DO $$
DECLARE
    user1_id UUID := 'user1-0000-0000-0000-000000000001';
    user2_id UUID := 'user2-0000-0000-0000-000000000002';
    user3_id UUID := 'user3-0000-0000-0000-000000000003';
BEGIN
    -- Insert test profiles (assuming these would normally come from auth.users)
    INSERT INTO public.profiles (id, username, display_name, profile_visibility, show_progress) VALUES
    (user1_id, 'testuser1', 'Test User 1', 'public', true),
    (user2_id, 'testuser2', 'Test User 2', 'public', false),
    (user3_id, 'testuser3', 'Test User 3', 'private', true)
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.user_stats (user_id, total_points, ctf_completions) VALUES
    (user1_id, 1000, 5),
    (user2_id, 800, 3),
    (user3_id, 1200, 7)
    ON CONFLICT (user_id) DO NOTHING;

    INSERT INTO public.ctf_progress (user_id, challenge_id, status, completed_at) VALUES
    (user1_id, 'aws-iam-challenge-1', 'completed', NOW()),
    (user2_id, 'aws-iam-challenge-1', 'completed', NOW()),
    (user3_id, 'aws-iam-challenge-1', 'completed', NOW())
    ON CONFLICT (user_id, challenge_id) DO NOTHING;
END $$;

-- Test 2: Public profile visibility
-- This should return only users with public profiles and show_progress = true
SELECT 'Test 2: Public profiles' as test_name;
SELECT username, profile_visibility, show_progress
FROM public.profiles
WHERE profile_visibility = 'public' AND show_progress = true;

-- Test 3: User stats visibility
-- This should only return stats for public users with show_progress = true
SELECT 'Test 3: Public user stats' as test_name;
SELECT p.username, us.total_points, us.ctf_completions
FROM public.user_stats us
JOIN public.profiles p ON us.user_id = p.id;

-- Test 4: Achievement visibility
-- All active achievements should be visible
SELECT 'Test 4: Active achievements' as test_name;
SELECT COUNT(*) as active_achievement_count
FROM public.achievements
WHERE is_active = true;

-- Test 5: Public leaderboard function
SELECT 'Test 5: Public leaderboard function' as test_name;
SELECT * FROM public.get_public_leaderboard(5);

-- Test 6: Public profile function
SELECT 'Test 6: Public profile function' as test_name;
SELECT * FROM public.get_public_profile('testuser1');

-- Test 7: Try to access private profile (should return no results)
SELECT 'Test 7: Private profile access (should be empty)' as test_name;
SELECT * FROM public.get_public_profile('testuser3');

-- Test 8: User stats for user with show_progress = false (should be filtered out)
SELECT 'Test 8: User stats with show_progress = false (should be filtered)' as test_name;
SELECT p.username, us.total_points
FROM public.user_stats us
JOIN public.profiles p ON us.user_id = p.id
WHERE p.username = 'testuser2';

-- Test 9: Platform statistics
SELECT 'Test 9: Platform statistics' as test_name;
SELECT * FROM public.get_platform_stats();

-- Test 10: Available achievements
SELECT 'Test 10: Available achievements' as test_name;
SELECT name, category, difficulty, is_secret
FROM public.get_available_achievements()
LIMIT 5;

-- Test RLS violation attempts (these should fail or return empty results)

-- Test 11: Try to access all user CTF progress directly (should be restricted)
SELECT 'Test 11: Direct CTF progress access (should be restricted by RLS)' as test_name;
SELECT COUNT(*) as accessible_ctf_records
FROM public.ctf_progress;

-- Test 12: Try to access all blog progress directly (should be restricted)
SELECT 'Test 12: Direct blog progress access (should be restricted by RLS)' as test_name;
SELECT COUNT(*) as accessible_blog_records
FROM public.blog_progress;

-- Test 13: Try to access all log sessions directly (should be restricted)
SELECT 'Test 13: Direct log sessions access (should be restricted by RLS)' as test_name;
SELECT COUNT(*) as accessible_log_sessions
FROM public.log_sessions;

-- Cleanup test data
DO $$
BEGIN
    DELETE FROM public.ctf_progress WHERE user_id IN (
        'user1-0000-0000-0000-000000000001',
        'user2-0000-0000-0000-000000000002',
        'user3-0000-0000-0000-000000000003'
    );

    DELETE FROM public.user_stats WHERE user_id IN (
        'user1-0000-0000-0000-000000000001',
        'user2-0000-0000-0000-000000000002',
        'user3-0000-0000-0000-000000000003'
    );

    DELETE FROM public.profiles WHERE id IN (
        'user1-0000-0000-0000-000000000001',
        'user2-0000-0000-0000-000000000002',
        'user3-0000-0000-0000-000000000003'
    );
END $$;

-- Summary of expected RLS behavior:
/*
1. Public profiles with show_progress = true should be visible to everyone
2. Private profiles should only be visible to the owner
3. User stats should only be visible for public profiles with show_progress = true
4. CTF/blog/log progress should only be visible to the owner
5. Achievements definitions should be visible to everyone
6. User achievements should be visible for public profiles with show_progress = true
7. Game sessions should be visible based on privacy settings
8. Public API functions should respect all the above rules
9. Service role should have elevated access for system operations
10. Leaderboard cache should be readable by everyone
*/