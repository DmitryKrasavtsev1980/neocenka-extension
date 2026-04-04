import { db } from '../database';
import { CadastralQuarter } from '@/types';

/**
 * Репозиторий для работы с кадастровыми кварталами в IndexedDB
 */
export const cadastralRepository = {
  /**
   * Массовая вставка кварталов
   */
  async bulkUpsert(quarters: CadastralQuarter[]): Promise<void> {
    for (const quarter of quarters) {
      const existing = await db.cadastral_quarters
        .where('cad_number')
        .equals(quarter.cad_number)
        .first();

      if (existing) {
        await db.cadastral_quarters.update(existing.id!, {
          geojson: quarter.geojson ?? existing.geojson,
          center_lat: quarter.center_lat ?? existing.center_lat,
          center_lon: quarter.center_lon ?? existing.center_lon,
        });
      } else {
        await db.cadastral_quarters.add(quarter);
      }
    }
  },

  /**
   * Получить все кварталы с геометрией
   */
  async getAllWithGeojson(): Promise<CadastralQuarter[]> {
    return db.cadastral_quarters
      .filter((q) => q.geojson != null)
      .toArray();
  },

  /**
   * Получить все кварталы (без геометрии — для списка)
   */
  async getAll(): Promise<CadastralQuarter[]> {
    return db.cadastral_quarters.toArray();
  },

  /**
   * Получить кварталы по cad_numbers
   */
  async getByCadNumbers(cadNumbers: string[]): Promise<CadastralQuarter[]> {
    return db.cadastral_quarters
      .where('cad_number')
      .anyOf(cadNumbers)
      .toArray();
  },

  /**
   * Количество кварталов
   */
  async count(): Promise<number> {
    return db.cadastral_quarters.count();
  },

  /**
   * Количество кварталов с геометрией
   */
  async countWithGeojson(): Promise<number> {
    return db.cadastral_quarters
      .filter((q) => q.geojson != null)
      .count();
  },

  /**
   * Удалить все
   */
  async clear(): Promise<void> {
    return db.cadastral_quarters.clear();
  },
};
