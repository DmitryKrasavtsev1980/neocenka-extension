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
  bazarpnz: 9,
  move: 11,
  yandex: 13,
  gipernn: 19,
  orsk: 21,
  domclick: 22,
  doskaYkt: 23,
};

export const INPARS_SOURCE_NAMES: Record<number, string> = {
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

const STORAGE_KEY = 'inpars_api_token';

let apiToken = '';
let lastRequestTime = 0;

/** Загрузить токен из chrome.storage */
export async function loadInparsToken(): Promise<string> {
  return new Promise((resolve) => {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      chrome.storage.local.get(STORAGE_KEY, (result) => {
        apiToken = result[STORAGE_KEY] || '';
        resolve(apiToken);
      });
    } else {
      resolve(apiToken);
    }
  });
}

/** Установить API токен (и сохранить в chrome.storage) */
export function setInparsToken(token: string): void {
  apiToken = token;
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    chrome.storage.local.set({ [STORAGE_KEY]: token });
  }
}

/** Получить текущий токен (из памяти) */
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
  regionId?: number;
  typeId?: number;
}> {
  const raw = await inparsRequest<{ data: Array<{ regionId?: number; typeId?: number; startTime: string; endTime: string; subscribe: string; api: boolean }>; meta?: unknown }>('GET', 'user/subscribe');

  const items = raw.data || [];
  const active = items.find(item => {
    if (!item.endTime) return false;
    return new Date(item.endTime) > new Date();
  });

  return {
    subscribed: !!active,
    expires_at: active?.endTime,
    plan: active?.subscribe,
    regionId: active?.regionId,
    typeId: active?.typeId,
  };
}

/** Загрузить категории */
export async function loadCategories(): Promise<InparsCategoryRaw[]> {
  const data = await inparsRequest<{ data: InparsCategoryRaw[] }>('GET', 'estate/category');
  return data.data || [];
}

/** Загрузить регионы (с кешированием в chrome.storage) */
export async function loadRegions(forceRefresh = false): Promise<InparsRegionRaw[]> {
  if (!forceRefresh && typeof chrome !== 'undefined' && chrome.storage?.local) {
    const cached = await new Promise<InparsRegionRaw[] | undefined>((resolve) => {
      chrome.storage.local.get('inpars_regions', (r) => resolve(r.inpars_regions));
    });
    if (cached?.length) return cached;
  }
  const data = await inparsRequest<{ data: InparsRegionRaw[] }>('GET', 'region');
  const regions = data.data || [];
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    chrome.storage.local.set({ inpars_regions: regions });
  }
  return regions;
}

/** Загрузить разделы (с кешированием в chrome.storage) */
export async function loadSections(forceRefresh = false): Promise<InparsSectionRaw[]> {
  if (!forceRefresh && typeof chrome !== 'undefined' && chrome.storage?.local) {
    const cached = await new Promise<InparsSectionRaw[] | undefined>((resolve) => {
      chrome.storage.local.get('inpars_sections', (r) => resolve(r.inpars_sections));
    });
    if (cached?.length) return cached;
  }
  const data = await inparsRequest<{ data: InparsSectionRaw[] }>('GET', 'estate/section');
  const sections = data.data || [];
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    chrome.storage.local.set({ inpars_sections: sections });
  }
  return sections;
}

/** Параметры запроса объявлений */
export interface InparsListingsOptions {
  polygon?: [number, number][];
  regionId?: number;
  limit?: number;
  timeStart?: number;
  timeEnd?: number;
  categoryId?: number | string;
  sourceId?: number | string;
  sellerType?: string;
  sortBy?: string;
  isNew?: number;
}

/** Получить ВСЕ объявления по полигону (с автоматической пагинацией) */
export async function getListingsByPolygon(
  polygon: [number, number][],
  options: Omit<InparsListingsOptions, 'polygon' | 'regionId'> = {},
  onProgress?: (loaded: number) => void,
): Promise<{ listings: InparsListingRaw[]; total?: number }> {
  const polygonString = polygon.map(([lat, lng]) => `${lat},${lng}`).join(',');
  const allListings: InparsListingRaw[] = [];
  let timeStart = options.timeStart;
  let page = 0;

  while (true) {
    const body: Record<string, unknown> = {
      polygon: polygonString,
      limit: MAX_LIMIT,
      expand: 'region,city,type,section,category,metro,material,rentTime,isNew,rooms,history,phoneProtected,parseId,isApartments,house',
      sortBy: 'updated_asc',
      isNew: 0,
      sellerType: options.sellerType || '1,2,3',
    };
    if (timeStart) body.timeStart = timeStart;
    if (options.timeEnd) body.timeEnd = options.timeEnd;
    if (options.categoryId) body.categoryId = options.categoryId;
    if (options.sourceId) body.sourceId = options.sourceId;

    const data = await inparsRequest<{ data: InparsListingRaw[]; meta?: { total?: number; totalCount?: number } }>(
      'POST',
      'estate',
      body,
    );

    const batch = data.data || [];
    if (batch.length === 0) break;

    allListings.push(...batch);
    page++;
    onProgress?.(allListings.length);

    // Если получили меньше лимита — всё загружено
    if (batch.length < MAX_LIMIT) break;

    // Берём updated последнего как курсор для следующей страницы (с fallback на другие поля)
    const lastItem = batch[batch.length - 1];
    const lastUpdated = lastItem.updated || lastItem.dateUpdate || lastItem.dateUpdated;
    if (!lastUpdated) break;
    if (typeof lastUpdated === 'number') {
      timeStart = lastUpdated;
    } else {
      timeStart = Math.floor(new Date(lastUpdated as string).getTime() / 1000);
    }
  }

  return { listings: allListings, total: allListings.length };
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
      expand: 'region,city,type,section,category,metro,material,rentTime,isNew,rooms,history,phoneProtected,parseId,isApartments,house',
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
  title: string;
  typeId: number;
  sectionId: number;
}

export interface InparsRegionRaw {
  id: number;
  title?: string;
  name?: string;
  parent_id?: number;
}

export interface InparsSectionRaw {
  id: number;
  typeId: number;
  title: string;
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
  dateUpdate?: string | number;
  dateUpdated?: string | number;
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

/** Преобразовать сырое объявление Inpars в Ad */
export function transformInparsListing(raw: InparsListingRaw): Ad {
  const source = raw.source || (raw.sourceId ? INPARS_SOURCE_NAMES[raw.sourceId] : null) || 'unknown';
  const pricePerMeter = raw.cost && raw.sq ? Math.round(raw.cost / raw.sq) : null;

  // Отладка: проверяем наличие координат
  if (!raw.lat || !raw.lng) {
    console.warn('[Inpars] No coordinates for listing', raw.id, 'keys:', Object.keys(raw).filter(k => k.toLowerCase().includes('lat') || k.toLowerCase().includes('lng') || k.toLowerCase().includes('geo') || k.toLowerCase().includes('point')));
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
