# Rebuild imported venue-clash detection

## Outcome
Venue clashes will be calculated from current active bookings instead of old warning text. Re-importing, editing, moving, or cancelling an event will immediately remove obsolete warnings from Pipeline and Calendar.

## Changes
- Add a live booking-clash view that compares active venue events by business, date, normalized room names, and overlapping time windows.
- Keep manual double-bookings blocked, but allow imported bookings to save and appear in the live clash view.
- Remove historical clash warning lines from booking notes and remove stale `venue clash` lead tags.
- Update both iVvy import paths to count genuine clashes from the live view rather than searching notes or writing lead tags.
- Update Pipeline and Leads badges to use live booking clashes.
- Exclude cancelled bookings from the Sales calendar and subscribed calendar feed so resolved duplicates disappear.

## Technical details
- Catering stays excluded.
- A booking never matches itself; matching import references are also excluded.
- Back-to-back events remain allowed.
- Overnight windows are compared correctly.
- Existing event notes remain intact except obsolete system-generated clash warning lines.
- Verify re-import, self-match, genuine overlap, different-room, back-to-back, cancelled, and overnight scenarios in Test.
