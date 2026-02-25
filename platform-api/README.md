# shart.platform API

Hono-based API for the shart.cloud CTF platform running on Cloudflare Workers with D1.

## Quick Start

```bash
cd platform-api
npm install

# Create D1 databases
wrangler d1 create shart-ctf-db
wrangler d1 create shart-ctf-db-dev

# Update wrangler.toml with the database IDs from the output above

# Set secrets
wrangler secret put BETTER_AUTH_SECRET      # Generate: openssl rand -base64 32
wrangler secret put INSTANCE_SECRET_SALT    # Generate: openssl rand -base64 16

# Run migrations
wrangler d1 execute shart-ctf-db-dev --local --file=./schema.sql
wrangler d1 execute shart-ctf-db-dev --local --file=./seed.sql

# Start dev server
npm run dev
```

## API Reference

### Authentication

Better Auth handles all auth routes at `/api/auth/*`:

```bash
# Sign up
curl -X POST https://platform.shart.cloud/api/auth/sign-up/email \
  -H "Content-Type: application/json" \
  -d '{"email": "player@example.com", "password": "securepassword", "name": "Player1"}'

# Sign in
curl -X POST https://platform.shart.cloud/api/auth/sign-in/email \
  -H "Content-Type: application/json" \
  -d '{"email": "player@example.com", "password": "securepassword"}'
```

### CTF Endpoints

#### Register VM Instance
```bash
POST /api/ctf/register
Authorization: Bearer <session_token>

# Response includes kubectl command to deploy telemetry
{
  "instance_id": "uuid",
  "instance_secret": "secret",
  "kubectl_command": "kubectl create secret..."
}
```

#### Get Questions
```bash
GET /api/ctf/questions
Authorization: Bearer <session_token>

# Returns all questions with your progress
{
  "questions": [{
    "id": "q1-1",
    "question_text": "What is the namespace...",
    "base_points": 10,
    "hints": [
      {"index": 0, "cost": 2, "text": null, "unlocked": false}
    ],
    "is_answered": false
  }]
}
```

#### Submit Answer
```bash
POST /api/ctf/questions/submit
Authorization: Bearer <session_token>
Content-Type: application/json

{"question_id": "q1-1", "answer": "customer-workloads"}

# Response
{"correct": true, "points_awarded": 10}
```

#### Unlock Hint
```bash
POST /api/ctf/questions/hint
Authorization: Bearer <session_token>

{"question_id": "q1-1", "hint_index": 0}
```

#### Player Status
```bash
GET /api/ctf/status
Authorization: Bearer <session_token>

# Returns points, progress, honeytoken trips, achievements
```

#### Leaderboard (public)
```bash
GET /api/ctf/leaderboard?limit=50&offset=0
```

### Telemetry (VM → API)

These endpoints use instance auth, not user JWT:

```bash
# Report honeytoken access
POST /api/ctf/telemetry/honeytoken
Content-Type: application/json

{
  "instance_id": "uuid",
  "instance_secret": "secret",
  "token_name": "fake-aws-creds",
  "token_path": "/etc/kubernetes/secrets/aws.json"
}

# Heartbeat
POST /api/ctf/telemetry/heartbeat
Content-Type: application/json

{"instance_id": "uuid", "instance_secret": "secret"}
```

## Architecture

```
┌──────────────┐     ┌────────────────────┐     ┌─────────────┐
│   Browser    │────▶│  platform.shart.cloud │◀───│  CTF VM     │
│              │     │  (Hono + D1)       │     │  telemetry  │
└──────────────┘     └────────────────────┘     └─────────────┘
       │                      │
       │ JWT Auth             │ Instance Secret
       ▼                      ▼
  ┌─────────────────────────────────────────┐
  │              D1 Database                │
  │  - users, sessions (Better Auth)       │
  │  - player_profiles, questions          │
  │  - submissions, honeytoken_trips       │
  └─────────────────────────────────────────┘
```

## Deployment

```bash
# Deploy to production
wrangler d1 execute shart-ctf-db --file=./schema.sql
wrangler d1 execute shart-ctf-db --file=./seed.sql
npm run deploy
```

## Files

```
platform-api/
├── src/
│   ├── index.ts      # All routes (Hono app)
│   ├── auth.ts       # Better Auth configuration
│   ├── db.ts         # Kysely + D1 setup
│   └── types.ts      # TypeScript interfaces
├── telemetry-daemon/
│   ├── main.go       # Go daemon for CTF VM
│   ├── Dockerfile
│   └── k8s-manifest.yaml
├── schema.sql        # D1 schema
├── seed.sql          # Sample questions
├── wrangler.toml     # Cloudflare config
└── package.json
```

## Adding Questions

Edit `seed.sql` or insert directly:

```sql
INSERT INTO questions (id, phase_id, question_number, question_text, answer, base_points, hints) 
VALUES (
  'q1-5',
  'shart-cloud-phase-1',
  5,
  'What is the value of SECRET_KEY in the exposed configmap?',
  'hunter2',
  15,
  '[{"text": "Check all configmaps in default namespace", "cost": 3}]'
);
```

## Honeytoken Setup

In your CTF VM, create honeytokens at these paths (or customize in telemetry daemon):

- `/etc/kubernetes/secrets/aws-admin.json` - Fake AWS creds
- `/var/lib/shart/honeypot-creds.txt` - Decoy credentials file
- `/opt/shart/fake-database.db` - Fake SQLite database

When accessed, the telemetry daemon reports to the API and the player loses Ghost Protocol eligibility.
