/**
 * Сервис S3-фотоархива.
 *
 * Управляет:
 * — локальным кешем маппингов original_url → s3_url (IndexedDB)
 * — отправкой батчей URL на сервер для архивации
 * — опросом статуса батчей
 * — восстановлением незавершённых батчей после перезапуска браузера
 */

import { db } from '@/db/database';
import {
  submitPhotoArchiveBatch,
  getPhotoArchiveBatchStatus,
  getPhotoArchiveMappings,
  type BatchStatus,
} from './api-service';

const PENDING_KEY = 'photo_archive_pending_batches';

interface PendingBatch {
  id: number;
  startedAt: number;
}

class PhotoArchiveService {
  /**
   * Получить S3-URL для массива оригинальных URL из локального кеша.
   * Возвращает Map только для найденных URL.
   */
  async resolveCached(urls: string[]): Promise<Map<string, string>> {
    if (urls.length === 0) return new Map();
    const uniqueUrls = [...new Set(urls)];
    const result = new Map<string, string>();

    try {
      const table = db.table<{ original_url: string; s3_url: string }>('archived_photos');
      const records = await table
        .where('original_url')
        .anyOf(uniqueUrls)
        .toArray();
      for (const r of records) {
        if (r.s3_url) result.set(r.original_url, r.s3_url);
      }
    } catch (e) {
      console.warn('photoArchive.resolveCached error:', e);
    }

    return result;
  }

  /**
   * Отправить батч URL на сервер для архивации.
   * Сохраняет batch_id в chrome.storage.local для восстановления после перезапуска.
   * Возвращает batch_id или null если нечего архивировать.
   */
  async submitBatch(urls: string[]): Promise<number | null> {
    const uniqueUrls = [...new Set(urls.filter(u => u && u.startsWith('http')))];
    if (uniqueUrls.length === 0) return null;

    const resp = await submitPhotoArchiveBatch(uniqueUrls);
    if (!resp.batch_id) return null;

    const pending = await this.getPending();
    pending.push({ id: resp.batch_id, startedAt: Date.now() });
    await this.savePending(pending);

    return resp.batch_id;
  }

  /**
   * Опросить статус батча.
   */
  async pollBatch(batchId: number): Promise<BatchStatus> {
    return await getPhotoArchiveBatchStatus(batchId);
  }

  /**
   * Сохранить маппинги в IndexedDB.
   */
  async saveMappings(mappings: { original_url: string; s3_url: string }[]): Promise<void> {
    if (mappings.length === 0) return;
    const table = db.table<{ original_url: string; s3_url: string; archived_at: string }>('archived_photos');

    for (const m of mappings) {
      const existing = await table.where('original_url').equals(m.original_url).first();
      if (existing) {
        await table.update(existing.id!, { s3_url: m.s3_url, archived_at: new Date().toISOString() });
      } else {
        await table.add({
          original_url: m.original_url,
          s3_url: m.s3_url,
          archived_at: new Date().toISOString(),
        });
      }
    }
  }

  /**
   * При запуске расширения: проверить chrome.storage.local на незавершённые batch'и,
   * опросить сервер, применить готовые маппинги.
   *
   * Для батчей со статусом done — выкачать маппинги через /mappings (все обновлённые
   * после startedAt батча). Для processing — оставить в pending. Для error — убрать.
   */
  async resumePendingBatches(): Promise<void> {
    const pending = await this.getPending();
    if (pending.length === 0) return;

    const stillPending: PendingBatch[] = [];

    for (const p of pending) {
      try {
        const status = await this.pollBatch(p.id);
        const batchStatus = status.batch.status;

        if (batchStatus === 'done') {
          // Выкачать маппинги, обновлённые после startedAt
          await this.downloadMappings(new Date(p.startedAt).toISOString());
        } else if (batchStatus === 'processing' || batchStatus === 'pending') {
          stillPending.push(p);
        }
        // error — убираем из pending, не загружаем
      } catch (e) {
        console.warn(`photoArchive.resumePendingBatches: batch ${p.id} poll failed:`, e);
        stillPending.push(p);
      }
    }

    await this.savePending(stillPending);
  }

  /**
   * Выкачать все маппинги с сервера и сохранить в IndexedDB.
   * Используется при первом запуске или восстановлении.
   */
  async downloadMappings(since?: string): Promise<number> {
    let page = 1;
    let hasMore = true;
    let total = 0;

    while (hasMore) {
      const resp = await getPhotoArchiveMappings(since, page);
      if (resp.data.length > 0) {
        await this.saveMappings(resp.data);
        total += resp.data.length;
      }
      hasMore = resp.has_more;
      page = resp.next_page;
    }

    return total;
  }

  /**
   * Подсчитать количество заархивированных фото в локальном кеше.
   */
  async getCachedCount(): Promise<number> {
    try {
      return await db.table('archived_photos').count();
    } catch {
      return 0;
    }
  }

  private async getPending(): Promise<PendingBatch[]> {
    return new Promise((resolve) => {
      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        chrome.storage.local.get(PENDING_KEY, (result) => {
          const raw = (result as Record<string, unknown>)[PENDING_KEY];
          resolve(Array.isArray(raw) ? raw as PendingBatch[] : []);
        });
      } else {
        resolve([]);
      }
    });
  }

  private async savePending(pending: PendingBatch[]): Promise<void> {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      chrome.storage.local.set({ [PENDING_KEY]: pending });
    }
  }
}

export const photoArchiveService = new PhotoArchiveService();
