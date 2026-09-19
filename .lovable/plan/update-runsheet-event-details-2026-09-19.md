# Update runsheet event details

## What will change
- Show the selected venue clearly in both Event Summary and Agenda, with an explicit **Venue** label.
- Split guest numbers into separate **Adults** and **Kids** lines instead of combining them as attendees.
- Print selected live stalls above the menu package and dishes.
- Add a start and end time to every selected live stall on the Menu tab and carry those timings into the runsheet.
- Add editable contact-number fields for the sales person and event coordinator on the Runsheet tab and print them beside each contact.
- Move the complete service schedule to the right column, directly below Setup & Additional Information.
- Keep pricing calculations in the sales workflow, but remove all prices from the runsheet, including corkage rates and live-stall charges.

## Technical details
- Add start/end time fields to saved live-stall selections and phone fields to saved runsheets, preserving existing records.
- Update menu loading, editing, saving, and PDF data mapping for these fields.
- Reorder PDF content so live stalls lead the left menu column and service timings appear in the right operations column.
- Generate and visually inspect a representative PDF for labels, spacing, overflow, and pagination; verify the app remains error-free.
