# Handyskillz Skill Hub

Handyskillz is a dark, lime-accented Nigeria-focused skill marketplace inspired by the uploaded mobile mockup references.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/handyskillz-laundry/app/index.tsx` — source of truth for the mobile experience, screen routing, interactions, and local state.
- `artifacts/handyskillz-laundry/constants/colors.ts` — charcoal, lime, and muted surface tokens used by the app.
- `artifacts/handyskillz-laundry/assets/images/` — bundled app icon and visual assets.
- `artifacts/handyskillz-laundry/app/_layout.tsx` — Expo Router root stack and font/splash setup.

## Architecture decisions

- The first build is frontend-first and local-state driven so the complete mobile flow is usable without requiring a backend or third-party credentials.
- The custom bottom navigation mirrors the supplied reference instead of using the platform tab bar.
- The role matrix is data-driven so the same shell can switch between Customer, Artisan, Professional, Business, and Admin workspaces.
- Escrow, quote, milestone, and disbursement cards live inside the chat workspace so trust-critical actions stay in context.

## Product

The app lets users switch role-based workspaces, describe a task for AI matching, browse nearby opportunities and providers, manage jobs and bids, join guilds or professional networks, message a counterpart, and keep Paystack escrow actions inside the protected chat flow.

## User preferences

- Use the uploaded mockup as visual inspiration only: near-black surfaces, lime-green active actions, rounded cards, compact Inter typography, and mobile-first spacing. Product copy and navigation come from the Handyskillz architecture prompt.

## Gotchas

- Expo’s optional React Native DevTools installer may log a missing `libglib-2.0.so.0`; Metro still starts and the app preview remains available.
- Use the managed Expo workflow (`artifacts/handyskillz-laundry: expo`) rather than starting Expo directly.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
