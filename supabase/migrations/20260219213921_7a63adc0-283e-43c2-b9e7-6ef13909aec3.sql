-- Make event-runsheets bucket public so PDFs can be accessed
UPDATE storage.buckets SET public = true WHERE id = 'event-runsheets';