-- Sample achievements for SHART.CLOUD platform
-- These can be inserted to populate the achievements system

INSERT INTO public.achievements (name, description, icon, category, difficulty, points, conditions) VALUES

-- CTF Achievements
('First Steps', 'Complete your first CTF challenge', '🥾', 'ctf', 'easy', 100, '{"type": "ctf_complete", "count": 1}'),
('AWS Explorer', 'Complete 3 AWS-focused CTF challenges', '☁️', 'ctf', 'medium', 250, '{"type": "ctf_complete", "count": 3, "category": "aws"}'),
('Cloud Warrior', 'Complete 10 CTF challenges across any category', '⚔️', 'ctf', 'medium', 500, '{"type": "ctf_complete", "count": 10}'),
('IAM Master', 'Complete all IAM-related CTF challenges', '🔐', 'ctf', 'hard', 750, '{"type": "ctf_complete", "category": "iam", "all": true}'),
('Speed Demon', 'Complete a CTF challenge in under 10 minutes', '⚡', 'ctf', 'hard', 300, '{"type": "ctf_complete_fast", "time_minutes": 10}'),
('Azure Ace', 'Complete 5 Azure-focused CTF challenges', '🔷', 'ctf', 'medium', 400, '{"type": "ctf_complete", "count": 5, "category": "azure"}'),
('GCP Guru', 'Complete 5 GCP-focused CTF challenges', '🌤️', 'ctf', 'medium', 400, '{"type": "ctf_complete", "count": 5, "category": "gcp"}'),
('Cloud Architect', 'Complete challenges in all three major cloud platforms', '🏗️', 'ctf', 'legendary', 1000, '{"type": "ctf_complete_multicloud", "platforms": ["aws", "azure", "gcp"]}'),

-- Blog Reading Achievements
('Curious Reader', 'Read your first blog post', '📖', 'blog', 'easy', 50, '{"type": "blog_read", "count": 1}'),
('Knowledge Seeker', 'Read 10 blog posts', '🔍', 'blog', 'medium', 200, '{"type": "blog_read", "count": 10}'),
('Bookworm', 'Read 25 blog posts', '🐛', 'blog', 'medium', 400, '{"type": "blog_read", "count": 25}'),
('Scholar', 'Read 50 blog posts', '🎓', 'blog', 'hard', 750, '{"type": "blog_read", "count": 50}'),
('Tutorial Master', 'Read all tutorial posts', '👨‍🏫', 'blog', 'medium', 300, '{"type": "blog_read_category", "category": "tutorials", "all": true}'),

-- Log Lab Achievements
('Log Detective', 'Complete your first log analysis session', '🕵️', 'log_lab', 'easy', 75, '{"type": "log_session_complete", "count": 1}'),
('Query Ninja', 'Execute 100 queries in the Log Lab', '🥷', 'log_lab', 'medium', 250, '{"type": "queries_executed", "count": 100}'),
('Data Hunter', 'Analyze 5 different log pack types', '🏹', 'log_lab', 'medium', 300, '{"type": "log_packs_analyzed", "count": 5}'),
('Insight Finder', 'Discover 20 insights across all sessions', '💡', 'log_lab', 'hard', 500, '{"type": "insights_discovered", "count": 20}'),
('Log Master', 'Complete 25 log analysis sessions', '🏆', 'log_lab', 'hard', 600, '{"type": "log_session_complete", "count": 25}'),

-- Streak Achievements
('Getting Started', 'Login for 3 consecutive days', '🔥', 'streak', 'easy', 100, '{"type": "daily_streak", "days": 3}'),
('On Fire', 'Maintain a 7-day activity streak', '🚀', 'streak', 'medium', 200, '{"type": "daily_streak", "days": 7}'),
('Unstoppable', 'Maintain a 30-day activity streak', '💪', 'streak', 'hard', 500, '{"type": "daily_streak", "days": 30}'),
('Legend', 'Maintain a 100-day activity streak', '👑', 'streak', 'legendary', 1500, '{"type": "daily_streak", "days": 100}'),

-- Community/Multiplayer Achievements
('Team Player', 'Participate in your first multiplayer session', '🤝', 'community', 'easy', 100, '{"type": "multiplayer_join", "count": 1}'),
('Session Host', 'Host your first multiplayer session', '🎯', 'community', 'medium', 200, '{"type": "multiplayer_host", "count": 1}'),
('Party Animal', 'Participate in 10 multiplayer sessions', '🎉', 'community', 'medium', 300, '{"type": "multiplayer_join", "count": 10}'),
('Competitor', 'Win a multiplayer CTF race', '🏁', 'community', 'hard', 400, '{"type": "multiplayer_win", "game_type": "ctf_race"}'),
('Community Leader', 'Host 5 multiplayer sessions', '👥', 'community', 'hard', 500, '{"type": "multiplayer_host", "count": 5}'),

-- Special/Hidden Achievements
('Early Adopter', 'Join during the first month of launch', '🌟', 'community', 'medium', 500, '{"type": "early_signup", "before": "2024-12-01"}'),
('Perfectionist', 'Complete a CTF challenge without using any hints', '✨', 'ctf', 'hard', 400, '{"type": "ctf_complete_no_hints", "count": 1}'),
('Night Owl', 'Complete a challenge between midnight and 6 AM', '🦉', 'ctf', 'medium', 150, '{"type": "ctf_complete_time", "start_hour": 0, "end_hour": 6}'),
('Weekend Warrior', 'Complete 5 challenges on weekends', '⚔️', 'ctf', 'medium', 250, '{"type": "ctf_complete_weekend", "count": 5}'),

-- Progress Milestones
('Point Collector', 'Earn your first 1,000 points', '💰', 'community', 'medium', 0, '{"type": "total_points", "points": 1000}'),
('High Achiever', 'Earn 5,000 total points', '💎', 'community', 'hard', 0, '{"type": "total_points", "points": 5000}'),
('Elite Member', 'Earn 10,000 total points', '👑', 'community', 'legendary', 0, '{"type": "total_points", "points": 10000}'),
('Jack of All Trades', 'Complete at least one activity in each category', '🎭', 'community', 'medium', 300, '{"type": "all_categories", "categories": ["ctf", "blog", "log_lab"]}');

-- Update the materialized view to include achievement counts
CREATE OR REPLACE VIEW public.user_achievement_summary AS
SELECT
    ua.user_id,
    COUNT(*) as total_achievements,
    COUNT(*) FILTER (WHERE a.difficulty = 'easy') as easy_achievements,
    COUNT(*) FILTER (WHERE a.difficulty = 'medium') as medium_achievements,
    COUNT(*) FILTER (WHERE a.difficulty = 'hard') as hard_achievements,
    COUNT(*) FILTER (WHERE a.difficulty = 'legendary') as legendary_achievements,
    SUM(a.points) as achievement_points
FROM public.user_achievements ua
JOIN public.achievements a ON ua.achievement_id = a.id
GROUP BY ua.user_id;