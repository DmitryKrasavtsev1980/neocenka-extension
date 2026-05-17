/**
 * Репозиторий объявлений — CRUD и поиск
 */

import { db } from '../database';
import type { Ad, AdSearchFilters, AdSearchResult, AdStats, AdImport } from '@/types';

export const adsRepository = {
  /** Массовая вставка с проверкой дублей по [source+external_id] */
  async bulkInsert(ads: Ad[], batchSize = 500): Promise<{ inserted: number; updated: number; duplicates: number }> {
    let inserted = 0;
    let updated = 0;
    let duplicates = 0;

    for (let i = 0; i < ads.length; i += batchSize) {
      const batch = ads.slice(i, i + batchSize);

      await db.transaction('rw', db.ads, async () => {
        for (const ad of batch) {
          const existing = await db.ads
            .where('[source+external_id]')
            .equals([ad.source, ad.external_id])
            .first();

          if (existing) {
            // Обновляем если есть изменения цены
            if (ad.price !== existing.price) {
              const priceHistory = [...(existing.price_history || [])];
              if (existing.price != null) {
                priceHistory.push({
                  date: new Date().toISOString(),
                  old_price: existing.price,
                  new_price: ad.price!,
                });
              }
              await db.ads.update(existing.id!, {
                price: ad.price,
                price_per_meter: ad.price_per_meter,
                price_history: priceHistory,
                updated_at: new Date().toISOString(),
                updated: ad.updated,
                status: ad.status,
              });
              updated++;
            } else {
              duplicates++;
            }
          } else {
            await db.ads.add(ad);
            inserted++;
          }
        }
      });
    }

    return { inserted, updated, duplicates };
  },

  /** Поиск с пагинацией и фильтрами */
  async search(filters: AdSearchFilters, page = 1, pageSize = 50): Promise<AdSearchResult> {
    let collection = db.ads.orderBy('updated').reverse();

    // Собираем все и фильтруем в памяти (IndexedDB ограничен в составных запросах)
    const allAds: Ad[] = [];
    await collection.each((ad) => {
      if (matchesFilters(ad, filters)) {
        allAds.push(ad);
      }
    });

    const total = allAds.length;
    const totalPages = Math.ceil(total / pageSize);
    const start = (page - 1) * pageSize;
    const ads = allAds.slice(start, start + pageSize);

    return { ads, total, page, pageSize, totalPages };
  },

  /** Все результаты для экспорта */
  async searchAll(filters: AdSearchFilters): Promise<Ad[]> {
    const result: Ad[] = [];
    await db.ads.each((ad) => {
      if (matchesFilters(ad, filters)) {
        result.push(ad);
      }
    });
    return result;
  },

  /** Получить уникальные значения для фильтров */
  async getFilterOptions(): Promise<{
    sources: string[];
    propertyTypes: string[];
    sellerTypes: string[];
    cities: { id: number; name: string }[];
    categories: { id: number; name: string }[];
  }> {
    const sources = new Set<string>();
    const propertyTypes = new Set<string>();
    const sellerTypes = new Set<string>();
    const cities = new Map<number, string>();
    const categories = new Map<number, string>();

    await db.ads.each((ad) => {
      if (ad.source) sources.add(ad.source);
      if (ad.property_type) propertyTypes.add(ad.property_type);
      if (ad.seller_info?.type) sellerTypes.add(ad.seller_info.type);
      if (ad.city_id) cities.set(ad.city_id, '');
      if (ad.category_id) categories.set(ad.category_id, '');
    });

    return {
      sources: [...sources].sort(),
      propertyTypes: [...propertyTypes].sort(),
      sellerTypes: [...sellerTypes].sort(),
      cities: [...cities.entries()].map(([id]) => ({ id, name: String(id) })),
      categories: [...categories.entries()].map(([id]) => ({ id, name: String(id) })),
    };
  },

  /** Статистика */
  async getStats(filters?: AdSearchFilters): Promise<AdStats> {
    let total = 0;
    let active = 0;
    let archived = 0;
    let priceSum = 0;
    let priceMeterSum = 0;
    let priceCount = 0;
    const bySource: Record<string, number> = {};
    const byPropertyType: Record<string, number> = {};
    const bySellerType: Record<string, number> = {};

    await db.ads.each((ad) => {
      if (filters && !matchesFilters(ad, filters)) return;

      total++;
      if (ad.status === 'active') active++;
      else archived++;

      if (ad.price != null) {
        priceSum += ad.price;
        priceCount++;
      }
      if (ad.price_per_meter != null) {
        priceMeterSum += ad.price_per_meter;
      }

      bySource[ad.source] = (bySource[ad.source] || 0) + 1;
      if (ad.property_type) byPropertyType[ad.property_type] = (byPropertyType[ad.property_type] || 0) + 1;
      if (ad.seller_info?.type) bySellerType[ad.seller_info.type] = (bySellerType[ad.seller_info.type] || 0) + 1;
    });

    return {
      total,
      active,
      archived,
      avgPrice: priceCount > 0 ? Math.round(priceSum / priceCount) : null,
      avgPricePerMeter: priceCount > 0 ? Math.round(priceMeterSum / priceCount) : null,
      bySource,
      byPropertyType,
      bySellerType,
    };
  },

  /** Получить объявление по ID */
  async getById(id: number): Promise<Ad | undefined> {
    return db.ads.get(id);
  },

  /** Обновить объявление */
  async update(id: number, updates: Partial<Ad>): Promise<void> {
    await db.ads.update(id, { ...updates, updated_at: new Date().toISOString() });
  },

  /** Получить объявления по object_id */
  async getByObjectId(objectId: number): Promise<Ad[]> {
    return db.ads.where('object_id').equals(objectId).toArray();
  },

  /** Удалить все объявления */
  async clear(): Promise<void> {
    await db.ads.clear();
  },

  /** Количество объявлений */
  async count(): Promise<number> {
    return db.ads.count();
  },

  /** Записать импорт */
  async recordImport(adImport: Omit<AdImport, 'id'>): Promise<void> {
    await db.ad_imports.add(adImport);
  },

  /** Получить историю импортов */
  async getImportHistory(): Promise<AdImport[]> {
    return db.ad_imports.orderBy('created_at').reverse().toArray();
  },
};

