import Dexie, { Table } from 'dexie';
import { Deal, ImportRecord, CadastralQuarter, Ad, AdObject, AdAddress, InparsCategory, ReferenceItem, AdImport, CrmPipeline, CrmStage, CrmClient, CrmMessage, CrmParsingSource, CrmBotSettings } from '@/types';

/**
 * Класс базы данных для хранения сделок с недвижимостью
 */
export class DealsDatabase extends Dexie {
  deals!: Table<Deal, number>;
  imports!: Table<ImportRecord, number>;
  cadastral_quarters!: Table<CadastralQuarter, number>;

  // Модуль объявлений
  ads!: Table<Ad, number>;
  ad_objects!: Table<AdObject, number>;
  ad_addresses!: Table<AdAddress, number>;
  inpars_categories!: Table<InparsCategory, number>;
  ad_wall_materials!: Table<ReferenceItem, number>;
  ad_house_classes!: Table<ReferenceItem, number>;
  ad_house_series!: Table<ReferenceItem, number>;
  ad_ceiling_materials!: Table<ReferenceItem, number>;
  ad_imports!: Table<AdImport, number>;

  // Модуль CRM
  crm_pipelines!: Table<CrmPipeline, number>;
  crm_stages!: Table<CrmStage, number>;
  crm_clients!: Table<CrmClient, number>;
  crm_messages!: Table<CrmMessage, number>;
  crm_parsing_sources!: Table<CrmParsingSource, number>;
  crm_bot_settings!: Table<CrmBotSettings, number>;

  constructor() {
    super('NeocenkaDB');

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

    // Version 3: модуль «Рекламные объявления»
    this.version(3).stores({
      ads: `
        ++id,
        external_id,
        source,
        status,
        region_id,
        city_id,
        category_id,
        section_id,
        property_type,
        price,
        price_per_meter,
        floor,
        area_total,
        seller_type,
        operation_type,
        object_id,
        address_id,
        created,
        updated,
        [source+external_id],
        [object_id],
        [status],
        [address_id]
      `,
      ad_objects: `
        ++id,
        address_id,
        property_type,
        status,
        current_price
      `,
      ad_addresses: `
        ++id,
        address,
        type,
        house_series_id,
        house_class_id,
        wall_material_id,
        ceiling_material_id
      `,
      inpars_categories: `
        ++id,
        inpars_id,
        name,
        parent_id,
        section_id,
        is_active
      `,
      ad_wall_materials: `
        ++id,
        name
      `,
      ad_house_classes: `
        ++id,
        name
      `,
      ad_house_series: `
        ++id,
        name
      `,
      ad_ceiling_materials: `
        ++id,
        name
      `,
      ad_imports: `
        ++id,
        source,
        created_at
      `,
    });

    // Version 4: модуль «CRM»
    this.version(4).stores({
      crm_pipelines: `
        ++id,
        name,
        is_default
      `,
      crm_stages: `
        ++id,
        pipeline_id,
        name,
        order
      `,
      crm_clients: `
        ++id,
        full_name,
        phone,
        source,
        pipeline_id,
        stage_id,
        status,
        created_at
      `,
      crm_messages: `
        ++id,
        client_id,
        direction,
        created_at
      `,
      crm_parsing_sources: `
        ++id,
        url,
        source_type,
        pipeline_id
      `,
      crm_bot_settings: `
        ++id
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

  // Получаем уникальные годы и регионы через each() — без загрузки всех объектов в массив
  const yearsSet = new Set<number>();
  const regionsSet = new Set<string>();
  await db.deals.each((d) => {
    yearsSet.add(parseInt(d.year_quarter.split('-')[0]));
    regionsSet.add(d.region_code);
  });
  const years = [...yearsSet].sort((a, b) => b - a);
  const regions = [...regionsSet].sort();

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
