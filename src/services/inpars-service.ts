/**
 * Inpars API клиент — скачивание объявлений с Avito/Cian/Домклик
 * Документация: https://inpars.ru/api/v2
 */

import type { Ad, PriceHistoryItem, SellerInfo, SourceMetadata, HouseDetails } from '@/types';

const BASE_URL = 'https://inpars.ru/api/v2';
const RATE_LIMIT_MS = 6000; // 10 запросов/мин
const TIMEOUT_MS = 30000;
const MAX_LIMIT = 500;

// Source IDs Inpars
export const INPARS_SOURCE_IDS: Record<string, number> = {
  avito: 1,
  cian: 2,
  youla: 5,
  sob: 7,
  domclick: 22,
};

export const INPARS_SOURCE_NAMES: Record<number, string> = {
  1: 'avito',
  2: 'cian',
  5: 'youla',
  7: 'sob',
  22: 'domclick',
};

let apiToken = '';
let lastRequestTime = 0;

/** Установить API токен */
export function setInparsToken(token: string): void {
  apiToken = token;
}

/** Получить текущий токен */
export function getInparsToken(): string {
  return apiToken;
}

/** Rate limiter */
async function waitForRateLimit(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < RATE_LIMIT_MS) {
    await new Promise((resolve) => setTimeout(resolve, RATE_LIMIT_MS - elapsed));
  }
  lastRequestTime = Date.now();
}

/** Базовый запрос к Inpars API */
async function inparsRequest<T>(
  method: 'GET' | 'POST',
  endpoint: string,
  body?: Record<string, unknown>,
): Promise<T> {
  await waitForRateLimit();

  const url = method === 'GET'
    ? `${BASE_URL}/${endpoint}${endpoint.includes('?') ? '&' : '?'}access-token=${encodeURIComponent(apiToken)}`
    : `${BASE_URL}/${endpoint}`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  // Basic Auth: токен как username, пароль пустой
  if (apiToken) {
    headers['Authorization'] = `Basic ${btoa(apiToken + ':')}`;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method,
      headers,
      body: method === 'POST' ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`Inpars API ${response.status}: ${text || response.statusText}`);
    }

    return await response.json();
  } finally {
    clearTimeout(timeoutId);
  }
}

/** Проверить подписку */
export async function checkSubscription(): Promise<{
  subscribed: boolean;
  expires_at?: string;
  plan?: string;
}> {
  return inparsRequest('GET', 'user/subscribe');
}

/** Загрузить категории */
export async function loadCategories(): Promise<InparsCategoryRaw[]> {
  const data = await inparsRequest<{ data: InparsCategoryRaw[] }>('GET', 'estate/category');
  return data.data || [];
}

/** Загрузить регионы */
export async function loadRegions(): Promise<InparsRegionRaw[]> {
  const data = await inparsRequest<{ data: InparsRegionRaw[] }>('GET', 'region');
  return data.data || [];
}

/** Параметры запроса объявлений */
export interface InparsListingsOptions {
  polygon?: [number, number][];
  regionId?: number;
  limit?: number;
  timeStart?: number;
  timeEnd?: number;
  categoryId?: number;
  sourceId?: number;
  sellerType?: string;
  expand?: boolean;
  sortBy?: string;
  isNew?: number;
}

/** Получить объявления по полигону */
export async function getListingsByPolygon(
  polygon: [number, number][],
  options: Omit<InparsListingsOptions, 'polygon' | 'regionId'> = {},
): Promise<{ listings: InparsListingRaw[]; total?: number }> {
  const body: Record<string, unknown> = {
    polygon,
    limit: options.limit || MAX_LIMIT,
    expand: true,
    ...options,
  };

  const data = await inparsRequest<{ data: InparsListingRaw[]; meta?: { total?: number } }>(
    'POST',
    'estate',
    body,
  );

  return {
    listings: data.data || [],
    total: data.meta?.total,
  };
}

