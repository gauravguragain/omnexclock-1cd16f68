# Match the supplied runsheet PDF

## What will change
- Rebuild the runsheet PDF layout to mirror the supplied Pro Regal Pavilion event order: title block, top-right logo, contact/reference columns, black section headers, bordered summary row, grey agenda row, two-column event detail area, closing rule, and signature footer.
- Use the same compact sans-serif hierarchy, line weights, alignment, bullets, spacing, and A4 proportions shown in the sample.
- Preserve all current CRM data, including menu courses, service timings, setup items, live stalls, corkage, dietary notes, allergies, revisions, and multi-page overflow.
- Improve long-content handling so sections continue cleanly without colliding with the footer or splitting headings from their content.

## Technical details
- Load the existing Pro Regal Pavilion logo asset and convert it to image data before creating the PDF.
- Make PDF generation asynchronous where required so downloads and issue actions wait for the logo.
- Keep repeatable page headers/footers and consistent column borders on overflow pages.
- Generate a representative PDF, render it to images, compare it visually with the uploaded sample, and correct any spacing or clipping issues.
