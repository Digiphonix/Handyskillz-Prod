# Handyskillz production setup

The rebuild keeps the existing Expo/React Native UI and the existing Node/Express API. The mobile app is configured to use npm + Expo and the generated API client can now receive a production API base URL and Clerk bearer token automatically.

## Mobile environment

Copy `.env.example` to `.env` and set:

- `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `EXPO_PUBLIC_API_URL`
- `EXPO_PUBLIC_EAS_PROJECT_ID` for native push notifications

Only `EXPO_PUBLIC_*` variables are bundled into the Expo app. Never put server secrets in them.

## API environment

Copy `artifacts/api-server/.env.example` to `artifacts/api-server/.env` and set:

- Clerk server credentials
- Supabase service-role credentials
- Paystack secret
- CORS origin

The API server keeps secret credentials server-side.

## Production behavior implemented

- All five workspace modes are supported: Customer, Artisan, Professional, Business and Admin.
- Every bottom-navigation tab has a real destination.
- Profile, addresses, provider discovery, saved providers, jobs, proposals, job payment, payout accounts, notifications, chat, support, availability, guilds, business team access, sessions and admin review actions use live API or Clerk integrations.
- Theme and selected workspace persist locally.
- API client base URL and Clerk bearer-token injection are configured at runtime.
- Search/filter controls query live provider and job data.
- Paystack job funding and transfers, uploads, profile persistence, team invitations and authentication remain backend-driven integrations.
- `.env` in this distribution contains placeholders only; no server secret is shipped.

## Validation

Run:

```bash
npm install
npm --prefix artifacts/api-server install
npm run typecheck
npm run api:typecheck
npm run api:build
npm start
```

For Expo production builds:

```bash
npx expo-doctor
npx expo start
npx eas build --platform android --profile production
npx eas build --platform ios --profile production
```

Before launch, apply the Supabase migrations and configure Clerk, Supabase, Paystack, Expo push credentials and the API URL described in `README.md`. Dispute handling is not currently exposed in the app.