/** Получить объявления по региону с пагинацией */
export async function getListingsByRegion(
  regionId: number,
  options: Omit<InparsListingsOptions, 'polygon' | 'regionId'> = {},
  onProgress?: (loaded: number, total: number | undefined) => void,
): Promise<InparsListingRaw[]> {
  const allListings: InparsListingRaw[] = [];
  let timeStart = options.timeStart;

  while (true) {
    const body: Record<string, unknown> = {
      regionId,
      limit: MAX_LIMIT,
      expand: true,
      sortBy: 'updated_asc',
      ...options,
    };
    if (timeStart) body.timeStart = timeStart;

    const data = await inparsRequest<{ data: InparsListingRaw[] }>('POST', 'estate', body);
    const batch = data.data || [];

    if (batch.length === 0) break;
    allListings.push(...batch);
    onProgress?.(allListings.length, undefined);

    if (batch.length < MAX_LIMIT) break;

    // Пагинация: берём updated последнего как timeStart для следующего запроса
    const lastUpdated = batch[batch.length - 1].updated;
    if (!lastUpdated) break;
    timeStart = typeof lastUpdated === 'number' ? lastUpdated : Math.floor(new Date(lastUpdated).getTime() / 1000);
  }

  return allListings;
}

// ========== Raw types from Inpars API ==========

export interface InparsCategoryRaw {
  id: number;
  name: string;
  name_eng?: string;
  parent_id?: number;
  section_id?: number;
  type_id?: number;
  has_children?: boolean;
  level?: number;
}

export interface InparsRegionRaw {
  id: number;
  name: string;
  parent_id?: number;
}

export interface InparsListingRaw {
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
  isNew?: number;
  [key: string]: unknown;
}

// ========== Трансформация Inpars → Ad ==========

/** Определить property_type из rooms */
function getPropertyType(rooms: number | undefined | null): string {
  if (!rooms || rooms === 0) return 'studio';
  if (rooms === 1) return '1k';
  if (rooms === 2) return '2k';
  if (rooms === 3) return '3k';
  return '4k+';
}

/** Нормализация истории цен из Inpars */
function normalizePriceHistory(history: Array<{ date: string | number; cost: number }> | undefined): PriceHistoryItem[] {
  if (!history || !Array.isArray(history)) return [];
  return history.map((h) => ({
    date: typeof h.date === 'number' ? new Date(h.date * 1000).toISOString() : String(h.date),
    price: h.cost,
  }));
}

/** Нормализация продавца */
function normalizeSeller(
  raw: InparsListingRaw,
): SellerInfo {
  const agentCode = raw.agent;
  let type: SellerInfo['type'] = null;
  if (agentCode === 0) type = 'owner';
  else if (agentCode === 1) type = 'agent';
  else if (agentCode === 2) type = 'agency';

  return {
    name: raw.name || null,
    type,
    is_agent: agentCode === 1 || agentCode === 2,
    phone: raw.phones?.[0] || null,
    phone_protected: null,
  };
}

/** Нормализация координат */
function normalizeCoordinates(lat: number | undefined, lng: number | undefined): { lat: number | null; lng: number | null } {
  const latNum = typeof lat === 'number' && !isNaN(lat) ? lat : null;
  const lngNum = typeof lng === 'number' && !isNaN(lng) ? lng : null;
  return { lat: latNum, lng: lngNum };
}

/** Нормализация даты */
function normalizeDate(d: string | number | undefined | null): string | null {
  if (!d) return null;
  if (typeof d === 'number') {
    return new Date(d * 1000).toISOString();
  }
  return String(d);
}

/** Преобразовать сырое объявление Inpars в Ad */
export function transformInparsListing(raw: InparsListingRaw): Ad {
  const source = raw.source || (raw.sourceId ? INPARS_SOURCE_NAMES[raw.sourceId] : null) || 'unknown';
  const pricePerMeter = raw.cost && raw.sq ? Math.round(raw.cost / raw.sq) : null;

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
    price_history: normalizePriceHistory(raw.history),

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
