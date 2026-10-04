/**
 * Воркер очереди актуализации объявлений.
 *
 * Пилот (регион 54): 1–2 Chrome-профиля на ПК с мобильным интернетом.
 * Ограничение — на IP, не на число воркеров, поэтому здесь общий троттлер:
 * поштучные задержки со случайным разбросом, дневные капы по площадкам
 * и пауза площадки при сигнале блокировки (403/429/капча).
 *
 * Цикл поверх update_queue:
 *   claim (аренда 10 мин) → быстрая проверка → полный парсинг при изменении
 *   → complete | release → heartbeat
 */

import { ClaimedAd, AdUpdateData, SourceDomain, updateQueueApi } from '@/services/update-queue-api';
import { delayWithJitter, isBlockSignal, MAX_CONSECUTIVE_BLOCKS } from '@/services/request-throttle';
import { loadAdUpdateSettings } from '@/services/ad-update-settings';
import { actualizeCianAd } from '@/services/cian-update-service';
import { actualizeAvitoAd } from '@/services/avito-update-service';
import type { Ad, PriceHistoryItem } from '@/types';

/** Пауза площадки после сигнала блокировки, мс (2–6 ч по плану пилота) */
const BLOCK_COOLDOWN_MS = 3 * 60 * 60 * 1000;

/** Дневные капы запросов на площадку — защита мобильного IP от бана */
const DEFAULT_DAILY_CAPS: Record<'cian' | 'avito', number> = {
  cian: 1200,
  avito: 1500,
};

/** Рабочее окно: вне него воркер спит (норма пилота — длинный день) */
const DEFAULT_WORK_WINDOW = { startHour: 8, endHour: 23 };

export type WorkerSite = 'cian' | 'avito';

export interface WorkerStatus {
  isRunning: boolean;
  browserId: string;
  site: WorkerSite;
  processed: number;
  matched: number;
  errors: number;
  todayCount: number;
  dailyCap: number;
  /** Пауза площадки до этой метки времени (после бана), null — нет паузы */
  pausedUntil: number | null;
  pausedReason: string | null;
  consecutiveBlocks: number;
  lastError: string | null;
  lastActivityAt: string | null;
}

interface PersistedState {
  browserId: string;
  day: string;
  todayCount: number;
  pausedUntil: number | null;
  pausedReason: string | null;
}

const STORAGE_KEY = 'ret_update_queue_worker_v1';

/** Сегодняшний день в локальной зоне — ключ дневного капа */
function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Устойчивый id воркера — живёт между перезапусками, виден в queue-stats */
async function getBrowserId(): Promise<string> {
  const state = await loadState();
  return state.browserId;
}

async function loadState(): Promise<PersistedState> {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  const prev = (stored[STORAGE_KEY] || {}) as Partial<PersistedState>;
  // Дневной кап обнуляется с новым календарным днём
  const day = prev.day === todayKey() ? prev.day : todayKey();
  const todayCount = prev.day === todayKey() ? (prev.todayCount ?? 0) : 0;
  return {
    browserId: prev.browserId ?? `updater-${Math.random().toString(36).slice(2, 10)}`,
    day,
    todayCount,
    pausedUntil: prev.pausedUntil ?? null,
    pausedReason: prev.pausedReason ?? null,
  };
}

async function saveState(patch: Partial<PersistedState>): Promise<PersistedState> {
  const current = await loadState();
  const next = { ...current, ...patch, day: todayKey() };
  await chrome.storage.local.set({ [STORAGE_KEY]: next });
  return next;
}

/** Извлечь ID фото из URL — для дедупликации при мерже */
function extractPhotoId(url: string): string {
  const match = url.match(/\/img\/(\d+)/) || url.match(/\/(\d{10,})/);
  return match ? match[1] : url.split('?')[0];
}

