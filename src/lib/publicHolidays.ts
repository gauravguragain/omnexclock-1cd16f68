// NSW Australia Public Holidays
// Source: NSW Industrial Relations (industrialrelations.nsw.gov.au)
// Dates are gazetted public holidays for NSW. Update yearly.
// Date keys are YYYY-MM-DD (Australia/Sydney local date).

export type PublicHoliday = { date: string; name: string };

export const NSW_PUBLIC_HOLIDAYS: PublicHoliday[] = [
  // 2025
  { date: "2025-01-01", name: "New Year's Day" },
  { date: "2025-01-27", name: "Australia Day (observed)" },
  { date: "2025-04-18", name: "Good Friday" },
  { date: "2025-04-19", name: "Easter Saturday" },
  { date: "2025-04-20", name: "Easter Sunday" },
  { date: "2025-04-21", name: "Easter Monday" },
  { date: "2025-04-25", name: "Anzac Day" },
  { date: "2025-06-09", name: "King's Birthday" },
  { date: "2025-10-06", name: "Labour Day" },
  { date: "2025-12-25", name: "Christmas Day" },
  { date: "2025-12-26", name: "Boxing Day" },

  // 2026
  { date: "2026-01-01", name: "New Year's Day" },
  { date: "2026-01-26", name: "Australia Day" },
  { date: "2026-04-03", name: "Good Friday" },
  { date: "2026-04-04", name: "Easter Saturday" },
  { date: "2026-04-05", name: "Easter Sunday" },
  { date: "2026-04-06", name: "Easter Monday" },
  { date: "2026-04-25", name: "Anzac Day" },
  { date: "2026-06-08", name: "King's Birthday" },
  { date: "2026-10-05", name: "Labour Day" },
  { date: "2026-12-25", name: "Christmas Day" },
  { date: "2026-12-26", name: "Boxing Day" },
  { date: "2026-12-28", name: "Additional Public Holiday (Boxing Day)" },

  // 2027
  { date: "2027-01-01", name: "New Year's Day" },
  { date: "2027-01-26", name: "Australia Day" },
  { date: "2027-03-26", name: "Good Friday" },
  { date: "2027-03-27", name: "Easter Saturday" },
  { date: "2027-03-28", name: "Easter Sunday" },
  { date: "2027-03-29", name: "Easter Monday" },
  { date: "2027-04-25", name: "Anzac Day" },
  { date: "2027-04-26", name: "Additional Public Holiday (Anzac Day)" },
  { date: "2027-06-14", name: "King's Birthday" },
  { date: "2027-10-04", name: "Labour Day" },
  { date: "2027-12-25", name: "Christmas Day" },
  { date: "2027-12-27", name: "Additional Public Holiday (Christmas Day)" },
  { date: "2027-12-28", name: "Additional Public Holiday (Boxing Day)" },
];

const HOLIDAY_MAP: Record<string, string> = NSW_PUBLIC_HOLIDAYS.reduce(
  (acc, h) => {
    acc[h.date] = h.name;
    return acc;
  },
  {} as Record<string, string>
);

/** Returns the holiday name for a YYYY-MM-DD date, or null. */
export function getPublicHolidayName(dateStr: string): string | null {
  return HOLIDAY_MAP[dateStr] ?? null;
}

/** Convenience boolean check. */
export function isPublicHoliday(dateStr: string): boolean {
  return dateStr in HOLIDAY_MAP;
}