/** Проверка объявления на соответствие фильтрам */
function matchesFilters(ad: Ad, filters: AdSearchFilters): boolean {
  if (filters.sources?.length && !filters.sources.includes(ad.source)) return false;

  if (filters.property_types?.length && !filters.property_types.includes(ad.property_type)) return false;

  if (filters.rooms?.length) {
    const rooms = ad.rooms ?? (ad.property_type === 'studio' ? 0 : null);
    if (rooms === null || !filters.rooms.includes(rooms)) return false;
  }

  if (filters.price_min != null && (ad.price == null || ad.price < filters.price_min)) return false;
  if (filters.price_max != null && (ad.price == null || ad.price > filters.price_max)) return false;

  if (filters.area_min != null && (ad.area_total == null || ad.area_total < filters.area_min)) return false;
  if (filters.area_max != null && (ad.area_total == null || ad.area_total > filters.area_max)) return false;

  if (filters.floor_min != null && (ad.floor == null || ad.floor < filters.floor_min)) return false;
  if (filters.floor_max != null && (ad.floor == null || ad.floor > filters.floor_max)) return false;

  if (filters.seller_type?.length) {
    const sType = ad.seller_info?.type;
    if (!sType || !filters.seller_type.includes(sType)) return false;
  }

  if (filters.status?.length && !filters.status.includes(ad.status)) return false;

  if (filters.region_id != null && ad.region_id !== filters.region_id) return false;
  if (filters.city_id != null && ad.city_id !== filters.city_id) return false;
  if (filters.section_id != null && ad.section_id !== filters.section_id) return false;
  if (filters.category_id != null && ad.category_id !== filters.category_id) return false;

  if (filters.date_from) {
    const adDate = ad.updated || ad.created;
    if (!adDate || adDate < filters.date_from) return false;
  }
  if (filters.date_to) {
    const adDate = ad.updated || ad.created;
    if (!adDate || adDate > filters.date_to) return false;
  }

  if (filters.query) {
    const q = filters.query.toLowerCase();
    const searchable = `${ad.address} ${ad.title} ${ad.description}`.toLowerCase();
    if (!searchable.includes(q)) return false;
  }

  return true;
}
