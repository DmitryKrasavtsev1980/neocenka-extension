/**
 * Страница импорта объявлений из Inpars API
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  setInparsToken,
  getInparsToken,
  checkSubscription,
  loadCategories,
  loadRegions,
  getListingsByRegion,
  getListingsByPolygon,
  transformInparsListing,
  INPARS_SOURCE_IDS,
  type InparsCategoryRaw,
  type InparsRegionRaw,
} from '@/services/inpars-service';
import { adsRepository } from '@/db/repositories/ads.repository';
import { db } from '@/db/database';
import type { Ad, InparsCategory } from '@/types';

interface AdsImportPageProps {
  onNavigate?: (page: string) => void;
}

const AdsImportPage: React.FC<AdsImportPageProps> = () => {
  // API ключ
  const [token, setToken] = useState(() => getInparsToken() || '');
  const [tokenSaved, setTokenSaved] = useState(false);
  const [subscription, setSubscription] = useState<{ subscribed: boolean; expires_at?: string; plan?: string } | null>(null);

  // Справочники
  const [categories, setCategories] = useState<InparsCategoryRaw[]>([]);
  const [regions, setRegions] = useState<InparsRegionRaw[]>([]);

  // Параметры импорта
  const [importMode, setImportMode] = useState<'region' | 'polygon'>('region');
  const [selectedRegionId, setSelectedRegionId] = useState<number | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [selectedSourceId, setSelectedSourceId] = useState<number | null>(null);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Состояние
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState('');
  const [result, setResult] = useState<{ inserted: number; updated: number; duplicates: number } | null>(null);
  const [error, setError] = useState('');

  // История импортов
  const [importHistory, setImportHistory] = useState<Array<{ source: string; count: number; created_at: string }>>([]);

  // Статистика
  const [totalAds, setTotalAds] = useState(0);

  const loadStats = useCallback(async () => {
    const count = await adsRepository.count();
    setTotalAds(count);
    const history = await adsRepository.getImportHistory();
    setImportHistory(history);
  }, []);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  /** Сохранить API ключ */
  const handleSaveToken = async () => {
    setInparsToken(token);
    setTokenSaved(true);
    setTimeout(() => setTokenSaved(false), 3000);

    // Проверяем подписку
    try {
      const sub = await checkSubscription();
      setSubscription(sub);

      // Загружаем справочники
      const [cats, regs] = await Promise.all([loadCategories(), loadRegions()]);
      setCategories(cats);
      setRegions(regs);

      // Сохраняем категории в БД
      await saveCategories(cats);
    } catch (e) {
      setError(`Ошибка проверки подписки: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  /** Сохранить категории в БД */
  async function saveCategories(cats: InparsCategoryRaw[]) {
    const now = new Date().toISOString();
    const records: InparsCategory[] = cats.map((c) => ({
      inpars_id: c.id,
      name: c.name,
      name_en: c.name_eng || '',
      parent_id: c.parent_id || null,
      section_id: c.section_id || null,
      type_id: c.type_id || null,
      is_active: true,
      sort_order: 0,
      description: '',
      level: c.level || 0,
      has_children: c.has_children || false,
      imported_at: now,
    }));
    await db.inpars_categories.clear();
    await db.inpars_categories.bulkAdd(records);
  }

  /** Запуск импорта */
  const handleImport = async () => {
    if (!getInparsToken()) {
      setError('Сначала сохраните API ключ');
      return;
    }

    setLoading(true);
    setError('');
    setResult(null);
    setProgress('Запуск импорта...');

    try {
      const options: Record<string, unknown> = {};
      if (selectedCategoryId) options.categoryId = selectedCategoryId;
      if (selectedSourceId) options.sourceId = selectedSourceId;
      if (dateFrom) options.timeStart = Math.floor(new Date(dateFrom).getTime() / 1000);
      if (dateTo) options.timeEnd = Math.floor(new Date(dateTo).getTime() / 1000);

      let rawListings;

      if (importMode === 'region') {
        if (!selectedRegionId) {
          setError('Выберите регион');
          setLoading(false);
          return;
        }
        setProgress('Загрузка объявлений...');
        rawListings = await getListingsByRegion(selectedRegionId, options, (loaded) => {
          setProgress(`Загружено: ${loaded} объявлений...`);
        });
      } else {
        setError('Импорт по полигону пока не реализован (нужна карта)');
        setLoading(false);
        return;
      }

      setProgress(`Получено ${rawListings.length} объявлений. Трансформация...`);

      // Трансформация
      const ads: Ad[] = rawListings.map(transformInparsListing);

      setProgress(`Сохранение ${ads.length} объявлений...`);

      // Сохранение
      const importResult = await adsRepository.bulkInsert(ads);
      setResult(importResult);

      // Записать импорт
      await adsRepository.recordImport({
        source: selectedSourceId ? String(selectedSourceId) : 'all',
        params: JSON.stringify({ regionId: selectedRegionId, ...options }),
        count: importResult.inserted,
        created_at: new Date().toISOString(),
      });

      await loadStats();
      setProgress('');
    } catch (e) {
      setError(`Ошибка импорта: ${e instanceof Error ? e.message : String(e)}`);
      setProgress('');
    } finally {
      setLoading(false);
    }
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

        {/* API ключ */}
        <div className="bg-white dark:bg-zinc-800 rounded-lg shadow-sm border border-zinc-200 dark:border-zinc-700 p-4 space-y-3">
          <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">API ключ Inpars</h2>
          <div className="flex gap-2">
            <input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Введите API ключ Inpars"
              className="flex-1 rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-700 px-3 py-2 text-sm text-zinc-900 dark:text-white placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={handleSaveToken}
              disabled={!token}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {tokenSaved ? 'Сохранено!' : 'Сохранить'}
            </button>
          </div>
          {subscription && (
            <p className={`text-sm ${subscription.subscribed ? 'text-green-600' : 'text-red-600'}`}>
              {subscription.subscribed
                ? `Подписка активна до ${subscription.expires_at || 'не указана'}`
                : 'Подписка не активна'}
            </p>
          )}
        </div>

        {/* Параметры импорта */}
        <div className="bg-white dark:bg-zinc-800 rounded-lg shadow-sm border border-zinc-200 dark:border-zinc-700 p-4 space-y-4">
          <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Параметры загрузки</h2>

          {/* Режим */}
          <div className="flex gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                checked={importMode === 'region'}
                onChange={() => setImportMode('region')}
                className="text-blue-600"
              />
              По региону
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                checked={importMode === 'polygon'}
                onChange={() => setImportMode('polygon')}
                className="text-blue-600"
              />
              По полигону
            </label>
          </div>

          {/* Регион */}
          {importMode === 'region' && (
            <div>
              <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Регион</label>
              <select
                value={selectedRegionId ?? ''}
                onChange={(e) => setSelectedRegionId(Number(e.target.value) || null)}
                className="w-full rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-700 px-3 py-2 text-sm text-zinc-900 dark:text-white"
              >
                <option value="">Выберите регион</option>
                {regions.map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
            </div>
          )}

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
                {Object.entries(INPARS_SOURCE_IDS).map(([name, id]) => (
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
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
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
            disabled={loading}
            className="w-full rounded-md bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading && (
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            )}
            {loading ? progress || 'Загрузка...' : 'Загрузить объявления'}
          </button>
        </div>

        {/* Результат */}
        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 text-sm text-red-700 dark:text-red-300">
            {error}
          </div>
        )}

        {result && (
          <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4 text-sm text-green-700 dark:text-green-300">
            <p className="font-medium">Импорт завершён:</p>
            <ul className="mt-1 list-disc list-inside">
              <li>Новых: {result.inserted}</li>
              <li>Обновлено (изменилась цена): {result.updated}</li>
              <li>Дубликатов (без изменений): {result.duplicates}</li>
            </ul>
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
