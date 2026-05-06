/**
 * Сервис адресов для модуля объявлений
 * CRUD + упрощённый матчинг (без ML)
 */

import { db } from '@/db/database';
import type { AdAddress } from '@/types';

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
   * Найти или создать адрес для объявления
   * Упрощённый алгоритм: точное совпадение нормализованного адреса → географическая близость
   */
  async findOrCreateForAd(adAddress: string, lat: number | null, lng: number | null): Promise<{ addressId: number; confidence: string; method: string }> {
    const normalized = normalizeAddress(adAddress);

    // Стадия 1: точное совпадение нормализованного адреса
    let match: AdAddress | undefined;
    await db.ad_addresses.each((addr) => {
      if (normalizeAddress(addr.address) === normalized) {
        match = addr;
      }
    });

    if (match) {
      return { addressId: match.id!, confidence: 'high', method: 'exact' };
    }

    // Стадия 2: географическая близость (50м)
    if (lat != null && lng != null) {
      const nearbyThreshold = 50; // метров
      await db.ad_addresses.each((addr) => {
        if (addr.coordinates.lat != null && addr.coordinates.lng != null) {
          const dist = haversineDistance(lat, lng, addr.coordinates.lat, addr.coordinates.lng);
          if (dist <= nearbyThreshold && normalizeAddress(addr.address) !== normalized) {
            // Проверяем что похоже по адресу (та же улица)
            if (sameStreet(addr.address, adAddress)) {
              match = addr;
            }
          }
        }
      });

      if (match) {
        return { addressId: match.id!, confidence: 'medium', method: 'geo_near' };
      }
    }

    // Не найден — создаём новый
    const now = new Date().toISOString();
    const newAddress: Omit<AdAddress, 'id'> = {
      address: adAddress,
      coordinates: { lat, lng },
      type: 'house',
      house_series_id: null,
      house_class_id: null,
      ceiling_material_id: null,
      wall_material_id: null,
      floors_count: null,
      build_year: null,
      entrances_count: null,
      living_spaces_count: null,
      gas_supply: null,
      individual_heating: null,
      has_playground: false,
      has_sports_area: false,
      created_at: now,
      updated_at: now,
    };

    const addressId = await db.ad_addresses.add(newAddress as AdAddress);
    return { addressId, confidence: 'low', method: 'new' };
  },

  /** Привязать объявления к адресам (пакетная обработка) */
  async matchAdsToAddresses(onProgress?: (processed: number, total: number) => void): Promise<{ matched: number; created: number }> {
    const ads = await db.ads.where('address_id').equals(0).or('address_id').equals(null as unknown as number).toArray();
    let matched = 0;
    let created = 0;

    for (let i = 0; i < ads.length; i++) {
      const ad = ads[i];
      if (!ad.address) continue;

      const result = await adsAddressService.findOrCreateForAd(
        ad.address,
        ad.coordinates.lat,
        ad.coordinates.lng,
      );

      await db.ads.update(ad.id!, {
        address_id: result.addressId,
        address_match_confidence: result.confidence,
        address_match_method: result.method,
      });

      if (result.method === 'new') created++;
      else matched++;

      onProgress?.(i + 1, ads.length);
    }

    return { matched, created };
  },

  /** Очистить все адреса */
  async clear(): Promise<void> {
    await db.ad_addresses.clear();
  },
};

/** Нормализация адреса для сравнения */
function normalizeAddress(address: string): string {
  return address
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[,.;]/g, '')
    .replace(/улица/g, 'ул')
    .replace(/проспект/g, 'пр')
    .replace(/бульвар/g, 'б-р')
    .replace(/переулок/g, 'пер')
    .replace(/дом\s*/g, 'д ')
    .replace(/корпус\s*/g, 'к ')
    .replace(/строение\s*/g, 'с ')
    .replace(/квартира\s*/g, 'кв ');
}

/** Расстояние Хаверсина в метрах */
function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/** Проверка что два адреса на одной улице */
function sameStreet(addr1: string, addr2: string): boolean {
  const n1 = normalizeAddress(addr1);
  const n2 = normalizeAddress(addr2);
  // Извлекаем улицу (до "д ")
  const street1 = n1.split(/д\s/i)[0]?.trim();
  const street2 = n2.split(/д\s/i)[0]?.trim();
  return street1 === street2;
}
