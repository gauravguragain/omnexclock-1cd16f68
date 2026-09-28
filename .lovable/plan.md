# Lead Flow Redesign — Smooth Navigation + Refined Booking Step

## Goal

The lead detail experience (full-page editor and popup dialog share `LeadDetailView` in `src/features/sales/LeadDetailDialog.tsx`) currently presents seven flat, horizontally-scrolling tabs — Timeline, Inspection, Confirmation, Menu tasting, Menu, Stakeholders, Runsheet — with no sense of the process. The user circled that tab row and asked for a smoother, easier-to-navigate flow for the whole journey, while keeping the approved booking design. Backend links, data and processes stay untouched.

## 1. Navigation redesign (new work)

Replace the flat tab row with a **journey stepper** that mirrors how a lead actually progresses:

```
+---------------------------------------------------------------------------+
| (1) Timeline   (2) Inspection   (3) Confirmation   (4) Menu tasting ...   |
|      done           done              ● current      upcoming             |
+---------------------------------------------------------------------------+
|                                   tab content                              |
|                                                            [Next: Menu] → |
+---------------------------------------------------------------------------+
```

- **Stepper header**: numbered gold-accented steps in process order, with completion checkmarks derived from existing data only — inspection recorded, booking exists (Confirmation), menu selection or tasting set, run sheet issued. Purely visual; no new fields.
- Stage groups stay readable on mobile: compact, wrap-friendly stepper with larger touch targets (replaces the overflow-scroll pill row flagged in the screenshot). Touch targets ≥ 40px height.
- **"Next step" affordance**: a Back/Next control at the bottom of each tab advances to the next stage (Timeline → Inspection → Confirmation → Menu tasting → Menu → Stakeholders → Runsheet), so staff can walk the process end to end.
- The hero "Next step: …" banner and quick actions (Call, Email, Log call, Remind, status dropdown) stay as they are.
- Implementation stays inside the existing shadcn `Tabs` — custom stepper replaces `TabsList`; tab content components are unchanged. Same `initialTab` deep-linking via `?tab=`.

## 2. Confirmation tab — approved Refined Dashboard Form layout

```
+--------------------------------------------------------------+
|  Event confirmation            [ Order # badge / on save ]   |
|                                                              |
|  Left (7/12)                     Right card (5/12)           |
|  VENUE SELECTION                 FINANCIAL SUMMARY           |
|   multi-select chips (gold       Total          $11,250.00   |
|   active, + add another kept)    Deposit        [ 1,000 ]    |
|                                              Deposit/Bal due |
|  EVENT DATE | DURATION           [ Prepare/Update booking ]  |
|  START TIME | END TIME              + PDF outline button      |
|  ADULTS | CHILDREN | TOTAL       "Recording the deposit      |
|                                   moves this lead to Deposit |
|                                   received."                 |
+--------------------------------------------------------------+
```

- Left: venue chips, date/duration/start/end (existing `DateField`, `TimeDropdownPicker`, auto-sync kept), adults + children with computed total (defaults from `booking.adults/kids` or `lead.estimated_guest_count`; `guests` total stays the saved value so save logic is unchanged; adults/kids added to the upsert like the catering wizard already does).
- Right: financial summary card (total, deposit input in gold, deposit due, balance due), full-width gold primary button with the same submit handler, PDF outline button beside it, hint line underneath.
- Order-number badge shows the booking's `event_order_number` when present, else "Assigned on save".
- Collapse to one column below `lg`; renders correctly in the popup dialog too.
- Task list below the form stays.

## Non-changes (explicit)

- No backend changes: same tables, columns, RPCs, statuses, triggers, PDF builders, run sheet flow.
- No changes to catering pages or the catering wizard.
- Inspection, Menu tasting, Menu, Stakeholders, Runsheet tab content unchanged — only the navigation chrome around them changes.
- No hardcoded colors; semantic tokens from `index.css` only.

## Verification

- Typecheck (`tsgo --noEmit`) and build OK.
- Playwright: desktop + narrow widths — stepper renders, every tab opens, Confirmation saves an existing booking, Next/Back advances tabs; popup dialog renders the same.
