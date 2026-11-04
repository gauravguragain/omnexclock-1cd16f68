type Booking = { booking_kind?: string; adults?: number | null; kids?: number | null; guest_count?: number | null };
type Sheet = { adult_guests?: number | null; kids_guests?: number | null };

// Catering bookings own their guest counts; event run sheets retain their explicit overrides.
export function runsheetGuests(sheet: Sheet, booking?: Booking | null) {
  const catering = booking?.booking_kind === "catering";
  return {
    adults: catering ? booking.adults ?? booking.guest_count ?? sheet.adult_guests : sheet.adult_guests ?? booking?.adults,
    kids: catering ? booking.kids ?? sheet.kids_guests : sheet.kids_guests ?? booking?.kids,
  };
}