# Branded emails for every message the app sends

## Look and feel (taken from regalpavilion.com.au)
- Colours: deep charcoal `#17191E` header/footer band, warm gold `#AC845D` accents and buttons, soft ivory `#FCFCFC` body card, muted text `#2D2C2C`.
- Type: Marcellus / Cormorant Garamond for headings (with Georgia fallback, since many mail apps block web fonts), Barlow / Helvetica for body.
- Tone: calm, fine-dining hospitality — "Warm regards, The Pro Regal Pavilion team".

## One shared email frame
Every email gets the same wrapper:
```text
[ charcoal band: business logo (or name in gold serif) ]
[ thin gold rule ]
[ ivory card: serif title, body, gold pill button ]
[ charcoal footer: business name, address/phone/email, website link,
  "Sent by Pro Regal Management" small print ]
```
- Uses the business's own logo, name and contact details, so each venue's emails carry its own brand.
- Built with email-safe tables and inline styles; works on phones, Outlook and Gmail, and in dark mode.
- Hidden preview text line so the inbox snippet reads nicely.

## Emails covered
- Event confirmation / run sheet (client and internal team copies)
- Deposit confirmation
- Menu share emails (menu layout inside stays exactly as it is now)
- Signed run sheet notification
- Roster published / roster PDF, report PDF, timesheet CSV export
- Employee induction welcome
- Admin invitation, password reset code
- Service maintenance reminders, food safety alerts

Wording of each email stays the same unless it currently reads awkwardly; only presentation changes.

## Checking
Render sample versions of the main emails (event confirmation, deposit, menu, invitation) and show you screenshots before you publish.

## Technical details
- New `supabase/functions/_shared/emailLayout.ts`: `renderBrandedEmail({ business, title, preheader, bodyHtml, cta? })` plus small helpers (`button`, `detailsTable`, `divider`).
- Business branding fetched once per send (name, logo_url from public business-logos bucket, phone, email, address, website).
- Refactor each branch of `send-email/index.ts` and the Resend calls in `invite-admin`, `reset-password-otp`, `service-reminders`, `crm-runsheet-public`, `fsl-alerts` to use it; `menuHtml.ts` output is placed inside the frame unchanged.
- Redeploy the affected functions. Record the "all emails go through emailLayout.ts" rule in AGENTS.md.
