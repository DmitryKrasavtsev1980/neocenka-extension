import Dexie, { Table } from 'dexie';
import { Deal, ImportRecord, CadastralQuarter, Ad, AdObject, AdAddress, ListingCategory, ReferenceItem, AdImport, CrmPipeline, CrmStage, CrmClient, CrmDeal, CrmDealDocument, CrmMessage, CrmParsingSource, CrmBotSettings, CrmSource, CrmLead, CrmTask, CrmStageAction, CrmMessageTemplate, normalizePhone } from '@/types';

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
  listing_categories!: Table<ListingCategory, number>;
  ad_wall_materials!: Table<ReferenceItem, number>;
  ad_house_classes!: Table<ReferenceItem, number>;
  ad_house_series!: Table<ReferenceItem, number>;
  ad_ceiling_materials!: Table<ReferenceItem, number>;
  ad_house_problems!: Table<ReferenceItem, number>;
  ad_imports!: Table<AdImport, number>;

  // Модуль CRM
  crm_pipelines!: Table<CrmPipeline, number>;
  crm_stages!: Table<CrmStage, number>;
  crm_clients!: Table<CrmClient, number>;
  crm_deals!: Table<CrmDeal, number>;
  crm_deal_documents!: Table<CrmDealDocument, number>;
  crm_messages!: Table<CrmMessage, number>;
  crm_parsing_sources!: Table<CrmParsingSource, number>;
  crm_bot_settings!: Table<CrmBotSettings, number>;
  crm_sources!: Table<CrmSource, number>;
  crm_leads!: Table<CrmLead, number>;
  crm_tasks!: Table<CrmTask, number>;
  crm_stage_actions!: Table<CrmStageAction, number>;
  crm_message_templates!: Table<CrmMessageTemplate, number>;

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
      listing_categories: `
        ++id,
        source_id,
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

    // Version 5: сделки (deals) отделены от клиентов
    this.version(5).stores({
      crm_clients: `
        ++id,
        full_name,
        phone,
        source,
        status,
        created_at
      `,
      crm_deals: `
        ++id,
        client_id,
        pipeline_id,
        stage_id,
        title,
        status,
        created_at
      `,
      crm_deal_documents: `
        ++id,
        deal_id,
        type,
        title
      `,
      crm_messages: `
        ++id,
        client_id,
        deal_id,
        direction,
        created_at
      `,
    }).upgrade(tx => {
      // Миграция: переносим pipeline_id/stage_id из клиентов в сделки
      const clients = tx.table('crm_clients');
      const deals = tx.table('crm_deals');
      return clients.toArray(clientList => {
        const dealPromises = clientList
          .filter(c => c.pipeline_id && c.stage_id)
          .map(c => deals.add({
            client_id: c.id,
            pipeline_id: c.pipeline_id,
            stage_id: c.stage_id,
            title: c.ad_data?.address || c.full_name || 'Сделка',
            status: c.status || 'active',
            amount: c.ad_data?.price,
            ad_data: c.ad_data,
            notes: c.notes,
            created_at: c.created_at,
            updated_at: c.updated_at || c.created_at,
          }));
        return Promise.all(dealPromises);
      });
    });

    // Version 6: справочник источников клиентов
    this.version(6).stores({
      crm_sources: `
        ++id,
        code,
        name,
        created_at
      `,
    }).upgrade(tx => {
      const sources = tx.table('crm_sources');
      const now = new Date().toISOString();
      const defaults: Omit<CrmSource, 'id'>[] = [
        { code: 'manual', name: 'Вручную', color: '#6b7280', is_system: true, created_at: now },
        { code: 'cian', name: 'ЦИАН', color: '#f59e0b', is_system: true, created_at: now },
        { code: 'avito', name: 'Авито', color: '#10b981', is_system: true, created_at: now },
        { code: 'other', name: 'Другое', color: '#8b5cf6', is_system: true, created_at: now },
      ];
      return sources.bulkAdd(defaults);
    });

    // Version 7: лиды (возможности)
    this.version(7).stores({
      crm_leads: `
        ++id,
        source,
        contact_name,
        contact_phone,
        pipeline_id,
        stage_id,
        status,
        created_at
      `,
    });

    // Version 8: задачи CRM
    this.version(8).stores({
      crm_tasks: `
        ++id,
        title,
        client_id,
        deal_id,
        lead_id,
        type,
        priority,
        status,
        due_date,
        created_at
      `,
    });

    // Version 9: действия этапов
    this.version(9).stores({
      crm_stage_actions: `
        ++id,
        stage_id,
        type,
        is_active,
        order
      `,
    });

    // Version 10: индекс source_url для лидов (поиск дубликатов)
    this.version(10).stores({
      crm_leads: `
        ++id,
        source,
        contact_name,
        contact_phone,
        source_url,
        pipeline_id,
        stage_id,
        status,
        created_at
      `,
    });

    // Version 11: phones[] вместо phone/contact_phone — убрать строковые индексы
    this.version(11).stores({
      crm_clients: `
        ++id,
        full_name,
        source,
        status,
        created_at
      `,
      crm_leads: `
        ++id,
        source,
        contact_name,
        source_url,
        pipeline_id,
        stage_id,
        status,
        created_at
      `,
    }).upgrade(tx => {
      // Миграция: phone → phones[], contact_phone → phones[]
      const clients = tx.table('crm_clients');
      const leads = tx.table('crm_leads');

      return clients.toCollection().modify(client => {
        if ('phone' in client && !('phones' in client)) {
          const raw = (client as Record<string, unknown>).phone as string || '';
          // Разбиваем по запятой (от старого парсинга) и нормализуем
          const parts = raw.split(/[,;]/).map((p: string) => p.trim()).filter(Boolean);
          (client as Record<string, unknown>).phones = parts.map((n: string) => ({
            number: normalizePhone(n),
          }));
          delete (client as Record<string, unknown>).phone;
        }
      }).then(() => {
        return leads.toCollection().modify(lead => {
          if ('contact_phone' in lead && !('phones' in lead)) {
            const raw = (lead as Record<string, unknown>).contact_phone as string || '';
            const parts = raw.split(/[,;]/).map((p: string) => p.trim()).filter(Boolean);
            (lead as Record<string, unknown>).phones = parts.map((n: string) => ({
              number: normalizePhone(n),
            }));
            delete (lead as Record<string, unknown>).contact_phone;
          }
        });
      });
    });

    // Version 12: шаблоны сообщений
    this.version(12).stores({
      crm_message_templates: `
        ++id,
        category,
        name,
        created_at
      `,
    }).upgrade(tx => {
      const tmplTable = tx.table('crm_message_templates');
      const now = new Date().toISOString();

      const defaults: Omit<CrmMessageTemplate, 'id'>[] = [
        {
          name: 'Загородная недвижимость',
          category: 'suburban',
          body: `Здравствуйте! Меня зовут Дмитрий. Пишу по вашему объявлению.

