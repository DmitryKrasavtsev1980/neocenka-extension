/**
 * Страница настроек модуля «Рекламные объявления»
 * — API ключ Inpars + проверка подписки
 * — Загрузка справочников (категории) из Inpars
 * — Выбор категорий для использования в фильтрах
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  setInparsToken,
  getInparsToken,
  loadInparsToken,
  checkSubscription,
  loadCategories,
  loadRegions,
  loadSections,
  INPARS_SOURCE_IDS,
  type InparsCategoryRaw,
  type InparsRegionRaw,
  type InparsSectionRaw,
} from '@/services/inpars-service';
import { db } from '@/db/database';
import type { InparsCategory } from '@/types';
import { addressSyncService } from '@/services/address-sync-service';

const TYPE_ID_LABELS: Record<number, string> = {
  1: 'Аренда',
  2: 'Продажа',
};

const STORAGE_KEY_SELECTED_CATEGORIES = 'inpars_selected_categories';
const STORAGE_KEY_SELECTED_SOURCES = 'inpars_selected_sources';

const SOURCE_LABELS: Record<string, string> = {
  avito: 'avito.ru',
  cian: 'cian.ru',
  youla: 'youla.io',
  sob: 'sob.ru',
  bazarpnz: 'bazarpnz.ru',
  move: 'move.ru',
  yandex: 'realty.yandex.ru',
  gipernn: 'gipernn.ru',
  orsk: 'orsk.ru',
  domclick: 'domclick.ru',
  doskaYkt: 'doska.ykt.ru',
};

/** Загрузить выбранные значения из chrome.storage */
async function loadFromStorage<T>(key: string): Promise<T> {
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    return new Promise((resolve) => {
      chrome.storage.local.get(key, (result) => {
        resolve((result as Record<string, T>)[key] ?? ([] as unknown as T));
      });
    });
  }
  return ([] as unknown) as T;
}

