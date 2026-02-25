# SHART.CLOUD Database Schema

This directory contains the PostgreSQL/Supabase database schema for the SHART.CLOUD platform, designed to support user progress tracking, achievements, and multiplayer game sessions.

## Files Overview

- **`schema.sql`** - Core database schema with all tables, indexes, and triggers
- **`rls-policies.sql`** - ⚠️  **VULNERABLE** - Original RLS policies with privilege escalation bugs
- **`rls-policies-secure.sql`** - ✅ **SECURE** - Red-teamed RLS policies that prevent cheating
- **`functions.sql`** - Stored procedures and functions for business logic
- **`public-api-functions.sql`** - Safe public functions for accessing data via API
- **`sample-achievements.sql`** - Sample achievement definitions to populate the system
- **`test-rls-policies.sql`** - Test queries to validate RLS policies are working correctly
- **`attack-tests.sql`** - Comprehensive attack scenarios to verify security

## Database Structure

### Core Tables

#### User Management
- **`profiles`** - Extended user profile data (linked to Supabase auth.users)
- **`user_stats`** - User statistics, points, and rankings
- **`global_leaderboard`** - Materialized view for performance rankings

#### Progress Tracking
- **`ctf_progress`** - CTF challenge completion tracking
- **`blog_progress`** - Blog post reading history
- **`log_sessions`** - Log analysis session data

#### Achievements System
- **`achievements`** - Achievement definitions with flexible conditions
- **`user_achievements`** - User-earned achievements with timestamps

#### Multiplayer Features
- **`game_sessions`** - Multiplayer game session management
- **`game_participants`** - Session participation tracking
- **`game_events`** - Real-time game events and scoring

## Key Features

### Flexible Achievement System
Achievements use JSONB conditions for maximum flexibility:
```json
{
  "type": "ctf_complete",
  "count": 5,
  "category": "aws"
}
```

### Real-time Multiplayer Support
- Session codes for easy joining
- Live event tracking
- Automatic scoring and leaderboards

### Comprehensive Progress Tracking
- Activity streaks
- Point systems
- Category-specific progress
- Time-based metrics

## Setup Instructions

1. **Apply the schema:**
   ```sql
   \i database/schema.sql
   ```

2. **Set up Row Level Security (USE SECURE VERSION):**
   ```sql
   \i database/rls-policies-secure.sql
   ```

3. **Install functions:**
   ```sql
   \i database/functions.sql
   ```

4. **Install public API functions:**
   ```sql
   \i database/public-api-functions.sql
   ```

5. **Populate sample achievements:**
   ```sql
   \i database/sample-achievements.sql
   ```

6. **Test RLS policies (optional):**
   ```sql
   \i database/test-rls-policies.sql
   ```

7. **Security validation (recommended):**
   ```sql
   \i database/attack-tests.sql
   ```

## Usage Examples

### Track CTF Completion
```sql
SELECT public.complete_ctf_challenge(
  'user-uuid',
  'aws-iam-challenge-1',
  45, -- time spent in minutes
  2,  -- hints used
  '{"solution": "user-provided-solution"}'::jsonb
);
```

### Record Blog Reading
```sql
SELECT public.record_blog_read(
  'user-uuid',
  'iam-text-explainer',
  120, -- read duration in seconds
  95   -- scroll percentage
);
```

### Start Log Analysis Session
```sql
SELECT public.start_log_session(
  'user-uuid',
  'VPC Flow Analysis',
  'starter-vpc-cloudtrail'
);
```

### Check User Achievements
```sql
SELECT public.check_achievements('user-uuid');
```

## Security Considerations

- **Full RLS Protection**: All tables use Row Level Security with no exceptions
- **Controlled Public Access**: Public data uses secure functions with `SECURITY DEFINER`
- **Service Role Pattern**: Backend services use elevated permissions for system operations
- **Privacy Controls**: Users control their data visibility through profile settings
- **Cached Leaderboards**: Public leaderboard data is cached for performance while maintaining security
- **Safe API Functions**: Public functions validate access patterns and prevent data leaks

## Performance Optimizations

- Strategic indexes on frequently queried columns
- Materialized view for leaderboards
- JSONB for flexible but indexed data storage
- Efficient foreign key relationships

## Future Expansions

The schema is designed to easily accommodate:
- Additional game types
- More complex achievement conditions
- Team-based multiplayer features
- Advanced analytics and reporting
- Integration with external platforms

## Maintenance

### Regular Tasks
- Refresh leaderboard materialized view (automated via functions)
- Monitor achievement condition performance
- Clean up old game sessions
- Update user rankings

### Monitoring Queries
```sql
-- Active users today
SELECT COUNT(*) FROM profiles WHERE updated_at > CURRENT_DATE;

-- Top achievements earned
SELECT a.name, COUNT(*) as earned_count
FROM achievements a
JOIN user_achievements ua ON a.id = ua.achievement_id
GROUP BY a.id, a.name
ORDER BY earned_count DESC;

-- Multiplayer session activity
SELECT COUNT(*) as active_sessions
FROM game_sessions
WHERE status IN ('waiting', 'active');
```