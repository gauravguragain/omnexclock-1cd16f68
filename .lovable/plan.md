# Events & Sales workspace (modelled on the InnoEMS draft)

## Goal
Sales & Marketing leaves the Business Admin menu and becomes its own **"Events & Sales"** tile on the home screen, alongside Business Admin, Register Business and Employee Portal. It opens a separate workspace with its own sidebar. Everything that already works (leads, pipeline, runsheet PDF, menu builder, ICS calendar, tasks) stays, and the missing features from the draft are added.

## Home screen
- New fourth tile, "Events & Sales". It goes through the normal sign-in and only lets in admins, super admins and sales managers.
- The "Sales & Marketing" item is removed from the Business Admin sidebar. Old links redirect to the new workspace.

## Workspace sidebar (matches the draft's structure)
```text
Dashboard
Leads        -> Event leads | Catering leads
Events       -> Events | Catering bookings | Calendar | Create event
Customers
Stakeholders
Catering     -> Menu books | Dishes | Drinks
Venue        -> Spaces
Reports
Settings
```

## Features
1. **Event vs catering leads.** Each lead is marked as an event or catering enquiry, and catering leads get a service location. Each lead card has three buttons: New / Confirmed / Declined, "Confirm as event" (or "Confirm as catering job") and "Decline". A declined lead picks a reason, and Cold stays available. Leads can be imported and exported as CSV.
2. **Events list.** Shows every confirmed event, split into Upcoming, Past and Cancelled, with a "Today" group. Columns: date, time, hall, customer, adults/kids, status and event order number (for example `329-1`). Opening an event shows the existing detail screen with its menu, runsheet and payments.
3. **Create event wizard.** Three steps: 01 Customer (pick existing or add new), 02 Event & schedule (adults and kids with a running total), and 03 Venue (hall capacity check and a clash warning when a hall is already booked for overlapping times). The catering version asks for a service location instead of a hall.
4. **Customers.** One customer list, built automatically from leads and events and also addable by hand. Shows source, phone, email, address and number of events, and opens to that customer's event history.
5. **Stakeholders.** Vendors, kitchen staff and coordinators, each with position, type, phone and email, and the option to archive. The runsheet's sales person and coordinator can be picked from this list, and their phone numbers fill in automatically.
6. **Menu books.** Packages are grouped into books such as Nepali Express or Indian Catering. Each package has a price per head, minimum guests, and courses; for each course you set how many dishes the guest picks and choose them from the shared dish list. Packages can be archived. The client menu page then picks a package, and its dishes appear by course, replacing the free-typed package.
7. **Dishes and Drinks.** Shared lists: dishes are marked veg or non-veg, drinks soft or hard, each shows "In N packages", and there are A–Z groups, search and archiving. The existing individual dishes move into this list.
8. **Venue spaces.** Halls with capacity, layouts (banquet, cocktail, theatre), photo, archive, and an "events this month" count. This list feeds the venue dropdowns and the capacity and clash checks. It replaces the text-only venue option.
9. **Calendar.** A month grid coloured by event type, with the existing list view and ICS link kept alongside it.
10. **Reports.** Events per month, revenue by event type and hall, lead conversion by source, catering vs events, and hall usage. Downloadable as PDF or Excel.

## Kept as is
The pipeline stages, runsheet PDF layout, ICS feed and public enquiry page stay as they are. As before, there are no sample data, no client emails and no iVvy link.

## Technical details
- Route `/b/:code/events/*` with a new `EventsLayout` (themed sidebar, same auth guard as AdminLayout). `admin/sales/*` redirects there. Index.tsx gets the new tile, which links to `/auth?next=events`, and the hub routes to it after sign-in.
- New tables, each with `business_id`, GRANTs and RLS via `can_access_crm`:
  - `crm_venue_spaces` (name, capacity, layouts[], photo_path, active)
  - `crm_customers` (name, phone, email, address, source)
  - `crm_stakeholders` (name, position, type, phone, email, active)
  - `crm_menu_books`
  - `crm_packages` (book_id, type food/beverage, price_per_head, min_guests, active)
  - `crm_package_courses` (package_id, name, picks)
  - `crm_package_course_items` (course_id, dish_id)
  - `crm_dishes` (name, diet veg/nonveg, active)
  - `crm_drinks` (name, kind soft/hard, active)
- New columns, all additive and nullable:
  - `crm_leads.lead_kind` (event/catering, default event), `service_location`, `customer_id`, `decline_reason`
  - `crm_bookings.venue_space_id`, `booking_kind`, `end_time`, `adults`, `kids`, `event_order_number`, `customer_id`, `service_location`
- Backfill: customers from existing leads, venue spaces from venue options, dishes from dish-category menu items. Event order numbers come from a per-business sequence.
- Clash check: overlapping bookings on the same hall and date (start/end), shown as a warning.
- Work split into phases in roadmap.md:
  1. Shell and move
  2. Venue, customers and stakeholders
  3. Menu books, dishes and drinks
  4. Lead types, events list and wizard
  5. Calendar month grid and reports
