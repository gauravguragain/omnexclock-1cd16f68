
## Employee Document Uploads

Let employees upload documents (RSA, Food Handling, Photo ID, Visa, Other) from their portal, and give admins a Documents view per employee with verify/delete controls and expiry status.

### Employee Portal — new "Documents" tab

- New tab in `PortalPageV2.tsx` next to existing tabs.
- Categories: **RSA**, **Food Handling**, **Photo ID**, **Visa / Work Rights**, **Other** (with custom label field).
- Upload dialog fields:
  - Category (select)
  - Custom label (only when Other)
  - Expiry date (optional; required for RSA / Food Handling / Visa)
  - File picker — any file type, max 10MB
- List shows: category, file name, uploaded date, expiry (with colour: green >30d, amber ≤30d, red expired), verification status badge (Pending / Verified / Rejected), View, Replace, Delete.
- Employees can delete or replace their own documents while status is Pending or Rejected. Verified documents are locked from deletion (must ask admin) — replace triggers re-verification.

### Admin — new "Documents" section on employee detail

- On the existing employee edit/detail screen, add a **Documents** panel listing that employee's uploaded files, plus a top-level roll-up under the employees list showing a per-employee document health icon (all valid / expiring / missing / rejected).
- Admin actions per document: **View / Download**, **Mark Verified**, **Mark Rejected** (with optional note), **Delete**.
- Filter/sort by category, status, expiry.

### Database

New table `public.employee_documents`:
- `employee_id` (FK employees, cascade)
- `business_id` (FK businesses, cascade)
- `category` (enum-like text: rsa, food_handling, photo_id, visa, other)
- `custom_label` (text, nullable)
- `file_path` (storage path)
- `file_name`, `file_size`, `mime_type`
- `expiry_date` (date, nullable)
- `status` (pending / verified / rejected, default pending)
- `admin_note` (text, nullable)
- `verified_by` (uuid, nullable), `verified_at` (timestamptz, nullable)
- `created_at`, `updated_at`

RLS + GRANTs:
- Admins/super admins of the business: full access via `has_business_access`.
- Authenticated employees access their own rows only through SECURITY DEFINER RPCs keyed by `employee_code` + `business_code` (same pattern as other portal RPCs — no direct table access from anon).

RPCs:
- `upload_employee_document(...)` — inserts row after file uploaded to storage.
- `get_my_employee_documents(_employee_code, _business_code)` — list own docs.
- `delete_my_employee_document(_employee_code, _business_code, _doc_id)` — only if status ≠ verified.
- `admin_set_document_status(_doc_id, _status, _note)` — admin only, sets verified/rejected + stamps verifier.

### Storage

Create private bucket `employee-documents`.
- Path convention: `{business_id}/{employee_id}/{uuid}-{filename}`.
- RLS on `storage.objects`:
  - Employees: insert/select/delete their own objects via signed URL flow (uploads happen client-side with a signed upload URL minted by an edge function that validates the employee code, so we don't need to expose `business_id` mapping to anon).
  - Admins: full access to objects where the first path segment matches a business they administer.
- Views/downloads use short-lived signed URLs.

### Edge function

`employee-document-upload` — validates employee_code + business_code, returns a signed upload URL scoped to the correct path, then the client calls the RPC to record the row. Same pattern used elsewhere in the app.

### No expiry notifications

Per your answer, expiry is tracked and shown visually only — no emails or notifications.

### Out of scope

- OCR / auto-parsing of document contents.
- Bulk upload.
- Expiry reminders (can add later).

### Files touched

- New: migration for table + RPCs + storage bucket + policies, `supabase/functions/employee-document-upload/index.ts`, `src/components/portal/DocumentsSection.tsx`, `src/components/admin/EmployeeDocumentsPanel.tsx`, `src/lib/employeeDocuments.ts`.
- Edit: `src/pages/PortalPageV2.tsx` (add tab), employee detail/edit page in admin (add panel), employees list (health indicator).