Знаю, что главная проблема при продаже загородной недвижимости — это холостые поездки на показы. Человек едет из города, осматривает объект и говорит «не то». У вас потрачены выходные, а результата нет.

Я делаю 3D-туры. Покупатель сможет виртуально пройтись по дому и участку прямо со смартфона, еще до выезда. Он оценит планировку, габариты и расположение онлайн. К вам на показ будут приезжать только те, кто уже фактически выбрал ваш объект. Это ускоряет сделку в разы.

Скинуть вам короткий пример, как это выглядит на практике?`,
          created_at: now,
          updated_at: now,
        },
        {
          name: 'Квартиры',
          category: 'flat',
          body: `Здравствуйте! Меня зовут Дмитрий. Вижу ваше объявление о продаже квартиры. Предлагаю сделать 3D-тур, чтобы продать объект быстрее и без снижения цены. Что это даст:
• Никаких холостых показов (люди оценят планировку онлайн).
• Выделение на фоне сотен конкурентов с обычными фото.
• Привлечение серьезных покупателей из других городов.

Скинуть пример моей работы?`,
          created_at: now,
          updated_at: now,
        },
      ];
      return tmplTable.bulkAdd(defaults);
    });

    // Version 13: добавляем pipeline_id и source в шаблоны сообщений
    this.version(13).stores({
      crm_message_templates: `
        ++id,
        category,
        pipeline_id,
        source,
        name,
        created_at
      `,
    }).upgrade(tx => {
      // Обновляем существующие шаблоны — оставляем общими (без привязки)
      const tmplTable = tx.table('crm_message_templates');
      return tmplTable.toCollection().modify((tmpl: any) => {
        // pipeline_id и source оставляем undefined — шаблон общий
      });
    });

    // Версия 14: расширение адресной базы (server_id, house_id, region и т.д.)
    this.version(14).stores({
      ad_addresses: `
        ++id,
        server_id,
        house_id,
        address,
        type,
        region,
        house_series_id,
        house_class_id,
        wall_material_id,
        ceiling_material_id,
        build_year,
        source
      `,
    }).upgrade(tx => {
      const addrs = tx.table('ad_addresses');
      return addrs.toCollection().modify((addr: any) => {
        if (!('server_id' in addr)) addr.server_id = null;
        if (!('house_id' in addr)) addr.house_id = null;
        if (!('region' in addr)) addr.region = null;
        if (!('cadno' in addr)) addr.cadno = null;
        if (!('house_type' in addr)) addr.house_type = null;
        if (!('serie' in addr)) addr.serie = null;
        if (!('house_problem_id' in addr)) addr.house_problem_id = null;
        if (!('area_total' in addr)) addr.area_total = null;
        if (!('area_live' in addr)) addr.area_live = null;
        if (!('ceiling_height' in addr)) addr.ceiling_height = null;
        if (!('comment' in addr)) addr.comment = '';
        if (!('source' in addr)) addr.source = 'user';
        if (!('synced_at' in addr)) addr.synced_at = null;
      });
    });

    // Version 15: справочник проблем домов
    this.version(15).stores({
      ad_house_problems: `
        ++id,
        name
      `,
    });

    // Version 16: добавляем индекс quarter_cad_number для быстрого поиска сделок по кадастровому кварталу
    this.version(16).stores({
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
        quarter_cad_number,
        [region_code+year_quarter],
        [region_code+realestate_type_code]
      `,
    });

    // Version 17: таблица категорий объявлений (listing_categories)
    this.version(17).stores({
      listing_categories: `
        ++id,
        source_id,
        name,
        parent_id,
        section_id,
        is_active
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

// Кэш статистики — years и регионы меняются только при импорте
let statsCache: Promise<ReturnType<typeof computeDatabaseStats>> | null = null;

async function computeDatabaseStats() {
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
 * Получение статистики по базе данных (кэшируется, сбрасывается при импорте)
 */
export async function getDatabaseStats() {
  if (!statsCache) {
    statsCache = computeDatabaseStats();
  }
  return statsCache;
}

/**
 * Сброс кэша статистики — вызывать после импорта/удаления данных
 */
export function invalidateDatabaseStatsCache() {
  statsCache = null;
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
