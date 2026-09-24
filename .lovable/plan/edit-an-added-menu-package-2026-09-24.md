# Edit an added menu package

## What will change
- Add an Edit action beside every menu-book package already added to a lead's Menu tab.
- Reopen the package picker with the existing menu book, package, selected dishes, protein choices, package price, and dish surcharges filled in.
- Save changes back into the same package entry instead of adding a duplicate or requiring deletion.
- Keep Remove as a separate action and preserve the current total calculations.

## Technical details
- Give each added package its source package ID and keep each selected dish's source dish ID and chosen protein.
- Extend the package picker with an edit mode that initializes from the selected package and returns an update through the existing validation rules.
- Replace the matching package and its dishes in local state, then rely on the existing Save menu selection action for database persistence.
- Existing saved selections without source IDs remain removable and price-editable; newly added or edited packages gain full editing.
- Verify type checks, preview build health, and the edit-in-place interaction.
