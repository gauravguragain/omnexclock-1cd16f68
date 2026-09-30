# Reliable live syncing across devices

## Goal
Keep every open device current after records are saved, while retaining manual refresh as a reliable fallback.

## Changes
- Strengthen the shared live-sync listener so it refreshes after remote changes, reconnects cleanly after sleep or network loss, and immediately catches up when the app regains focus.
- Add lightweight visible-page polling as a safety net for mobile browsers that suspend live connections in the background.
- Expand Sales & Events subscriptions to every related record used by those screens, including payments, menu selections, timeline items, venue clashes, and linked customer details.
- Ensure the relevant backend tables are enabled for live change delivery and include enough previous-row data for update/delete filtering.
- Keep refresh buttons fast: they will request fresh records immediately without relying on cached screen state.

## Validation
- Verify the app builds cleanly.
- Open two authenticated browser sessions, change a record in one, and confirm the other updates without a manual reload.
- Confirm returning from a backgrounded tab catches up immediately.

## Technical details
- Reuse the existing shared `useLiveSync` hook rather than creating page-specific connection logic.
- Use one debounced refresh path per screen to prevent bursts of database updates from causing repeated loads.
- Preserve existing business-level access rules; live updates only trigger reloads of data each user is already allowed to read.
