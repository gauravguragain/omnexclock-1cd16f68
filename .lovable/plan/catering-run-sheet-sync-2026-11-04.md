# Catering run-sheet sync

- Make catering run sheets use the latest saved booking guest counts, date, time, service and location, while retaining independently edited team notes and signatures.
- Keep menu, customer and team details current in open run-sheet previews, emailed links, QR views and roster copies.
- Save catering menus atomically and refresh the booking summary after saving.
- Check guest-count changes, including zero kids, and verify a saved booking reads back correctly.

## Technical details
- Synchronize duplicated catering guest fields on booking updates without changing event guest overrides.
- Share guest-count resolution between document and email displays; include current adults in the public response.
- Reuse existing live-refresh mechanisms and menu-save transaction.