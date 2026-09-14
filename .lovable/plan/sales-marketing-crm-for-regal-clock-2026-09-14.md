# Sales & Marketing CRM for Regal Clock

## Goal
Add a complete, business-scoped Sales & Marketing workspace inside the existing Regal Clock admin area. It will share the current login, Pro Regal Pavilion visual system, business switching, notifications, audit trail, and reporting conventions.

Calendly will be optional and disabled by default. Each business admin can connect or disconnect their own Calendly account from CRM Settings. The first release sends email notifications and reminders; SMS controls will be clearly unavailable until an SMS provider is added.

## User experience

### Navigation and access
- Add one **Sales & Marketing** item to the existing admin navigation.
- Open the module on a focused sales dashboard with internal tabs for **Dashboard, Leads, Pipeline, Inspections, Tasks, and Settings**.
- Admins and super admins receive full access by default.
- Add a dedicated **Sales & Marketing Manager** role. Managers can work with assigned leads and the shared pipeline, while business settings and analytics administration remain controlled.
- Reuse the existing invitation and business-access flow so future sales staff can be invited without a separate login.

### Dashboard
- Show today's follow-ups, calls, inspections, quotes awaiting response, and upcoming confirmed events.
- Include pipeline value, conversion rate, win/loss rate, average lead-to-booking time, source/staff performance, lost reasons, and monthly/quarterly trends.
- Add a compact **Recent client feedback** area populated only from notes explicitly marked shareable.

### Leads and pipeline
- Provide a searchable/filterable lead list and CSV export.
- Provide drag-and-drop Kanban stages: New, Contacted, Inspection Booked, Inspected, Menu Selected, Quoted, Confirmed, Lost.
- Flag duplicate email/phone matches before save.
- Highlight stale leads after a configurable number of inactive days, defaulting to five.
- Show event-date urgency without obscuring status.
- Support fixed-manager and round-robin assignment settings.

### Lead detail
- Use a photography-forward venue banner selected from the configured venue space.
- Keep all work in tabs: **Overview, Timeline, Interactions, Inspections, Menu, Confirmation, Tasks**.
- Timeline combines calls, messages, emails, inspections, stage changes, menu changes, document events, and confirmations.
- Interaction logging supports duration, notes, follow-up requirement/date, staff attribution, and shareable client feedback.
- After a note is saved, offer an AI-generated summary of questions, decisions, and follow-up tasks. Nothing is created until staff accept or edit it.

### Inspections and calendar
- Add responsive month/list calendar views, status colours, filters, and quick-create/edit flows.
- Detect overlapping inspections for the same venue space and warn before saving.
- Suggest open times from CRM inspection bookings and configurable operating windows.
- Email confirmations, calendar invitations, 24-hour reminders, and 2-hour reminders to clients and assigned staff.

### Menu builder
- Configure packages under Nepali Express, Nepali Catering Packages, and Indian Catering Packages.
- Configure add-ons, beverage packages, dietary tags, and live stations such as Pani Puri, Momo, and Sekuwa.
- Calculate package/add-on totals live from confirmed or estimated guest count.
- Make allergies and dietary requirements prominent throughout menu and booking summaries.
- Suggest popular combinations from prior confirmed bookings of the same event type.

### Booking confirmation
- Convert a lead into one confirmed booking without re-entering details.
- Generate a branded PDF containing event, venue, menu, pricing, deposit, balance, and terms.
- Email a secure, expiring client confirmation link and PDF.
- Record acceptance, automatically set the lead to Confirmed, and create/update the existing roster event for staffing planning.
- Allow individual and list-level booking exports while preventing duplicate conversions.

### Public enquiry form
- Add a mobile-friendly public enquiry page tied to a business code, suitable for embedding or linking from a website.
- Auto-tag submissions as Website Form, run duplicate checks server-side, assign by configured rules, and notify the assigned manager.
- Apply validation and abuse controls; expose no private CRM data publicly.

