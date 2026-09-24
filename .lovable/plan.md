# Separate vegetarian and non-vegetarian guest picks

## What will change
- Add optional **Vegetarian picks** and **Non-vegetarian picks** limits to every food-package course in Menu Books.
- Keep existing packages' new limits blank, as requested. The current combined guest-picks limit remains available for backward compatibility.
- Show each course's separate allowances in the internal lead Menu selection and prevent selections exceeding either allowance.
- Update guest menu links to present separate vegetarian and non-vegetarian choices, including dish photos, and enforce each limit before submission.
- Validate both limits in the database submission function so a guest cannot bypass them.
- Ensure submitted choices continue to populate the lead's Menu tab.

## Technical details
- Add nullable integer columns to package courses with non-negative checks.
- Update the guest-menu data function to return both limits and the submission function to validate dish counts by diet.
- Preserve current behaviour when both separate limits are blank.
- Refresh generated database types and verify the app and guest flow.
