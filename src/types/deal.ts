/**
 * Типы данных для расширения поиска сделок с недвижимостью
 */

/**
 * Сделка с недвижимостью (строка из датасета Росреестра)
 */
export interface Deal {
  id?: number;
  /** Количество сделок в группе */
  number: number;
  /** ОКАТО */
  okato: string;
  /** Код региона РФ */
  region_code: string;
  /** Муниципальный район/округ */
  district: string;
  /** Населённый пункт */
  city: string;
  /** Кадастровый квартал */
  quarter_cad_number: string;
  /** Улица */
  street: string;
  /** Код вида объекта недвижимости */
  realestate_type_code: string;
  /** Код материала стен */
  wall_material_code: string;
  /** Год постройки/год ввода в эксплуатацию */
  year_build: number | null;
  /** Этажность (для здания)/номер этажа (для помещения) */
  floor: number | null;
  /** Код назначения объекта / вида разрешенного использования */
  purpose_code: string;
  /** Суммарная площадь объектов недвижимости в группе сделок */
  area: number;
  /** Дата регистрации сделки */
  period_start_date: string;
  /** Суммарная цена сделок в группе */
  deal_price: number;
  /** Валюта */
  currency: string;
  /** Тип документа (ДДУ, ДКП) */
  doc_type: string;
  /** ID импорта */
  import_id: number;
  /** Год и квартал (формат: 2025-Q1) */
  year_quarter: string;
}

/**
 * Запись об импорте файла
 */
export interface ImportRecord {
  id?: number;
  /** Имя файла */
  filename: string;
  /** MD5 хеш файла для проверки дублей */
  file_hash: string;
  /** Год */
  year: number;
  /** Квартал (1-4) */
  quarter: number;
  /** Коды импортированных регионов */
  regions: string[];
  /** Количество импортированных записей */
  records_count: number;
  /** Дата и время импорта */
  imported_at: Date;
}

/**
 * Сырые данные из CSV (до преобразования)
 */
export interface RawCsvRow {
  number: string;
  okato: string;
  region_code: string;
  district: string;
  city: string;
  quarter_cad_number: string;
  street: string;
  realestate_type_code: string;
  wall_material_code: string;
  year_build: string;
  floor: string;
  purpose_code: string;
  area: string;
  period_start_date: string;
  deal_price: string;
  currency: string;
  doc_type: string;
}

/**
 * Параметры фильтрации поиска
 */
export interface SearchFilters {
  /** Коды регионов */
  region_codes?: string[];
  /** Районы */
  districts?: string[];
  /** Населённые пункты */
  cities?: string[];
  /** Типы объектов */
  realestate_type_codes?: string[];
  /** Типы документов */
  doc_types?: string[];
  /** Период: год */
  year?: number;
  /** Период: кварталы */
  quarters?: number[];
  /** Конкретные периоды (формат: "2024-Q1") */
  year_quarters?: string[];
  /** Диапазон цены (от) */
  price_min?: number;
  /** Диапазон цены (до) */
  price_max?: number;
  /** Диапазон площади (от) */
  area_min?: number;
  /** Диапазон площади (до) */
  area_max?: number;
  /** Год постройки (от) */
  year_build_min?: number;
  /** Год постройки (до) */
  year_build_max?: number;
  /** Этаж (от) */
  floor_min?: number;
  /** Этаж (до) */
  floor_max?: number;
  /** Материалы стен */
  wall_material_codes?: string[];
  /** Поиск по городу */
  search_city?: string;
  /** Поиск по улице */
  search_street?: string;
}

/**
 * Результат поиска с пагинацией
 */
export interface SearchResult {
  deals: Deal[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/**
 * Опции импорта
 */
export interface ImportOptions {
  /** Файл для импорта */
  file: File;
  /** Год */
  year: number;
  /** Квартал (1-4) */
  quarter: number;
  /** Коды регионов для фильтрации (пусто = все) */
  region_codes?: string[];
}

/**
 * Статус импорта
 */
export interface ImportStatus {
  /** Идёт ли импорт */
  isImporting: boolean;
  /** Текущий прогресс (0-100) */
  progress: number;
  /** Количество обработанных записей */
  processed: number;
  /** Общее количество записей */
  total: number;
  /** Текущий этап */
  stage: 'reading' | 'parsing' | 'filtering' | 'saving' | 'done' | 'error';
  /** Сообщение об ошибке */
  error?: string;
}

/**
 * Статистика по сделкам
 */
export interface DealsStats {
  /** Общее количество сделок */
  totalDeals: number;
  /** Количество импортов */
  totalImports: number;
  /** Последний импорт */
  lastImport?: Date;
  /** Доступные годы */
  years: number[];
  /** Доступные регионы */
  regions: string[];
}
