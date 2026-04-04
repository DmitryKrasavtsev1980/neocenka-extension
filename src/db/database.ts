import Dexie, { Table } from 'dexie';
import { Deal, ImportRecord, CadastralQuarter } from '@/types';

/**
 * Класс базы данных для хранения сделок с недвижимостью
 */
export class DealsDatabase extends Dexie {
  deals!: Table<Deal, number>;
  imports!: Table<ImportRecord, number>;
  cadastral_quarters!: Table<CadastralQuarter, number>;

  constructor() {
    super('RosreestrDealsDB');

    this.version(1).stores({
      // Таблица сделок с индексами для быстрого поиска
      deals: `
        ++id,
        region_code,
        district,
        city,
        realestate_type_code,
        doc_type,
        year_quarter,
        period_start_date,
        deal_price,
        area,
        year_build,
        wall_material_code,
        import_id,
        [region_code+year_quarter],
        [region_code+realestate_type_code]
      `,
      // Таблица истории импортов
      imports: `
        ++id,
        filename,
        file_hash,
        year,
        quarter,
        imported_at
      `,
    });

    // Version 2: добавляем таблицу кадастровых кварталов
    this.version(2).stores({
      cadastral_quarters: `
        ++id,
        cad_number
      `,
    });
  }
}

// Синглтон базы данных
export const db = new DealsDatabase();

/**
 * Очистка всей базы данных
 */
export async function clearDatabase(): Promise<void> {
  await db.deals.clear();
  await db.imports.clear();
}

/**
 * Получение статистики по базе данных
 */
export async function getDatabaseStats() {
  const [totalDeals, totalImports, lastImport] = await Promise.all([
    db.deals.count(),
    db.imports.count(),
    db.imports.orderBy('imported_at').last(),
  ]);

  // Получаем уникальные годы и регионы
  const deals = await db.deals.toArray();
  const years = [...new Set(deals.map((d) => parseInt(d.year_quarter.split('-')[0])))].sort((a, b) => b - a);
  const regions = [...new Set(deals.map((d) => d.region_code))].sort();

  return {
    totalDeals,
    totalImports,
    lastImport: lastImport?.imported_at,
    years,
    regions,
  };
}

/**
 * Проверка, был ли уже импортирован файл с таким хешем
 */
export async function isFileImported(fileHash: string): Promise<ImportRecord | undefined> {
  return db.imports.where('file_hash').equals(fileHash).first();
}

/**
 * Удаление импорта и связанных сделок
 */
export async function deleteImport(importId: number): Promise<void> {
  await db.deals.where('import_id').equals(importId).delete();
  await db.imports.delete(importId);
}
