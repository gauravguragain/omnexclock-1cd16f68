# Redesigned Event Booking — Confirmation Step (Refined Dashboard Form)

## What changes

The event booking step (the "Confirmation" tab inside a lead) is redesigned from a flat 2-column field grid into the chosen **Refined dashboard form** layout: logistics on the left, a dark financial summary card on the right with a gold action button.

Scope confirmed with the user:
- Booking step only — catering and the rest of the lead detail page stay as they are.
- One structured page — no step-by-step wizard.
- All existing fields and save behavior preserved (same form submit, same upsert on `crm_bookings`, same "Prepare booking" / "Update booking" semantics, same PDF button).

## Layout (matching the selected prototype)

```
+--------------------------------------------------------------+
|  Event Confirmation            [ Order # badge / "on save" ] |
|  (serif italic heading)                                      |
|                                                              |
|  Left column (7/12)              Right card (5/12)           |
|  -------------------------       -------------------------   |
|  VENUE SELECTION                 FINANCIAL SUMMARY           |
|   chips (multi-select, gold      Total          $11,250.00   |
|   active state, "+ add another"  Deposit        [ $1,000 ]   |
|   free-text row kept)            Deposit due    Balance due  |
|                                              ---------------- |
|  EVENT DATE | DURATION (HRS)     [ Prepare booking ] (gold,  |
|  START TIME | END TIME            full width)                |
|                                                              |
|  ADULTS | CHILDREN | TOTAL       "Recording the deposit      |
|                                   moves this lead to         |
|                                   Deposit received."         |
+--------------------------------------------------------------+
```

## Details

File: `src/features/sales/LeadDetailDialog.tsx`, `TabsContent value="booking"` (line 233). Rewrite only that block into:

1. **Header row** — serif italic "Event confirmation" heading; on the right a small badge showing the booking's event order number when a booking exists, otherwise "Assigned on save".
2. **Left — logistics**:
   - Venue multi-select chips first (uses existing `MultiOptionSelect` data; gold fill for selected), including the free-text "add another" entry.
   - Grid: Event date · Duration (hours) · Start time · End time (existing components: `DateField`, `TimeDropdownPicker`; duration/end-time auto-sync kept).
   - Guests: Adults and Children inputs with a computed Total (uses `booking.adults/kids` when present, else `lead.estimated_guest_count`; `guests` field stays the total so existing save logic is unchanged — adults/kids added to the upsert, matching the catering wizard).
3. **Right — financial summary card** (muted panel, `bg-muted/40`-style tokens, NOT hardcoded colors):
   - Total amount (large serif numerals), deposit input in gold, deposit due / balance due dates side by side.
   - Full-width gold primary button: "Prepare booking" (or "Update booking" when it exists) with the same submit handler.
   - Keep the PDF download as an outline button beside it.
   - Hint line under the button: recording the deposit in Payments moves the lead to Deposit received (accurate to current behavior — the button itself does not change lead status).
4. Task list below the form stays.

## Non-changes (explicit)

- No new tables, no migration, no status changes, no catering changes.
- Tab order and the rest of LeadDetailView untouched.
- Works in both the full-page lead editor and the popup dialog (layout collapses to one column under `lg`).

## Verification

- Typecheck (`tsgo --noEmit`) and build OK.
- Playwright: open the lead detail page, screenshot the new Confirmation tab at desktop and narrow widths; save still works (existing "Update booking" flow).
