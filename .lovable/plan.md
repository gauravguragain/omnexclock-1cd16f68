# Package dish per-person surcharges

## What will change
- Add an optional extra price per person to each dish within a specific menu package course.
- Show a price field beside each selected package dish in Menu Books; the same dish may have different surcharges in different packages.
- Display `+$X.XX per person` beside priced dishes in the internal lead menu picker and the guest menu selection link.
- Carry selected dish surcharges into the lead's saved menu selection and include them in the event's estimated menu total.
- Preserve existing packages and dishes with a default surcharge of $0.

## Guest submission
- Validate all guest picks against the selected package as before.
- Resolve prices from the package configuration on the server, rather than trusting prices sent by the guest.
- Save each selected dish with its package-specific surcharge so the lead Menu tab reflects the submitted choices and pricing.

## Technical details
- Add a non-negative `extra_price_per_head` column to package course items.
- Update the guest-menu data function to return that value and the submission function to save it on menu selection items.
- Update package editing, package loading, guest choice display, saved menu totals, and generated database types.
- Verify the migration, type checks, current build status, and both internal and guest-facing flows.
