/**
 * Типы модуля CRM
 */

/** Клиент CRM — контактная информация, без привязки к воронке */
export interface CrmClient {
  id?: number;
  full_name: string;
  phone: string;
  email?: string;
  source: string;
  source_url?: string;
  notes?: string;
  status: 'active' | 'paused' | 'closed';
  last_contact_at?: string;
  created_at: string;
  updated_at: string;
}

/** Источник клиента (справочник) */
export interface CrmSource {
  id?: number;
  code: string;
  name: string;
  color: string;
  is_system: boolean;
  created_at: string;
}

/** Сделка — бизнес-процесс, привязанный к клиенту и воронке */
export interface CrmDeal {
  id?: number;
  client_id: number;
  pipeline_id: number;
  stage_id: number;
  title: string;
  status: 'active' | 'won' | 'lost' | 'paused';
  amount?: number;
  ad_data?: CrmClientAdData;
  notes?: string;
  created_at: string;
  updated_at: string;
}

/** Данные объявления, привязанные к сделке */
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

/** Документ/сущность, привязанная к сделке */
export interface CrmDealDocument {
  id?: number;
  deal_id: number;
  type: 'contract' | 'buy_request' | 'sell_request' | 'other';
  title: string;
  content?: string;
  file_url?: string;
  created_at: string;
}

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

/** Сообщение клиента */
export interface CrmMessage {
  id?: number;
  client_id: number;
  deal_id?: number;
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
  status?: string;
}

/** Фильтры для поиска сделок */
export interface CrmDealFilters {
  search?: string;
  client_id?: number;
  pipeline_id?: number;
  stage_id?: number;
  status?: string;
}

/** Результат поиска */
export interface CrmClientSearchResult {
  clients: CrmClient[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CrmDealSearchResult {
  deals: CrmDeal[];
  total: number;
  page: number;
  pageSize: number;
}

/** Лид (Возможность) — входящий контакт из различных источников */
export interface CrmLead {
  id?: number;
  source: string;              // код из справочника источников
  source_url?: string;
  contact_name: string;
  contact_phone: string;
  contact_email?: string;
  ad_data?: CrmClientAdData;
  pipeline_id: number;
  stage_id: number;
  status: 'new' | 'contacted' | 'qualified' | 'converted' | 'rejected';
  client_id?: number;          // после конвертации
  deal_id?: number;            // после конвертации
  notes?: string;
  created_at: string;
  updated_at: string;
}

/** Фильтры для поиска лидов */
export interface CrmLeadFilters {
  search?: string;
  source?: string;
  status?: string;
  pipeline_id?: number;
}

/** Результат поиска лидов */
export interface CrmLeadSearchResult {
  leads: CrmLead[];
  total: number;
  page: number;
  pageSize: number;
}

/** Задача CRM */
export interface CrmTask {
  id?: number;
  title: string;
  description?: string;
  /** К кому привязана задача */
  client_id?: number;
  deal_id?: number;
  lead_id?: number;
  /** Тип задачи */
  type: 'call' | 'meeting' | 'email' | 'deadline' | 'reminder' | 'other';
  /** Приоритет */
  priority: 'low' | 'medium' | 'high' | 'urgent';
  /** Статус */
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  /** Дата и время выполнения (deadline) */
  due_date: string;
  /** Дата завершения */
  completed_at?: string;
  created_at: string;
  updated_at: string;
}

/** Фильтры для поиска задач */
export interface CrmTaskFilters {
  search?: string;
  status?: string;
  type?: string;
  priority?: string;
  client_id?: number;
  deal_id?: number;
  date_from?: string;
  date_to?: string;
}

/** Результат поиска задач */
export interface CrmTaskSearchResult {
  tasks: CrmTask[];
  total: number;
  page: number;
  pageSize: number;
}

/** Действие этапа — автоматически запускается при переходе сделки на этап */
export interface CrmStageAction {
  id?: number;
  stage_id: number;
  /** Тип действия */
  type: 'create_task' | 'send_message' | 'change_status' | 'notify' | 'webhook';
  /** Название действия (для отображения) */
  name: string;
  /** Конфигурация действия — зависит от type */
  config: CrmStageActionConfig;
  /** Включено/выключено */
  is_active: boolean;
  /** Порядок выполнения */
  order: number;
  created_at: string;
  updated_at: string;
}

/** Конфигурация действия этапа */
export interface CrmStageActionConfig {
  // create_task
  task_title?: string;
  task_type?: CrmTask['type'];
  task_priority?: CrmTask['priority'];
  task_due_offset_hours?: number; // через сколько часов после перехода

  // send_message
  message_template?: string;

  // change_status
  target_status?: CrmDeal['status'];

  // notify
  notify_text?: string;

  // webhook
  webhook_url?: string;
  webhook_method?: 'GET' | 'POST';
  webhook_body?: string;
}
