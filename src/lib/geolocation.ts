// Geolocation capture + reverse geocoding via OpenStreetMap Nominatim

export interface GeoResult {
  lat: number | null;
  lng: number | null;
  locationName: string | null;
  locationAccuracy: number | null;
  locationStatus: "verified" | "denied" | "unavailable" | "coordinates-only";
}

// Simple queue to enforce 1 req/sec rate limit for Nominatim
let lastGeocodingTime = 0;

async function waitForRateLimit(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastGeocodingTime;
  if (elapsed < 1100) {
    await new Promise((r) => setTimeout(r, 1100 - elapsed));
  }
  lastGeocodingTime = Date.now();
}

async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  await waitForRateLimit();

  const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "WorkSync-App/1.0" },
      });

      if (res.status === 429) {
        // Rate limited — retry once after 2s
        if (attempt === 0) {
          await new Promise((r) => setTimeout(r, 2000));
          continue;
        }
        return null;
      }

      if (!res.ok) return null;

      const data = await res.json();
      if (!data?.address) return null;

      const parts: string[] = [];
      const a = data.address;
      const locality = a.suburb || a.neighbourhood || a.village;
      const city = a.city || a.town;
      const state = a.state;

      if (locality) parts.push(locality);
      if (city) parts.push(city);
      if (state) parts.push(state);

      return parts.length > 0 ? parts.join(", ") : null;
    } catch {
      if (attempt === 0) {
        await new Promise((r) => setTimeout(r, 2000));
        continue;
      }
      return null;
    }
  }
  return null;
}

export async function captureGeolocation(): Promise<GeoResult> {
  // Check if geolocation is supported
  if (!navigator.geolocation) {
    console.warn("[Geo] Geolocation API not available");
    return { lat: null, lng: null, locationName: null, locationAccuracy: null, locationStatus: "unavailable" };
  }

  // Check if running in insecure context (non-HTTPS)
  if (typeof window !== "undefined" && window.isSecureContext === false) {
    console.warn("[Geo] Insecure context — geolocation blocked");
    return { lat: null, lng: null, locationName: null, locationAccuracy: null, locationStatus: "unavailable" };
  }

  try {
    console.log("[Geo] Requesting position...");
    const position = await new Promise<GeolocationPosition>((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 60000,
      });
    });

    const lat = position.coords.latitude;
    const lng = position.coords.longitude;
    const accuracy = Math.round(position.coords.accuracy);
    console.log(`[Geo] Got position: ${lat.toFixed(5)}, ${lng.toFixed(5)} (±${accuracy}m)`);

    // Try reverse geocoding
    const locationName = await reverseGeocode(lat, lng);

    if (locationName) {
      return { lat, lng, locationName, locationAccuracy: accuracy, locationStatus: "verified" };
    }

    // Fallback to coordinates
    return {
      lat, lng,
      locationName: `Lat: ${lat.toFixed(5)}, Lng: ${lng.toFixed(5)}`,
      locationAccuracy: accuracy,
      locationStatus: "coordinates-only",
    };
  } catch (error: any) {
    const code = error?.code;
    const msg = error?.message || "Unknown error";
    console.warn(`[Geo] Error code=${code}, message=${msg}`);
    
    if (code === 1) {
      // Permission denied
      return { lat: null, lng: null, locationName: null, locationAccuracy: null, locationStatus: "denied" };
    }
    // code 2 = position unavailable, code 3 = timeout
    return { lat: null, lng: null, locationName: null, locationAccuracy: null, locationStatus: "unavailable" };
  }
}

/** Format geo data from clock_events.geolocation JSON */
export function formatGeoLocation(geo: any): { name: string | null; status: string; lat: number | null; lng: number | null; accuracy: number | null } {
  if (!geo) return { name: null, status: "unavailable", lat: null, lng: null, accuracy: null };
  return {
    name: geo.locationName || null,
    status: geo.locationStatus || "unavailable",
    lat: geo.lat ?? null,
    lng: geo.lng ?? null,
    accuracy: geo.locationAccuracy ?? null,
  };
}
