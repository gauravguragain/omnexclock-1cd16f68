-- Clear stale "⚠ Venue clash" warnings left on bookings by an old import bug
-- that matched a booking against itself. Recompute each flagged booking with
-- crm_find_venue_clash; only remove the warning when no genuine clash remains.

UPDATE public.crm_bookings b
SET notes = NULLIF(btrim(regexp_replace(b.notes, '⚠ Venue clash:[^\n]*\n?', '', 'g')), '')
WHERE b.notes LIKE '%⚠ Venue clash%'
  AND NOT EXISTS (
    SELECT 1 FROM public.crm_find_venue_clash(
      b.business_id, b.id, b.external_ref, b.event_date, b.venue_space,
      b.start_time, b.end_time, b.duration_minutes
    )
  );

-- Remove the "venue clash" tag from leads whose bookings no longer carry a
-- clash warning.
UPDATE public.crm_leads l
SET tags = array_remove(l.tags, 'venue clash')
WHERE l.tags @> ARRAY['venue clash']
  AND NOT EXISTS (
    SELECT 1 FROM public.crm_bookings b
    WHERE b.lead_id = l.id AND b.notes LIKE '%⚠ Venue clash%'
  );