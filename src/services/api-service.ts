import { getDeviceId } from './device-service';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://admin.test/api';

/** Базовый домен для share-ссылок (без /api) */
export const APP_BASE_URL = API_BASE_URL.replace(/\/api\/?$/, '');

// === Interfaces ===

interface ApiResponse<T = unknown> {
  data: T;
  error?: string;
  errors?: Record<string, string[]>;
}

interface User {
  id: number;
  name: string;
  email: string;
  status: string;
  created_at: string;
}

interface UserModule {
  code: string;
  name: string;
  status: string;
  expires_at: string | null;
  regions: string[];
}

export interface ModuleInfo {
  id: number;
  code: string;
  name: string;
  description: string | null;
  icon: string | null;
  price_30d: number | null;
  price_90d: number | null;
  price_180d: number | null;
  price_365d: number | null;
  trial_days: number;
  has_regional_pricing: boolean;
  trial_available: boolean;
  regional_prices: Record<string, Record<string, number>> | null;
  available_regions: { code: string; name: string }[] | null;
  access: {
    status: string;
    period: string;
    expires_at: string | null;
    regions: string[];
    source: 'personal' | 'company';
    license_type?: string;
  } | null;
  pending_payment: {
    id: number;
    period: string;
    amount: number;
    region_codes: string[] | null;
    created_at: string;
  } | null;
}

export interface ManifestFile {
  id: number;
  region_code: string;
  region_name: string;
  year: number;
  quarter: number;
  records: number;
  size: number;
  url: string;
}

// === Token storage ===

let authToken: string | null = null;
let refreshTokenValue: string | null = null;
let currentUser: User | null = null;
let onUnauthorizedCallback: (() => void) | null = null;

// Сохранённые credentials для авто-логина
let savedEmail: string | null = null;
let savedPassword: string | null = null;

export function onUnauthorized(callback: () => void): void {
  onUnauthorizedCallback = callback;
}

const TOKEN_KEY = 'ret_auth_token';
const REFRESH_TOKEN_KEY = 'ret_refresh_token';
const USER_KEY = 'ret_current_user';
const CREDENTIALS_KEY = 'ret_saved_credentials';

async function saveAuth(token: string, refresh: string, user: User): Promise<void> {
  authToken = token;
  refreshTokenValue = refresh;
  currentUser = user;
  return new Promise((resolve) => {
    chrome.storage.local.set({
      [TOKEN_KEY]: token,
      [REFRESH_TOKEN_KEY]: refresh,
      [USER_KEY]: JSON.stringify(user),
    }, () => resolve());
  });
}

function saveCredentials(email: string, password: string): void {
  savedEmail = email;
  savedPassword = password;
  chrome.storage.local.set({
    [CREDENTIALS_KEY]: JSON.stringify({ email, password }),
  });
}

function clearCredentials(): void {
  savedEmail = null;
  savedPassword = null;
  chrome.storage.local.remove(CREDENTIALS_KEY);
}

async function loadCredentials(): Promise<{ email: string; password: string } | null> {
  if (savedEmail && savedPassword) {
    return { email: savedEmail, password: savedPassword };
  }
  return new Promise((resolve) => {
    chrome.storage.local.get(CREDENTIALS_KEY, (result: any) => {
      const raw = result?.[CREDENTIALS_KEY];
      if (!raw) { resolve(null); return; }
      try {
        const creds = JSON.parse(raw);
        savedEmail = creds.email;
        savedPassword = creds.password;
        resolve(creds);
      } catch {
        resolve(null);
      }
    });
  });
}

export async function loadAuth(): Promise<{ token: string | null; refresh: string | null; user: User | null }> {
  if (authToken && currentUser) {
    return { token: authToken, refresh: refreshTokenValue, user: currentUser };
  }

  return new Promise((resolve) => {
    chrome.storage.local.get([TOKEN_KEY, REFRESH_TOKEN_KEY, USER_KEY], (result: any) => {
      authToken = result?.[TOKEN_KEY] || null;
      refreshTokenValue = result?.[REFRESH_TOKEN_KEY] || null;
      const userStr = result?.[USER_KEY] || null;
      currentUser = userStr ? JSON.parse(userStr) : null;
      resolve({ token: authToken, refresh: refreshTokenValue, user: currentUser });
    });
  });
}