/** Сохранить значения в chrome.storage */
async function saveToStorage<T>(key: string, value: T): Promise<void> {
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    chrome.storage.local.set({ [key]: value });
  }
}
const AdsSettingsPage: React.FC = () => {
  const [token, setToken] = useState('');
  const [tokenLoaded, setTokenLoaded] = useState(false);
  const [tokenSaved, setTokenSaved] = useState(false);
  const [subscription, setSubscription] = useState<{
    subscribed: boolean;
    expires_at?: string;
    plan?: string;
    regionId?: number;
    typeId?: number;
  } | null>(null);
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);

  // Справочники для подписки
  const [regions, setRegions] = useState<InparsRegionRaw[]>([]);
  const [sections, setSections] = useState<InparsSectionRaw[]>([]);

  // Справочники — категории
  const [allCategories, setAllCategories] = useState<InparsCategoryRaw[]>([]);
  const [categoriesCount, setCategoriesCount] = useState(0);
  const [importingCategories, setImportingCategories] = useState(false);
  const [categoriesResult, setCategoriesResult] = useState<{ imported: number; updated: number } | null>(null);
  const [categoriesError, setCategoriesError] = useState('');

  // Выбранные пользователем категории (inpars_id[])
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<number[]>([]);

  // Выбранные пользователем источники (sourceIds: number[])
  const [selectedSourceIds, setSelectedSourceIds] = useState<number[]>([]);

  // Адресная база — синхронизация
  const [addressCount, setAddressCount] = useState(0);
  const [addressSyncing, setAddressSyncing] = useState(false);
  const [addressProgress, setAddressProgress] = useState<{ loaded: number; total: number } | null>(null);
  const [addressLastSync, setAddressLastSync] = useState<string | null>(null);
  const [addressError, setAddressError] = useState('');
  const [addressSyncResult, setAddressSyncResult] = useState<{ downloaded: number; upserted: number } | null>(null);

  // Резолв имени региона
  const regionName = useMemo(() => {
    if (!subscription?.regionId || regions.length === 0) return undefined;
    const region = regions.find(r => r.id === subscription.regionId);
    return region?.title || region?.name || `ID ${subscription.regionId}`;
  }, [subscription?.regionId, regions]);

  // Резолв типа подписки
  const typeName = useMemo(() => {
    if (!subscription?.typeId) return undefined;
    return TYPE_ID_LABELS[subscription.typeId] || `Тип ${subscription.typeId}`;
  }, [subscription?.typeId]);

  // Группировка категорий по разделам
  const categoriesBySection = useMemo(() => {
    const map = new Map<number, { section: InparsSectionRaw | undefined; categories: InparsCategoryRaw[] }>();
    for (const cat of allCategories) {
      if (!map.has(cat.sectionId)) {
        map.set(cat.sectionId, {
          section: sections.find(s => s.id === cat.sectionId),
          categories: [],
        });
      }
      map.get(cat.sectionId)!.categories.push(cat);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a - b)
      .map(([, val]) => val);
  }, [allCategories, sections]);

  /** Загрузить справочники (регионы + разделы) один раз при наличии токена */
  const loadReferences = async () => {
    try {
      const [regionsData, sectionsData] = await Promise.all([
        loadRegions(),
        loadSections(),
      ]);
      setRegions(regionsData);
      setSections(sectionsData);
    } catch {
      // Не критично — покажем ID вместо имён
    }
  };

  useEffect(() => {
    (async () => {
      const savedToken = await loadInparsToken();
      if (savedToken) {
        setToken(savedToken);
        setTokenLoaded(true);
        setChecking(true);
        try {
          const [sub] = await Promise.all([
            checkSubscription(),
            loadReferences(),
          ]);
          setSubscription(sub);
        } catch {
          // Тихо игнорируем
        } finally {
          setChecking(false);
        }
      } else {
        setTokenLoaded(true);
      }

      // Загрузить категории из IndexedDB
      const saved = await db.table<InparsCategory>('inpars_categories').toArray();
      setCategoriesCount(saved.length);
      if (saved.length > 0) {
        setAllCategories(saved.map(c => ({
          id: c.inpars_id!,
          title: c.name,
          typeId: c.type_id ?? 0,
          sectionId: c.section_id ?? 0,
        })));
      }

      // Загрузить выбранные категории и источники
      const [selCats, selSources] = await Promise.all([
        loadFromStorage<number[]>(STORAGE_KEY_SELECTED_CATEGORIES),
        loadFromStorage<number[]>(STORAGE_KEY_SELECTED_SOURCES),
      ]);
      setSelectedCategoryIds(selCats);
      setSelectedSourceIds(selSources);

      // Статистика адресной базы
      const stats = await addressSyncService.getLocalStats();
      setAddressCount(stats.total);
      const lastSync = await addressSyncService.getLastSyncDate();
      setAddressLastSync(lastSync);
    })();
  }, []);

  const handleSaveToken = async () => {
    setInparsToken(token);
    setTokenSaved(true);
    setTimeout(() => setTokenSaved(false), 3000);
    setError('');
    setSubscription(null);

    if (!token) return;

    setChecking(true);
    try {
      const [sub] = await Promise.all([
        checkSubscription(),
        loadReferences(),
      ]);
      setSubscription(sub);
    } catch (e) {
      setError(`Ошибка проверки подписки: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setChecking(false);
    }
  };

  const handleImportCategories = async () => {
    if (!getInparsToken()) {
      setCategoriesError('Сначала сохраните API ключ');
      return;
    }

    setImportingCategories(true);
    setCategoriesError('');
    setCategoriesResult(null);

    try {
      const rawCategories = await loadCategories();
      const now = new Date().toISOString();
      let imported = 0;
      let updated = 0;

      const table = db.table<InparsCategory>('inpars_categories');

      for (const cat of rawCategories) {
        const existing = await table.where('inpars_id').equals(cat.id).first();

        const record: InparsCategory = {
          inpars_id: cat.id,
          name: cat.title,
          name_en: '',
          parent_id: null,
          section_id: cat.sectionId,
          type_id: cat.typeId,
          is_active: true,
          sort_order: 0,
          description: '',
          level: 0,
          has_children: false,
          imported_at: now,
        };

        if (existing) {
          await table.update(existing.id!, record);
          updated++;
        } else {
          await table.add(record);
          imported++;
        }
      }

      setAllCategories(rawCategories);
      setCategoriesResult({ imported, updated });
      setCategoriesCount(await table.count());
    } catch (e) {
      setCategoriesError(`Ошибка: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setImportingCategories(false);
    }
  };

  const toggleCategory = useCallback((catId: number) => {
    setSelectedCategoryIds(prev => {
      const next = prev.includes(catId)
        ? prev.filter(id => id !== catId)
        : [...prev, catId];
      saveToStorage(STORAGE_KEY_SELECTED_CATEGORIES, next);
      return next;
    });
  }, []);

  const selectAllInSection = useCallback((sectionId: number) => {
    setSelectedCategoryIds(prev => {
      const sectionCatIds = allCategories
        .filter(c => c.sectionId === sectionId)
        .map(c => c.id);
      const allSelected = sectionCatIds.every(id => prev.includes(id));
      const next = allSelected
        ? prev.filter(id => !sectionCatIds.includes(id))
        : [...new Set([...prev, ...sectionCatIds])];
      saveToStorage(STORAGE_KEY_SELECTED_CATEGORIES, next);
      return next;
    });
  }, [allCategories]);

  const selectAllCats = useCallback(() => {
    const allIds = allCategories.map(c => c.id);
    setSelectedCategoryIds(allIds);
    saveToStorage(STORAGE_KEY_SELECTED_CATEGORIES, allIds);
  }, [allCategories]);

  const deselectAllCats = useCallback(() => {
    setSelectedCategoryIds([]);
    saveToStorage(STORAGE_KEY_SELECTED_CATEGORIES, []);
  }, []);

  // Callbacks для источников
  const toggleSource = useCallback((sourceId: number) => {
    setSelectedSourceIds(prev => {
      const next = prev.includes(sourceId)
        ? prev.filter(id => id !== sourceId)
        : [...prev, sourceId];
      saveToStorage(STORAGE_KEY_SELECTED_SOURCES, next);
      return next;
    });
  }, []);

  const selectAllSources = useCallback(() => {
    const allIds = Object.values(INPARS_SOURCE_IDS);
    setSelectedSourceIds(allIds);
    saveToStorage(STORAGE_KEY_SELECTED_SOURCES, allIds);
  }, []);

  const deselectAllSources = useCallback(() => {
    setSelectedSourceIds([]);
    saveToStorage(STORAGE_KEY_SELECTED_SOURCES, []);
  }, []);

  const handleSyncAddresses = async () => {
    setAddressSyncing(true);
    setAddressError('');
    setAddressSyncResult(null);
    setAddressProgress(null);

    try {
      const region = subscription?.regionId ? String(subscription.regionId) : undefined;
      const result = await addressSyncService.syncFromServer(region, (loaded, total) => {
        setAddressProgress({ loaded, total });
      });

      setAddressSyncResult(result);
      const stats = await addressSyncService.getLocalStats();
      setAddressCount(stats.total);
      const lastSync = await addressSyncService.getLastSyncDate();
      setAddressLastSync(lastSync);
    } catch (e) {
      setAddressError(e instanceof Error ? e.message : String(e));
    } finally {
      setAddressSyncing(false);
      setAddressProgress(null);
    }
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto p-6 space-y-6">
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-white">Настройки</h1>

        {/* API ключ Inpars */}
        <div className="rounded-xl bg-white p-5 shadow-sm dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 space-y-3">
          <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Inpars API</h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            API ключ для загрузки объявлений с Авито, ЦИАН, Домклик через сервис Inpars.
            Получить ключ можно на <a href="https://inpars.ru" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">inpars.ru</a>.
          </p>
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
              disabled={checking}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
            >
              {checking ? 'Проверка...' : tokenSaved ? 'Сохранено!' : 'Сохранить'}
            </button>
          </div>

          {checking && !subscription && token && (
            <div className="flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Проверяем подписку...
            </div>
          )}

          {subscription && (
            <div className={`rounded-lg px-4 py-3 text-sm space-y-2 ${
              subscription.subscribed
                ? 'bg-green-50 border border-green-200 dark:bg-green-900/20 dark:border-green-800'
                : 'bg-red-50 border border-red-200 dark:bg-red-900/20 dark:border-red-800'
            }`}>
              <div className="flex items-center gap-2">
                <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold ${
                  subscription.subscribed
                    ? 'bg-green-500 text-white'
                    : 'bg-red-500 text-white'
                }`}>
                  {subscription.subscribed ? '✓' : '✗'}
                </span>
                <span className={`font-medium ${
                  subscription.subscribed
                    ? 'text-green-700 dark:text-green-400'
                    : 'text-red-700 dark:text-red-400'
                }`}>
                  {subscription.subscribed ? 'Подписка активна' : 'Подписка не активна'}
                </span>
              </div>
              {subscription.subscribed && (
                <div className="ml-7 space-y-1 text-xs">
                  {subscription.plan && (
                    <div className="text-green-600 dark:text-green-400">
                      <span className="text-green-500 dark:text-green-500">Тариф:</span> {subscription.plan}
                    </div>
                  )}
                  {typeName && (
                    <div className="text-green-600 dark:text-green-400">
                      <span className="text-green-500 dark:text-green-500">Тип:</span> {typeName}
                    </div>
                  )}
                  {regionName && (
                    <div className="text-green-600 dark:text-green-400">
                      <span className="text-green-500 dark:text-green-500">Регион:</span> {regionName}
                    </div>
                  )}
                  {subscription.expires_at && (
                    <div className="text-green-600 dark:text-green-400">
                      <span className="text-green-500 dark:text-green-500">Действует до:</span>{' '}
                      {new Date(subscription.expires_at).toLocaleDateString('ru-RU', {
                        day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
                      })}
                    </div>
                  )}
                  {subscription.expires_at && (
                    <div className="text-green-600 dark:text-green-400">
                      <span className="text-green-500 dark:text-green-500">Осталось:</span>{' '}
                      {(() => {
                        const days = Math.ceil((new Date(subscription.expires_at).getTime() - Date.now()) / 86400000);
                        if (days <= 0) return 'менее суток';
                        if (days === 1) return '1 день';
                        if (days < 5) return `${days} дня`;
                        return `${days} дней`;
                      })()}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {error && (
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          )}
        </div>

        {/* Справочники — загрузка */}
        <div className="rounded-xl bg-white p-5 shadow-sm dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 space-y-3">
          <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Справочники</h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Загрузка категорий недвижимости из Inpars для использования в фильтрах загрузки.
          </p>

          <div className="flex items-center gap-3">
            <button
              onClick={handleImportCategories}
              disabled={importingCategories || !getInparsToken()}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {importingCategories && (
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              )}
              {importingCategories ? 'Загрузка...' : 'Загрузить категории'}
            </button>
            <span className="text-xs text-zinc-500 dark:text-zinc-400">
              В базе: {categoriesCount} категорий
            </span>
          </div>

          {categoriesResult && (
            <div className="rounded-md bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 px-3 py-2 text-sm text-green-700 dark:text-green-300">
              Импортировано: {categoriesResult.imported} новых, {categoriesResult.updated} обновлено
            </div>
          )}

          {categoriesError && (
            <p className="text-sm text-red-600 dark:text-red-400">{categoriesError}</p>
          )}
        </div>

        {/* Выбор категорий */}
        {allCategories.length > 0 && (
          <div className="rounded-xl bg-white p-5 shadow-sm dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Категории для фильтров
              </h2>
              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                Выбрано: {selectedCategoryIds.length} из {allCategories.length}
              </span>
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Выберите категории, которые будут отображаться в фильтрах на странице загрузки объявлений.
            </p>

            <div className="flex gap-2">
              <button
                onClick={selectAllCats}
                className="rounded-md bg-zinc-100 dark:bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700"
              >
                Выбрать все
              </button>
              <button
                onClick={deselectAllCats}
                className="rounded-md bg-zinc-100 dark:bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700"
              >
                Сбросить
              </button>
            </div>

            <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
              {categoriesBySection.map(({ section, categories }) => {
                const sectionLabel = section
                  ? `${section.title} (${TYPE_ID_LABELS[section.typeId] || `тип ${section.typeId}`})`
                  : 'Без раздела';
                const allSectionSelected = categories.every(c => selectedCategoryIds.includes(c.id));

                return (
                  <div key={categories[0]?.sectionId} className="space-y-1.5">
                    <button
                      onClick={() => selectAllInSection(categories[0].sectionId)}
                      className="flex items-center gap-2 text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
                    >
                      <span className={`inline-flex h-4 w-4 items-center justify-center rounded border ${
                        allSectionSelected
                          ? 'bg-blue-600 border-blue-600 text-white'
                          : 'border-zinc-300 dark:border-zinc-600'
                      }`}>
                        {allSectionSelected && (
                          <svg className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        )}
                      </span>
                      {sectionLabel}
                    </button>
                    <div className="flex flex-wrap gap-1.5 pl-6">
                      {categories.map(cat => (
                        <button
                          key={cat.id}
                          onClick={() => toggleCategory(cat.id)}
                          className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                            selectedCategoryIds.includes(cat.id)
                              ? 'bg-blue-600 text-white'
                              : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700'
                          }`}
                        >
                          {cat.title}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Адресная база — синхронизация */}
        <div className="rounded-xl bg-white p-5 shadow-sm dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 space-y-3">
          <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Адресная база</h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Загрузка адресов с характеристиками домов с сервера. Адреса используются для привязки объявлений и отображения на карте.
          </p>

          <div className="flex items-center gap-3">
            <button
              onClick={handleSyncAddresses}
              disabled={addressSyncing}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {addressSyncing && (
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              )}
              {addressSyncing ? 'Загрузка...' : 'Загрузить с сервера'}
            </button>
            <span className="text-xs text-zinc-500 dark:text-zinc-400">
              В базе: {addressCount.toLocaleString('ru-RU')} адресов
            </span>
          </div>

          {addressProgress && (
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-zinc-500 dark:text-zinc-400">
                <span>Загружено {addressProgress.loaded.toLocaleString('ru-RU')} из {addressProgress.total.toLocaleString('ru-RU')}</span>
                <span>{Math.round((addressProgress.loaded / addressProgress.total) * 100)}%</span>
              </div>
              <div className="w-full bg-zinc-200 dark:bg-zinc-700 rounded-full h-2">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${(addressProgress.loaded / addressProgress.total) * 100}%` }}
                />
              </div>
            </div>
          )}

          {addressSyncResult && (
            <div className="rounded-md bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 px-3 py-2 text-sm text-green-700 dark:text-green-300">
              Синхронизация завершена: загружено {addressSyncResult.downloaded.toLocaleString('ru-RU')} адресов, обновлено {addressSyncResult.upserted.toLocaleString('ru-RU')}
            </div>
          )}

          {addressLastSync && (
            <p className="text-xs text-zinc-400 dark:text-zinc-500">
              Последняя синхронизация: {new Date(addressLastSync).toLocaleString('ru-RU')}
            </p>
          )}

          {addressError && (
            <p className="text-sm text-red-600 dark:text-red-400">{addressError}</p>
          )}
        </div>

        {/* Источники для загрузки */}
        <div className="rounded-xl bg-white p-5 shadow-sm dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Источники для загрузки
            </h2>
            <span className="text-xs text-zinc-500 dark:text-zinc-400">
              Выбрано: {selectedSourceIds.length} из {Object.keys(INPARS_SOURCE_IDS).length}
            </span>
          </div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Выберите источники, которые будут использоваться по умолчанию при загрузке объявлений.
          </p>
          <div className="flex gap-2">
            <button
              onClick={selectAllSources}
              className="rounded-md bg-zinc-100 dark:bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700"
            >
              Выбрать все
            </button>
            <button
              onClick={deselectAllSources}
              className="rounded-md bg-zinc-100 dark:bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700"
            >
              Сбросить
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(SOURCE_LABELS).map(([key, label]) => {
              const id = INPARS_SOURCE_IDS[key];
              return (
                <button
                  key={key}
                  onClick={() => toggleSource(id)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    selectedSourceIds.includes(id)
                      ? 'bg-blue-600 text-white'
                      : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdsSettingsPage;
