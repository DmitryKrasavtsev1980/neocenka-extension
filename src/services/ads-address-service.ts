/**
 * Сервис адресов для модуля объявлений
 * CRUD + SmartAddressMatcher (порт из neocenka-extension)
 */

import { db } from '@/db/database';
import type { AdAddress } from '@/types';
import { SmartAddressMatcher } from './smart-address-matcher';

const matcher = new SmartAddressMatcher();

export const adsAddressService = {
  /** Получить все адреса */
  async getAll(): Promise<AdAddress[]> {
    return db.ad_addresses.toArray();
  },

  /** Получить адрес по ID */
  async getById(id: number): Promise<AdAddress | undefined> {
    return db.ad_addresses.get(id);
  },

  /** Создать адрес */
  async create(data: Omit<AdAddress, 'id'>): Promise<number> {
    return db.ad_addresses.add(data as AdAddress);
  },

  /** Обновить адрес */
  async update(id: number, data: Partial<AdAddress>): Promise<void> {
    await db.ad_addresses.update(id, { ...data, updated_at: new Date().toISOString() });
  },

  /** Удалить адрес */
  async remove(id: number): Promise<void> {
    await db.ad_addresses.delete(id);
  },

  /** Поиск адресов по подстроке */
  async search(query: string): Promise<AdAddress[]> {
    if (!query || query.length < 3) return [];
    const q = query.toLowerCase();
    const results: AdAddress[] = [];
    await db.ad_addresses.each((addr) => {
      if (addr.address.toLowerCase().includes(q)) {
        results.push(addr);
      }
    });
    return results;
  },

  /**
   * Привязать объявления к адресам через SmartAddressMatcher
   *
   * Алгоритм (идентичен neocenka-extension):
   * 1. Загружаем все адреса из БД (с сервера)
   * 2. Для каждого объявления без адреса запускаем 5-этапный матчинг
   * 3. НЕ создаём новые адреса — только привязка к существующим
   */
  async matchAdsToAddresses(
    onProgress?: (processed: number, total: number) => void,
    polygons?: [number, number][][],
  ): Promise<{ matched: number; unmatched: number }> {
    // Загружаем все адреса из БД (с сервера)
    const allAddresses = await db.ad_addresses.toArray();

    // Фильтруем объявления без привязки к адресу
    const allAds = await db.ads.toArray();
    let ads = allAds.filter(a => !a.address_id);

    // Если задан полигон — оставляем только объявления внутри полигона
    if (polygons && polygons.length > 0) {
      ads = ads.filter(ad => {
        const lat = ad.coordinates.lat;
        const lng = ad.coordinates.lng;
        if (lat == null || lng == null) return false;
        return polygons.some(poly => pointInPolygon(lat, lng, poly));
      });
    }

    let matched = 0;
    let unmatched = 0;

    for (let i = 0; i < ads.length; i++) {
      const ad = ads[i];

      // Запускаем SmartAddressMatcher
      const result = matcher.matchAddressSmart(ad, allAddresses);

      if (result.address && result.confidence !== 'none') {
        // Найден подходящий адрес — привязываем
        await db.ads.update(ad.id!, {
          address_id: result.address.id!,
          address_match_confidence: result.confidence,
          address_match_method: result.method,
          address_match_score: result.score,
          address_distance: result.distance,
          processing_status: 'duplicate_check_needed',
        });
        matched++;
      } else {
        // Адрес не найден — оставляем без привязки
        unmatched++;
      }

      onProgress?.(i + 1, ads.length);
    }

    return { matched, unmatched };
  },

  /** Очистить все адреса */
  async clear(): Promise<void> {
    await db.ad_addresses.clear();
  },

  /** Привязать адрес к объявлению вручную (confidence=manual) */
  async linkAdToAddress(adId: number, addressId: number): Promise<void> {
    await db.ads.update(adId, {
      address_id: addressId,
      address_match_confidence: 'manual',
      address_match_method: 'manual_selection',
      address_match_score: 1.0,
      address_distance: null,
      processing_status: 'duplicate_check_needed',
    });
  },

  /** Отвязать адрес от объявления */
  async unlinkAdFromAddress(adId: number): Promise<void> {
    await db.ads.update(adId, {
      address_id: null,
      address_match_confidence: null,
      address_match_method: null,
      address_match_score: null,
      address_distance: null,
      processing_status: 'address_needed',
    });
  },

  /** Отвязать адреса от всех объявлений и сбросить статус */
  async unlinkAllAddresses(): Promise<{ unlinked: number }> {
    const adsWithAddress = await db.ads.filter(a => a.address_id != null).toArray();
    let unlinked = 0;
    for (const ad of adsWithAddress) {
      await db.ads.update(ad.id!, {
        address_id: null,
        address_match_confidence: null,
        address_match_method: null,
        address_match_score: null,
        address_distance: null,
        processing_status: 'address_needed',
      });
      unlinked++;
    }
    return { unlinked };
  },

  /** Подтвердить текущий адрес (confidence=manual) */
  async confirmAdAddress(adId: number): Promise<void> {
    await db.ads.update(adId, {
      address_match_confidence: 'manual',
    });
  },
};

/** Проверка принадлежности точки полигону (ray casting). Полигон: [lat, lng][] */
function pointInPolygon(lat: number, lng: number, polygon: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const latI = polygon[i][0], lngI = polygon[i][1];
    const latJ = polygon[j][0], lngJ = polygon[j][1];
    if (((latI > lat) !== (latJ > lat)) &&
        (lng < (lngJ - lngI) * (lat - latI) / (latJ - latI) + lngI)) {
      inside = !inside;
    }
  }
  return inside;
}
