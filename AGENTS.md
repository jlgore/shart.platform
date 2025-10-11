# SHART.CLOUD - Cloud Security Training Platform

## Project Overview
Irreverent cloud security training platform featuring blog, CTF challenges, and certificate system.
Domain: shart.cloud | Focus: Cloud security education with personality

## Core Features Architecture
### 1. Blog System
- Use Astro Content Collections in `src/content/blog/`
- MDX for rich content with code snippets and interactive components
- Categories: cloud-security, ctf-writeups, tutorials, rants
- Frontmatter: title, date, author, tags, difficulty, readTime

### 2. CTF Landing Page (`/ctf`)
- Challenge catalog with difficulty ratings
- Links to GitHub repos (challenge source code)
- VM/container images download section
- Scoreboard integration placeholder
- Challenge categories: AWS, Azure, GCP, Kubernetes, IAM

### 3. Authentication & Flag System
- JWT-based auth (store in httpOnly cookies)
- Database: PostgreSQL/Supabase for user data and flag tracking
- Flag format: `SHART{clever_irreverent_phrase}`
- Rate limiting on flag submissions (prevent brute force)
- Progress tracking per user

### 4. Certificate Generation
- Unique completion certificates with UUID
- PDF generation using React PDF or Canvas API
- Verifiable at `/verify/{certificate-id}`
- Include completion date, challenges solved, and snarky achievement

## Build Commands
```bash
npm run dev          # Start dev server (port 4321)
npm run build        # Production build
npm run preview      # Preview production build
npm run astro check  # TypeScript and Astro validation
```

## Code Style & Conventions
### File Structure
```
src/
├── components/      # Reusable .astro/.tsx components
├── content/        # Blog posts and CTF challenges
├── layouts/        # Page layouts (Base, Blog, CTF)
├── pages/          # Routes (index, blog, ctf, auth)
├── lib/            # Utilities, auth, API clients
├── styles/         # Global CSS, Tailwind config
└── api/            # API routes for auth/flags
```

### Naming Conventions
- **Components**: PascalCase (`CTFChallenge.astro`, `FlagSubmit.tsx`)
- **Utils/Helpers**: camelCase (`validateFlag.ts`, `generateCert.ts`)
- **API Routes**: kebab-case (`submit-flag.ts`, `get-certificate.ts`)
- **Content Files**: kebab-case (`intro-to-cloud-security.mdx`)

### TypeScript Guidelines
- Strict mode enabled (extends `astro/tsconfigs/strict`)
- Define interfaces for all API responses
- Type all component props explicitly
- Use enums for challenge difficulties and categories

### Styling Approach
- Tailwind CSS for utility-first styling
- CSS modules for complex component styles
- Dark mode by default (hackers don't use light mode)
- Monospace fonts for code/terminal aesthetics

### Security Best Practices
- Environment variables for sensitive config (API keys, DB URLs)
- Input sanitization on all user inputs
- Rate limiting on auth endpoints
- CORS configuration for API routes
- CSP headers for XSS protection

### Content Guidelines
- Irreverent tone but technically accurate
- Include memes and pop culture references
- Clear difficulty progression in challenges
- Practical, real-world cloud security scenarios
- No actual vulnerabilities in production code

### Testing Strategy
- Vitest for unit tests
- Playwright for E2E testing
- Test flag validation logic thoroughly
- Mock external services in tests

### Dependencies to Add
- @astrojs/tailwind - Styling
- @astrojs/mdx - Rich blog content
- @astrojs/react or @astrojs/vue - Interactive components
- @supabase/supabase-js - Database and auth
- jsonwebtoken - JWT handling
- rate-limiter-flexible - Rate limiting
- pdfkit or @react-pdf/renderer - Certificate generation

## Development Workflow
1. Feature branches from `main`
2. Prefix branches: `feat/`, `fix/`, `blog/`
3. Commit format: `type: description` (feat/fix/docs/style)
4. PR required for main branch
5. Deploy to Vercel/Netlify on merge

## Environment Variables
```env
PUBLIC_SITE_URL=https://shart.cloud
DATABASE_URL=postgresql://...
JWT_SECRET=...
PUBLIC_SUPABASE_URL=...
PUBLIC_SUPABASE_ANON_KEY=...
CERTIFICATE_SIGNING_KEY=...
# Client-visible base URL for duckdb-wasm assets (host on Cloudflare R2/Pages/CDN)
PUBLIC_DUCKDB_ASSETS_BASE=https://assets.shart.cloud/duckdb/
# Discord invite visibility (server-only)
DISCORD_SERVER_INVITE=false
# Optional: actual invite URL (server-only)
DISCORD_INVITE_URL=https://discord.gg/your-invite-code
```
