/**
 * Геометрические утилиты (ray casting и т.д.).
 * Используются в нескольких местах: AdsPage, ads-filter-utils, ads-address-service.
 */

/**
 * Проверка принадлежности точки полигону (ray casting).
 * Полигон: массив [lat, lng].
 */
export function pointInPolygon(lat: number, lng: number, polygon: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const latI = polygon[i][0], lngI = polygon[i][1];
    const latJ = polygon[j][0], lngJ = polygon[j][1];
    if (((latI > lat) !== (latJ > lat)) &&
        (lng < (lngJ - lngI) * (lat - latI) / (latJ - latI) + lngI)) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Проверка, входит ли точка хотя бы в один из полигонов.
 * polygonsCoords: массив полигонов, каждый полигон — массив [lat, lng].
 */
export function pointInPolygons(
  lat: number,
  lng: number,
  polygons: [number, number][][] | null | undefined,
): boolean {
  if (!polygons || polygons.length === 0) return false;
  if (lat == null || lng == null || !isFinite(lat) || !isFinite(lng)) return false;
  return polygons.some(poly => pointInPolygon(lat, lng, poly));
}
