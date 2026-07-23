/**
 * Galeria zdjęć obiektu budowy.
 * `photos[]` w rozszerzeniu obiektu + legacy `photo_documentation` (pierwsze zdjęcie).
 */

export const SITE_PHOTOS_MAX = 20;

/** @param {{ photos?: unknown, photo_documentation?: unknown }} input */
export function normalizeSitePhotos(input = {}) {
  const fromArr = Array.isArray(input.photos)
    ? input.photos.filter((u) => typeof u === "string" && u.trim()).map((u) => u.trim())
    : [];
  if (fromArr.length) {
    return [...new Set(fromArr)].slice(0, SITE_PHOTOS_MAX);
  }
  const legacy =
    typeof input.photo_documentation === "string" && input.photo_documentation.trim()
      ? [input.photo_documentation.trim()]
      : [];
  return legacy.slice(0, SITE_PHOTOS_MAX);
}

export function primarySitePhoto(photos) {
  const list = Array.isArray(photos) ? photos : [];
  return list[0] || "";
}

export function sitePhotosLabel(count) {
  const n = Number(count) || 0;
  if (n <= 0) return "";
  if (n === 1) return "1 zdjęcie";
  if (n >= 2 && n <= 4) return `${n} zdjęcia`;
  return `${n} zdjęć`;
}
