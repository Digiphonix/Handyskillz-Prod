# Assigned-job location tracking

The map icon in the workspace header opens tracking in every mode. Matched and
in-progress job details also have a tracking button. Lists are based on actual job
ownership/assignment, regardless of the user's current workspace. The authorized
platform administrator can see all active assigned jobs.

## Setup

1. Apply `supabase/migrations/20260928_job_tracking.sql` to the application's Supabase database.
2. Restart/rebuild the API server and Expo app. Native development/production builds
   must be rebuilt to include `expo-location`, `react-native-webview`, and the
   location permission text in `app.json`.
3. Web location permission needs HTTPS or localhost. Test sharing on a GPS-enabled
   phone, or use browser developer tools to simulate location during development.

## Behavior

- Providers explicitly start sharing for an assigned active job and grant foreground
  location permission. Customers/admins do not need location permission to view it.
- A new GPS fix is requested approximately every 10 seconds. Viewers poll every
  10 seconds. The map shows age, GPS accuracy, and the provider's self-reported
  “On the way” / “Arrived” status. Updates older than 30 seconds are labeled last known.
- Leaving tracking, hiding the browser tab, or backgrounding the app stops sharing.
  There is no background tracking. If the device disconnects, its last position is
  hidden by the server and client after 90 seconds.
- Only the latest position is stored, not a movement history. Explicit stop clears
  coordinates. Closing or reassigning a job deletes its tracking row in a database
  trigger. Expired disconnected rows are inaccessible through the API but remain
  stored until the next session, explicit stop, or job closure.
- The API authenticates reads, limits them to participants or the platform admin,
  and prevents response caching. Mutations run through a service-role-only database
  function that checks assignment and job state under a row lock. Session IDs block
  stale updates after stopping or starting a new session. Direct client database
  access to tracking is revoked and RLS enabled.

## Maps and limits

The map uses Leaflet 1.9.4 in an isolated web document and OpenStreetMap tiles with
attribution. Internet access to `unpkg.com` and `tile.openstreetmap.org` is needed.
Public OSM tiles are best-effort; configure an appropriate tile provider before
high-volume production use. Map requests expose the viewed map area to the tile
provider; the map document does not receive account data or authentication tokens.

This feature does not invent ETAs or road routes from GPS points. The job's address
is shown as text, and an explicit link opens the provider's coordinates in Maps.

References: [Expo location](https://docs.expo.dev/versions/latest/sdk/location/),
[WebView](https://github.com/react-native-webview/react-native-webview/blob/master/docs/Guide.md),
[Leaflet](https://leafletjs.com/reference),
[OSM tile usage policy](https://operations.osmfoundation.org/policies/tiles/).

## Verification

Run `npm run check` and `node --test scripts/tracking.test.cjs`.
With two signed-in accounts and an assigned job, start sharing on the provider's
device, verify the customer sees movement, change travel status, and stop sharing.
Also verify denied location permission, network loss, tab/app backgrounding,
job completion, reassignment, and an unrelated account attempting the tracking URL.
