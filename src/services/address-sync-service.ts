/**
 * Сервис синхронизации адресной базы
 * Скачивает адреса + справочники с сервера → IndexedDB
 * Отправляет user-created адреса на сервер
 */

import { db } from '@/db/database';
import type { AdAddress, ReferenceItem } from '@/types';
import {
  getAddresses,
  getAddressRefs,
  getAddressesStats,
  postAddresses,
  postAddressChanges,
  getAddressChanges,
  type AddressResponse,
  type AddressChangeResponse,
} from '@/services/api-service';

const SYNC_KEY = 'address_last_sync';

function getLastSync(): Promise<string | null> {
  return new Promise((resolve) => {
    chrome.storage.local.get(SYNC_KEY, (result) => {
      resolve(result?.[SYNC_KEY] || null);
    });
  });
}

function setLastSync(date: string): void {
  chrome.storage.local.set({ [SYNC_KEY]: date });
}

/** Маппинг серверного Address → AdAddress для IndexedDB */
function mapServerAddress(a: AddressResponse): Omit<AdAddress, 'id'> {
  return {
    server_id: a.id,
    house_id: a.house_id,
    address: a.address,
    coordinates: { lat: a.lat, lng: a.lon },
    type: a.type,
    region: a.region,
    cadno: a.cadno,
    house_type: a.house_type,
    serie: a.serie,
    house_series_id: a.house_series_id,
    house_class_id: a.house_class_id,
    ceiling_material_id: a.ceiling_material_id,
    wall_material_id: a.wall_material_id,
    house_problem_id: a.house_problem_id,
    floors_count: a.levels,
    build_year: a.build_year,
    entrances_count: a.entrances_count,
    living_spaces_count: a.living_spaces_count,
    area_total: a.area_total,
    area_live: a.area_live,
    ceiling_height: a.ceiling_height,
    gas_supply: a.gas_supply,
    individual_heating: a.individual_heating,
    has_playground: a.has_playground,
    has_sports_area: a.has_sports_area,
    comment: a.comment || '',
    source: 'server',
    synced_at: new Date().toISOString(),
    created_at: a.updated_at,
    updated_at: a.updated_at,
  };
}

