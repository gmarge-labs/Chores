# Supabase Setup For CHORES

This repo is now prepared for a future Supabase-backed version of CHORES so multiple families can use the app across devices with synced data.

## Current state

- The live app still runs in local mode today.
- Family data is still stored in browser `localStorage`.
- The runtime now looks for optional Supabase credentials in [`supabase-config.js`](./supabase-config.js).
- Once you create a Supabase project, we can wire the frontend to real auth and database sync cleanly.

## What to create in Supabase

1. Create a new Supabase project.
2. Open the SQL editor.
3. Run the schema in [`supabase/schema.sql`](./supabase/schema.sql).
4. Copy your project URL and anon key from `Project Settings -> API`.
5. Replace the placeholder values in [`supabase-config.js`](./supabase-config.js) using [`supabase-config.example.js`](./supabase-config.example.js) as the template.

## Recommended migration phases

### Phase 1

- Parent signup/login with Supabase Auth
- Families, kids, tasks, rewards, reports, and settings stored in Postgres
- Real cross-device sync for parent-managed data

### Phase 2

- Kid login with a safer cloud-backed flow
- Parent-generated child access codes or child accounts
- Parent approval and kid-only views enforced server-side

## Suggested frontend migration order

1. Add the Supabase JS client
2. Replace `localStorage` family creation with parent signup + family row creation
3. Load families, kids, tasks, rewards, and adjustments from Supabase
4. Save task updates, approvals, settings, and reports to Supabase
5. Keep a local cache for offline resilience

## Data model notes

The schema is designed around:

- one family having many kids
- one family having one or more parent memberships
- tasks tracked by status: `due`, `awaiting`, `completed`
- reusable rewards/favors per kid
- bonus/penalty entries and reason lists per kid
- family-level settings and streak tracking

## Security model

The included schema uses Row Level Security so only authenticated parents who belong to a family can access or modify that family's data.

That means:

- Family A cannot read Family B
- Parent data access is enforced in the database
- Kid-mode access should later be implemented with a dedicated secure child auth flow

## Important note

Do not put a service role key into the frontend. Use only the public anon key in [`supabase-config.js`](./supabase-config.js).
