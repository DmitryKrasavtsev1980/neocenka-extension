/**
 * Сервис обратного геокодирования через Dadata API.
 *
 * Endpoint: POST https://suggestions.dadata.ru/suggestions/api/4_1/rs/geolocate/address
 * Бесплатный лимит: 10000 запросов/день.
 *
 * Возвращает короткий человекочитаемый адрес (поле `value` из первого suggestion),
 * например: "г Новосибирск, ул Ленина, д 5".
 */

const DADATA_TOKEN = 'c112b5a34e749a0ce0872bbcf858b6f12794546b';
const DADATA_REVERSE_URL =
  'https://suggestions.dadata.ru/suggestions/api/4_1/rs/geolocate/address';

export interface DadataGeoSuggestion {
  value: string;
  unrestricted_value: string;
  data: {
    country?: string;
    region?: string;
    region_type?: string;
    city?: string;
    city_type?: string;
    street?: string;
    street_type?: string;
    house?: string;
    house_type?: string;
    geo_lat?: string;
    geo_lon?: string;
    [key: string]: unknown;
  };
}

interface DadataReverseResponse {
  suggestions?: DadataGeoSuggestion[];
}

/**
 * Обратное геокодирование: координаты → адрес.
 *
 * @param lat Широта
 * @param lon Долгота
 * @param count Сколько вариантов вернуть (по умолчанию 1)
 * @param radiusMeters Радиус поиска в метрах (по умолчанию 100)
 * @returns Массив suggestions (пустой, если ничего не найдено)
 */
export async function reverseGeocodeDadata(
  lat: number,
  lon: number,
  opts: { count?: number; radiusMeters?: number } = {},
): Promise<DadataGeoSuggestion[]> {
  const body = {
    lat,
    lon,
    count: opts.count ?? 1,
    radius_meters: opts.radiusMeters ?? 100,
  };

  const resp = await fetch(DADATA_REVERSE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Token ${DADATA_TOKEN}`,
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    throw new Error(`Dadata HTTP ${resp.status}`);
  }

  const data = (await resp.json()) as DadataReverseResponse;
  return data.suggestions ?? [];
}

/**
 * Удобная обёртка: возвращает строку адреса (value первого suggestion)
 * или null, если ничего не найдено / произошла ошибка.
 */
export async function reverseGeocodeAddress(
  lat: number,
  lon: number,
): Promise<string | null> {
  try {
    const suggestions = await reverseGeocodeDadata(lat, lon, { count: 1 });
    return suggestions[0]?.value ?? null;
  } catch {
    return null;
  }
}