### Settings
- Editable lists for lead sources, event types, lost reasons, stages, venues, menu catalogue, live stations, beverage packages, tags, and templates.
- Seed the requested Pro Regal Pavilion terms while keeping every option editable.
- Configure stale-day threshold, assignment mode, inspection hours, reminder timing, email templates, confirmation terms, venue images, and Calendly mappings.
- Provide an audit-visible Calendly connection panel with **Connect**, **Pause sync**, and **Disconnect** states.

## Calendly integration
- Use per-business-admin OAuth rather than a shared workspace credential.
- Keep the integration off until an admin explicitly connects it in CRM Settings.
- After connection, subscribe to Calendly invitee-created and invitee-canceled events for the selected inspection event types.
- Create or match leads by normalized email/phone, create inspections without duplicate entry, and tag imported records **Source: Calendly**.
- Treat a Calendly reschedule as linked cancellation plus replacement, preserving history while updating the active inspection.
- Let admins map Calendly event types to CRM event types and venue spaces.
- Show connection health and last sync. Failed or ambiguous matches become review tasks instead of silently overwriting data.
- Store tokens only in the secure backend; verify webhook signatures and make processing idempotent.
- Before activation, a Calendly OAuth application must be registered and its client credentials stored securely. The CRM remains fully usable without it.

## Data and security
- Add business-scoped tables for CRM roles/access, settings/options, leads, tags, interactions, inspections, menus, selections, bookings, tasks, templates, timeline events, confirmation tokens, Calendly connections/mappings, webhook receipts, and reminder jobs.
- Every record includes timestamps and actor attribution where applicable. Timeline/audit records are append-only.
- Enforce tenant isolation in the database. Admins/super admins control the business CRM; Sales & Marketing Managers can edit assigned records and read the shared pipeline; other roles have no access unless explicitly granted later.
- Keep roles in the existing separate role table and add the Sales & Marketing Manager role to invitations and role checks.
- Use secure server functions for public enquiries, confirmation links, AI extraction, email delivery, reminder processing, and Calendly synchronization.
- Add indexes and uniqueness rules for pipeline queries, normalized duplicate detection, reminder queues, external event IDs, and per-business configuration.

## Technical implementation
- Add the schema through additive database migrations with grants, row-level rules, helper functions, seeds, triggers, and regenerated client types.
- Add focused CRM pages/components under the existing business admin routes and reuse the current buttons, forms, dialogs, charts, notifications, action lock, and business theme tokens.
- Use semantic theme colours rather than embedding the supplied hex values in page code. Add a refined display face only for CRM page and record titles; keep the established sans-serif for working UI.
- Use native pointer and keyboard drag support for Kanban, with accessible move controls as a non-drag fallback.
- Add dedicated backend functions for public lead capture, AI note extraction, confirmation, CRM email/reminders, Calendly OAuth/webhooks, and scheduled automation.
- Reuse existing PDF/export naming and audit utilities. Escape client-authored text in emails and PDFs.
- Add selective tests for duplicate matching, totals, role boundaries, stage automation, conflicts, reminders, confirmation, and Calendly webhook idempotency.

## Delivery order
1. Schema, seeds, roles, permissions, and audit/timeline foundation.
2. Navigation, CRM shell, dashboard, lead list, Kanban, detail tabs, and tasks.
3. Inspection calendar, conflicts, reminders, menu builder, and analytics.
4. PDF confirmation, public enquiry and confirmation pages, email automation, and roster-event handoff.
5. Optional Calendly connect/settings flow and webhook synchronization.
6. Desktop, tablet, and mobile verification; role/security checks; CSV/PDF/email validation.

## Acceptance checks
- Every requested CRM record can be created, edited, searched, and audited within the active business only.
- Admin and Sales & Marketing Manager permissions behave as specified; unrelated roles cannot access the module.
- Lead list, Kanban, detail tabs, calendar, dashboard, and settings are usable on desktop and mobile.
- Duplicate, stale, conflict, task, pricing, conversion, and reminder rules work reliably.
- Confirmation PDF/email/link and roster-event creation work without duplicate records.
- Calendly is visibly optional, only syncs after connection, and handles create/cancel/reschedule safely.
- Existing roster, timesheet, payroll, employee portal, invoicing, and authentication features remain unchanged.
