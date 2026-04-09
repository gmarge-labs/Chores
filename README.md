# CHORES

A playful web app for tracking kids' chores, points, rewards, reports, and parent-only settings.

## Run Locally

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

## Deploy With GitHub Pages

This is a static app, so it can be deployed directly from the repository root using GitHub Pages.

## Current Data Mode

CHORES currently runs in local browser storage mode, which means each device keeps its own family data.

The repo is now also prepared for a future Supabase migration so multiple families can eventually log in and sync data across devices.

## Cloud-Sync Prep

Files added for the next backend phase:

- [`supabase/schema.sql`](./supabase/schema.sql)
- [`SUPABASE_SETUP.md`](./SUPABASE_SETUP.md)
- [`supabase-config.example.js`](./supabase-config.example.js)

The runtime safely loads [`supabase-config.js`](./supabase-config.js), but the app stays in local mode until real Supabase credentials are added.
