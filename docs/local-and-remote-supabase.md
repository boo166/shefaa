# Local vs Online Supabase: Detailed Usage Guide

This document explains how to work with the local Supabase stack and the online (remote) Supabase project. It covers setup, common workflows, schema migrations, data handling, troubleshooting, and a team-ready deployment checklist.

Terminology
- Local: the Supabase stack running on your machine via Docker.
- Remote: the hosted Supabase project (online).
- Schema: tables, functions, policies, indexes, etc. managed by migrations.
- Data: rows stored in tables and storage objects.

Important
- Migrations sync schema, not data. Local and remote data are different unless you explicitly copy data.
- Never put secrets or access tokens into git or documentation.

Prerequisites
- Docker Desktop running.
- Supabase CLI installed and available in your terminal.
- You are logged into Supabase CLI for remote operations (`supabase login`).
- Project configured in `supabase/config.toml`.
- Environment variables configured in `.env` (do not commit secrets).

Project identifiers
- Local project ID (from `supabase/config.toml`): `owfuzrsfagufcchrxpvm`
- Remote project ref: use the same ref unless you also have staging/prod refs.

Environment files (recommended)
- `.env` should point to the remote project.
- `.env.local` should point to the local project.
- Use `.env.local.example` as a template for local development.

Example local environment file
```
VITE_SUPABASE_URL="http://127.0.0.1:54321"
VITE_SUPABASE_PUBLISHABLE_KEY="sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH"
VITE_SUPABASE_PROJECT_ID="owfuzrsfagufcchrxpvm"
APP_ORIGINS="http://localhost:5173"
REMINDER_CRON_SECRET="local-dev-secret"
```

Section 1: Local Supabase (development)

Start the local stack
1. Run:
   `supabase start`
2. The CLI prints local URLs for Studio, REST, GraphQL, Storage, and the DB connection string.
3. Use `supabase status` any time to view local URLs.

Stop the local stack
1. Run:
   `supabase stop`
2. Containers will stop but data is preserved unless you reset.

Apply migrations locally
1. Run:
   `supabase migration up`
2. This applies all migrations in `supabase/migrations` to your local DB.

Reset local DB (wipe and re-apply)
1. Run:
   `supabase db reset`
2. This wipes local data and re-applies all migrations.

Run DB tests (pgTAP)
1. Run:
   `supabase test db`
2. This executes SQL tests in `supabase/tests`.

Local data seeding
- If you use `supabase/seed.sql`, it will run on reset.
- You can add a separate seed script or insert data directly using Studio or `supabase db` tools.

Local Studio
- Open Studio URL shown by `supabase start`.
- Use it to browse tables, run SQL, inspect policies, and test RPCs.

Point the app to local
1. Copy `.env.local.example` to `.env.local`.
2. Ensure the local values match `supabase status`.
3. Restart the dev server so Vite picks up `.env.local`.

Quick switch command
- `npm run env:local`

Section 2: Online (remote) Supabase

Authenticate the CLI
1. Run:
   `supabase login`
2. Follow the browser flow to authenticate.

Link your project
1. Run:
   `supabase link --project-ref <project_ref>`
2. This links your local repo to the remote Supabase project.
3. For this repo, the current project ref is expected to be: `owfuzrsfagufcchrxpvm`.

Push migrations to remote
1. Run:
   `supabase db push`
2. This applies new migration files to the remote database.
3. The CLI will prompt for confirmation and list pending migrations.

Check for drift (schema differences)
1. Run:
   `supabase db diff`
2. This compares local migration state with the remote database schema.
3. If it times out, try again with `--debug` or use `supabase db pull` for a quick check.

Pull remote schema (read-only check)
1. Run:
   `supabase db pull`
2. This generates a schema dump from remote for comparison.

Remote Studio
- Use the Supabase web dashboard for the remote project.
- Use it to monitor data, logs, and manage settings.

Point the app to remote
1. Ensure `.env` contains the remote URL and publishable key.
2. Remove or rename `.env.local` if you want to force remote for a session.
3. Restart the dev server so Vite picks up `.env`.

Quick switch command
- `npm run env:remote`

Section 3: Recommended workflow

Normal development flow
1. Create or modify schema via new migration files.
2. Apply migrations locally (`supabase migration up`).
3. Run DB tests (`supabase test db`).
4. Verify in local Studio.
5. Push to remote (`supabase db push`).

Staging and production flow (recommended)
1. Create migration locally.
2. Apply locally and run tests.
3. Push to staging (`supabase link --project-ref <staging_ref>` then `supabase db push`).
4. Run staging checks and QA.
5. Push to production (`supabase link --project-ref <prod_ref>` then `supabase db push`).

Branching and deployment
- Keep migrations in order and never modify applied migrations.
- If you need to change a production schema, create a new migration file.
- For hotfixes, keep them small, forward-only, and reviewed.

When you need to sync data
- Data is not synced automatically.
- Use `supabase db dump --data-only` to export data, then restore to another environment.
- For large or sensitive data sets, prefer separate staging environments or masking.

Section 4: Storage usage

Local storage
- Storage runs locally in the Supabase stack.
- Access via local Storage URL shown by `supabase start`.
- Bucket policies and RLS still apply.

Remote storage
- Uses Supabase Storage in the online project.
- Access via the Supabase dashboard or your app's Supabase client.
- Ensure sensitive buckets are private and accessed via signed URLs or RLS.

Section 5: Security reminders

Do
- Use `anon` key in client code.
- Keep `service_role` key server-side only.
- Enforce tenant isolation at RLS and repository/service layers.
- Use signed URLs for private storage.

Do not
- Commit access tokens or private keys.
- Use `service_role` in frontend code.
- Disable RLS in production.

Section 6: Troubleshooting

Docker permission errors (Windows)
- Run Docker Desktop.
- Run terminal as administrator if required.
- Ensure Docker is configured to allow CLI access.

Migration failures
- Check the failing migration SQL file.
- Fix the SQL and re-run `supabase migration up`.
- If remote already applied, create a new migration to fix forward.

RLS test failures
- Ensure `supabase test db` is running.
- Confirm pgTAP tests match actual policies and expected counts.

Section 7: Quick reference

Local
- Start: `supabase start`
- Status: `supabase status`
- Apply migrations: `supabase migration up`
- Reset: `supabase db reset`
- Test DB: `supabase test db`
- Stop: `supabase stop`
- Switch to local env: `npm run env:local`
- Check env status: `npm run env:status`

Remote
- Login: `supabase login`
- Link: `supabase link --project-ref <project_ref>`
- Push migrations: `supabase db push`
- Check drift: `supabase db diff`
- Pull schema: `supabase db pull`
- Switch to remote env: `npm run env:remote`

Section 8: Team workflow checklist (copy/paste)

Daily development checklist
1. `supabase start`
2. `supabase migration up`
3. Make changes and add a migration.
4. `supabase test db`
5. `npm run build` (or `npm test` if required)
6. Commit code + migrations.

Pre-staging checklist
1. `supabase db diff` (ensure no unexpected drift).
2. `supabase db push` to staging.
3. Run staging smoke tests (auth, patient, appointment, billing, reports).

Pre-production checklist
1. Confirm staging is green.
2. `supabase db diff` against production.
3. `supabase db push` to production.
4. Verify audit logs and RLS behavior.

Environment-specific notes
- Staging: use masked or synthetic data.
- Production: never run `supabase db reset`.
- Production storage: keep sensitive buckets private and use signed URLs.

