/**
 * Карточка настроек S3-фотоархива для AdsSettingsPage.
 *
 * Функции:
 * — Форма реквизитов S3 (endpoint, region, bucket, access_key, secret_key, path_prefix)
 * — Проверка соединения
 * — Кнопка «Архивировать все фото»
 * — Прогресс архивации (polling)
 * — Восстановление маппингов
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { db } from '@/db/database';
import {
  getS3Storage,
  saveS3Storage,
  deleteS3Storage,
  testS3Storage,
  getPhotoArchiveBatchStatus,
  type S3StorageConfig,
} from '@/services/api-service';
import { photoArchiveService } from '@/services/photo-archive-service';

const PENDING_KEY = 'photo_archive_pending_batches';

interface PendingBatch {
  id: number;
  startedAt: number;
}

const S3PhotoArchiveCard: React.FC = () => {
  const [storage, setStorage] = useState<S3StorageConfig | null>(null);
  const [loading, setLoading] = useState(true);

  // Форма
  const [endpoint, setEndpoint] = useState('https://s3.ru1.storage.beget.cloud');
  const [region, setRegion] = useState('ru-1');
  const [bucket, setBucket] = useState('');
  const [accessKey, setAccessKey] = useState('');
  const [secretKey, setSecretKey] = useState('');
  const [pathPrefix, setPathPrefix] = useState('neocenka-photos');
  const [showSecret, setShowSecret] = useState(false);

  // Действия
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string } | null>(null);
  const [archiving, setArchiving] = useState(false);
  const [archiveProgress, setArchiveProgress] = useState<{ processed: number; total: number; succeeded: number; failed: number } | null>(null);

  // Статистика
  const [cachedCount, setCachedCount] = useState(0);
  const [totalPhotos, setTotalPhotos] = useState(0);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Загрузка данных
  const loadStorage = useCallback(async () => {
    setLoading(true);
    try {
      const s = await getS3Storage();
      setStorage(s);
      if (s) {
        setEndpoint(s.endpoint);
        setRegion(s.region);
        setBucket(s.bucket);
        setAccessKey(s.access_key);
        setPathPrefix(s.path_prefix);
      }
    } catch (e) {
      // Не критично
    } finally {
      setLoading(false);
    }
  }, []);

  const loadStats = useCallback(async () => {
    try {
      const cached = await photoArchiveService.getCachedCount();
      setCachedCount(cached);

      // Подсчитать все уникальные фото-URL в объявлениях
      const allAds = await db.table('ads').toArray() as any[];
      const urls = new Set<string>();
      for (const ad of allAds) {
        if (ad.photos && Array.isArray(ad.photos)) {
          for (const u of ad.photos) {
            if (typeof u === 'string' && u.startsWith('http')) urls.add(u);
          }
        }
      }
      setTotalPhotos(urls.size);
    } catch (e) {
      // ignore
    }
  }, []);

  useEffect(() => {
    loadStorage();
    loadStats();
    // Восстановление незавершённых батчей
    photoArchiveService.resumePendingBatches().then(() => loadStats()).catch(() => {});
  }, [loadStorage, loadStats]);

  // Опрос активного батча
  const startPolling = useCallback((batchId: number) => {
    if (pollRef.current) clearInterval(pollRef.current);

    const poll = async () => {
      try {
        const status = await getPhotoArchiveBatchStatus(batchId);
        setArchiveProgress({
          processed: status.batch.processed,
          total: status.batch.total,
          succeeded: status.batch.succeeded,
          failed: status.batch.failed,
        });

        if (status.batch.status === 'done' || status.batch.status === 'error') {
          if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
          setArchiving(false);
          // Скачать маппинги
          await photoArchiveService.downloadMappings();
          await loadStats();
          // Убрать из pending
          const pending = await getPendingBatches();
          await savePendingBatches(pending.filter((p: PendingBatch) => p.id !== batchId));
        }
      } catch (e) {
        console.warn('Poll error:', e);
      }
    };

    poll();
    pollRef.current = setInterval(poll, 5000);
  }, [loadStats]);

  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  // Обработчики
  const handleTest = async () => {
    if (!endpoint || !bucket || !accessKey || !secretKey) {
      setTestResult({ ok: false, error: 'Заполните все поля' });
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      const result = await testS3Storage({ endpoint, region, bucket, access_key: accessKey, secret_key: secretKey });
      setTestResult(result);
    } catch (e: any) {
      setTestResult({ ok: false, error: e?.message || String(e) });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    if (!endpoint || !bucket || !accessKey || !secretKey) {
      setTestResult({ ok: false, error: 'Заполните все поля' });
      return;
    }
    setSaving(true);
    try {
      const saved = await saveS3Storage({
        endpoint, region, bucket,
        access_key: accessKey,
        secret_key: secretKey,
        path_prefix: pathPrefix,
        name: 'Мой S3',
      });
      setStorage(saved);
      setTestResult({ ok: true });
      await loadStorage(); // обновить last_test_status
    } catch (e: any) {
      setTestResult({ ok: false, error: e?.message || String(e) });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Удалить реквизиты S3? Архивные фото на S3 останутся, но новые архивироваться не будут.')) return;
    try {
      await deleteS3Storage();
      setStorage(null);
      setBucket('');
      setAccessKey('');
      setSecretKey('');
    } catch (e) {
      // ignore
    }
  };

  const handleArchiveAll = async () => {
    if (!storage) return;
    if (!confirm(`Заархивировать все фото (${totalPhotos} шт.)? Это может занять несколько минут.`)) return;

    setArchiving(true);
    setArchiveProgress(null);
    try {
      // Собираем все URL
      const allAds = await db.table('ads').toArray() as any[];
      const urls = new Set<string>();
      for (const ad of allAds) {
        if (ad.photos && Array.isArray(ad.photos)) {
          for (const u of ad.photos) {
            if (typeof u === 'string' && u.startsWith('http')) urls.add(u);
          }
        }
      }
      const urlList = [...urls];

      // Отфильтровать уже заархивированные
      const cached = await photoArchiveService.resolveCached(urlList);
      const uncached = urlList.filter(u => !cached.has(u));

      if (uncached.length === 0) {
        alert('Все фото уже заархивированы.');
        setArchiving(false);
        return;
      }

      const batchId = await photoArchiveService.submitBatch(uncached);
      if (batchId) {
        startPolling(batchId);
      } else {
        setArchiving(false);
      }
    } catch (e: any) {
      alert('Ошибка: ' + (e?.message || String(e)));
      setArchiving(false);
    }
  };

  const handleSyncMappings = async () => {
    try {
      const count = await photoArchiveService.downloadMappings();
      await loadStats();
      alert(`Загружено маппингов: ${count}`);
    } catch (e: any) {
      alert('Ошибка: ' + (e?.message || String(e)));
    }
  };

  if (loading) {
    return (
      <div className="rounded-xl bg-white p-5 shadow-sm dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700">
        <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">S3-фотоархив</h2>
        <p className="text-xs text-zinc-400 mt-2">Загрузка...</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-white p-5 shadow-sm dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">S3-фотоархив</h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
            Архивация фотографий объявлений в ваше S3-хранилище. Защита от протухания ссылок.
          </p>
        </div>
        {storage?.last_test_status === 'ok' && (
          <span className="inline-flex items-center gap-1 rounded-full bg-green-100 dark:bg-green-900/30 px-2 py-0.5 text-xs font-medium text-green-700 dark:text-green-300">
            <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
            Подключено
          </span>
        )}
        {storage?.last_test_status === 'error' && (
          <span className="inline-flex items-center gap-1 rounded-full bg-red-100 dark:bg-red-900/30 px-2 py-0.5 text-xs font-medium text-red-700 dark:text-red-300">
            <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
            Ошибка
          </span>
        )}
      </div>

      {/* Статистика */}
      <div className="grid grid-cols-2 gap-3 text-xs">
        <div className="rounded-lg bg-zinc-50 dark:bg-zinc-800 p-2.5">
          <div className="text-zinc-400 dark:text-zinc-500">Всего фото в объявлениях</div>
          <div className="text-lg font-semibold text-zinc-700 dark:text-zinc-200 mt-0.5">{totalPhotos.toLocaleString('ru-RU')}</div>
        </div>
        <div className="rounded-lg bg-zinc-50 dark:bg-zinc-800 p-2.5">
          <div className="text-zinc-400 dark:text-zinc-500">Заархивировано в S3</div>
          <div className="text-lg font-semibold text-zinc-700 dark:text-zinc-200 mt-0.5">{cachedCount.toLocaleString('ru-RU')}</div>
        </div>
      </div>

      {/* Форма */}
      <div className="space-y-3">
        <p className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400 uppercase">Реквизиты Beget S3</p>

        <div>
          <label className="text-xs text-zinc-500 dark:text-zinc-400">Endpoint</label>
          <input
            type="text"
            value={endpoint}
            onChange={e => setEndpoint(e.target.value)}
            placeholder="https://s3.ru1.storage.beget.cloud"
            className="mt-1 w-full rounded border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-700 px-3 py-1.5 text-xs text-zinc-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-zinc-500 dark:text-zinc-400">Region</label>
            <input
              type="text"
              value={region}
              onChange={e => setRegion(e.target.value)}
              className="mt-1 w-full rounded border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-700 px-3 py-1.5 text-xs text-zinc-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="text-xs text-zinc-500 dark:text-zinc-400">Bucket</label>
            <input
              type="text"
              value={bucket}
              onChange={e => setBucket(e.target.value)}
              placeholder="my-bucket"
              className="mt-1 w-full rounded border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-700 px-3 py-1.5 text-xs text-zinc-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>

        <div>
          <label className="text-xs text-zinc-500 dark:text-zinc-400">Access Key</label>
          <input
            type="text"
            value={accessKey}
            onChange={e => setAccessKey(e.target.value)}
            className="mt-1 w-full rounded border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-700 px-3 py-1.5 text-xs text-zinc-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="text-xs text-zinc-500 dark:text-zinc-400">Secret Key</label>
          <div className="mt-1 flex gap-2">
            <input
              type={showSecret ? 'text' : 'password'}
              value={secretKey}
              onChange={e => setSecretKey(e.target.value)}
              className="flex-1 rounded border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-700 px-3 py-1.5 text-xs text-zinc-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <button
              onClick={() => setShowSecret(!showSecret)}
              className="rounded border border-zinc-300 dark:border-zinc-600 px-2 text-xs text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-600"
            >
              {showSecret ? 'Скрыть' : 'Показать'}
            </button>
          </div>
        </div>

        <div>
          <label className="text-xs text-zinc-500 dark:text-zinc-400">Path prefix</label>
          <input
            type="text"
            value={pathPrefix}
            onChange={e => setPathPrefix(e.target.value)}
            className="mt-1 w-full rounded border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-700 px-3 py-1.5 text-xs text-zinc-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Результат теста */}
      {testResult && (
        <div className={`rounded-md px-3 py-2 text-xs ${
          testResult.ok
            ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-300'
            : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300'
        }`}>
          {testResult.ok ? 'Соединение успешно' : `Ошибка: ${testResult.error}`}
        </div>
      )}

      {/* Кнопки */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={handleTest}
          disabled={testing || !endpoint || !bucket || !accessKey || !secretKey}
          className="rounded-md bg-zinc-100 dark:bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 disabled:opacity-50"
        >
          {testing ? 'Проверка...' : 'Проверить'}
        </button>
        <button
          onClick={handleSave}
          disabled={saving || !endpoint || !bucket || !accessKey || !secretKey}
          className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? 'Сохранение...' : 'Сохранить'}
        </button>
        {storage && (
          <button
            onClick={handleDelete}
            className="rounded-md bg-zinc-100 dark:bg-zinc-800 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
          >
            Удалить
          </button>
        )}
      </div>

      {/* Архивация */}
      {storage && (
        <div className="border-t border-zinc-200 dark:border-zinc-700 pt-4 space-y-3">
          <div className="flex flex-wrap gap-2">
            <button
              onClick={handleArchiveAll}
              disabled={archiving || totalPhotos === 0}
              className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1.5"
            >
              {archiving && (
                <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              )}
              {archiving ? 'Архивация...' : 'Архивировать все фото'}
            </button>
            <button
              onClick={handleSyncMappings}
              className="rounded-md bg-zinc-100 dark:bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700"
            >
              Загрузить маппинги с сервера
            </button>
          </div>

          {archiveProgress && (
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs text-zinc-500 dark:text-zinc-400">
                <span>
                  Обработано {archiveProgress.processed.toLocaleString('ru-RU')} из {archiveProgress.total.toLocaleString('ru-RU')}
                </span>
                <span>
                  Успешно: {archiveProgress.succeeded}
                  {archiveProgress.failed > 0 && <span className="text-red-500 ml-1">Ошибок: {archiveProgress.failed}</span>}
                </span>
              </div>
              <div className="w-full bg-zinc-200 dark:bg-zinc-700 rounded-full h-2">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all duration-500"
                  style={{ width: `${archiveProgress.total > 0 ? (archiveProgress.processed / archiveProgress.total * 100) : 0}%` }}
                />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// Вспомогательные функции для chrome.storage.local
async function getPendingBatches(): Promise<PendingBatch[]> {
  return new Promise((resolve) => {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      chrome.storage.local.get(PENDING_KEY, (result) => {
        const raw = (result as Record<string, unknown>)[PENDING_KEY];
        resolve(Array.isArray(raw) ? raw as PendingBatch[] : []);
      });
    } else {
      resolve([]);
    }
  });
}

async function savePendingBatches(pending: PendingBatch[]): Promise<void> {
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    chrome.storage.local.set({ [PENDING_KEY]: pending });
  }
}

export default S3PhotoArchiveCard;
