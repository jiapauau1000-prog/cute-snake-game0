/** Open turn-by-turn navigation in Google Maps (works on phone & desktop). */
export function mapsNavigateUrl(place: string): string {
  const q = place.trim();
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(q)}&travelmode=transit`;
}

/** Open place search / pin. */
export function mapsSearchUrl(place: string): string {
  const q = place.trim();
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}

/** Embeddable map preview (no API key). */
export function mapsEmbedUrl(place: string): string {
  const q = place.trim();
  return `https://maps.google.com/maps?q=${encodeURIComponent(q)}&z=15&output=embed`;
}
