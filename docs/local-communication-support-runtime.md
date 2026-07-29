# Local Communication Support Runtime

This guide is the shortest path to verify the `communicationSupport` settings
loop against a real local `cboard-api`.

## API prerequisites

1. Copy `.env.development.example` to `.env.development` in `cboard-api`.
2. Start a local MongoDB on `mongodb://127.0.0.1:27017/cboard-api`.
3. Start the API:

   - `npm run start`

4. Seed a local email/password user:

   - `npm run seed:local-runtime-user`

5. Verify backend settings persistence:

   - `npm run verify:communication-support-settings`

The API now supports local email/password runtime without configuring OAuth
providers. OAuth routes are skipped when required environment variables are
missing.

## Frontend prerequisites

1. Copy `.env.development.example` to `.env.development` in `cboard`.
2. Start the frontend:

   - `npm start`

3. Run the local Playwright validation:

   - `npx playwright test --config=playwright.local.config.ts`

## What the local runtime test verifies

- Email/password login against local `cboard-api`
- `Communication Support` settings page loads in logged-in mode
- JSON import updates local state
- `Upload local to cloud` persists to remote settings
- Page refresh restores persisted counts
- `Board` page reads the same history from the shared communication support data
