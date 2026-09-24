# Streamline event lead confirmation

## Outcome
- New and in-progress event leads stay out of the Events list.
- An event appears in Events only once its linked lead reaches **Deposit received** or a later stage.
- Reaching **Deposit received** automatically moves that lead into the **Confirmed** tab under Event leads.

## Implementation
- Update every lead-stage change path, including pipeline drag-and-drop and the lead detail stage selector, so Deposit received and later stages set the lead outcome to confirmed.
- If a confirmed lead is deliberately moved back before Deposit received, return it to the Leads tab rather than leaving it marked confirmed.
- Filter the Events list by the linked event lead's stage, while leaving standalone records and catering bookings unchanged.
- Verify the app builds and the Event leads and Events views use the same stage rule.
