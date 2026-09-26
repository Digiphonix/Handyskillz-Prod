# Handyskillz Skill Hub

A standalone Expo Router app for finding, hiring, and managing skilled local experts.

## Run it

1. Install Node.js 20 or later and run `npm install`.
2. Copy `.env.example` to `.env`. Set Clerk's publishable key, `EXPO_PUBLIC_API_URL`, and your EAS project ID for native push notifications.
3. Apply every SQL migration in `supabase/migrations` to your Supabase project, in date order.
4. Configure `artifacts/api-server/.env` with `PORT`, `CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY`, `SUPABASE_URL`, and a server-only `SUPABASE_SERVICE_ROLE_KEY`. Add `PAYSTACK_SECRET_KEY` to enable job funding and provider transfers.
5. Run the API with `npm --prefix artifacts/api-server run dev`, then run `npm start` and open the app with a development build or press `w` for web.

Useful commands: `npm run android`, `npm run ios`, `npm run web`, `npm run check`, and `npm run api:build`.

## External service setup

- Configure the Paystack webhook URL as `https://<your-api-host>/api/payments/paystack/webhook` so successful charges and provider transfers update job payment status. Set `PAYSTACK_CALLBACK_URL` in the API environment if checkout should return to a specific app or hosted page.
- Remote push notifications require an EAS project ID in `EXPO_PUBLIC_EAS_PROJECT_ID` and valid APNs/FCM credentials in EAS. Build and install a native development or production app; push delivery does not work in Expo Go on current Expo SDKs. Web uses the in-app notification inbox.
- `EXPO_ACCESS_TOKEN` in the API environment is optional and can authenticate server requests to Expo's push service.
- Enable Organizations in the Clerk dashboard to allow business owners to create teams and invite members. `CLERK_ORGANIZATION_INVITATION_REDIRECT_URL` is optional; set it to your app's invitation acceptance page if you need a custom redirect.
- Payout account setup and job transfers use Paystack. Customer-approved releases are sent from the platform Paystack balance to the provider's saved bank recipient.

Never put Clerk secret keys, Supabase service-role keys, Paystack secret keys, or the Expo access token in the client `.env` file.