/** Битый URL старого формата Avito CDN — выбрасываем при мерже */
function isBrokenAvitoUrl(url: string): boolean {
  return typeof url === 'string' && /https?:\/\/\d+\.img\.avito\.st\/image\/1\//.test(url);
}

/** Дедупликация истории цен по паре «день + цена» */
function mergePriceHistory(existing: PriceHistoryItem[], newEntries: PriceHistoryItem[]): PriceHistoryItem[] {
  const toDayPriceKey = (date: string, price: number) => {
    const d = new Date(date);
    const day = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
    return `${day}|${price}`;
  };
  const keys = new Set(existing.map(h => toDayPriceKey(h.date, h.price ?? h.new_price ?? 0)));
  const merged: PriceHistoryItem[] = [...existing];
  for (const entry of newEntries) {
    const price = entry.price ?? entry.new_price ?? 0;
    const key = toDayPriceKey(entry.date, price);
    if (!keys.has(key)) {
      merged.push(entry);
      keys.add(key);
    }
  }
  return merged.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

/** Контекст одного прогона */
interface WorkerContext {
  site: WorkerSite;
  sourceDomain: SourceDomain;
  processed: number;
  matched: number;
  errors: number;
  consecutiveBlocks: number;
  lastError: string | null;
  lastActivityAt: string | null;
  todayCount: number;
  dailyCap: number;
  pausedUntil: number | null;
  pausedReason: string | null;
}

/**
 * Воркер очереди актуализации.
 *
 * Запускается из UI расширения (страница остаётся открытой — так надёжнее,
 * чем фоновый service worker MV3 с его 30-секундным простоем).
 */
export class UpdateQueueWorker {
  private ctx: WorkerContext;
  private shouldStop = false;
  private isRunning = false;
  private listeners: Array<(status: WorkerStatus) => void> = [];

  constructor(private site: WorkerSite = 'cian') {
    this.ctx = {
      site,
      sourceDomain: site === 'cian' ? 'cian.ru' : 'avito.ru',
      processed: 0,
      matched: 0,
      errors: 0,
      consecutiveBlocks: 0,
      lastError: null,
      lastActivityAt: null,
      todayCount: 0,
      dailyCap: DEFAULT_DAILY_CAPS[site],
      pausedUntil: null,
      pausedReason: null,
    };
  }

  onStatus(cb: (status: WorkerStatus) => void) {
    this.listeners.push(cb);
    cb(this.getStatus());
  }

  getStatus(): WorkerStatus {
    return {
      isRunning: this.isRunning,
      browserId: '',
      site: this.ctx.site,
      processed: this.ctx.processed,
      matched: this.ctx.matched,
      errors: this.ctx.errors,
      todayCount: this.ctx.todayCount,
      dailyCap: this.ctx.dailyCap,
      pausedUntil: this.ctx.pausedUntil,
      pausedReason: this.ctx.pausedReason,
      consecutiveBlocks: this.ctx.consecutiveBlocks,
      lastError: this.ctx.lastError,
      lastActivityAt: this.ctx.lastActivityAt,
    };
  }

  private notify() {
    const status = this.getStatus();
    for (const cb of this.listeners) cb(status);
  }

  /** Главный цикл: claim → обработка → pause → повтор */
  async start(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;
    this.shouldStop = false;

    try {
      const state = await loadState();
      this.ctx.todayCount = state.todayCount;
      this.ctx.pausedUntil = state.pausedUntil;
      this.ctx.pausedReason = state.pausedReason;

      const healthy = await updateQueueApi.healthCheck();
      if (!healthy) {
        throw new Error(`API региона недоступен: ${updateQueueApi.getBaseUrl()}`);
      }

      const browserId = await getBrowserId();
      console.log(`[UpdateQueueWorker] Started as ${browserId}, site=${this.ctx.site}`);

      while (!this.shouldStop) {
        // Пауза после бана — не долбить площадку с тем же IP
        if (this.ctx.pausedUntil && Date.now() < this.ctx.pausedUntil) {
          await this.sleep(Math.min(this.ctx.pausedUntil - Date.now(), 60_000));
          continue;
        }
        if (this.ctx.pausedUntil && Date.now() >= this.ctx.pausedUntil) {
          this.ctx.pausedUntil = null;
          this.ctx.pausedReason = null;
          await saveState({ pausedUntil: null, pausedReason: null });
          this.notify();
        }

        // Дневной кап — берегём мобильный IP
        if (this.ctx.todayCount >= this.ctx.dailyCap) {
          await this.sleep(5 * 60_000);
          continue;
        }

        // Ночная пауза: вне рабочего окна спим
        const hour = new Date().getHours();
        if (hour < DEFAULT_WORK_WINDOW.startHour || hour >= DEFAULT_WORK_WINDOW.endHour) {
          await this.sleep(10 * 60_000);
          continue;
        }

        const handled = await this.processBatch();
        if (this.shouldStop) break;
        if (handled === 0) {
          // очередь пуста — досоздаём задачу и ждём
          await this.ensureQueue();
          await this.sleep(60_000);
        }
      }
    } finally {
      this.isRunning = false;
      console.log(`[UpdateQueueWorker] Stopped. processed=${this.ctx.processed} matched=${this.ctx.matched} errors=${this.ctx.errors}`);
      this.notify();
    }
  }

  stop() {
    this.shouldStop = true;
  }

  /** Портция в аренду: быстрая проверка каждой карточки, парсинг — только при изменении */
  private async processBatch(): Promise<number> {
    const browserId = await getBrowserId();
    const ads = await updateQueueApi.claim(browserId, this.ctx.sourceDomain, 5);
    if (ads.length === 0) return 0;

    console.log(`[UpdateQueueWorker] Claimed ${ads.length} ads`);
    const inFlight = new Set(ads.map(a => a.queue_id));

    for (const ad of ads) {
      if (this.shouldStop) {
        await updateQueueApi.release(ad.queue_id, browserId, 'worker stopped').catch(() => {});
        inFlight.delete(ad.queue_id);
        continue;
      }

      try {
        const update = await this.processAd(ad);
        await updateQueueApi.complete(ad.queue_id, browserId, update ?? {});
        if (update) this.ctx.matched++;
        this.ctx.processed++;
        this.ctx.todayCount++;
        await saveState({ todayCount: this.ctx.todayCount });
        this.ctx.consecutiveBlocks = 0;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[UpdateQueueWorker] Ad ${ad.id} (queue ${ad.queue_id}) failed:`, msg);
        this.ctx.errors++;
        this.ctx.processed++;
        this.ctx.lastError = msg;

        // Сигнал блокировки → возвращаем строку и уводим площадку в паузу
        if (isBlockSignal(msg)) {
          this.ctx.consecutiveBlocks++;
          await updateQueueApi.release(ad.queue_id, browserId, msg).catch(() => {});
          if (this.ctx.consecutiveBlocks >= MAX_CONSECUTIVE_BLOCKS) {
            await this.pauseSite(msg);
            break;
          }
        } else {
          await updateQueueApi.release(ad.queue_id, browserId, msg).catch(() => {});
        }
      } finally {
        inFlight.delete(ad.queue_id);
      }

      this.ctx.lastActivityAt = new Date().toISOString();
      this.notify();
      await this.sendHeartbeat(browserId, [...inFlight]);

      const settings = await loadAdUpdateSettings();
      await delayWithJitter(this.ctx.site === 'cian' ? settings.cianCheckDelayMs : settings.avitoCheckDelayMs);
    }

    await this.sendHeartbeat(browserId, []);
    return ads.length;
  }

  /**
   * Обработка одного объявления.
   *
   * Полный парсинг (вкладка) — только когда карточка жива и что-то изменилось;
   * снятые и неизменённые закрываются без открытия страницы.
   */
  private async processAd(ad: ClaimedAd): Promise<AdUpdateData | null> {
    // actualize* ждут объект Ad; id не передаём, чтобы сервисы не писали
    // в локальную IndexedDB — результат отправляем на сервер через complete()
    const adLike = {
      id: undefined,
      url: ad.url,
      price: ad.price,
      status: ad.status,
      photos: ad.photos ?? [],
      price_history: ad.price_history ?? [],
      source: ad.source ?? this.ctx.site,
    } as unknown as Ad;

    const result = this.ctx.site === 'cian'
      ? await actualizeCianAd(adLike)
      : await actualizeAvitoAd(adLike);

    if (!result.success) {
      throw new Error(result.error || 'actualize failed');
    }

    const updated = result.ad;
    if (!updated) return null;

    // Изменений нет — закрываем строку пустым апдейтом (обновится parsed_at)
    const nothingChanged = !result.changes || result.changes.length === 0;
    if (nothingChanged) return null;

    // Мерж фото: отбрасываем битые URL Avito, дедуплицируем по ID
    const existingPhotos = ad.photos ?? [];
    const newPhotos = updated.photos ?? [];
    const hasNewValid = newPhotos.some(p => !isBrokenAvitoUrl(p));
    const base = hasNewValid ? existingPhotos.filter(p => !isBrokenAvitoUrl(p)) : existingPhotos;
    const seen = new Set(base.map(extractPhotoId));
    const mergedPhotos = [...base, ...newPhotos.filter(p => !seen.has(extractPhotoId(p)))];

    const mergedHistory = mergePriceHistory(ad.price_history ?? [], updated.price_history ?? []);

    return {
      price: updated.price ?? undefined,
      price_per_meter: updated.price_per_meter ?? undefined,
      status: updated.status,
      photos: mergedPhotos.length > 0 ? mergedPhotos : undefined,
      price_history: mergedHistory.length > 0 ? mergedHistory : undefined,
      seller_name: updated.seller_name ?? undefined,
      seller_type: updated.seller_type ?? undefined,
      updated_at: updated.updated_at || new Date().toISOString(),
    };
  }

  /** Пауза площадки после бана: задачи остаются в очереди, IP можно сменить */
  private async pauseSite(reason: string) {
    const until = Date.now() + BLOCK_COOLDOWN_MS;
    this.ctx.pausedUntil = until;
    this.ctx.pausedReason = reason;
    this.ctx.consecutiveBlocks = 0;
    await saveState({ pausedUntil: until, pausedReason: reason });
    console.warn(`[UpdateQueueWorker] Site paused until ${new Date(until).toISOString()}: ${reason}`);
    this.notify();
  }

  /** Смена IP оператором → снимаем паузу и продолжаем */
  async resumeAfterIpChange() {
    this.ctx.pausedUntil = null;
    this.ctx.pausedReason = null;
    await saveState({ pausedUntil: null, pausedReason: null });
    this.notify();
  }

  /** Поручить серверу сложить в очередь всё (если пусто) */
  private async ensureQueue() {
    try {
      const result = await updateQueueApi.createTask({
        name: `Авто-обновление ${this.ctx.sourceDomain}`,
        source: this.ctx.sourceDomain,
        filter_data: { update_all: true },
      });
      console.log(`[UpdateQueueWorker] Enqueued task #${result.task.id}, ads: ${result.ads_found}`);
    } catch (err) {
      console.warn('[UpdateQueueWorker] Enqueue failed:', err);
    }
  }

  private async sendHeartbeat(browserId: string, queueIds: number[]) {
    try {
      await updateQueueApi.heartbeat(
        browserId,
        this.ctx.sourceDomain,
        { processed: this.ctx.processed, matched: this.ctx.matched, errors: this.ctx.errors },
        queueIds
      );
    } catch (err) {
      console.warn('[UpdateQueueWorker] Heartbeat failed:', err);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
