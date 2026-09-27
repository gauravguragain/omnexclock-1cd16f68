# Import from iVvy (reusable)

Your sample is an iVvy **Bookings export** (488 bookings: 424 Tentative, 63 Confirmed, 1 Cancelled; 2024–2026; about 118 are catering orders). Since you already have this file, the quickest reliable route is an **Import from iVvy** screen that reads this export. A live iVvy API connection can be added later on top of the same importer once you have API keys.

## What you'll get
- A new **Import from iVvy** button in Sales & Marketing that opens an upload screen.
- Drop in the iVvy bookings CSV and see a preview before anything is saved: how many new leads, confirmed events, catering orders, updates and skipped rows.
- Click **Import** to save. You can run it again with a newer export; bookings that were already imported (matched by the iVvy code, e.g. `2GPTCBCQF1`) are updated, not duplicated.

## How each iVvy booking is brought in
- **Customer**: Main Contact, Email and Company. Matched to existing customers by email automatically.
- **Lead**: one per booking. Name, event name, event date, guest count, value, sales person, and the iVvy code as a tag.
  - Names containing "Catering" become **catering leads**, all others **event leads**.
  - Tentative becomes **New**, Confirmed becomes **Deposit received** (so it appears under Confirmed and in Events), Cancelled becomes **Cold** with the cancel reason.
- **Event / catering booking**: created for Confirmed bookings with the date, guests, total amount, amount paid and coordinator in the notes. Start time defaults to 6:00 PM (4 hours) because the export doesn't include times; you can edit it afterwards.
- Past bookings are imported too, so your history and customer list are complete.

## Not in this export
Notes/interactions and tasks aren't included in the iVvy bookings export. If iVvy lets you export notes or tasks as CSV, send a sample and I'll add them to the same importer.

## Technical details
- Migration: add nullable `external_ref text` to `crm_leads` and `crm_bookings`, with unique indexes on (business_id, external_ref) where the value isn't null, used for idempotent upserts.
- New `src/features/sales/IvvyImportDialog.tsx`: client-side CSV parsing (quoted fields, BOM, "Saturday, 26 September 2026" dates, "6,075.00" amounts, dd/mm/yyyy modified dates), preview summary, batched upserts under RLS for the current business.
- Leads are upserted first (the customer sync trigger links customers), then bookings for Confirmed rows with lead_id, booking_kind event or catering, venue_space "TBC".
- Button added to the Sales & Marketing header for users with CRM access.
