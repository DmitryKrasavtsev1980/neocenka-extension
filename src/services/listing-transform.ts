/**
 * Типы данных объявлений и утилиты трансформации
 * Данные запрашиваются через сервер Неоценка (data-request-service.ts)
 */

import type { Ad, PriceHistoryItem, SellerInfo, SourceMetadata, HouseDetails } from '@/types';

// Идентификаторы источников данных
export const SOURCE_IDS: Record<string, number> = {
  avito: 1,
  cian: 2,
  youla: 5,
  sob: 7,
  bazarpnz: 9,
  move: 11,
  yandex: 13,
  gipernn: 19,
  orsk: 21,
  domclick: 22,
  doskaYkt: 23,
};

export const SOURCE_NAMES: Record<number, string> = {
  1: 'avito',
  2: 'cian',
  5: 'youla',
  7: 'sob',
  9: 'bazarpnz',
  11: 'move',
  13: 'yandex',
  19: 'gipernn',
  21: 'orsk',
  22: 'domclick',
  23: 'doskaYkt',
};

// ========== Сырые типы данных ==========

export interface ListingCategoryRaw {
  id: number;
  title: string;
  typeId: number;
  sectionId: number;
}

export interface ListingRegionRaw {
  id: number;
  title?: string;
  name?: string;
  parent_id?: number;
}

export interface ListingSectionRaw {
  id: number;
  typeId: number;
  title: string;
}

export interface ListingRaw {
  id: number;
  source?: string;
  sourceId?: number;
  url?: string;
  title?: string;
  text?: string;
  address?: string;
  lat?: number;
  lng?: number;
  regionId?: number;
  cityId?: number;
  categoryId?: number;
  sectionId?: number;
  rooms?: number;
  sq?: number;
  floor?: number;
  floors?: number;
  material?: string;
  house?: { buildYear?: number; [key: string]: unknown };
  cost?: number;
  history?: Array<{ date: string | number; cost: number }>;
  images?: string[];
  name?: string;
  agent?: number;
  phones?: string[];
  created?: string | number;
  updated?: string | number;
  dateUpdate?: string | number;
  dateUpdated?: string | number;
  isNew?: number;
  [key: string]: unknown;
}

// ========== Трансформация сырых данных → Ad ==========

/** Определить property_type из rooms */
function getPropertyType(rooms: number | undefined | null): string {
  if (!rooms || rooms === 0) return 'studio';
  if (rooms === 1) return '1k';
  if (rooms === 2) return '2k';
  if (rooms === 3) return '3k';
  return '4k+';
}

/** Нормализация истории цен */
function normalizePriceHistory(history: Array<{ date: string | number; cost: number }> | undefined): PriceHistoryItem[] {
  if (!history || !Array.isArray(history)) return [];
  return history.map((h) => ({
    date: typeof h.date === 'number' ? new Date(h.date * 1000).toISOString() : String(h.date),
    price: h.cost,
  }));
}

/** Нормализация продавца */
function normalizeSeller(
  raw: ListingRaw,
): SellerInfo {
  const agentCode = raw.agent;
  let type: SellerInfo['type'] = null;
  if (agentCode === 0) type = 'owner';
  else if (agentCode === 1 || agentCode === 2) type = 'agent';
  else if (agentCode === 3) type = 'developer';

  return {
    name: raw.name || null,
    type,
    is_agent: agentCode === 1 || agentCode === 2 || agentCode === 3,
    phone: raw.phones?.[0] || null,
    phone_protected: null,
  };
}

/** Нормализация координат */
function normalizeCoordinates(lat: number | string | undefined, lng: number | string | undefined): { lat: number | null; lng: number | null } {
  const parse = (v: number | string | undefined): number | null => {
    if (v == null) return null;
    const n = typeof v === 'number' ? v : parseFloat(String(v));
    return !isNaN(n) ? n : null;
  };
  return { lat: parse(lat), lng: parse(lng) };
}

