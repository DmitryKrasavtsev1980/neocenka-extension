/**
 * HTTP-клиент очереди актуализации на data-server региона.
 *
 * Цикл воркера поверх update_queue:
 *   claim (аренда 10 мин) → парс карточки → complete | release → heartbeat
 *
 * Адрес data-server отличается от admin API (api-service.ts) — у каждого
 * региона свой сервер, поэтому базовый URL настраивается.
 */

/** Источник в том виде, в каком его ждёт сервер в update_tasks.source */
export type SourceDomain = 'avito.ru' | 'cian.ru';

/** Одна строка ответа POST /api/update/claim */
export interface ClaimedAd {
  queue_id: number;
  id: number;
  url: string;
  price: number | null;
  status: string;
  photos: string[] | null;
  price_history: { date: string; price?: number; old_price?: number; new_price?: number }[] | null;
  source: string | null;
  parsed_at: string | null;
}

/** Данные для POST /api/update/complete/{queue_id} (без browser_id) */
export interface AdUpdateData {
  price?: number;
  price_per_meter?: number;
  status?: string;
  photos?: string[];
  price_history?: { date: string; price?: number; old_price?: number; new_price?: number }[];
  seller_name?: string;
  seller_type?: string;
  /**
   * Дата изменения объявления на площадке (ad.updated).
   * Не updated_at — на сервере это Laravel-таймстамп правки строки.
   */
  updated?: string;
}

/** Сводка по очереди (GET /api/update/queue-stats) */
export interface QueueStats {
  counts: { pending: number; claimed: number; done: number; failed: number };
  workers: { browser_id: string; holding: number; lease_until: string | null }[];
  expired_claims: number;
  tasks: { processing: number; completed: number; failed: number };
}

/** Данные задачи на обновление (POST /api/update/tasks) */
export interface UpdateTaskDto {
  id: number;
  name: string;
  source: string | null;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  total: number;
  matched: number;
  processed: number;
  failed_count: number;
}

/** URL data-server региона по умолчанию (пилот — Новосибирск) */
export const DEFAULT_QUEUE_API_URL = 'https://54.neocenka.ru/api';

class UpdateQueueApi {
  private baseUrl: string;

  constructor(baseUrl: string = DEFAULT_QUEUE_API_URL) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  setBaseUrl(url: string) {
    this.baseUrl = url.replace(/\/$/, '');
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, init);
    if (!response.ok) {
      throw new Error(`API error: ${response.status} ${response.statusText}`);
    }
    return response.json();
  }

  /**
   * Создать задачу на обновление. filter_data: { update_all: true } —
   * складывает в очередь все объявления фильтра.
   */
  async createTask(params: {
    name?: string;
    source?: SourceDomain;
    filter_data?: Record<string, unknown>;
    saved_filter_id?: number;
  }): Promise<{ success: boolean; task: UpdateTaskDto; ads_found: number }> {
    return this.request('/update/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
  }

  /**
   * Взять порцию объявлений в аренду (10 минут).
   * source: 'avito.ru' | 'cian.ru'; null — не фильтровать.
   */
  async claim(browserId: string, source: SourceDomain | null, limit: number): Promise<ClaimedAd[]> {
    const data = await this.request<{ data: ClaimedAd[] }>('/update/claim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        browser_id: browserId,
        source: source ?? undefined,
        limit: Math.min(Math.max(limit, 1), 100),
      }),
    });
    return data.data || [];
  }

  /**
   * Отметить строку очереди обработанной и записать данные в ads.
   * id — это queue_id, НЕ ad.id.
   */
  async complete(queueId: number, browserId: string, data: AdUpdateData): Promise<{ success: boolean; ad_id: number }> {
    return this.request(`/update/complete/${queueId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ browser_id: browserId, ...data }),
    });
  }

  /** Вернуть строку в очередь (ошибка парсинга). После 3 попыток — failed. */
  async release(queueId: number, browserId: string, error?: string): Promise<{ success: boolean }> {
    return this.request(`/update/release/${queueId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ browser_id: browserId, error }),
    });
  }

  /**
   * Пульс воркера: продлевает аренду строк, которые он ещё держит.
   * queue_ids обязательны для длинного парсинга — иначе через 10 минут
   * строку отберёт сосед.
   */
  async heartbeat(
    browserId: string,
    source: SourceDomain | null,
    stats: { processed: number; matched: number; errors: number },
    queueIds: number[] = []
  ): Promise<{ success: boolean; extended: number }> {
    return this.request('/update/heartbeat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        browser_id: browserId,
        source: source ?? undefined,
        queue_ids: queueIds,
        ...stats,
      }),
    });
  }

  /** Сводка по очереди: счётчики, кто держит аренды, протухшие. */
  async getQueueStats(): Promise<QueueStats> {
    const data = await this.request<{ data: QueueStats }>('/update/queue-stats');
    return data.data;
  }

  /** Доступность API региона. */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/health`);
      return response.ok;
    } catch {
      return false;
    }
  }
}

export const updateQueueApi = new UpdateQueueApi();
