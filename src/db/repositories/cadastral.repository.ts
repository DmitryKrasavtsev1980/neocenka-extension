import { db } from '../database';
import { CadastralQuarter } from '@/types';

export const cadastralRepository = {
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

  async getAllWithGeojson(): Promise<CadastralQuarter[]> {
    return db.cadastral_quarters
      .filter((q) => q.geojson != null)
      .toArray();
  },

  async getAllCadNumbers(): Promise<string[]> {
    const numbers: string[] = [];
    await db.cadastral_quarters.each((q) => {
      numbers.push(q.cad_number);
    });
    return numbers;
  },

  async getAll(): Promise<CadastralQuarter[]> {
    return db.cadastral_quarters.toArray();
  },

  async getByCadNumbers(cadNumbers: string[]): Promise<CadastralQuarter[]> {
    return db.cadastral_quarters
      .where('cad_number')
      .anyOf(cadNumbers)
      .toArray();
  },

  async count(): Promise<number> {
    return db.cadastral_quarters.count();
  },

  async countWithGeojson(): Promise<number> {
    return db.cadastral_quarters
      .filter((q) => q.geojson != null)
      .count();
  },

  async getRegionStats(): Promise<Record<string, number>> {
    const stats: Record<string, number> = {};
    await db.cadastral_quarters.each((quarter) => {
      const regionCode = quarter.cad_number.split(':')[0];
      stats[regionCode] = (stats[regionCode] || 0) + 1;
    });
    return stats;
  },

  async clear(): Promise<void> {
    return db.cadastral_quarters.clear();
  },
};
