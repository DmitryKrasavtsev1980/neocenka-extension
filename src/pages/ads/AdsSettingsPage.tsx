/**
 * Страница настроек модуля «Рекламные объявления»
 * — API ключ Inpars + проверка подписки
 * — Загрузка справочников (категории) из Inpars
 */

import React, { useState, useEffect } from 'react';
import {
  setInparsToken,
  getInparsToken,
  checkSubscription,
  loadCategories,
  type InparsCategoryRaw,
} from '@/services/inpars-service';
import { db } from '@/db/database';
import type { InparsCategory } from '@/types';

const AdsSettingsPage: React.FC = () => {
  const [token, setToken] = useState(() => getInparsToken() || '');
  const [tokenSaved, setTokenSaved] = useState(false);
  const [subscription, setSubscription] = useState<{
    subscribed: boolean;
    expires_at?: string;
    plan?: string;
  } | null>(null);
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);

  // Справочники
  const [categoriesCount, setCategoriesCount] = useState(0);
  const [importingCategories, setImportingCategories] = useState(false);
  const [categoriesResult, setCategoriesResult] = useState<{ imported: number; updated: number } | null>(null);
  const [categoriesError, setCategoriesError] = useState('');

  useEffect(() => {
    db.table<InparsCategory>('inpars_categories').count().then(setCategoriesCount);
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
      const sub = await checkSubscription();
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
          name: cat.name,
          name_en: cat.name_eng || '',
          parent_id: cat.parent_id ?? null,
          section_id: cat.section_id ?? null,
          type_id: cat.type_id ?? null,
          is_active: true,
          sort_order: 0,
          description: '',
          level: cat.level ?? 0,
          has_children: cat.has_children ?? false,
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

      setCategoriesResult({ imported, updated });
      setCategoriesCount(await table.count());
    } catch (e) {
      setCategoriesError(`Ошибка: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setImportingCategories(false);
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

          {subscription && (
            <div className={`rounded-md px-3 py-2 text-sm ${
              subscription.subscribed
                ? 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400'
                : 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400'
            }`}>
              {subscription.subscribed
                ? `Подписка активна${subscription.expires_at ? ` до ${new Date(subscription.expires_at).toLocaleDateString('ru-RU')}` : ''}`
                : 'Подписка не активна'}
            </div>
          )}

          {error && (
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          )}
        </div>

        {/* Справочники */}
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
      </div>
    </div>
  );
};

export default AdsSettingsPage;