export const addressSyncService = {
  /**
   * Скачать адреса с сервера → IndexedDB
   * По выбранным регионам (если переданы) или все доступные
   */
  async syncFromServer(
    regions?: string[],
    onProgress?: (loaded: number, total: number) => void
  ): Promise<{ downloaded: number; upserted: number }> {
    // 1. Скачать справочники
    const refs = await getAddressRefs();

    await db.transaction('rw', [db.ad_wall_materials, db.ad_house_classes, db.ad_house_series, db.ad_ceiling_materials, db.ad_house_problems], async () => {
      await db.ad_wall_materials.clear();
      await db.ad_wall_materials.bulkAdd(
        refs.wall_materials.map((w) => ({ id: undefined as unknown as number, server_id: w.id, name: w.name, color: w.color || undefined, created_at: '', updated_at: '' }) as ReferenceItem)
      );

      await db.ad_house_classes.clear();
      await db.ad_house_classes.bulkAdd(
        refs.house_classes.map((c) => ({ id: undefined as unknown as number, server_id: c.id, name: c.name, color: c.color || undefined, created_at: '', updated_at: '' }) as ReferenceItem)
      );

      await db.ad_house_series.clear();
      await db.ad_house_series.bulkAdd(
        refs.house_series.map((s) => ({ id: undefined as unknown as number, server_id: s.id, name: s.name, created_at: '', updated_at: '' }) as ReferenceItem)
      );

      await db.ad_ceiling_materials.clear();
      await db.ad_ceiling_materials.bulkAdd(
        refs.ceiling_materials.map((c) => ({ id: undefined as unknown as number, server_id: c.id, name: c.name, created_at: '', updated_at: '' }) as ReferenceItem)
      );

      await db.ad_house_problems.clear();
      await db.ad_house_problems.bulkAdd(
        refs.house_problems.map((p) => ({ id: undefined as unknown as number, server_id: p.id, name: p.name, color: p.color || undefined, created_at: '', updated_at: '' }) as ReferenceItem)
      );
    });

    // 2. Скачать адреса
    const lastSync = await getLastSync();
    const response = await getAddresses(regions, lastSync || undefined);

    onProgress?.(0, response.total);

    // 3. Upsert в IndexedDB по server_id
    let upserted = 0;
    const batchSize = 500;

    for (let i = 0; i < response.addresses.length; i += batchSize) {
      const batch = response.addresses.slice(i, i + batchSize);

      await db.transaction('rw', db.ad_addresses, async () => {
        for (const serverAddr of batch) {
          const mapped = mapServerAddress(serverAddr);

          // Найти существующий по server_id
          const existing = await db.ad_addresses.where('server_id').equals(serverAddr.id).first();

          if (existing) {
            await db.ad_addresses.update(existing.id!, mapped);
          } else {
            await db.ad_addresses.add(mapped as AdAddress);
          }
          upserted++;
        }
      });

      onProgress?.(Math.min(i + batchSize, response.total), response.total);
    }

    setLastSync(new Date().toISOString());

    // 4. Починить битые ссылки: address_id в ads → локальный id, который мог измениться
    const allAddresses = await db.ad_addresses.toArray();
    const validAddressIds = new Set(allAddresses.map(a => a.id));
    const adsWithAddress = await db.ads.filter(a => a.address_id != null).toArray();
    let fixedCount = 0;
    for (const ad of adsWithAddress) {
      if (ad.address_id && !validAddressIds.has(ad.address_id)) {
        await db.ads.update(ad.id!, {
          address_id: null,
          address_match_confidence: null,
          address_match_method: null,
          address_match_score: null,
          address_distance: null,
          processing_status: 'address_needed',
        });
        fixedCount++;
      }
    }
    if (fixedCount > 0) {
      console.log(`[address-sync] Fixed ${fixedCount} broken address links`);
    }

    return { downloaded: response.total, upserted };
  },

  /**
   * Отправить изменения адресов как предложения на модерацию
   * Находит адреса с source='user' и synced_at=null
   * Отправляет через POST /api/address-changes
   */
  async submitChanges(): Promise<{ submitted: number }> {
    const unsynced = await db.ad_addresses
      .where('source')
      .equals('user')
      .toArray();

    const toSync = unsynced.filter((a) => !a.synced_at);

    if (toSync.length === 0) return { submitted: 0 };

    const changes = toSync.map((a) => ({
      address_id: a.server_id, // server_id = ID на сервере (для update), null для новых
      address: a.address,
      lat: a.coordinates.lat,
      lon: a.coordinates.lng,
      type: a.type,
      region: a.region,
      house_type: a.house_type,
      cadno: a.cadno,
      serie: a.serie,
      house_series_id: a.house_series_id,
      house_class_id: a.house_class_id,
      wall_material_id: a.wall_material_id,
      ceiling_material_id: a.ceiling_material_id,
      house_problem_id: a.house_problem_id,
      levels: a.floors_count,
      build_year: a.build_year,
      entrances_count: a.entrances_count,
      living_spaces_count: a.living_spaces_count,
      area_total: a.area_total,
      area_live: a.area_live,
      gas_supply: a.gas_supply,
      individual_heating: a.individual_heating,
      has_playground: a.has_playground,
      has_sports_area: a.has_sports_area,
      ceiling_height: a.ceiling_height,
      comment: a.comment,
    }));

    const result = await postAddressChanges(changes);

    // Пометить как отправленные (на модерации)
    const now = new Date().toISOString();
    for (const addr of toSync) {
      await db.ad_addresses.update(addr.id!, { synced_at: now });
    }

    return { submitted: result.created };
  },

  /**
   * Получить статус своих предложений
   */
  async getChangesStatus(): Promise<AddressChangeResponse[]> {
    const result = await getAddressChanges();
    return result.changes;
  },

  /**
   * Проверить нужна ли синхронизация
   */
  async needsSync(): Promise<boolean> {
    const lastSync = await getLastSync();
    if (!lastSync) return true;

    const hoursSinceSync = (Date.now() - new Date(lastSync).getTime()) / (1000 * 60 * 60);
    return hoursSinceSync > 24;
  },

  /**
   * Получить адреса в пределах bounding box (для карты)
   */
  async getAddressesInBounds(
    minLat: number,
    maxLat: number,
    minLng: number,
    maxLng: number
  ): Promise<AdAddress[]> {
    const all = await db.ad_addresses.toArray();
    return all.filter((a) => {
      const lat = a.coordinates.lat;
      const lng = a.coordinates.lng;
      return lat != null && lng != null && lat >= minLat && lat <= maxLat && lng >= minLng && lng <= maxLng;
    });
  },

  /**
   * Статистика: сколько адресов в локальной базе
   */
  async getLocalStats(): Promise<{ total: number; bySource: Record<string, number> }> {
    const all = await db.ad_addresses.toArray();
    const bySource: Record<string, number> = {};
    for (const a of all) {
      bySource[a.source] = (bySource[a.source] || 0) + 1;
    }
    return { total: all.length, bySource };
  },

  /**
   * Последняя синхронизация
   */
  async getLastSyncDate(): Promise<string | null> {
    return getLastSync();
  },

  /**
   * Очистить локальную базу адресов
   */
  async clearLocal(): Promise<void> {
    await db.ad_addresses.clear();
    chrome.storage.local.remove(SYNC_KEY);
  },
};
