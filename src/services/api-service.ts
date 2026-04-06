import { getDeviceId } from './device-service';

const API_BASE_URL = 'http://admin.test/api';

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
  price_monthly: number | null;
  price_yearly: number | null;
  price_lifetime: number | null;
  access: {
    status: string;
    period: string;
    expires_at: string | null;
    regions: string[];
  } | null;
  pending_payment: {
    id: number;
    period: string;
    amount: number;
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

export function onUnauthorized(callback: () => void): void {
  onUnauthorizedCallback = callback;
}

const TOKEN_KEY = 'ret_auth_token';
const REFRESH_TOKEN_KEY = 'ret_refresh_token';
const USER_KEY = 'ret_current_user';

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

async function apiRequest<T>(
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
    // Refresh failed or no token — clear auth and redirect
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
  return data;
}

export async function register(name: string, email: string, password: string, passwordConfirmation: string): Promise<{
  user: User;
  token: string;
  refresh_token: string;
}> {
  const data = await apiRequest<{
    user: User;
    token: string;
    refresh_token: string;
  }>('POST', '/auth/register', {
    name,
    email,
    password,
    password_confirmation: passwordConfirmation,
  });

  await saveAuth(data.token, data.refresh_token, data.user);
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
  }
}

export async function unlinkDevice(deviceId: string): Promise<{ message: string }> {
  return apiRequest<{ message: string }>('POST', '/auth/unlink-device', { device_id: deviceId });
}

export async function getModules(): Promise<{ modules: ModuleInfo[] }> {
  return apiRequest<{ modules: ModuleInfo[] }>('GET', '/modules');
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

// === Payments ===

export interface PaymentInfo {
  id: number;
  module_id: number;
  module_name: string;
  module_icon: string | null;
  period: 'monthly' | 'yearly' | 'lifetime';
  amount: number;
  currency: string;
  status: 'pending' | 'completed' | 'failed' | 'refunded';
  created_at: string;
  paid_at: string | null;
}

export async function createPayment(moduleId: number, period: 'monthly' | 'yearly' | 'lifetime', promoCode?: string): Promise<{ payment: PaymentInfo }> {
  const body: Record<string, unknown> = { module_id: moduleId, period };
  if (promoCode) body.promo_code = promoCode;
  return apiRequest<{ payment: PaymentInfo }>('POST', '/payments', body);
}

export interface PromoCheckResult {
  valid: boolean;
  discount_type?: 'percent' | 'fixed';
  discount_value?: number;
  original_amount?: number;
  discount?: number;
  final_amount?: number;
  description?: string;
  error?: string;
}

export async function checkPromo(code: string, moduleId: number, period: 'monthly' | 'yearly' | 'lifetime'): Promise<PromoCheckResult> {
  return apiRequest<PromoCheckResult>('POST', '/payments/promo/check', { code, module_id: moduleId, period });
}

export async function getPayments(): Promise<{ payments: PaymentInfo[] }> {
  return apiRequest<{ payments: PaymentInfo[] }>('GET', '/payments');
}

export async function cancelPayment(paymentId: number): Promise<{ message: string }> {
  return apiRequest<{ message: string }>('POST', `/payments/${paymentId}/cancel`);
}
