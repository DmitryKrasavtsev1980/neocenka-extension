/**
 * Типы данных для модуля «Рекламные объявления»
 * Структура повторяет ListingModel из neocenka-extension
 */

/** Элемент истории цены */
export interface PriceHistoryItem {
  date: string;
  price?: number;
  old_price?: number;
  new_price?: number;
}

/** Информация о продавце */
export interface SellerInfo {
  name: string | null;
  type: 'owner' | 'agent' | 'developer' | null;
  is_agent: boolean;
  phone: string | null;
  phone_protected: boolean | null;
}

/** Метаданные источника данных */
export interface SourceMetadata {
  original_source: string | null;
  source_method: 'parser' | 'api' | 'manual' | null;
  original_id: string | null;
  source_internal_id: string | null;
  import_date: string;
  last_sync_date: string | null;
  sync_errors: string[];
}

/** Детали дома */
export interface HouseDetails {
  build_year: number | null;
  cargo_lifts: number | null;
  passenger_lifts: number | null;
  material: string | null;
}

/** Объявление недвижимости */
export interface Ad {
  id?: number;

  // Идентификация
  external_id: string;
  source: string;
  url: string;
  segment_id: number | null;
  object_id: number | null;

  // Контент
  title: string;
  name: string;
  description: string;
  address: string;
  coordinates: { lat: number | null; lng: number | null };

  // Характеристики
  property_type: string;
  area_total: number | null;
  area_living: number | null;
  area_kitchen: number | null;
  floor: number | null;
  floors_total: number | null;
  rooms: number | null;
  house_type: string;
  condition: string;
  year_built: number | null;
  has_balcony: boolean | null;
  bathroom_type: string;
  ceiling_height: number | null;

  // Цена
  price: number | null;
  price_per_meter: number | null;
  price_history: PriceHistoryItem[];

  // Медиа
  photos: string[];
  photos_count: number;

  // Продавец
  seller_name: string;
  seller_type: string;
  phone: string;
  seller_info: SellerInfo;

  // Статусы
  status: 'active' | 'archived' | 'needs_processing';
  processing_status: 'address_needed' | 'duplicate_check_needed' | 'processed' | 'needs_update';

  // Адресная привязка
  address_id: number | null;
  address_match_confidence: string | null;
  address_match_method: string | null;
  address_match_score: number | null;
  address_distance: number | null;

  // Географические ID (Inpars)
  region_id: number | null;
  city_id: number | null;
  metro_id: number | null;
  operation_type: string | null;
  section_id: number | null;
  category_id: number | null;
  original_source_id: number | null;
  is_new_building: boolean | null;
  is_apartments: boolean | null;

  // Дополнительные характеристики
  house_details: HouseDetails;
  renovation_type: string | null;
  bathroom_details: string | null;
  balcony_details: string | null;
  views_count: number | null;
  is_premium: boolean;
  parsing_errors: string[];

  // Даты
  created_at: string;
  updated_at: string;
  created: string | null;
  updated: string | null;
  parsed_at: string | null;

  // Метаданные источника
  source_metadata: SourceMetadata;
}

/** Склеенный объект недвижимости */
export interface AdObject {
  id?: number;
  address_id: number | null;
  property_type: string | null;
  area_total: number | null;
  area_living: number | null;
  area_kitchen: number | null;
  floor: number | null;
  floors_total: number | null;
  rooms: number | null;
  status: string;
  current_price: number | null;
  price_per_meter: number | null;
  price_history: PriceHistoryItem[];
  listings_count: number;
  active_listings_count: number;
  owner_status: string;
  created: string | null;
  updated: string | null;
  last_recalculated_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Адрес с характеристиками дома */
export interface AdAddress {
  id?: number;
  // Связь с сервером
  server_id: number | null;
  house_id: string | null;
  // Основное
  address: string;
  coordinates: { lat: number | null; lng: number | null };
  type: string;
  region: string | null;
  cadno: string | null;
  house_type: string | null;
  serie: string | null;
  // Справочники (ID)
  house_series_id: string | null;
  house_class_id: string | null;
  ceiling_material_id: string | null;
  wall_material_id: string | null;
  house_problem_id: string | null;
  // Параметры
  floors_count: number | null;
  build_year: number | null;
  entrances_count: number | null;
  living_spaces_count: number | null;
  area_total: number | null;
  area_live: number | null;
  ceiling_height: string | null;
  // Коммуникации
  gas_supply: boolean | null;
  individual_heating: boolean | null;
  has_playground: boolean;
  has_sports_area: boolean;
  // Мета
  comment: string;
  source: string;
  synced_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Категория Inpars */
export interface InparsCategory {
  id?: number;
  inpars_id: number | null;
  name: string;
  name_en: string;
  parent_id: number | null;
  section_id: number | null;
  type_id: number | null;
  is_active: boolean;
  sort_order: number;
  description: string;
  level: number;
  has_children: boolean;
  imported_at: string;
}

/** Справочник (универсальный) */
export interface ReferenceItem {
  id?: number;
  server_id?: string;
  name: string;
  color?: string;
  created_at: string;
  updated_at: string;
}

/** Запись импорта объявлений */
export interface AdImport {
  id?: number;
  source: string;
  params: string;
  count: number;
  created_at: string;
}

/** Фильтры поиска объявлений */
export interface AdSearchFilters {
  sources?: string[];
  region_id?: number;
  city_id?: number;
  category_id?: number;
  section_id?: number;
  property_types?: string[];
  rooms?: number[];
  price_min?: number;
  price_max?: number;
  area_min?: number;
  area_max?: number;
  floor_min?: number;
  floor_max?: number;
  floor?: number;
  seller_type?: string[];
  status?: string[];
  processing_status?: string;
  address_id?: number;
  date_from?: string;
  date_to?: string;
  query?: string;
  /** Показывать объекты вместо объявлений */
  view_mode?: 'listings' | 'objects';
}

/** Результат поиска объявлений */
export interface AdSearchResult {
  ads: Ad[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/** Статистика объявлений */
export interface AdStats {
  total: number;
  active: number;
  archived: number;
  avgPrice: number | null;
  avgPricePerMeter: number | null;
  bySource: Record<string, number>;
  byPropertyType: Record<string, number>;
  bySellerType: Record<string, number>;
}
