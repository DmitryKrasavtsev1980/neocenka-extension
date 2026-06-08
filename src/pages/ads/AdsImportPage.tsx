/**
 * Страница импорта объявлений через сервер Неоценка
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  SOURCE_IDS,
} from '@/services/listing-transform';
import {
  getAvailableRegions,
  getAvailableCategories,
  type RegionAdmin,
  type CategoryAdmin,
} from '@/services/data-request-service';
import { adsRepository } from '@/db/repositories/ads.repository';
import { useImportTasks } from '@/contexts/ImportTaskContext';

interface AdsImportPageProps {
  onNavigate?: (page: string) => void;
}

const AdsImportPage: React.FC<AdsImportPageProps> = () => {
  // Справочники с сервера
  const [regions, setRegions] = useState<RegionAdmin[]>([]);
  const [categories, setCategories] = useState<CategoryAdmin[]>([]);

  // Параметры импорта
  const [selectedRegionId, setSelectedRegionId] = useState<number | null>(null);
  const [selectedRegionName, setSelectedRegionName] = useState<string>('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [selectedSourceId, setSelectedSourceId] = useState<number | null>(null);
  const [selectedSellerType, setSelectedSellerType] = useState<number | null>(null);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Состояние
  const [error, setError] = useState('');
  const [loadingRefs, setLoadingRefs] = useState(true);

  // Импорт
  const { tasks, startAdsImport } = useImportTasks();
  const importTask = tasks.find(t => t.type === 'ads-import');
  const adsImportRunning = importTask?.status === 'running';

  // История импортов
  const [importHistory, setImportHistory] = useState<Array<{ source: string; count: number; created_at: string }>>([]);

  // Статистика
  const [totalAds, setTotalAds] = useState(0);

  const loadRefs = useCallback(async () => {
    setLoadingRefs(true);
    try {
      const [serverRegions, serverCategories] = await Promise.all([
        getAvailableRegions(),
        getAvailableCategories(),
      ]);
      setRegions(serverRegions);
      setCategories(serverCategories);
    } catch (e) {
      setError(`Ошибка загрузки справочников: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoadingRefs(false);
    }
  }, []);

  const loadStats = useCallback(async () => {
    const count = await adsRepository.count();
    setTotalAds(count);
    const history = await adsRepository.getImportHistory();
    setImportHistory(history);
  }, []);

  useEffect(() => {
    loadRefs();
    loadStats();
  }, [loadRefs, loadStats]);

  /** Запуск импорта */
  const handleImport = async () => {
    if (!selectedRegionId) {
      setError('Выберите регион');
      return;
    }

    setError('');

    startAdsImport({
      regionId: selectedRegionId,
      regionName: selectedRegionName,
      sourceIds: selectedSourceId ? [selectedSourceId] : undefined,
      categoryIds: selectedCategoryId ? [selectedCategoryId] : undefined,
      sellerTypes: selectedSellerType ? [selectedSellerType] : undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
    });
  };

  const SELLER_TYPES: Record<string, { id: number; label: string }> = {
    owner: { id: 0, label: 'Собственник' },
    agent: { id: 1, label: 'Агент' },
    developer: { id: 3, label: 'Застройщик' },
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-white">Загрузка объявлений</h1>
          <span className="text-sm text-zinc-500 dark:text-zinc-400">
            В базе: {totalAds.toLocaleString('ru-RU')} объявлений
          </span>
        </div>

        {/* Параметры импорта */}
        <div className="bg-white dark:bg-zinc-800 rounded-lg shadow-sm border border-zinc-200 dark:border-zinc-700 p-4 space-y-4">
          <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Параметры загрузки</h2>

          {loadingRefs && (
            <p className="text-xs text-zinc-400">Загрузка справочников...</p>
          )}

          {/* Регион */}
          <div>
            <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Регион</label>
            <select
              value={selectedRegionId ?? ''}
              onChange={(e) => {
                const id = Number(e.target.value) || null;
                setSelectedRegionId(id);
                const region = regions.find(r => r.source_id === id);
                setSelectedRegionName(region?.title || region?.name || '');
              }}
              className="w-full rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-700 px-3 py-2 text-sm text-zinc-900 dark:text-white"
              disabled={loadingRefs}
            >
              <option value="">Выберите регион</option>
              {regions.map((r) => (
                <option key={r.source_id} value={r.source_id}>{r.title || r.name || `Регион ${r.source_id}`}</option>
              ))}
            </select>
          </div>

          {/* Фильтры */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Источник</label>
              <select
                value={selectedSourceId ?? ''}
                onChange={(e) => setSelectedSourceId(Number(e.target.value) || null)}
                className="w-full rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-700 px-3 py-2 text-sm text-zinc-900 dark:text-white"
              >
                <option value="">Все источники</option>
                {Object.entries(SOURCE_IDS).map(([name, id]) => (
                  <option key={id} value={id}>{name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Категория</label>
              <select
                value={selectedCategoryId ?? ''}
                onChange={(e) => setSelectedCategoryId(Number(e.target.value) || null)}
                className="w-full rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-700 px-3 py-2 text-sm text-zinc-900 dark:text-white"
              >
                <option value="">Все категории</option>
                {categories.map((c) => (
                  <option key={c.source_id} value={c.source_id}>{c.title}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Тип продавца</label>
              <select
                value={selectedSellerType ?? ''}
                onChange={(e) => setSelectedSellerType(Number(e.target.value) || null)}
                className="w-full rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-700 px-3 py-2 text-sm text-zinc-900 dark:text-white"
              >
                <option value="">Все типы</option>
                {Object.entries(SELLER_TYPES).map(([, { id, label }]) => (
                  <option key={id} value={id}>{label}</option>
                ))}
              </select>
            </div>
            <div />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Дата от</label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-full rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-700 px-3 py-2 text-sm text-zinc-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Дата до</label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-full rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-700 px-3 py-2 text-sm text-zinc-900 dark:text-white"
              />
            </div>
          </div>

          {/* Кнопка */}
          <button
            onClick={handleImport}
            disabled={adsImportRunning || !selectedRegionId}
            className="w-full rounded-md bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {adsImportRunning && (
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            )}
            {adsImportRunning ? importTask?.detail || 'Загрузка...' : 'Загрузить объявления'}
          </button>
        </div>

        {/* Прогресс */}
        {importTask && importTask.status === 'running' && (
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-zinc-500 dark:text-zinc-400">
              <span>{importTask.detail}</span>
              <span>{importTask.progress}%</span>
            </div>
            <div className="w-full bg-zinc-200 dark:bg-zinc-700 rounded-full h-2">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${importTask.progress}%` }}
              />
            </div>
          </div>
        )}

        {/* Результат */}
        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 text-sm text-red-700 dark:text-red-300">
            {error}
          </div>
        )}

        {importTask && importTask.status === 'done' && (
          <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4 text-sm text-green-700 dark:text-green-300">
            {importTask.detail}
          </div>
        )}

        {importTask && importTask.status === 'error' && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 text-sm text-red-700 dark:text-red-300">
            {importTask.detail}
          </div>
        )}

        {/* История */}
        {importHistory.length > 0 && (
          <div className="bg-white dark:bg-zinc-800 rounded-lg shadow-sm border border-zinc-200 dark:border-zinc-700 p-4">
            <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-3">История загрузок</h2>
            <div className="space-y-2">
              {importHistory.slice(0, 10).map((imp, i) => (
                <div key={i} className="flex justify-between text-xs text-zinc-600 dark:text-zinc-400">
                  <span>{new Date(imp.created_at).toLocaleString('ru-RU')}</span>
                  <span>Источник: {imp.source}</span>
                  <span>{imp.count} новых</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdsImportPage;