/** Нормализация даты */
function normalizeDate(d: string | number | undefined | null): string | null {
  if (!d) return null;
  if (typeof d === 'number') {
    return new Date(d * 1000).toISOString();
  }
  return String(d);
}

/** Преобразовать сырые данные объявления в Ad */
export function transformListing(raw: ListingRaw): Ad {
  const source = raw.source || (raw.sourceId ? SOURCE_NAMES[raw.sourceId] : null) || 'unknown';
  const pricePerMeter = raw.cost && raw.sq ? Math.round(raw.cost / raw.sq) : null;

  if (!raw.lat || !raw.lng) {
    console.warn('[Data] No coordinates for listing', raw.id);
  }

  const sellerInfo = normalizeSeller(raw);
  const coordinates = normalizeCoordinates(raw.lat, raw.lng);

  const houseDetails: HouseDetails = {
    build_year: raw.house?.buildYear || null,
    cargo_lifts: null,
    passenger_lifts: null,
    material: raw.material || null,
  };

  const sourceMetadata: SourceMetadata = {
    original_source: source === 'unknown' ? null : `${source}.ru`,
    source_method: 'api',
    original_id: String(raw.id),
    source_internal_id: null,
    import_date: new Date().toISOString(),
    last_sync_date: null,
    sync_errors: [],
  };

  return {
    external_id: String(raw.id),
    source,
    url: raw.url || '',
    segment_id: null,
    object_id: null,

    title: raw.title || '',
    name: '',
    description: raw.text || '',
    address: raw.address || '',
    coordinates,

    property_type: getPropertyType(raw.rooms),
    area_total: raw.sq || null,
    area_living: null,
    area_kitchen: null,
    floor: raw.floor || null,
    floors_total: raw.floors || null,
    rooms: raw.rooms || null,
    house_type: raw.material || '',
    condition: '',
    year_built: raw.house?.buildYear || null,
    has_balcony: null,
    bathroom_type: '',
    ceiling_height: null,

    price: raw.cost || null,
    price_per_meter: pricePerMeter,
    price_history: (() => {
      const hist = normalizePriceHistory(raw.history);
      const createdDate = normalizeDate(raw.created);
      if (raw.cost && createdDate) {
        const earliestDate = hist.length > 0
          ? hist.reduce((min, h) => new Date(h.date) < new Date(min) ? h.date : min, hist[0].date)
          : null;
        if (!earliestDate || new Date(createdDate) < new Date(earliestDate)) {
          hist.push({ date: createdDate, price: raw.cost });
        }
      } else if (hist.length === 0 && raw.cost) {
        hist.push({ date: new Date().toISOString(), price: raw.cost });
      }
      return hist;
    })(),

    photos: raw.images || [],
    photos_count: raw.images?.length || 0,

    seller_name: raw.name || '',
    seller_type: sellerInfo.type || '',
    phone: raw.phones?.[0] || '',
    seller_info: sellerInfo,

    status: 'active',
    processing_status: 'address_needed',

    address_id: null,
    address_match_confidence: null,
    address_match_method: null,
    address_match_score: null,
    address_distance: null,

    region_id: raw.regionId || null,
    city_id: raw.cityId || null,
    metro_id: null,
    operation_type: raw.sectionId === 6 ? 'rent' : 'sale',
    section_id: raw.sectionId || null,
    category_id: raw.categoryId || null,
    original_source_id: null,
    is_new_building: raw.isNew === 1 ? true : raw.isNew === 0 ? false : null,
    is_apartments: null,

    house_details: houseDetails,
    renovation_type: null,
    bathroom_details: null,
    balcony_details: null,
    views_count: null,
    is_premium: false,
    parsing_errors: [],

    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    created: normalizeDate(raw.created),
    updated: normalizeDate(raw.updated),
    parsed_at: new Date().toISOString(),

    source_metadata: sourceMetadata,
  };
}
