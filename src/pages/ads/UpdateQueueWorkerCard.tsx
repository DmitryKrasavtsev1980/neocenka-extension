/**
 * Панель воркера очереди актуализации (пилот, регион 54).
 *
 * Воркер живёт в этой вкладке: пока она открыта, он берёт заявки из
 * update_queue на data-server, парсит ЦИАН/Авито и отдаёт обновления.
 * Ограничение — на IP (мобильный интернет ПК), поэтому здесь видны
 * дневной кап и пауза после бана: при паузe IP меняют переподключением
 * модема и жмут «Продолжить».
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  UpdateQueueWorker,
  type WorkerStatus,
  type WorkerSite,
} from '@/services/update-queue-worker';
import { updateQueueApi, DEFAULT_QUEUE_API_URL, type QueueStats } from '@/services/update-queue-api';

const UpdateQueueWorkerCard: React.FC = () => {
  const workerRef = useRef<UpdateQueueWorker | null>(null);
  const [status, setStatus] = useState<WorkerStatus | null>(null);
  const [site, setSite] = useState<WorkerSite>('cian');
  const [apiUrl, setApiUrl] = useState(DEFAULT_QUEUE_API_URL);
  const [queueStats, setQueueStats] = useState<QueueStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Останавливаем воркер при уходе со страницы — вкладка = процесс
  useEffect(() => {
    return () => {
      workerRef.current?.stop();
    };
  }, []);

  // Периодическая сводка по очереди, пока воркер запущен
  useEffect(() => {
    if (!status?.isRunning) return;
    const timer = setInterval(async () => {
      try {
        setQueueStats(await updateQueueApi.getQueueStats());
      } catch { /* сводка не критична */ }
    }, 30_000);
    return () => clearInterval(timer);
  }, [status?.isRunning]);

  const start = async () => {
    setError(null);
    updateQueueApi.setBaseUrl(apiUrl);
    const worker = new UpdateQueueWorker(site);
    workerRef.current = worker;
    worker.onStatus(setStatus);
    worker.start().catch((err) => {
      setError(err instanceof Error ? err.message : String(err));
    });
  };

  const stop = () => {
    workerRef.current?.stop();
    workerRef.current = null;
  };

  const resume = () => {
    workerRef.current?.resumeAfterIpChange();
  };

  const refreshQueue = async () => {
    try {
      updateQueueApi.setBaseUrl(apiUrl);
      setQueueStats(await updateQueueApi.getQueueStats());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const paused = !!status?.pausedUntil && status.pausedUntil > Date.now();
  const running = !!status?.isRunning;

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-700 dark:bg-zinc-900">
      <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
        Воркер актуализации (пилот)
      </h2>
      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
        Берёт заявки из очереди региона, парсит объявления и отправляет обновления на сервер.
        Темп ограничен вашим IP: дневной кап и пауза при блокировке защищают мобильный интернет.
      </p>

      {/* Настройки подключения */}
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="text-xs text-zinc-500 dark:text-zinc-400">API региона</span>
          <input
            value={apiUrl}
            onChange={(e) => setApiUrl(e.target.value)}
            disabled={running}
            className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200"
          />
        </label>
        <label className="block">
          <span className="text-xs text-zinc-500 dark:text-zinc-400">Площадка</span>
          <select
            value={site}
            onChange={(e) => setSite(e.target.value as WorkerSite)}
            disabled={running}
            className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200"
          >
            <option value="cian">ЦИАН</option>
            <option value="avito">Авито</option>
          </select>
        </label>
      </div>

      {/* Кнопки */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {!running ? (
          <button
            onClick={start}
            className="rounded-lg bg-zinc-800 px-4 py-2 text-sm font-medium text-white dark:bg-zinc-700"
          >
            Запустить
          </button>
        ) : (
          <button
            onClick={stop}
            className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
          >
            Остановить
          </button>
        )}
        {paused && (
          <button
            onClick={resume}
            title="IP сменён переподключением модема — снять паузу и продолжить"
            className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
          >
            Сменил IP — продолжить
          </button>
        )}
        <button
          onClick={refreshQueue}
          className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
        >
          Сводка очереди
        </button>
      </div>

      {error && (
        <p className="mt-3 text-xs text-red-600 dark:text-red-400">{error}</p>
      )}

      {/* Состояние */}
      {status && (
        <div className="mt-4 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
          <div>
            <div className="text-zinc-500 dark:text-zinc-400">Обработано</div>
            <div className="mt-0.5 text-sm font-medium text-zinc-800 dark:text-zinc-200">
              {status.processed}
            </div>
          </div>
          <div>
            <div className="text-zinc-500 dark:text-zinc-400">С изменениями</div>
            <div className="mt-0.5 text-sm font-medium text-zinc-800 dark:text-zinc-200">
              {status.matched}
            </div>
          </div>
          <div>
            <div className="text-zinc-500 dark:text-zinc-400">Ошибки</div>
            <div className="mt-0.5 text-sm font-medium text-zinc-800 dark:text-zinc-200">
              {status.errors}
            </div>
          </div>
          <div>
            <div className="text-zinc-500 dark:text-zinc-400">За сегодня / кап</div>
            <div className="mt-0.5 text-sm font-medium text-zinc-800 dark:text-zinc-200">
              {status.todayCount} / {status.dailyCap}
            </div>
          </div>
        </div>
      )}

      {/* Пауза после бана */}
      {paused && (
        <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
          Площадка в паузе до {new Date(status!.pausedUntil!).toLocaleTimeString()}.
          Причина: {status!.pausedReason || 'сигнал блокировки'}.
          Смените IP (переподключите модем) и нажмите «Сменил IP — продолжить».
        </div>
      )}

      {/* Сводка очереди на сервере */}
      {queueStats && (
        <div className="mt-4 rounded-lg border border-zinc-200 p-3 text-xs dark:border-zinc-700">
          <div className="font-medium text-zinc-700 dark:text-zinc-300">Очередь на сервере</div>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div>Ожидают: <b>{queueStats.counts.pending}</b></div>
            <div>В работе: <b>{queueStats.counts.claimed}</b></div>
            <div>Готово: <b>{queueStats.counts.done}</b></div>
            <div>Провалено: <b>{queueStats.counts.failed}</b></div>
          </div>
          {queueStats.workers.length > 0 && (
            <div className="mt-2 text-zinc-500 dark:text-zinc-400">
              Воркеры:{' '}
              {queueStats.workers
                .map((w) => `${w.browser_id} (${w.holding})`)
                .join(', ')}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default UpdateQueueWorkerCard;
