Owner Operations reuses the Sales & Events dashboard with an explicit business ID, so master accounts without a selected business context see the same live data without duplicating dashboard calculations.
Run-sheet links use separate client and internal bearer tokens; the public function strips team notes for client links, preventing client recipients from reading internal instructions.
Lead detail uses one shared seven-stage concierge layout in the full page and dialog, preserving each stage's existing form and save handler to avoid workflow divergence.- Menu layout (print, email, online /m/:token) is rendered only by supabase/functions/_shared/menuHtml.ts (buildSectionsFromRows + renderMenuHtml) so all three stay identical.
Event menu estimates synchronize into event booking totals in the database, while received amounts always come from crm_payments; this keeps Sales and Operations aligned without overwriting catering or imported bookings lacking a menu.
Event confirmation stores the two child age counts separately while keeping crm_bookings.kids as their sum; other guest-count consumers continue to work unchanged.
- Menu selections save only through the save_menu_selection RPC (one transaction replaces the selection and all its items), so a save can never half-apply or revert.
- Venue-clash UI and imports read crm_booking_venue_clashes live; booking notes and lead tags never store clash state, preventing stale import warnings.

- All outgoing emails are wrapped by supabase/functions/_shared/emailLayout.ts (renderBrandedEmail) so every message shares one branded frame.
- Shared live data screens use useLiveSync with backend change broadcasts plus focus, reconnect, and visible-page polling fallbacks so mobile sleep cannot leave records stale.
- Shareable calendar (/calendar/:businessId/:token) reuses the Google feed's crm_settings.calendar_token via the crm-calendar-public function and MonthCalendar's paidBookingIds prop, so public and in-app calendars show identical events without exposing contact or payment data.
