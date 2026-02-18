/**
 * Format coordinates as a short display string.
 * No external API calls — just formats lat/lng.
 */
export function formatLocation(lat: number, lng: number): string {
  return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
}

export function googleMapsUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps?q=${lat},${lng}`;
}
