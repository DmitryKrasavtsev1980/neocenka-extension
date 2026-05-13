/**
 * Типы модуля CRM
 */

/** Телефонный номер */
export interface CrmPhone {
  number: string;    // '+79836299488' — только цифры с +
  label?: string;    // 'мобильный', 'WhatsApp', 'рабочий' — опционально
}

/** Получить основной номер (первый) */
export function getPrimaryPhone(phones: CrmPhone[]): string {
  return phones[0]?.number || '';
}

/** Нормализовать номер — только цифры и + */
export function normalizePhone(raw: string): string {
  return raw.replace(/[^\d+]/g, '');
}

/** Красивый вывод номера: +7 (983) 629-94-88 */
export function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  const d = digits.startsWith('8') ? digits.slice(1) : digits.startsWith('7') ? digits.slice(1) : digits;
  let formatted = '+7';
  if (d.length > 0) formatted += ' (' + d.slice(0, 3);
  if (d.length >= 3) formatted += ') ' + d.slice(3, 6);
  if (d.length > 6) formatted += '-' + d.slice(6, 8);
  if (d.length > 8) formatted += '-' + d.slice(8, 10);
  return formatted;
}

/** Клиент CRM — контактная информация, без привязки к воронке */
export interface CrmClient {
  id?: number;
  full_name: string;
  phones: CrmPhone[];
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

/** Шаблон сообщения для отправки лидам */
export interface CrmMessageTemplate {
  id?: number;
  name: string;
  body: string;
  /** 'suburban' | 'flat' — для автоподстановки по типу объекта */
  category?: string;
  created_at: string;
  updated_at: string;
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
  phones: CrmPhone[];
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
  stage_id?: number;
  date_from?: string;
  date_to?: string;
}

/** Результат поиска лидов */
export interface CrmLeadSearchResult {
  leads: CrmLead[];
  total: number;
  page: number;
  pageSize: number;
  statusCounts?: Record<string, number>;
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

/** Данные для CRM Dashboard */
export interface CrmDashboardStats {
  // KPI
  dealsActive: number;
  dealsActiveSum: number;
  dealsWon: number;
  dealsWonSum: number;
  leadsNew: number;
  tasksToday: number;
  tasksOverdue: number;

  // Воронка по этапам
  funnel: {
    stageId: number;
    stageName: string;
    color: string;
    count: number;
    sum: number;
  }[];

  // Задачи ближайшие (10 штук)
  upcomingTasks: CrmTask[];

  // Лиды по источникам
  leadsBySource: {
    source: string;
    sourceName: string;
    color: string;
    total: number;
    converted: number;
  }[];

  // Последние сделки (5 штук)
  recentDeals: (CrmDeal & { clientName?: string })[];
}
