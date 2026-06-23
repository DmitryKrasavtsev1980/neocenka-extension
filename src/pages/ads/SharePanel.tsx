/**
 * Панель «Поделиться фильтром» — создание/обновление/удаление публичных ссылок.
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  listSharedViews,
  createSharedView,
  updateSharedView,
  deleteSharedView,
  APP_BASE_URL,
  type SharedViewMeta,
} from '@/services/api-service';
import {
  buildSharedViewData,
  loadSavedFiltersForShare,
  type SavedFilterLite,
  type SavedGroupLite,
} from '@/services/shared-view-builder';
import type { ComparativeSession } from '@/types/comparative';
import { loadSessionsForFilter } from '@/pages/ads/reports/comparativeStorage';
import { computeFilterHash } from '@/pages/ads/reports/comparativeUtils';
import { applyFilterToAds } from '@/services/ads-filter-utils';
import { db } from '@/db/database';

interface SharePanelProps {
  /** Сигнал от родителя, чтобы открывать модал создания. Необязательно. */
}

const EXPIRY_OPTIONS: Array<{ value: 7 | 30 | 90 | null; label: string }> = [
  { value: 7, label: '7 дней' },
  { value: 30, label: '30 дней' },
  { value: 90, label: '90 дней' },
  { value: null, label: 'Бессрочно' },
];

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} МБ`;
}

const SharePanel: React.FC<SharePanelProps> = () => {
  const [views, setViews] = useState<SharedViewMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copiedId, setCopiedId] = useState<number | null>(null);

  // Состояние модала создания
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [filters, setFilters] = useState<SavedFilterLite[]>([]);
  const [groups, setGroups] = useState<SavedGroupLite[]>([]);
  const [selectedFilterIds, setSelectedFilterIds] = useState<Set<string>>(new Set());
  const [title, setTitle] = useState('');
  const [expiresIn, setExpiresIn] = useState<7 | 30 | 90 | null>(30);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [modalError, setModalError] = useState('');

  // Модал обновления
  const [editTarget, setEditTarget] = useState<SharedViewMeta | null>(null);

  // Уведомление об успешной операции
  const [notice, setNotice] = useState('');

  // V2: выбор сравнительного анализа для каждого фильтра
  const [comparativeSelection, setComparativeSelection] = useState<Record<string, ComparativeSession | null>>({});
  const [comparativeSessionsCache, setComparativeSessionsCache] = useState<Record<string, ComparativeSession[]>>({});
  const [sessionsLoading, setSessionsLoading] = useState<Set<string>>(new Set());

  const refresh = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await listSharedViews();
      setViews(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const openCreateModal = async () => {
    setShowCreateModal(true);
    setModalError('');
    setPassword('');
    setTitle(`Поделиться от ${new Date().toLocaleDateString('ru-RU')}`);
    setExpiresIn(30);
    setSelectedFilterIds(new Set());
    setComparativeSelection({});
    setComparativeSessionsCache({});
    if (filters.length === 0) {
      const loaded = await loadSavedFiltersForShare();
      setFilters(loaded.filters);
      setGroups(loaded.groups);
    }
  };

  const openEditModal = async (view: SharedViewMeta) => {
    setEditTarget(view);
    setModalError('');
    setPassword('');
    setTitle(view.title || `Поделиться от ${new Date().toLocaleDateString('ru-RU')}`);
    setExpiresIn(view.expires_at ? null : null); // при обновлении можно задать только новый срок
    setSelectedFilterIds(new Set());
    setComparativeSelection({});
    setComparativeSessionsCache({});
    if (filters.length === 0) {
      const loaded = await loadSavedFiltersForShare();
      setFilters(loaded.filters);
      setGroups(loaded.groups);
    }
  };

  const toggleFilter = (id: string) => {
    setSelectedFilterIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        // Очищаем выбор comparative при снятии фильтра
        setComparativeSelection(prevSel => {
          const nextSel = { ...prevSel };
          delete nextSel[id];
          return nextSel;
        });
      } else {
        next.add(id);
        // Загружаем сессии для нового выбранного фильтра
        ensureSessionsLoaded(id);
      }
      return next;
    });
  };

  /**
   * Загрузить сохранённые comparative-сессии для фильтра.
   * Вычисляет filterHash из объектов фильтра и тянет сессии из comparativeStorage.
   */
  const ensureSessionsLoaded = async (filterId: string) => {
    if (comparativeSessionsCache[filterId]) return; // уже загружено
    const filter = filters.find(f => f.id === filterId);
    if (!filter) return;

    setSessionsLoading(prev => new Set(prev).add(filterId));
    try {
      const allAds = await db.table('ads').toArray();
      const allAddresses = await db.table('ad_addresses').toArray();
      const filteredAds = applyFilterToAds(allAds, filter.state, allAddresses);

      const objectIds = new Set<number>();
      for (const ad of filteredAds) {
        if (ad.object_id != null) objectIds.add(ad.object_id);
      }
      const objects = await db.table('ad_objects')
        .where('id').anyOf(Array.from(objectIds)).toArray();

      const filterHash = computeFilterHash(objects);
      const sessions = await loadSessionsForFilter(filterHash);

      setComparativeSessionsCache(prev => ({ ...prev, [filterId]: sessions }));
    } catch (e) {
      console.error('Failed to load comparative sessions:', e);
      setComparativeSessionsCache(prev => ({ ...prev, [filterId]: [] }));
    } finally {
      setSessionsLoading(prev => {
        const next = new Set(prev);
        next.delete(filterId);
        return next;
      });
    }
  };

  const groupedPreviewCount = useMemo(() => {
    return selectedFilterIds.size;
  }, [selectedFilterIds]);

  const handleCreate = async () => {
    if (selectedFilterIds.size === 0) {
      setModalError('Выберите хотя бы один фильтр');
      return;
    }
    setBusy(true);
    setModalError('');
    try {
      const comparativeMap = buildComparativeMap();
      const data = await buildSharedViewData(
        Array.from(selectedFilterIds),
        filters,
        groups,
        Object.keys(comparativeMap).length > 0 ? comparativeMap : undefined,
      );
      await createSharedView({
        title,
        password: password || null,
        expires_in: expiresIn,
        data,
      });
      setShowCreateModal(false);
      setNotice('Ссылка создана');
      setTimeout(() => setNotice(''), 3000);
      await refresh();
    } catch (e) {
      setModalError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const handleUpdate = async () => {
    if (!editTarget) return;
    if (selectedFilterIds.size === 0) {
      setModalError('Выберите хотя бы один фильтр');
      return;
    }
    setBusy(true);
    setModalError('');
    try {
      const comparativeMap = buildComparativeMap();
      const data = await buildSharedViewData(
        Array.from(selectedFilterIds),
        filters,
        groups,
        Object.keys(comparativeMap).length > 0 ? comparativeMap : undefined,
      );
      await updateSharedView(editTarget.id, {
        title,
        password: password || null,
        data,
      });
      setEditTarget(null);
      setNotice('Ссылка обновлена');
      setTimeout(() => setNotice(''), 3000);
      await refresh();
    } catch (e) {
      setModalError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  /** Собрать Record<filterId, ComparativeSession> из выбора пользователя (без null). */
  const buildComparativeMap = (): Record<string, ComparativeSession> => {
    const map: Record<string, ComparativeSession> = {};
    for (const [filterId, session] of Object.entries(comparativeSelection)) {
      if (session) map[filterId] = session;
    }
    return map;
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Удалить ссылку? Клиенты больше не смогут ей воспользоваться.')) return;
    try {
      await deleteSharedView(id);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleCopy = async (view: SharedViewMeta) => {
    const finalUrl = `${APP_BASE_URL}/share/${view.token}`;
    try {
      await navigator.clipboard.writeText(finalUrl);
      setCopiedId(view.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // Fallback — открываем ссылку
      window.open(finalUrl, '_blank');
    }
  };

  const renderFiltersList = () => {
    if (filters.length === 0) {
      return (
        <div className="rounded-lg bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 p-3 text-xs text-zinc-500 dark:text-zinc-400 text-center">
          Нет сохранённых фильтров. Создайте фильтры на странице поиска объявлений.
        </div>
      );
    }
    return (
      <div className="space-y-2 max-h-64 overflow-y-auto">
        {filters
          .filter(f => !f.groupId)
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map(filter => (
            <label key={filter.id} className="flex items-center gap-2 px-2 py-1.5 hover:bg-zinc-50 dark:hover:bg-zinc-800 rounded cursor-pointer">
              <input
                type="checkbox"
                checked={selectedFilterIds.has(filter.id)}
                onChange={() => toggleFilter(filter.id)}
                className="rounded border-zinc-300 dark:border-zinc-600 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-xs text-zinc-700 dark:text-zinc-300 flex-1">{filter.name}</span>
            </label>
          ))
        }
        {groups
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map(group => {
            const groupFilters = filters
              .filter(f => f.groupId === group.id)
              .sort((a, b) => a.sortOrder - b.sortOrder);
            if (groupFilters.length === 0) return null;
            const allGroupSelected = groupFilters.every(f => selectedFilterIds.has(f.id));
            return (
              <div key={group.id} className="space-y-0.5">
                <button
                  onClick={() => setSelectedFilterIds(prev => {
                    const next = new Set(prev);
                    if (allGroupSelected) {
                      groupFilters.forEach(f => next.delete(f.id));
                    } else {
                      groupFilters.forEach(f => next.add(f.id));
                    }
                    return next;
                  })}
                  className="flex items-center gap-2 px-2 py-1 w-full text-left hover:bg-zinc-50 dark:hover:bg-zinc-800 rounded"
                >
                  <span className={`inline-flex h-4 w-4 items-center justify-center rounded border text-xs ${
                    allGroupSelected
                      ? 'bg-blue-600 border-blue-600 text-white'
                      : 'border-zinc-300 dark:border-zinc-600'
                  }`}>
                    {allGroupSelected && (
                      <svg className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    )}
                  </span>
                  <span className="text-xs font-medium" style={{ color: group.color || undefined }}>
                    {group.name}
                  </span>
                  <span className="text-[10px] text-zinc-400">{groupFilters.length}</span>
                </button>
                <div className="pl-6">
                  {groupFilters.map(filter => (
                    <label key={filter.id} className="flex items-center gap-2 px-2 py-1 hover:bg-zinc-50 dark:hover:bg-zinc-800 rounded cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedFilterIds.has(filter.id)}
                        onChange={() => toggleFilter(filter.id)}
                        className="rounded border-zinc-300 dark:border-zinc-600 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-xs text-zinc-700 dark:text-zinc-300 flex-1">{filter.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            );
          })
        }
      </div>
    );
  };

  return (
    <div className="rounded-xl bg-white p-5 shadow-sm dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Поделиться фильтром
        </h2>
        <button
          onClick={openCreateModal}
          className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 flex items-center gap-1.5"
        >
          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" /></svg>
          Создать ссылку
        </button>
      </div>
      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        Сформируйте уникальную ссылку для клиента. Перейдя по ней, он увидит карту, графики, таблицы объектов и объявлений по выбранным фильтрам. Данные только для чтения.
      </p>

      {notice && (
        <div className="rounded-md bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 px-3 py-2 text-sm text-green-700 dark:text-green-300">
          {notice}
        </div>
      )}

      {error && (
        <div className="rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-3 py-2 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-xs text-zinc-500 dark:text-zinc-400 text-center py-4">Загрузка...</div>
      ) : views.length === 0 ? (
        <div className="rounded-lg bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 p-3 text-xs text-zinc-500 dark:text-zinc-400 text-center">
          Пока нет созданных ссылок
        </div>
      ) : (
        <div className="space-y-2">
          {views.map(view => (
            <div
              key={view.id}
              className={`rounded-lg border p-3 space-y-2 ${
                view.is_expired
                  ? 'border-red-200 dark:border-red-800 bg-red-50/30 dark:bg-red-900/10'
                  : 'border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-zinc-900 dark:text-white truncate">
                    {view.title || 'Без названия'}
                  </div>
                  <div className="text-[11px] text-zinc-500 dark:text-zinc-400 flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5">
                    <span>Создано: {formatDate(view.created_at)}</span>
                    {view.has_password && <span className="text-amber-600 dark:text-amber-400">с паролем</span>}
                    {view.expires_at && (
                      <span className={view.is_expired ? 'text-red-600 dark:text-red-400' : ''}>
                        {view.is_expired ? 'истекла' : 'до'}: {formatDate(view.expires_at)}
                      </span>
                    )}
                    {!view.expires_at && <span>бессрочно</span>}
                    <span>{formatSize(view.data_size)}</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={() => handleCopy(view)}
                  className="rounded-md bg-blue-50 dark:bg-blue-900/30 px-2.5 py-1 text-xs font-medium text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/50"
                >
                  {copiedId === view.id ? 'Скопировано!' : 'Копировать ссылку'}
                </button>
                <button
                  onClick={() => openEditModal(view)}
                  disabled={view.is_expired}
                  className="rounded-md bg-zinc-100 dark:bg-zinc-700 px-2.5 py-1 text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-600 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Обновить данные
                </button>
                <button
                  onClick={() => handleDelete(view.id)}
                  className="rounded-md bg-red-50 dark:bg-red-900/30 px-2.5 py-1 text-xs font-medium text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-900/50"
                >
                  Удалить
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Модал создания/обновления */}
      {(showCreateModal || editTarget) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3" onClick={() => { if (!busy) { setShowCreateModal(false); setEditTarget(null); } }}>
          <div
            className="bg-white dark:bg-zinc-900 rounded-xl shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-semibold text-zinc-900 dark:text-white">
                  {editTarget ? 'Обновить ссылку' : 'Новая ссылка'}
                </h3>
                <button
                  onClick={() => { setShowCreateModal(false); setEditTarget(null); }}
                  disabled={busy}
                  className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
                >
                  ✕
                </button>
              </div>

              {/* Выбор фильтров */}
              <div className="space-y-2">
                <div className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400 uppercase">
                  Фильтры ({groupedPreviewCount})
                </div>
                {renderFiltersList()}
              </div>

              {/* V2: Выбор сравнительного анализа (по одному на фильтр) */}
              {selectedFilterIds.size > 0 && (
                <div className="space-y-2 border-t border-zinc-200 dark:border-zinc-700 pt-3">
                  <div className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400 uppercase">
                    Сравнительный анализ
                  </div>
                  <p className="text-[10px] text-zinc-400 dark:text-zinc-500">
                    Для каждого фильтра можно прикрепить одну сохранённую сессию анализа. Получатель ссылки увидит её в режиме «только чтение».
                  </p>
                  {Array.from(selectedFilterIds).map(filterId => {
                    const filter = filters.find(f => f.id === filterId);
                    const sessions = comparativeSessionsCache[filterId];
                    const isLoading = sessionsLoading.has(filterId);
                    const selected = comparativeSelection[filterId];
                    return (
                      <div key={filterId} className="flex flex-col gap-1">
                        <div className="text-[11px] text-zinc-600 dark:text-zinc-400 truncate">
                          {filter?.name || filterId}
                        </div>
                        <select
                          value={selected?.id || ''}
                          onChange={e => {
                            const sid = e.target.value;
                            const found = sessions?.find(s => s.id === sid) || null;
                            setComparativeSelection(prev => ({ ...prev, [filterId]: found }));
                          }}
                          disabled={isLoading || (sessions != null && sessions.length === 0)}
                          className="w-full rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-2 py-1.5 text-xs text-zinc-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-60"
                        >
                          {isLoading ? (
                            <option value="">Загрузка…</option>
                          ) : (sessions == null || sessions.length === 0) ? (
                            <option value="">Нет сохранённых сессий</option>
                          ) : (
                            <>
                              <option value="">Без анализа</option>
                              {sessions.map(s => (
                                <option key={s.id} value={s.id}>
                                  {s.name} ({Object.keys(s.evaluations || {}).length} оценок)
                                </option>
                              ))}
                            </>
                          )}
                        </select>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Название */}
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400 uppercase">Название</label>
                <input
                  type="text"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="Например: Подборка по улице Ленина"
                  className="w-full rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              {/* Срок действия */}
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400 uppercase">
                  Срок действия {editTarget && '(новый отсчёт при смене)'}
                </label>
                <div className="flex gap-2 flex-wrap">
                  {EXPIRY_OPTIONS.map(opt => (
                    <button
                      key={String(opt.value)}
                      onClick={() => setExpiresIn(opt.value)}
                      className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                        expiresIn === opt.value
                          ? 'bg-blue-600 text-white'
                          : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Пароль */}
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400 uppercase">
                  Пароль (необязательно) {editTarget?.has_password && '— оставить пустым, чтобы не менять'}
                </label>
                <input
                  type="text"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Оставьте пустым, если без пароля"
                  className="w-full rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              {modalError && (
                <div className="rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-3 py-2 text-sm text-red-700 dark:text-red-300">
                  {modalError}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => { setShowCreateModal(false); setEditTarget(null); }}
                  disabled={busy}
                  className="rounded-md bg-zinc-100 dark:bg-zinc-800 px-4 py-2 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 disabled:opacity-50"
                >
                  Отмена
                </button>
                <button
                  onClick={editTarget ? handleUpdate : handleCreate}
                  disabled={busy || selectedFilterIds.size === 0}
                  className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {busy && (
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                  )}
                  {editTarget ? 'Обновить' : 'Создать'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SharePanel;
