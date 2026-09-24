# Event run-sheet preview

## Goal
Make the event run-sheet preview behave like the catering preview: open as an in-app page in the current tab instead of launching a separate browser tab.

## Changes
- Replace the event run-sheet button’s new-tab action with navigation to the existing business event run-sheet page.
- Keep the current event run-sheet document, print, download, copy-link, and send/resend controls.
- Ensure the Back to event action returns to the correct confirmed event page rather than the general events list.
- Preserve the public share link behavior for guests.

## Verification
- Open a confirmed event’s Runsheet tab and select View run sheet.
- Confirm the preview opens in the same tab with the catering-style toolbar and A4 preview.
- Confirm Back to event returns to that event and print/download remain available.