export async function clearAuth(): Promise<void> {
  authToken = null;
  refreshTokenValue = null;
  currentUser = null;
  return new Promise((resolve) => {
    chrome.storage.local.remove([TOKEN_KEY, REFRESH_TOKEN_KEY, USER_KEY], () => resolve());
  });
}

export function getCurrentUser(): User | null {
  return currentUser;
}

// === API requests ===

export async function apiRequest<T>(
  method: string,
  path: string,
  body?: Record<string, unknown>,
  retry = true
): Promise<T> {
  const deviceId = await getDeviceId();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }
  if (deviceId) {
    headers['X-Device-ID'] = deviceId;
  }

  const options: RequestInit = {
    method,
    headers,
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, options);

  if (response.status === 401) {
    if (retry && refreshTokenValue) {
      const refreshed = await refreshAuthToken();
      if (refreshed) {
        return apiRequest<T>(method, path, body, false);
      }
    }
    // Refresh failed — try auto-login with saved credentials
    if (retry) {
      const creds = await loadCredentials();
      if (creds) {
        try {
          await login(creds.email, creds.password);
          return apiRequest<T>(method, path, body, false);
        } catch {
          // Auto-login failed
        }
      }
    }
    // All attempts failed — clear auth and redirect
    await clearAuth();
    onUnauthorizedCallback?.();
    throw { status: 401, message: 'Требуется авторизация', error: 'unauthorized' };
  }

  // Check if response is HTML instead of JSON
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('text/html')) {
    throw { status: response.status, message: `Ошибка сервера (${response.status})`, error: 'server_error' };
  }

  const data = await response.json();

  if (!response.ok) {
    throw { status: response.status, ...data };
  }

  return data as T;
}

async function refreshAuthToken(): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshTokenValue }),
    });

    if (!response.ok) return false;

    const data = await response.json();
    authToken = data.token;
    refreshTokenValue = data.refresh_token;

    await new Promise<void>((resolve) => {
      chrome.storage.local.set({
        [TOKEN_KEY]: authToken!,
        [REFRESH_TOKEN_KEY]: refreshTokenValue!,
      }, () => resolve());
    });

    return true;
  } catch {
    return false;
  }
}

// === Public API ===

export async function login(email: string, password: string): Promise<{
  user: User;
  token: string;
  refresh_token: string;
  device: { is_new: boolean };
  devices: { current: number; max: number };
  modules: UserModule[];
}> {
  const deviceId = await getDeviceId();
  const data = await apiRequest<{
    user: User;
    token: string;
    refresh_token: string;
    device: { is_new: boolean };
    devices: { current: number; max: number };
    modules: UserModule[];
  }>('POST', '/auth/login', {
    email,
    password,
    device_id: deviceId,
    device_name: navigator.userAgent,
  });

  await saveAuth(data.token, data.refresh_token, data.user);
  saveCredentials(email, password);
  return data;
}

export async function forgotPassword(email: string): Promise<{ message: string }> {
  return apiRequest<{ message: string }>('POST', '/auth/forgot-password', { email });
}

export async function resetPassword(token: string, email: string, password: string, passwordConfirmation: string): Promise<{ message: string }> {
  return apiRequest<{ message: string }>('POST', '/auth/reset-password', {
    token,
    email,
    password,
    password_confirmation: passwordConfirmation,
  });
}

export async function getMe(): Promise<{ user: User; devices: { current: number; max: number } }> {
  return apiRequest<{ user: User; devices: { current: number; max: number } }>('GET', '/auth/me');
}

