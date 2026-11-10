# TokyoYoungin site

Runs on Bun with no npm dependencies. Postgres holds the data (Bun's built-in client), a volume holds uploaded videos and pictures, Stripe is called over fetch.

Variables: `DATABASE_URL`, `DATA_DIR` (volume path for uploads), `OWNER_EMAIL` / `OWNER_PASSWORD` and `ADMIN_EMAIL` / `ADMIN_PASSWORD` (starter owner logins), `STRIPE_SECRET_KEY`, `PUBLIC_URL`.

Start: `bun server.js`
