/**
 * Сервис S3-фотоархива — client-side архивация.
 *
 * Архивация выполняется в браузере:
 * 1. fetch() фото с CDN (IP пользователя — нет риска бана серверного IP)
 * 2. Canvas API: resize → WebP (без серверного GD)
 * 3. uploadArchivedPhoto() — сервер принимает готовый WebP и заливает в S3
 *
 * Локальный кеш маппингов original_url → s3_url хранится в IndexedDB.
 */

import { db } from '@/db/database';
import {
  uploadArchivedPhoto,
  getPhotoArchiveMappings,
} from './api-service';

const MAX_DIMENSION = 1280;
const WEBP_QUALITY = 0.8;
const CONCURRENCY = 3;

export interface ArchiveProgress {
  processed: number;
  total: number;
  succeeded: number;
  failed: number;
}

type ProgressCallback = (progress: ArchiveProgress) => void;

class PhotoArchiveService {
  private cancelled = false;

  /**
   * Получить S3-URL для массива оригинальных URL из локального кеша (IndexedDB).
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
   * Архивировать массив URL: скачать → WebP → загрузить на сервер.
   *
   * @param urls Список оригинальных URL для архивации
   * @param onProgress Колбэк прогресса (вызывается после каждого фото)
   * @returns Карта успешных маппингов original_url → s3_url
   */
  async archivePhotos(
    urls: string[],
    onProgress?: ProgressCallback,
  ): Promise<Map<string, string>> {
    this.cancelled = false;

    const uniqueUrls = [...new Set(urls.filter(u => u && u.startsWith('http')))];
    const total = uniqueUrls.length;
    let processed = 0;
    let succeeded = 0;
    let failed = 0;

    const results = new Map<string, string>();

    const report = () => {
      onProgress?.({ processed, total, succeeded, failed });
    };

    report();

    // Пул с ограниченной конкурентностью
    let index = 0;

    const worker = async () => {
      while (index < uniqueUrls.length && !this.cancelled) {
        const url = uniqueUrls[index++];
        try {
          const s3Url = await this.archiveOnePhoto(url);
          if (s3Url) {
            results.set(url, s3Url);
            succeeded++;
          }
        } catch (e) {
          console.warn('photoArchive: failed to archive', url, e);
          failed++;
        }
        processed++;
        report();
      }
    };

    const workers = Array.from({ length: Math.min(CONCURRENCY, uniqueUrls.length) }, () => worker());
    await Promise.all(workers);

    return results;
  }

  /**
   * Остановить архивацию (мягкая остановка — текущие фото доработаются).
   */
  cancelArchive(): void {
    this.cancelled = true;
  }

  /**
   * Архивировать одно фото: скачать → WebP → загрузить.
   */
  private async archiveOnePhoto(url: string): Promise<string | null> {
    // 1. Скачать
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const blob = await response.blob();

    if (blob.size < 100) {
      throw new Error('Фото слишком мало (возможно, заглушка)');
    }

    // 2. Конвертировать в WebP
    const webpBlob = await this.convertToWebP(blob);

    // 3. Загрузить на сервер
    const result = await uploadArchivedPhoto(url, webpBlob);

    // 4. Сохранить в IndexedDB
    await this.saveMappings([{ original_url: url, s3_url: result.s3_url }]);

    return result.s3_url;
  }

  /**
   * Конвертировать изображение в WebP через Canvas API.
   * Resize до MAX_DIMENSION по большей стороне.
   */
  private async convertToWebP(blob: Blob): Promise<Blob> {
    const bitmap = await createImageBitmap(blob);

    let width = bitmap.width;
    let height = bitmap.height;

    if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
      const ratio = Math.min(MAX_DIMENSION / width, MAX_DIMENSION / height);
      width = Math.round(width * ratio);
      height = Math.round(height * ratio);
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context недоступен');
    ctx.drawImage(bitmap, 0, 0, width, height);

    bitmap.close?.();

    return new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (result) => {
          if (result) {
            resolve(result);
          } else {
            reject(new Error('Canvas.toBlob вернул null'));
          }
        },
        'image/webp',
        WEBP_QUALITY,
      );
    });
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
   * Выкачать все маппинги с сервера и сохранить в IndexedDB.
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
}

export const photoArchiveService = new PhotoArchiveService();