export async function logout(): Promise<void> {
  try {
    await apiRequest<{ message: string }>('POST', '/auth/logout');
  } finally {
    await clearAuth();
    clearCredentials();
  }
}

export async function unlinkDevice(deviceId: string): Promise<{ message: string }> {
  return apiRequest<{ message: string }>('POST', '/auth/unlink-device', { device_id: deviceId });
}

export async function getModules(): Promise<{ modules: ModuleInfo[]; is_company_admin: boolean; company_name: string | null }> {
  return apiRequest<{ modules: ModuleInfo[]; is_company_admin: boolean; company_name: string | null }>('GET', '/modules');
}

export async function getManifest(moduleCode: string): Promise<{ files: ManifestFile[] }> {
  return apiRequest<{ files: ManifestFile[] }>('GET', `/data/manifest?module=${moduleCode}`);
}

export async function logImport(fileId: number): Promise<{ ok: boolean }> {
  return apiRequest<{ ok: boolean }>('POST', '/data/log', { file_id: fileId });
}

export function getDownloadUrl(fileId: number): string {
  return `${API_BASE_URL}/data/download/${fileId}`;
}

export function getAuthHeader(): string | null {
  if (authToken) {
    return `Bearer ${authToken}`;
  }
  return null;
}

// === Cadastral Quarters ===

export interface CadastralManifestQuarter {
  id: number;
  cad_number: string;
  center_lat: number | null;
  center_lon: number | null;
}

export interface CadastralBatchQuarter {
  id: number;
  cad_number: string;
  geojson: GeoJSON.Feature<GeoJSON.Polygon>;
  center_lat: number | null;
  center_lon: number | null;
}

export async function getCadastralManifest(moduleCode: string, regions?: string[]): Promise<{
  quarters: CadastralManifestQuarter[];
  total: number;
}> {
  const params = new URLSearchParams({ module: moduleCode });
  if (regions?.length) {
    regions.forEach(r => params.append('regions[]', r));
  }
  return apiRequest<{ quarters: CadastralManifestQuarter[]; total: number }>(
    'GET',
    `/data/cadastral/manifest?${params}`
  );
}

export async function getCadastralBatch(ids: number[], moduleCode: string): Promise<{
  quarters: CadastralBatchQuarter[];
}> {
  return apiRequest<{ quarters: CadastralBatchQuarter[] }>(
    'POST',
    '/data/cadastral/batch',
    { ids, module: moduleCode }
  );
}

// === News ===

export interface NewsItem {
  id: number;
  title: string;
  content: string;
  excerpt: string;
  image_url: string | null;
  module: { id: number; name: string; icon: string | null } | null;
  is_published: boolean;
  published_at: string | null;
  likes_count: number;
  dislikes_count: number;
  comments_count: number;
  my_reaction: 'like' | 'dislike' | null;
}

export interface NewsComment {
  id: number;
  content: string;
  user_name: string;
  created_at: string;
  likes_count: number;
  dislikes_count: number;
  my_reaction: 'like' | 'dislike' | null;
}

export async function getNews(page = 1, perPage = 15): Promise<{
  news: NewsItem[];
  meta: { current_page: number; last_page: number; per_page: number; total: number };
}> {
  return apiRequest('GET', `/news?page=${page}&per_page=${perPage}`);
}

export async function getNewsDetail(id: number): Promise<{ news: NewsItem }> {
  return apiRequest('GET', `/news/${id}`);
}

export async function reactToNews(newsId: number, reaction: 'like' | 'dislike'): Promise<{
  likes_count: number;
  dislikes_count: number;
  my_reaction: 'like' | 'dislike' | null;
}> {
  return apiRequest('POST', `/news/${newsId}/react`, { reaction });
}

export async function getNewsComments(newsId: number, page = 1): Promise<{
  comments: NewsComment[];
  meta: { current_page: number; last_page: number; total: number };
}> {
  return apiRequest('GET', `/news/${newsId}/comments?page=${page}`);
}

