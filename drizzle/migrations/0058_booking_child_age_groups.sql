ALTER TABLE public.crm_bookings
  ADD COLUMN kids_5_to_10 integer,
  ADD COLUMN kids_under_5 integer;
ALTER TABLE public.crm_bookings
  ADD CONSTRAINT crm_bookings_kids_5_to_10_nonnegative CHECK (kids_5_to_10 IS NULL OR kids_5_to_10 >= 0),
  ADD CONSTRAINT crm_bookings_kids_under_5_nonnegative CHECK (kids_under_5 IS NULL OR kids_under_5 >= 0);
COMMENT ON COLUMN public.crm_bookings.kids_5_to_10 IS 'Children aged 5 to 10 entered on the event confirmation page; NULL means no age breakdown was recorded.';
COMMENT ON COLUMN public.crm_bookings.kids_under_5 IS 'Children under 5 entered on the event confirmation page; NULL means no age breakdown was recorded.';