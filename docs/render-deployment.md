# Deploy the API to Render Free

The repository includes `render.yaml`. It deploys only the Express API; the Expo
app is built separately with EAS and continues to use Supabase for storage/data.

## Deploy from GitHub

1. Push this repository to GitHub (a private repository is supported).
2. In Render, select **New > Blueprint**, connect GitHub, and select the repository.
3. Render reads `render.yaml`. Confirm the **Free** service plan.
4. Enter the required environment values from your API configuration:
   `CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `SUPABASE_URL`, and
   `SUPABASE_SERVICE_ROLE_KEY`. Enter them in Render, never in GitHub or the mobile app.
5. Apply the SQL migrations in `supabase/migrations` to Supabase in filename order
   if they are not already applied. Deploying the API does not apply migrations.
6. After deployment, open `https://YOUR-SERVICE.onrender.com/api/healthz`.
   It should return `{"status":"ok"}`. This tests HTTP availability, not database,
   authentication, or payment configuration; test signed-in flows separately.

If creating a Web Service manually instead of using a Blueprint:

| Setting | Value |
| --- | --- |
| Language | Node |
| Root Directory | Leave empty (repository root) |
| Build Command | `npm ci --prefix artifacts/api-server --include=dev --install-links && npm run api:build` |
| Start Command | `npm --prefix artifacts/api-server run start` |
| Health Check Path | `/api/healthz` |
| Instance Type | Free |
| Environment | `NODE_ENV=production`, `NODE_VERSION=22`, plus the required keys above |

Render provides `PORT` (normally 10000). Do not copy your local `PORT=3000` into
Render. The API binds to `0.0.0.0` and uses Render's port; locally it defaults to 3000.
The `--install-links` flag is intentional: it installs the local API schema package
with its dependencies without requiring an Expo/mobile dependency installation.

## Feature-specific environment settings

- `PAYSTACK_SECRET_KEY`: required for payment and payout features.
- `PAYSTACK_CALLBACK_URL`: your hosted checkout return URL, if used.
- `CORS_ORIGIN`: comma-separated allowed web app origins, without trailing slashes.
  Native iOS/Android requests do not require a browser CORS origin. With no value,
  the production API does not permit cross-origin browser access.
- `EXPO_ACCESS_TOKEN`: if push security is enabled for your Expo project.
- `CLERK_ORGANIZATION_INVITATION_REDIRECT_URL`: if your team invitation flow uses it.

Configure Paystack's webhook URL as
`https://YOUR-SERVICE.onrender.com/api/payments/paystack/webhook`.
Use Clerk keys from the same instance on the API and mobile app. Keep development
and live payment credentials separate.

## Connect the Expo app

Set `EXPO_PUBLIC_API_URL=https://YOUR-SERVICE.onrender.com` in the local client
environment and in the matching EAS preview/production environment. Do not append
`/api`: the app adds that path. Restart Expo locally and rebuild installed apps so
they contain the new URL. Do not use localhost for an installed phone app.

## Free-tier expectations

Render Free web services sleep after 15 minutes without inbound traffic. The next
request starts the service again and can take about a minute. This can affect sign-in
flows, payment callbacks, and live tracking; retry after the service wakes. Free
instances have ephemeral filesystems, so keep persistent images/data in Supabase.
Free hosting is suitable for testing; assess these limitations before relying on it
for time-sensitive production features.

References: [Render web services](https://render.com/docs/web-services),
[Free services](https://render.com/docs/free),
[Blueprint configuration](https://render.com/docs/blueprint-spec).