export async function createNewsComment(newsId: number, content: string): Promise<{ comment: NewsComment }> {
  return apiRequest('POST', `/news/${newsId}/comments`, { content });
}

export async function reactToComment(commentId: number, reaction: 'like' | 'dislike'): Promise<{
  likes_count: number;
  dislikes_count: number;
  my_reaction: 'like' | 'dislike' | null;
}> {
  return apiRequest('POST', `/comments/${commentId}/react`, { reaction });
}

export async function getNewsUnreadCount(): Promise<{ unread_count: number }> {
  return apiRequest('GET', '/news/unread-count');
}

export async function markNewsRead(): Promise<{ unread_count: number }> {
  return apiRequest('POST', '/news/mark-read');
}

// === Instructions ===

export interface Instruction {
  id: number;
  title: string;
  content: string | null;
  video_url: string | null;
  video_embed_url: string | null;
  image_url: string | null;
}

export interface InstructionCategory {
  id: number;
  name: string;
  slug: string;
  icon: string | null;
  instructions: Instruction[];
}

export async function getInstructions(): Promise<{ categories: InstructionCategory[] }> {
  return apiRequest<{ categories: InstructionCategory[] }>('GET', '/instructions');
}

// === Feedback Links ===

export interface FeedbackLink {
  id: number;
  label: string;
  url: string;
}

export async function getFeedbackLinks(): Promise<{ links: FeedbackLink[] }> {
  return apiRequest('GET', '/feedback-links');
}

// === Saved Filters (server sync) ===

export interface SavedFilterGroupServer {
  id: number;
  name: string;
  color: string;
  sort_order: number;
  is_collapsed: boolean;
  filters_count?: number;
  created_at: string;
  updated_at: string;
}

