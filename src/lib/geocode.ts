const cache = new Map<string, string>();

export async function reverseGeocode(lat: number, lng: number): Promise<string> {
  const key = `${lat.toFixed(4)},${lng.toFixed(4)}`;
  if (cache.has(key)) return cache.get(key)!;

  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=16&addressdetails=1`,
      { headers: { "Accept-Language": "en" } }
    );
    if (!res.ok) throw new Error("Geocode failed");
    const data = await res.json();
    const addr = data.address;
    // Build a short location name
    const parts: string[] = [];
    if (addr?.road) parts.push(addr.road);
    if (addr?.suburb) parts.push(addr.suburb);
    else if (addr?.city || addr?.town || addr?.village) parts.push(addr.city || addr.town || addr.village);
    const name = parts.length > 0 ? parts.join(", ") : data.display_name?.split(",").slice(0, 2).join(",").trim() || key;
    cache.set(key, name);
    return name;
  } catch {
    cache.set(key, key);
    return key;
  }
}
