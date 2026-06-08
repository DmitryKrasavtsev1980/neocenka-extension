/**
 * Data Request Service — запросы данных объявлений через сервер Неоценка
 */

import { apiRequest } from './api-service';
import { transformListing } from './listing-transform';
import { adsRepository } from '@/db/repositories/ads.repository';
import type { ListingRaw } from './listing-transform';

// === Interfaces ===

export interface DataRequestCreateParams {
  regionId?: number;
  regionName?: string;
  polygons?: [number, number][][];
  categoryId?: number | string;
  sourceId?: number | string;
  sellerType?: string;
  timeStart?: number;
  timeEnd?: number;
  isNew?: number;
}

export interface DataRequestStatus {
  id: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  filters: Record<string, unknown>;
  total_records: number;
  pages_fetched: number;
  result_file_size: number;
  download_url: string | null;
  error_message: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  expires_at: string | null;
}

export interface RegionAdmin {
  source_id: number;
  title: string | null;
  name: string | null;
  parent_id: number | null;
}

export interface CategoryAdmin {
  source_id: number;
  title: string;
  type_id: number | null;
  section_id: number | null;
}

export interface SourceAdmin {
  id: number;
  code: string;
  name: string;
}

// === API Functions ===

/** Создать запрос данных */
export async function createDataRequest(
  params: DataRequestCreateParams,
): Promise<DataRequestStatus> {
  const result = await apiRequest<{ data_request: DataRequestStatus }>(
    'POST',
    '/data-requests',
    params as Record<string, unknown>,
  );
  return result.data_request;
}

/** Получить статус запроса */
export async function getDataRequestStatus(id: number): Promise<DataRequestStatus> {
  const result = await apiRequest<{ data_request: DataRequestStatus }>(
    'GET',
    `/data-requests/${id}`,
  );
  return result.data_request;
}

/** Список запросов пользователя */
export async function getDataRequests(
  page = 1,
  status?: string,
): Promise<{
  data: DataRequestStatus[];
  current_page: number;
  last_page: number;
  total: number;
}> {
  let path = `/data-requests?page=${page}`;
  if (status) path += `&status=${status}`;
  const result = await apiRequest<{
    data: DataRequestStatus[];
    current_page: number;
    last_page: number;
    total: number;
  }>('GET', path);
  return result;
}

/** Отменить запрос */
export async function cancelDataRequest(id: number): Promise<{ message: string }> {
  return apiRequest<{ message: string }>('POST', `/data-requests/${id}/cancel`);
}

/** Получить доступные регионы */
export async function getAvailableRegions(): Promise<RegionAdmin[]> {
  const resp = await apiRequest<{ regions: RegionAdmin[] }>('GET', '/data-sources/regions');
  return resp.regions;
}

/** Получить категории */
export async function getAvailableCategories(): Promise<CategoryAdmin[]> {
  const resp = await apiRequest<{ categories: CategoryAdmin[] }>('GET', '/data-sources/categories');
  return resp.categories;
}

/** Получить источники */
export async function getAvailableSources(): Promise<SourceAdmin[]> {
  const resp = await apiRequest<{ sources: SourceAdmin[] }>('GET', '/data-sources/sources');
  return resp.sources;
}

// === Polling ===

/** Polling: ждать завершения запроса */
export async function pollDataRequest(
  requestId: number,
  onProgress?: (status: DataRequestStatus) => void,
  intervalMs = 5000,
  timeoutMs = 600000, // 10 минут
): Promise<DataRequestStatus> {
  const startTime = Date.now();
  let failCount = 0;
  const MAX_FAIL_CHECKS = 3; // При failed проверим ещё 3 раза — вдруг job перезапустится

  while (Date.now() - startTime < timeoutMs) {
    const status = await getDataRequestStatus(requestId);
    onProgress?.(status);

    if (status.status === 'completed') {
      return status;
    }
    if (status.status === 'failed') {
      failCount++;
      if (failCount >= MAX_FAIL_CHECKS) {
        throw new Error(status.error_message || 'Запрос данных завершился ошибкой');
      }
      // Ждём дольше перед повторной проверкой — job может перезапуститься
      await new Promise((resolve) => setTimeout(resolve, intervalMs * 3));
      continue;
    }

    // Если статус сменился с failed обратно — сбрасываем счётчик
    failCount = 0;

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error('Превышено время ожидания запроса данных');
}

// === Download & Import ===

/** Скачать результат через прокси-сервер и импортировать в IndexedDB */
export async function downloadAndImportResult(
  requestId: number,
  _downloadUrl: string,
): Promise<{ inserted: number; updated: number; duplicates: number }> {
  // Скачиваем через наш API-прокси (чтобы обойти CORS с chrome-extension на S3)
  const data: { listings: ListingRaw[] } = await apiRequest('GET', `/data-requests/${requestId}/download`);
  const listings = data.listings || [];

  if (listings.length === 0) {
    return { inserted: 0, updated: 0, duplicates: 0 };
  }

  // Трансформируем и импортируем
  const ads = listings.map(transformListing);
  const result = await adsRepository.bulkInsert(ads);

  // Записываем в историю импортов
  await adsRepository.recordImport({
    source: 'server',
    params: JSON.stringify({ requestId, count: listings.length }),
    count: result.inserted,
    created_at: new Date().toISOString(),
  });

  return result;
}