export interface SavedFilterServer {
  id: number;
  saved_filter_group_id: number | null;
  name: string;
  filter_data: Record<string, unknown>;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

// Filter Groups
export async function getFilterGroups(): Promise<SavedFilterGroupServer[]> {
  return apiRequest<SavedFilterGroupServer[]>('GET', '/user/filter-groups');
}

export async function createFilterGroup(data: {
  name: string;
  color?: string;
  sort_order?: number;
}): Promise<SavedFilterGroupServer> {
  return apiRequest<SavedFilterGroupServer>('POST', '/user/filter-groups', data as Record<string, unknown>);
}

export async function updateFilterGroup(id: number, data: {
  name?: string;
  color?: string;
  sort_order?: number;
  is_collapsed?: boolean;
}): Promise<SavedFilterGroupServer> {
  return apiRequest<SavedFilterGroupServer>('PUT', `/user/filter-groups/${id}`, data as Record<string, unknown>);
}

export async function deleteFilterGroup(id: number): Promise<{ deleted: boolean }> {
  return apiRequest<{ deleted: boolean }>('DELETE', `/user/filter-groups/${id}`);
}

// Saved Filters
export async function getSavedFilters(): Promise<SavedFilterServer[]> {
  return apiRequest<SavedFilterServer[]>('GET', '/user/saved-filters');
}

export async function createSavedFilter(data: {
  name: string;
  saved_filter_group_id?: number | null;
  filter_data: Record<string, unknown>;
  sort_order?: number;
}): Promise<SavedFilterServer> {
  return apiRequest<SavedFilterServer>('POST', '/user/saved-filters', data as Record<string, unknown>);
}

export async function updateSavedFilter(id: number, data: {
  name?: string;
  saved_filter_group_id?: number | null;
  filter_data?: Record<string, unknown>;
  sort_order?: number;
}): Promise<SavedFilterServer> {
  return apiRequest<SavedFilterServer>('PUT', `/user/saved-filters/${id}`, data as Record<string, unknown>);
}

export async function deleteSavedFilter(id: number): Promise<{ deleted: boolean }> {
  return apiRequest<{ deleted: boolean }>('DELETE', `/user/saved-filters/${id}`);
}

export async function reorderSavedFilters(items: Array<{
  id: number;
  group_id?: number | null;
  sort_order: number;
}>): Promise<{ updated: boolean }> {
  return apiRequest<{ updated: boolean }>('PUT', '/user/saved-filters/reorder', { items });
}

// === Shared Views (Поделиться фильтром) ===

export interface SharedViewMeta {
  id: number;
  token: string;
  title: string;
  has_password: boolean;
  expires_at: string | null;
  is_expired: boolean;
  data_size: number;
  created_at: string;
  updated_at: string;
}

export interface SharedViewPayload {
  title: string;
  password?: string | null;
  expires_in?: 7 | 30 | 90 | null;
  data: unknown;
}

export interface SharedViewCreated {
  id: number;
  token: string;
  title: string;
  url: string;
  expires_at: string | null;
  created_at: string;
}

export interface SharedViewUpdated {
  id: number;
  token: string;
  title: string;
  has_password: boolean;
  expires_at: string | null;
  updated_at: string;
}

export async function listSharedViews(): Promise<SharedViewMeta[]> {
  return apiRequest<SharedViewMeta[]>('GET', '/user/shared-views');
}

export async function createSharedView(payload: SharedViewPayload): Promise<SharedViewCreated> {
  return apiRequest<SharedViewCreated>('POST', '/user/shared-views', payload as unknown as Record<string, unknown>);
}

export async function updateSharedView(id: number, payload: Partial<SharedViewPayload> & { clear_password?: boolean }): Promise<SharedViewUpdated> {
  return apiRequest<SharedViewUpdated>('PUT', `/user/shared-views/${id}`, payload as unknown as Record<string, unknown>);
}

export async function deleteSharedView(id: number): Promise<{ deleted: boolean }> {
  return apiRequest<{ deleted: boolean }>('DELETE', `/user/shared-views/${id}`);
}

// === Addresses ===

export interface AddressResponse {
  id: number;
  house_id: string | null;
  address: string;
  lat: number;
  lon: number;
  region: string | null;
  type: string;
  cadno: string | null;
  house_type: string | null;
  serie: string | null;
  house_series_id: string | null;
  house_class_id: string | null;
  wall_material_id: string | null;
  ceiling_material_id: string | null;
  house_problem_id: string | null;
  levels: number | null;
  build_year: number | null;
  entrances_count: number | null;
  living_spaces_count: number | null;
  area_total: number | null;
  area_live: number | null;
  ceiling_height: string | null;
  gas_supply: boolean | null;
  individual_heating: boolean | null;
  has_playground: boolean;
  has_sports_area: boolean;
  comment: string | null;
  source: string;
  updated_at: string;
}

export interface AddressesListResponse {
  addresses: AddressResponse[];
  total: number;
  updated_at: string | null;
}

export interface AddressRefsResponse {
  house_series: { id: string; name: string; build_years: string | null }[];
  house_classes: { id: string; name: string; rating: number | null; color: string | null }[];
  wall_materials: { id: string; name: string; color: string | null }[];
  ceiling_materials: { id: string; name: string }[];
  house_problems: { id: string; name: string; color: string | null }[];
}

export async function getAddresses(regions?: string[], updatedSince?: string): Promise<AddressesListResponse> {
  const params = new URLSearchParams();
  if (regions && regions.length > 0) {
    regions.forEach(r => params.append('region[]', r));
  }
  if (updatedSince) params.set('updated_since', updatedSince);
  const query = params.toString();
  const path = `/addresses${query ? '?' + query : ''}`;
  return apiRequest<AddressesListResponse>('GET', path);
}

export async function getAddressRefs(): Promise<AddressRefsResponse> {
  return apiRequest<AddressRefsResponse>('GET', '/addresses/refs');
}

export async function getAddressesStats(): Promise<{ total: number; by_region: Record<string, number>; last_updated: string | null }> {
  return apiRequest<{ total: number; by_region: Record<string, number>; last_updated: string | null }>('GET', '/addresses/stats');
}

export async function postAddresses(addresses: Record<string, unknown>[]): Promise<{ synced: number }> {
  return apiRequest<{ synced: number }>('POST', '/addresses', { addresses });
}

export interface AddressChangeResponse {
  id: number;
  address_id: number | null;
  change_type: 'create' | 'update';
  status: 'pending' | 'approved' | 'rejected';
  admin_comment: string | null;
  created_at: string;
  reviewed_at: string | null;
}

export async function postAddressChanges(changes: Record<string, unknown>[]): Promise<{ created: number }> {
  return apiRequest<{ created: number }>('POST', '/address-changes', { changes });
}

export async function getAddressChanges(): Promise<{ changes: AddressChangeResponse[] }> {
  return apiRequest<{ changes: AddressChangeResponse[] }>('GET', '/address-changes');
}

// === Company Heartbeat ===

export async function sendCompanyHeartbeat(moduleCode: string): Promise<{
  ok: boolean;
  license_type?: string;
  active_users?: number;
  max_seats?: number;
  error?: string;
}> {
  try {
    return await apiRequest('POST', '/company/heartbeat', { module_code: moduleCode });
  } catch {
    return { ok: false, error: 'heartbeat_failed' };
  }
}

// === Dedup Feedback ===

interface DedupFeedbackPayload {
  id: number;
  property_type: string | null;
  floor: number | null;
  floors_total: number | null;
  area_total: number | null;
  area_living: number | null;
  area_kitchen: number | null;
  rooms: number | null;
  price: number | null;
  description: string;
  phone: string | null;
  seller_name: string | null;
  photos: string[];
  source: string | null;
  created: string | null;
  updated: string | null;
}

/**
 * Отправка одной пары фидбека по дедупликации (merge/split).
 */
async function sendDedupFeedbackPair(
  action: 'merge' | 'split',
  adA: DedupFeedbackPayload,
  adB: DedupFeedbackPayload,
  context?: Record<string, unknown>
): Promise<void> {
  await apiRequest('POST', '/dedup-feedback', { action, ad_a: adA, ad_b: adB, context });
}

/**
 * Отправка фидбека по всем парам из массива объявлений.
 * Для N объявлений отправляется N*(N-1)/2 пар.
 * Silent: ошибки логируются, но не прерывают работу.
 */
export async function sendDedupFeedbackBatch(
  action: 'merge' | 'split',
  ads: Array<{
    id: number;
    property_type: string | null;
    floor: number | null;
    floors_total: number | null;
    area_total: number | null;
    area_living: number | null;
    area_kitchen: number | null;
    rooms: number | null;
    price: number | null;
    description?: string;
    phone?: string | null;
    seller_name?: string | null;
    photos?: string[];
    source?: string | null;
    created?: string | null;
    updated?: string | null;
  }>,
  context?: Record<string, unknown>
): Promise<void> {
  const payloads: DedupFeedbackPayload[] = ads.map(ad => ({
    id: ad.id,
    property_type: ad.property_type ?? null,
    floor: ad.floor ?? null,
    floors_total: ad.floors_total ?? null,
    area_total: ad.area_total ?? null,
    area_living: ad.area_living ?? null,
    area_kitchen: ad.area_kitchen ?? null,
    rooms: ad.rooms ?? null,
    price: ad.price ?? null,
    description: ad.description || '',
    phone: ad.phone ?? null,
    seller_name: ad.seller_name ?? null,
    photos: ad.photos || [],
    source: ad.source ?? null,
    created: ad.created ?? null,
    updated: ad.updated ?? null,
  }));

  const promises: Promise<void>[] = [];
  for (let i = 0; i < payloads.length; i++) {
    for (let j = i + 1; j < payloads.length; j++) {
      promises.push(
        sendDedupFeedbackPair(action, payloads[i], payloads[j], context)
          .catch(err => console.warn('Dedup feedback error:', err))
      );
    }
  }
  await Promise.allSettled(promises);
}
