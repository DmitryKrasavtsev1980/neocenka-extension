/**
 * Сервис поиска дубликатов объявлений
 *
 * Алгоритм:
 * 1. Находим все неназначенные объявления (object_id is null)
 * 2. Берём первое по дате created
 * 3. Собираем все объявления с тем же address_id + property_type
 * 4. Отправляем на сервер POST /api/deduplicate
 * 5. Получаем группы, создаём AdObject для каждой, линкуем объявления
 * 6. Повторяем для следующего неназначенного
 */

import { db } from '@/db/database';
import { apiRequest } from '@/services/api-service';
import { recalculateObjectFromAds } from '@/services/ad-object-utils';
import type { Ad, AdObject } from '@/types';

// --- Типы ---

export interface DeduplicateAdPayload {
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

export interface DeduplicateGroup {
  ads: number[];
  confidence: 'high' | 'medium' | 'low' | 'single';
  match_details: string;
  ad_scores?: Record<string, number>;
}

export interface DeduplicateResponse {
  groups: DeduplicateGroup[];
}

export interface DeduplicateProgress {
  total: number;
  current: number;
  objectsCreated: number;
  adsGrouped: number;
  detail: string;
}

export type DeduplicateProgressCallback = (progress: DeduplicateProgress) => void;

export interface DeduplicateResult {
  total: number;
  objectsCreated: number;
  adsGrouped: number;
  errors: string[];
}

// --- Основная функция ---

export async function runDeduplication(
  onProgress?: DeduplicateProgressCallback,
  scopeAds?: Ad[],
): Promise<DeduplicateResult> {
  const result: DeduplicateResult = {
    total: 0,
    objectsCreated: 0,
    adsGrouped: 0,
    errors: [],
  };

  // 1. Если передан scopeAds — работаем только с ними, иначе со всеми из БД
  const allScopeAds = scopeAds ?? await db.ads.toArray();

  // Неназначенные объявления с адресом из scope
  const unassigned = allScopeAds
    .filter(ad => !ad.object_id && ad.address_id && ad.property_type && ad.floor != null)
    .sort((a, b) => (a.created || '').localeCompare(b.created || ''));
  result.total = unassigned.length;

  if (unassigned.length === 0) {
    onProgress?.({ total: 0, current: 0, objectsCreated: 0, adsGrouped: 0, detail: 'Нет неназначенных объявлений' });
    return result;
  }

  // Индекс scope-объявлений по address_id+property_type+floor для быстрого поиска кандидатов
  const scopeByAddressTypeFloor = new Map<string, Ad[]>();
  for (const ad of allScopeAds) {
    if (!ad.address_id || !ad.property_type || ad.floor == null) continue;
    const key = `${ad.address_id}|${ad.property_type}|${ad.floor}`;
    if (!scopeByAddressTypeFloor.has(key)) scopeByAddressTypeFloor.set(key, []);
    scopeByAddressTypeFloor.get(key)!.push(ad);
  }

  // Множество обработанных ID
  const processedIds = new Set<number>();

  for (let i = 0; i < unassigned.length; i++) {
    const seedAd = unassigned[i];

    // Пропускаем уже обработанные
    if (!seedAd.id || processedIds.has(seedAd.id)) continue;
    // Пропускаем без address_id, property_type или floor
    if (!seedAd.address_id || !seedAd.property_type || seedAd.floor == null) continue;

    onProgress?.({
      total: result.total,
      current: i + 1,
      objectsCreated: result.objectsCreated,
      adsGrouped: result.adsGrouped,
      detail: `Адрес: ${seedAd.address?.slice(0, 50) || `#${seedAd.id}`}`,
    });

    try {
      // 2. Собираем кандидатов из scope по address_id + property_type + floor
      const key = `${seedAd.address_id}|${seedAd.property_type}|${seedAd.floor}`;
      const candidates = scopeByAddressTypeFloor.get(key) ?? [];

      // Фильтруем: ещё не обработанные
      const batch = candidates.filter(a =>
        a.id && !processedIds.has(a.id)
      );

      if (batch.length === 0) continue;

      // 3. Формируем payload для сервера
      const payload: DeduplicateAdPayload[] = batch.map(ad => ({
        id: ad.id!,
        property_type: ad.property_type,
        floor: ad.floor,
        floors_total: ad.floors_total,
        area_total: ad.area_total,
        area_living: ad.area_living,
        area_kitchen: ad.area_kitchen,
        rooms: ad.rooms,
        price: ad.price,
        description: ad.description || '',
        phone: ad.phone || ad.seller_info?.phone || null,
        seller_name: ad.seller_name || ad.seller_info?.name || null,
        photos: ad.photos || [],
        source: ad.source || null,
        created: ad.created || null,
        updated: ad.updated || null,
      }));

      // 4. Отправляем на сервер
      const response = await apiRequest<DeduplicateResponse>('POST', '/deduplicate', { ads: payload });

      // 5. Обрабатываем группы
      for (const group of response.groups) {
        if (group.ads.length === 0) continue;

        // Получаем полные объекты объявлений
        const groupAds: Ad[] = [];
        for (const adId of group.ads) {
          const ad = batch.find(a => a.id === adId);
          if (ad) groupAds.push(ad);
        }

        if (groupAds.length === 0) continue;

        // Создаём AdObject
        const objectData = recalculateObjectFromAds(groupAds);
        const newObjectId = await db.table('ad_objects').add({
          ...objectData,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });

        // Привязываем все объявления группы к новому объекту
        for (const ad of groupAds) {
          if (ad.id) {
            const score = group.ad_scores?.[String(ad.id)];
            await db.ads.update(ad.id, {
              object_id: newObjectId as number,
              processing_status: 'processed',
              ...(score != null ? { dedup_score: Math.round(score * 100) / 100 } : {}),
            });
            processedIds.add(ad.id);
          }
        }

        result.objectsCreated++;
        result.adsGrouped += groupAds.length;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      result.errors.push(`Ad ${seedAd.id}: ${msg}`);
    }
  }

  onProgress?.({
    total: result.total,
    current: result.total,
    objectsCreated: result.objectsCreated,
    adsGrouped: result.adsGrouped,
    detail: `Готово: ${result.objectsCreated} объектов, ${result.adsGrouped} объявлений`,
  });

  return result;
}

