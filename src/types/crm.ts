/**
 * Типы модуля CRM
 */

/** Воронка продаж */
export interface CrmPipeline {
  id?: number;
  name: string;
  color: string;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

/** Этап воронки */
export interface CrmStage {
  id?: number;
  pipeline_id: number;
  name: string;
  order: number;
  color: string;
  created_at: string;
}

/** Клиент CRM */
export interface CrmClient {
  id?: number;
  full_name: string;
  phone: string;
  email?: string;
  source: 'manual' | 'cian' | 'avito' | 'other';
  source_url?: string;
  pipeline_id: number;
  stage_id: number;
  ad_data?: CrmClientAdData;
  notes?: string;
  status: 'active' | 'paused' | 'closed';
  last_contact_at?: string;
  created_at: string;
  updated_at: string;
}

/** Данные объявления, привязанные к клиенту */
export interface CrmClientAdData {
  address?: string;
  price?: number;
  property_type?: string;
  area_total?: number;
  rooms?: number;
  floor?: number;
  floors_total?: number;
  url?: string;
  description?: string;
}

/** Сообщение клиента */
export interface CrmMessage {
  id?: number;
  client_id: number;
  direction: 'incoming' | 'outgoing';
  type: 'text' | 'bot';
  content: string;
  bot_generated: boolean;
  sent_at?: string;
  created_at: string;
}

/** Источник парсинга */
export interface CrmParsingSource {
  id?: number;
  url: string;
  source_type: 'cian' | 'avito';
  pipeline_id: number;
  stage_id: number;
  last_parsed_at?: string;
  listings_count: number;
  created_at: string;
}

/** Настройки AI-бота */
export interface CrmBotSettings {
  id?: number;
  zai_token: string;
  context_template: string;
  mode: 'suggest' | 'semi-auto' | 'auto';
  is_active: boolean;
}

/** Фильтры для поиска клиентов */
export interface CrmClientFilters {
  search?: string;
  source?: string;
  pipeline_id?: number;
  stage_id?: number;
  status?: string;
}

/** Результат поиска клиентов */
export interface CrmClientSearchResult {
  clients: CrmClient[];
  total: number;
  page: number;
  pageSize: number;
}
