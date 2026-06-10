/**
 * Страница «Поиск объявлений»
 * Единая таблица с объявлениями и объектами (по аналогии с neocenka-extension)
 */

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { adsRepository } from '@/db/repositories/ads.repository';
import { db } from '@/db/database';
import type { Ad, AdObject, AdAddress, AdStats, ReferenceItem, PriceHistoryItem } from '@/types';
import { batchUpdateCianAds, type BatchProgress } from '@/services/cian-batch-update-service';
import { batchUpdateAvitoAds, type AvitoBatchProgress } from '@/services/avito-batch-update-service';
import { useImportTasks, type ImportTask } from '@/contexts/ImportTaskContext';
import { getModules } from '@/services/api-service';
import AdsReportsPanel from './reports/AdsReportsPanel';
import { REGION_CENTERS } from '@/constants/regions';
import {
  SOURCE_IDS,
  type ListingCategoryRaw,
} from '@/services/listing-transform';
import {
  getAvailableCategories,
} from '@/services/data-request-service';
import { useImportTasks } from '@/contexts/ImportTaskContext';
import SearchByPolygon from '@/components/SearchByPolygon/SearchByPolygon';
import { Button } from '@/components/catalyst/button';
import { Badge } from '@/components/catalyst/badge';
import AdDetailModal from './AdDetailModal';
import AdObjectDetailModal from './AdObjectDetailModal';
import AdAddressModal from './AdAddressModal';
import AdsSavedFiltersPanel from './AdsSavedFiltersPanel';
import AdAddressAssignModal from './AdAddressAssignModal';
import { adsAddressService } from '@/services/ads-address-service';
import {
  FunnelIcon,
  ArrowDownTrayIcon,
  ChevronDownIcon,
  XMarkIcon,
  ArrowPathIcon,
  MapPinIcon,
  TrashIcon,
  ChartBarIcon,
} from '@heroicons/react/16/solid';

// ─── Константы ───

const PROPERTY_TYPE_LABELS: Record<string, string> = {
  studio: 'Студия', '1k': '1-к', '2k': '2-к', '3k': '3-к', '4k+': '4+к',
};
const PROPERTY_TYPE_FULL: Record<string, string> = {
  studio: 'Студия', '1k': '1-комн.', '2k': '2-комн.', '3k': '3-комн.', '4k+': '4+ комн.',
};
const SOURCE_LABELS: Record<string, string> = {
  avito: 'avito.ru', cian: 'cian.ru', domclick: 'domclick.ru', yandex: 'realty.yandex.ru', youla: 'youla.io', sob: 'sob.ru', bazarpnz: 'bazarpnz.ru', move: 'move.ru', gipernn: 'gipernn.ru', orsk: 'orsk.ru', doskaYkt: 'doska.ykt.ru', unknown: '?',
};
// Нормализация source: "avito.ru" → "avito", "cian.ru" → "cian"
const normalizeSource = (s: string | null | undefined): string => {
  if (!s) return '';
  if (SOURCE_LABELS[s]) return s;
  const keys = Object.keys(SOURCE_LABELS);
  for (const k of keys) {
    if (s.startsWith(k + '.') || s === SOURCE_LABELS[k]) return k;
  }
  return s;
};
const SOURCE_COLORS: Record<string, string> = {
  avito: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  cian: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  domclick: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  yandex: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  youla: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  unknown: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-300',
};
const SECTION_LABELS: Record<number, string> = {
  1: 'Жилая', 4: 'Коммерческая', 5: 'Загородная', 9: 'Гараж', 11: 'Готовый бизнес',
};
const SELLER_TYPE_LABELS: Record<string, string> = { owner: 'Собственник', agent: 'Агент', developer: 'Застройщик' };
/** sellerType: 0=собственник, 1=агент, 3=застройщик */
const SELLER_TYPE_API_MAP: Record<string, number> = { owner: 1, agent: 2, developer: 3 };
const PROCESSING_STATUS_LABELS: Record<string, string> = {
  address_needed: 'Определить адрес', duplicate_check_needed: 'Обработать на дубли', needs_update: 'Актуализировать',
};
const CONFIDENCE_LABELS: Record<string, string> = {
  high: '(Подтвержден)', medium: '(Средняя)', low: '(Низкая)', very_low: '(Очень низкая)', manual: '(Ручной)',
};
const PAGE_SIZES = [10, 25, 50, 100];

function toDateString(d: Date): string { return d.toISOString().slice(0, 10); }

/** Проверка принадлежности точки полигону (ray casting). Полигон: [lat, lng][] */
function pointInPolygon(lat: number, lng: number, polygon: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const latI = polygon[i][0], lngI = polygon[i][1];
    const latJ = polygon[j][0], lngJ = polygon[j][1];
    if (((latI > lat) !== (latJ > lat)) &&
        (lng < (lngJ - lngI) * (lat - latI) / (latJ - latI) + lngI)) {
      inside = !inside;
    }
  }
  return inside;
}

function daysAgo(dateStr: string | null): number | null {
  if (!dateStr) return null;
  try { return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000); }
  catch { return null; }
}

/** Тип строки таблицы */
type TableRow =
  | { kind: 'ad'; data: Ad }
  | { kind: 'object'; data: AdObject }
  | { kind: 'expanded_ad'; data: Ad; parentObjectId: number };

interface AdsPageProps { onNavigate?: (page: string) => void; }

/** Компонент пагинации с номерами страниц и выбором размера */
const PaginationBar: React.FC<{
  page: number; totalPages: number; pageSize: number; totalItems: number;
  position?: 'top' | 'bottom';
  onPageChange: (p: number) => void;
  onPageSizeChange: (s: number) => void;
}> = ({ page, totalPages, pageSize, totalItems, position = 'top', onPageChange, onPageSizeChange }) => {
  // Формируем массив номеров страниц для отображения
  const getPageNumbers = (): (number | '...')[] => {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
    const pages: (number | '...')[] = [1];
    if (page > 3) pages.push('...');
    const start = Math.max(2, page - 1);
    const end = Math.min(totalPages - 1, page + 1);
    for (let i = start; i <= end; i++) pages.push(i);
    if (page < totalPages - 2) pages.push('...');
    pages.push(totalPages);
    return pages;
  };

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, totalItems);

  return (
    <div className={`flex items-center justify-between px-4 py-2 ${position === 'top' ? 'border-b' : 'border-t'} border-zinc-200 dark:border-zinc-700`}>
      <div className="flex items-center gap-2">
        <span className="text-[11px] text-zinc-500 dark:text-zinc-400">{from}–{to} из {totalItems}</span>
        <select
          value={pageSize}
          onChange={e => onPageSizeChange(Number(e.target.value))}
          className="rounded border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-700 px-1 py-0.5 text-[11px] text-zinc-700 dark:text-zinc-300"
        >
          {PAGE_SIZES.map(s => <option key={s} value={s}>{s} на стр.</option>)}
        </select>
      </div>
      <div className="flex items-center gap-0.5">
        <button
          onClick={() => onPageChange(1)} disabled={page <= 1}
          className="px-1.5 py-1 rounded text-[11px] border border-zinc-300 dark:border-zinc-600 disabled:opacity-30 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300"
          title="Первая"
        >{'«'}</button>
        <button
          onClick={() => onPageChange(page - 1)} disabled={page <= 1}
          className="px-1.5 py-1 rounded text-[11px] border border-zinc-300 dark:border-zinc-600 disabled:opacity-30 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300"
        >{'‹'}</button>
        {getPageNumbers().map((p, i) =>
          p === '...' ? (
            <span key={`dots-${i}`} className="px-1 text-[11px] text-zinc-400">...</span>
          ) : (
            <button
              key={p}
              onClick={() => onPageChange(p)}
              className={`px-2 py-1 rounded text-[11px] border ${
                p === page
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'border-zinc-300 dark:border-zinc-600 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800'
              }`}
            >{p}</button>
          )
        )}
        <button
          onClick={() => onPageChange(page + 1)} disabled={page >= totalPages}
          className="px-1.5 py-1 rounded text-[11px] border border-zinc-300 dark:border-zinc-600 disabled:opacity-30 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300"
        >{'›'}</button>
        <button
          onClick={() => onPageChange(totalPages)} disabled={page >= totalPages}
          className="px-1.5 py-1 rounded text-[11px] border border-zinc-300 dark:border-zinc-600 disabled:opacity-30 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300"
          title="Последняя"
        >{'»'}</button>
      </div>
    </div>
  );
};

const AdsPage: React.FC<AdsPageProps> = () => {
  const { startAdsImport, startCianBatchUpdate, startAvitoBatchUpdate, tasks: importTasks } = useImportTasks();
  const importTasksRef = useRef(importTasks);
  importTasksRef.current = importTasks;
  const adsImportRunning = importTasks.some(t => t.type === 'ads-import' && t.status === 'running');
  // ─── Данные ───
  const [allAds, setAllAds] = useState<Ad[]>([]);
  const [allObjects, setAllObjects] = useState<AdObject[]>([]);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<AdStats | null>(null);
  const [totalAds, setTotalAds] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // ─── Выбор ───
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [selectedTypes, setSelectedTypes] = useState<Map<number, 'ad' | 'object'>>(new Map());

  // ─── Раскрытие объектов ───
  const [expandedObjects, setExpandedObjects] = useState<Set<number>>(new Set());
  const [objectAds, setObjectAds] = useState<Map<number, Ad[]>>(new Map());

  // ─── Основной фильтр (сегментный) ───
  const [showFilters, setShowFilters] = useState(false);
  const [filterSources, setFilterSources] = useState<string[]>([]);
  const [filterPropertyTypes, setFilterPropertyTypes] = useState<string[]>([]);
  const [filterCategoryIds, setFilterCategoryIds] = useState<number[]>([]);
  const [filterPriceMin, setFilterPriceMin] = useState('');
  const [filterPriceMax, setFilterPriceMax] = useState('');
  const [filterAreaMin, setFilterAreaMin] = useState('');
  const [filterAreaMax, setFilterAreaMax] = useState('');
  const [filterFloorMin, setFilterFloorMin] = useState('');
  const [filterFloorMax, setFilterFloorMax] = useState('');
  const [filterYearMin, setFilterYearMin] = useState('');
  const [filterYearMax, setFilterYearMax] = useState('');
  const [filterSellerTypes, setFilterSellerTypes] = useState<string[]>([]);
  const [filterStatus, setFilterStatus] = useState<'active' | 'archived' | ''>('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // ─── Фильтры обработки ───
  const [showProcessingFilter, setShowProcessingFilter] = useState(false);
  const [filterProcessingStatus, setFilterProcessingStatus] = useState('');
  const [filterAddressId, setFilterAddressId] = useState<number | ''>('');
  const [filterContactType, setFilterContactType] = useState('');
  const [filterProcessingCategoryId, setFilterProcessingCategoryId] = useState<number | ''>('');
  const [filterProcessingFloor, setFilterProcessingFloor] = useState('');
  const [addresses, setAddresses] = useState<AdAddress[]>([]);
  const [refWallMaterials, setRefWallMaterials] = useState<ReferenceItem[]>([]);
  const [refHouseSeries, setRefHouseSeries] = useState<ReferenceItem[]>([]);
  const [refHouseClasses, setRefHouseClasses] = useState<ReferenceItem[]>([]);
  const [refCeilingMaterials, setRefCeilingMaterials] = useState<ReferenceItem[]>([]);
  const [refHouseProblems, setRefHouseProblems] = useState<ReferenceItem[]>([]);

  // ─── Фильтры по параметрам адресов ───
  const [filterHouseSeriesIds, setFilterHouseSeriesIds] = useState<string[]>([]);
  const [filterWallMaterialIds, setFilterWallMaterialIds] = useState<string[]>([]);
  const [filterFloorsMin, setFilterFloorsMin] = useState('');
  const [filterFloorsMax, setFilterFloorsMax] = useState('');
  const [sortColumn, setSortColumn] = useState<'price' | 'created' | 'updated' | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [excludedAddressIds, setExcludedAddressIds] = useState<Set<number>>(() => {
    try {
      const saved = localStorage.getItem('ret_ads_excluded_address_ids');
      if (!saved) return new Set();
      const arr = JSON.parse(saved);
      return new Set(Array.isArray(arr) ? arr : []);
    } catch { return new Set(); }
  });

  // ─── Сохранённые фильтры ───
  const [showSavedPanel, setShowSavedPanel] = useState(false);
  const [activeFilterId, setActiveFilterId] = useState<string | null>(null);
  const [activeFilterName, setActiveFilterName] = useState<string | null>(null);
  const [activeFilterStateJson, setActiveFilterStateJson] = useState<string | null>(null);

  // ─── Загрузка данных ───
  const [showImportPanel, setShowImportPanel] = useState(false);
  const categoriesLoadedRef = useRef(false);
  const [categories, setCategories] = useState<ListingCategoryRaw[]>([]);
  const [importSourceIds, setImportSourceIds] = useState<number[]>([]);
  const [importCategoryIds, setImportCategoryIds] = useState<number[]>([]);
  const [importSellerTypeIds, setImportSellerTypeIds] = useState<number[]>([]);
  const [importIsNew, setImportIsNew] = useState<number>(0); // 0=вторичка, 1=новостройка
  const [enabledSources, setEnabledSources] = useState<{ id: number; key: string }[]>([]);
  const [importDateFrom, setImportDateFrom] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 367); return toDateString(d); });
  const [importDateTo, setImportDateTo] = useState(() => { const d = new Date(); d.setDate(d.getDate() + 1); return toDateString(d); });
  const [importError, setImportError] = useState('');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  // ─── Чекбоксы задач ───
  const [runImport, setRunImport] = useState(false);
  const [runAddress, setRunAddress] = useState(false);
  const [runUpdate, setRunUpdate] = useState(false);
  const cianTask = importTasks.find(t => t.type === 'cian-update' && (t.status === 'running' || t.status === 'done' || t.status === 'error'));
  const avitoTask = importTasks.find(t => t.type === 'avito-update' && (t.status === 'running' || t.status === 'done' || t.status === 'error'));
  const [archiveDays, setArchiveDays] = useState(7);
  const [showReports, setShowReports] = useState(false);
  const [dealsModuleActive, setDealsModuleActive] = useState(false);

  // ─── Matching адресов ───
  const [matchRunning, setMatchRunning] = useState(false);
  const [matchProgress, setMatchProgress] = useState<{ done: number; total: number } | null>(null);

  // ─── Удаление ───
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleteRunning, setDeleteRunning] = useState(false);
  const [deleteSelectedConfirm, setDeleteSelectedConfirm] = useState(false);

  // ─── Модалки ───
  const [detailAd, setDetailAd] = useState<Ad | null>(null);
  const [detailObject, setDetailObject] = useState<AdObject | null>(null);
  const [detailAddress, setDetailAddress] = useState<AdAddress | null>(null);
  const [assignAd, setAssignAd] = useState<Ad | null>(null);
  const [createAddressForAd, setCreateAddressForAd] = useState<Ad | null>(null);

  /** Открыть модалку объекта — гарантирует загрузку его объявлений */
  const openObjectDetail = useCallback((o: AdObject) => {
    const objId = o.id!;
    if (!objectAds.has(objId)) {
      const ads = allAds
        .filter(a => a.object_id === objId)
        .sort((a, b) => {
          const ta = new Date(a.updated || a.created || 0).getTime();
          const tb = new Date(b.updated || b.created || 0).getTime();
          return tb - ta;
        });
      setObjectAds(prev => new Map(prev).set(objId, ads));
    }
    setDetailObject(o);
  }, [objectAds, allAds]);
  const [addressModalMode, setAddressModalMode] = useState<'edit' | 'create'>('edit');

  // ─── Карта ───
  const [showMapFilter, setShowMapFilter] = useState(false);
  const [flyToTarget, setFlyToTarget] = useState<{ lat: number; lon: number; zoom: number } | null>(null);
  const [subscriptionRegionCodes, setSubscriptionRegionCodes] = useState<string[]>([]);
  const [polygonsCoords, setPolygonsCoords] = useState<[number, number][][] | null>(() => {
    try {
      const saved = localStorage.getItem('ret_ads_polygon_coords');
      if (!saved) return null;
      const parsed = JSON.parse(saved);
      if (parsed && Array.isArray(parsed) && parsed.length > 0 && Array.isArray(parsed[0]) && !Array.isArray(parsed[0][0])) return [parsed];
      return parsed;
    } catch { return null; }
  });
  const [filterAddressIds, setFilterAddressIds] = useState<Set<number>>(() => {
    try {
      const saved = localStorage.getItem('ret_ads_filter_address_ids');
      if (!saved) return new Set();
      const arr = JSON.parse(saved);
      return new Set(Array.isArray(arr) ? arr : []);
    } catch { return new Set(); }
  });

  // JSON текущего полигона — для сравнения в handlePolygonsChange.
  // Если SearchByPolygon возвращает тот же полигон что уже установлен —
  // это восстановление из initialPolygons, а не действие пользователя.
  const polygonsCoordsJsonRef = useRef<string>('null');
  // Синхронизируем ref с state
  polygonsCoordsJsonRef.current = polygonsCoords ? JSON.stringify(polygonsCoords) : 'null';

  // ─── Загрузка данных ───
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [ads, objects] = await Promise.all([
        adsRepository.search({}, 1, 100000),
        db.table<AdObject>('ad_objects').toArray(),
      ]);
      setAllAds(ads.ads);
      // Нормализуем статус: 'archive' → 'archived' (старые записи)
      const normalized = objects.map(o => o.status === 'archive' ? { ...o, status: 'archived' } : o);
      setAllObjects(normalized);
      setTotalAds(ads.total);
    } finally { setLoading(false); }
  }, []);

  const loadStats = useCallback(async () => {
    const [s, count] = await Promise.all([adsRepository.getStats(), adsRepository.count()]);
    setStats(s); setTotalAds(count);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => { loadStats(); }, [loadStats]);
  useEffect(() => { ensureListingData(); }, []);
  useEffect(() => {
    getModules().then(data => {
      const active = data.modules.some(m => m.code === 'dealsrosreestr' && m.access?.status === 'active');
      setDealsModuleActive(active);
      // Регионы подписки на модуль ads
      const adsModule = data.modules.find(m => m.code === 'ads' && m.access?.status === 'active');
      if (adsModule?.access?.regions) {
        setSubscriptionRegionCodes(adsModule.access.regions);
      }
    }).catch(() => {});
  }, []);

  // Отслеживание завершения импорта — обновление таблицы + toast
  const lastSeenImportStatus = useRef<Record<string, string>>({});
  useEffect(() => {
    const task = importTasks.find(t => t.type === 'ads-import');
    if (!task) return;

    const prev = lastSeenImportStatus.current[task.id];
    lastSeenImportStatus.current[task.id] = task.status;

    // Статус сменился с running → done/error
    if (prev === 'running' && task.status === 'done') {
      loadData();
      loadStats();
      setToast({ message: task.detail || 'Импорт завершён', type: 'success' });
    } else if (prev === 'running' && task.status === 'error') {
      setToast({ message: task.detail || 'Ошибка импорта', type: 'error' });
    }
  }, [importTasks, loadData, loadStats]);

  // Автоскрытие toast
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(timer);
  }, [toast]);

  // Загрузка адресов и справочников для карты (+ дефолтные данные если пусто)
  useEffect(() => {
    db.table<AdAddress>('ad_addresses').toArray().then(addrs => {
      addrs.sort((a, b) => (a.address || '').localeCompare(b.address || '', 'ru'));
      setAddresses(addrs);
    });

    // Справочники: загрузить, если пустые — заполнить дефолтными значениями
    const loadRef = async (table: string, defaults: ReferenceItem[]) => {
      const t = db.table<ReferenceItem>(table);
      let items = await t.toArray();
      if (items.length === 0 && defaults.length > 0) {
        await t.bulkAdd(defaults);
        items = await t.toArray();
      }
      return items;
    };

    const DEFAULT_WALL_MATERIALS: ReferenceItem[] = [
      { id: undefined as any, server_id: 'brick', name: 'Кирпичный', color: '#ef4444', created_at: '', updated_at: '' },
      { id: undefined as any, server_id: 'panel', name: 'Панельный', color: '#3b82f6', created_at: '', updated_at: '' },
      { id: undefined as any, server_id: 'monolith', name: 'Монолитный', color: '#f59e0b', created_at: '', updated_at: '' },
      { id: undefined as any, server_id: 'block', name: 'Блочный', color: '#8b5cf6', created_at: '', updated_at: '' },
      { id: undefined as any, server_id: 'wood', name: 'Деревянный', color: '#92400e', created_at: '', updated_at: '' },
    ];
    const DEFAULT_HOUSE_SERIES: ReferenceItem[] = [
      { id: undefined as any, server_id: 'khrushchevka', name: 'Хрущёвка', created_at: '', updated_at: '' },
      { id: undefined as any, server_id: 'stalinka', name: 'Сталинка', created_at: '', updated_at: '' },
      { id: undefined as any, server_id: 'brezhnevka', name: 'Брежневка', created_at: '', updated_at: '' },
      { id: undefined as any, server_id: 'modern', name: 'Современная', created_at: '', updated_at: '' },
      { id: undefined as any, server_id: 'improved', name: 'Улучшенная планировка', created_at: '', updated_at: '' },
      { id: undefined as any, server_id: 'individual', name: 'Индивидуальный проект', created_at: '', updated_at: '' },
    ];
    const DEFAULT_HOUSE_CLASSES: ReferenceItem[] = [
      { id: undefined as any, server_id: 'economy', name: 'Эконом', created_at: '', updated_at: '' },
      { id: undefined as any, server_id: 'comfort', name: 'Комфорт', created_at: '', updated_at: '' },
      { id: undefined as any, server_id: 'comfort_plus', name: 'Комфорт+', created_at: '', updated_at: '' },
      { id: undefined as any, server_id: 'business', name: 'Бизнес', created_at: '', updated_at: '' },
      { id: undefined as any, server_id: 'elite', name: 'Элитное', created_at: '', updated_at: '' },
    ];
    const DEFAULT_CEILING_MATERIALS: ReferenceItem[] = [
      { id: undefined as any, server_id: 'reinforced_concrete', name: 'Железобетонное', created_at: '', updated_at: '' },
      { id: undefined as any, server_id: 'wooden', name: 'Деревянное', created_at: '', updated_at: '' },
      { id: undefined as any, server_id: 'metal', name: 'Металлическое', created_at: '', updated_at: '' },
    ];
    const DEFAULT_HOUSE_PROBLEMS: ReferenceItem[] = [
      { id: undefined as any, server_id: 'emergency', name: 'Аварийный', color: '#ef4444', created_at: '', updated_at: '' },
      { id: undefined as any, server_id: 'struts', name: 'На стяжках', color: '#f59e0b', created_at: '', updated_at: '' },
      { id: undefined as any, server_id: 'renovation', name: 'Под реновацию', color: '#8b5cf6', created_at: '', updated_at: '' },
      { id: undefined as any, server_id: 'bad_entrance', name: 'Плохое состояние подъездов', color: '#f97316', created_at: '', updated_at: '' },
    ];

    loadRef('ad_wall_materials', DEFAULT_WALL_MATERIALS).then(setRefWallMaterials);
    loadRef('ad_house_series', DEFAULT_HOUSE_SERIES).then(setRefHouseSeries);
    loadRef('ad_house_classes', DEFAULT_HOUSE_CLASSES).then(setRefHouseClasses);
    loadRef('ad_ceiling_materials', DEFAULT_CEILING_MATERIALS).then(setRefCeilingMaterials);
    loadRef('ad_house_problems', DEFAULT_HOUSE_PROBLEMS).then(setRefHouseProblems);
  }, []);

  // Статистика объектов/объявлений по адресам (для маркеров на карте)
  const addressStatsMap = useMemo(() => {
    const statsMap: Record<number, { objects: number; listings: number }> = {};
    for (const obj of allObjects) {
      if (obj.address_id) {
        if (!statsMap[obj.address_id]) statsMap[obj.address_id] = { objects: 0, listings: 0 };
        statsMap[obj.address_id].objects++;
      }
    }
    for (const ad of allAds) {
      if (ad.address_id) {
        if (!statsMap[ad.address_id]) statsMap[ad.address_id] = { objects: 0, listings: 0 };
        statsMap[ad.address_id].listings++;
      }
    }
    return statsMap;
  }, [allAds, allObjects]);

  // Загрузка данных + регион подписки
  useEffect(() => {
    (async () => {
      // Восстановление последнего состояния фильтров
      try {
        const lastFilter = localStorage.getItem('ret_ads_last_filter');
        if (lastFilter) {
          const parsed = JSON.parse(lastFilter);
          applyFilterState(parsed);
        }
      } catch {}
      // Данные загружаются через сервер Неоценка, прямой API ключ не нужен
    })();
  }, []);

  // ─── Сохранение фильтров ───
  const getFilterState = useCallback(() => ({
    sources: filterSources, propertyTypes: filterPropertyTypes, categoryIds: filterCategoryIds,
    priceMin: filterPriceMin, priceMax: filterPriceMax,
    areaMin: filterAreaMin, areaMax: filterAreaMax,
    floorMin: filterFloorMin, floorMax: filterFloorMax,
    yearMin: filterYearMin, yearMax: filterYearMax,
    sellerTypes: filterSellerTypes, status: filterStatus,
    dateFrom: filterDateFrom, dateTo: filterDateTo,
    searchQuery,
    processingStatus: filterProcessingStatus, addressId: filterAddressId, contactType: filterContactType,
    processingCategoryId: filterProcessingCategoryId, processingFloor: filterProcessingFloor,
    filterAddressIds: [...filterAddressIds],
    excludedAddressIds: [...excludedAddressIds],
    polygonsCoords,
    houseSeriesIds: filterHouseSeriesIds,
    wallMaterialIds: filterWallMaterialIds,
    floorsMin: filterFloorsMin, floorsMax: filterFloorsMax,
  }), [filterSources, filterPropertyTypes, filterCategoryIds, filterPriceMin, filterPriceMax, filterAreaMin, filterAreaMax,
    filterFloorMin, filterFloorMax, filterYearMin, filterYearMax, filterSellerTypes, filterStatus,
    filterDateFrom, filterDateTo, searchQuery, filterProcessingStatus, filterAddressId, filterContactType,
    filterProcessingCategoryId, filterProcessingFloor, filterAddressIds, excludedAddressIds, polygonsCoords,
    filterHouseSeriesIds, filterWallMaterialIds, filterFloorsMin, filterFloorsMax]);

  const applyFilterState = useCallback((state: Record<string, unknown>) => {
    setFilterSources((state.sources as string[]) || []);
    setFilterPropertyTypes((state.propertyTypes as string[]) || []);
    setFilterCategoryIds((state.categoryIds as number[]) || []);
    setFilterPriceMin((state.priceMin as string) || '');
    setFilterPriceMax((state.priceMax as string) || '');
    setFilterAreaMin((state.areaMin as string) || '');
    setFilterAreaMax((state.areaMax as string) || '');
    setFilterFloorMin((state.floorMin as string) || '');
    setFilterFloorMax((state.floorMax as string) || '');
    setFilterYearMin((state.yearMin as string) || '');
    setFilterYearMax((state.yearMax as string) || '');
    setFilterSellerTypes((state.sellerTypes as string[]) || []);
    setFilterStatus((state.status as 'active' | 'archived' | '') || '');
    setFilterDateFrom((state.dateFrom as string) || '');
    setFilterDateTo((state.dateTo as string) || '');
    setSearchQuery((state.searchQuery as string) || '');
    setFilterProcessingStatus((state.processingStatus as string) || '');
    setFilterAddressId((state.addressId as number | '') ?? '');
    setFilterContactType((state.contactType as string) || '');
    setFilterProcessingCategoryId((state.processingCategoryId as number | '') ?? '');
    setFilterProcessingFloor((state.processingFloor as string) || '');
    // Восстановление адресного фильтра
    const savedAddrIds = state.filterAddressIds as number[] | undefined;
    if (savedAddrIds && Array.isArray(savedAddrIds)) {
      const ids = new Set(savedAddrIds);
      setFilterAddressIds(ids);
      localStorage.setItem('ret_ads_filter_address_ids', JSON.stringify([...ids]));
    } else {
      setFilterAddressIds(new Set());
      localStorage.removeItem('ret_ads_filter_address_ids');
    }
    const savedPolygons = state.polygonsCoords as [number, number][][] | null | undefined;
    if (savedPolygons && savedPolygons.length > 0) {
      setPolygonsCoords(savedPolygons);
      localStorage.setItem('ret_ads_polygon_coords', JSON.stringify(savedPolygons));
    } else {
      setPolygonsCoords(null);
      localStorage.removeItem('ret_ads_polygon_coords');
    }
    // Восстановление исключённых адресов
    const savedExcluded = state.excludedAddressIds as number[] | undefined;
    if (savedExcluded && Array.isArray(savedExcluded)) {
      const ids = new Set(savedExcluded);
      setExcludedAddressIds(ids);
      localStorage.setItem('ret_ads_excluded_address_ids', JSON.stringify([...ids]));
    } else {
      setExcludedAddressIds(new Set());
      localStorage.removeItem('ret_ads_excluded_address_ids');
    }
    // Восстановление фильтров по серии, материалу стен и этажности дома
    setFilterHouseSeriesIds((state.houseSeriesIds as string[]) || []);
    setFilterWallMaterialIds((state.wallMaterialIds as string[]) || []);
    setFilterFloorsMin((state.floorsMin as string) || '');
    setFilterFloorsMax((state.floorsMax as string) || '');
  }, []);

  // Автосохранение фильтров при любом изменении (пропускаем первый рендер)
  const filterSaveReady = useRef(false);
  useEffect(() => {
    if (!filterSaveReady.current) {
      filterSaveReady.current = true;
      return;
    }
    try {
      const state = getFilterState();
      localStorage.setItem('ret_ads_last_filter', JSON.stringify(state));
    } catch {}
  }, [getFilterState]);

  // Ref для отложенной установки activeFilterStateJson после рендера
  const pendingFilterSnapshot = useRef<string | null>(null);

  // После рендера — снимаем snapshot реального состояния фильтра
  useEffect(() => {
    if (pendingFilterSnapshot.current !== null) {
      // Задержка чтобы SearchByPolygon успел обработать новый initialPolygons
      // и вызвать handlePolygonsChange, который может изменить polygonsCoords
      const timer = setTimeout(() => {
        setActiveFilterStateJson(JSON.stringify(getFilterState()));
        pendingFilterSnapshot.current = null;
      }, 600);
      return () => clearTimeout(timer);
    }
  });

  const handleApplySavedFilter = (state: Record<string, unknown>, filterId?: string, filterName?: string, _groupName?: string) => {
    applyFilterState(state);
    setActiveFilterId(filterId ?? null);
    setActiveFilterName(filterName ?? null);
    // Откладываем snapshot до следующего рендера, когда все setState'ы применятся
    pendingFilterSnapshot.current = filterId ? 'pending' : null;
    setActiveFilterStateJson(null); // временно null, чтобы не мигало
  };

  // Поля фильтра обработки — не участвуют в отслеживании изменений сохранённого фильтра
  const PROCESSING_FILTER_KEYS = ['processingStatus', 'addressId', 'contactType', 'processingCategoryId', 'processingFloor'];

  // Убираем из состояния поля фильтра обработки для сравнения
  const stripProcessingFields = (state: Record<string, unknown>) => {
    const copy = { ...state };
    for (const key of PROCESSING_FILTER_KEYS) delete copy[key];
    return copy;
  };

  // Проверяем, изменился ли активный фильтр (без учёта полей фильтра обработки)
  const filterChanged = useMemo(() => {
    if (!activeFilterId || !activeFilterStateJson) return false;
    const current = getFilterState();
    const currentStripped = stripProcessingFields(current);
    const savedStripped = stripProcessingFields(JSON.parse(activeFilterStateJson));
    return JSON.stringify(currentStripped) !== JSON.stringify(savedStripped);
  }, [activeFilterId, activeFilterStateJson, getFilterState]);

  const handleSaveToActiveFilter = () => {
    if (!activeFilterId) return;
    const currentState = getFilterState();
    const STORAGE_KEY = 'ret_ads_saved_filters_v2';
    chrome.storage.local.get(STORAGE_KEY, (result: any) => {
      const raw = result?.[STORAGE_KEY];
      if (!raw) return;
      try {
        const filters = JSON.parse(raw);
        const updated = filters.map((f: any) =>
          f.id === activeFilterId ? { ...f, state: currentState } : f
        );
        chrome.storage.local.set({ [STORAGE_KEY]: JSON.stringify(updated) });
        const target = updated.find((f: any) => f.id === activeFilterId);
        if (target?.serverId) {
          import('@/services/api-service').then(api => {
            api.updateSavedFilter(target.serverId, {
              filter_data: currentState as unknown as Record<string, unknown>,
            }).catch(() => {});
          });
        }
      } catch {}
    });
    setActiveFilterStateJson(JSON.stringify(currentState));
  };

  const handleCancelFilterChanges = () => {
    if (!activeFilterStateJson) return;
    // Сохраняем текущие значения полей фильтра обработки (они не сбрасываются)
    const currentProcessingStatus = filterProcessingStatus;
    const currentAddressId = filterAddressId;
    const currentContactType = filterContactType;
    const currentProcessingCategoryId = filterProcessingCategoryId;
    const currentProcessingFloor = filterProcessingFloor;
    const savedState = JSON.parse(activeFilterStateJson);
    applyFilterState(savedState);
    // Восстанавливаем поля фильтра обработки, т.к. они не являются частью сохранённого фильтра
    setFilterProcessingStatus(currentProcessingStatus);
    setFilterAddressId(currentAddressId);
    setFilterContactType(currentContactType);
    setFilterProcessingCategoryId(currentProcessingCategoryId);
    setFilterProcessingFloor(currentProcessingFloor);
  };

  // ─── Доступные серии домов (только из релевантных адресов) ───
  const availableHouseSeries = useMemo(() => {
    if (filterAddressIds.size === 0) return [];
    const relevantAddresses = addresses.filter(a => a.id != null && filterAddressIds.has(a.id));
    const usedIds = new Set(
      relevantAddresses.map(a => a.house_series_id).filter(Boolean) as string[]
    );
    return refHouseSeries.filter(s => s.server_id && usedIds.has(s.server_id));
  }, [refHouseSeries, addresses, filterAddressIds]);

  // ─── Доступные материалы стен (только из релевантных адресов) ───
  const availableWallMaterials = useMemo(() => {
    if (filterAddressIds.size === 0) return [];
    const relevantAddresses = addresses.filter(a => a.id != null && filterAddressIds.has(a.id));
    const usedIds = new Set(
      relevantAddresses.map(a => a.wall_material_id).filter(Boolean) as string[]
    );
    return refWallMaterials.filter(s => s.server_id && usedIds.has(s.server_id));
  }, [refWallMaterials, addresses, filterAddressIds]);

  // ─── Адреса, подходящие под все адресные фильтры (полигон + серия + материал + этажность, без excluded) ───
  const highlightedAddressIds = useMemo(() => {
    const hasAddrFilters = filterHouseSeriesIds.length > 0 || filterWallMaterialIds.length > 0 || !!filterFloorsMin || !!filterFloorsMax;
    // Без доп.фильтров — все активные (не excluded) адреса пула
    const activePool = filterAddressIds.size > 0
      ? [...filterAddressIds].filter(id => !excludedAddressIds.has(id))
      : [];
    const activeSet = new Set(activePool);
    if (!hasAddrFilters) return activeSet;

    const result = new Set<number>();
    const pool = addresses.filter(a => a.id != null && activeSet.has(a.id));
    for (const addr of pool) {
      if (filterHouseSeriesIds.length > 0 && (!addr.house_series_id || !filterHouseSeriesIds.includes(addr.house_series_id))) continue;
      if (filterWallMaterialIds.length > 0 && (!addr.wall_material_id || !filterWallMaterialIds.includes(addr.wall_material_id))) continue;
      if (filterFloorsMin && (!addr.floors_count || addr.floors_count < Number(filterFloorsMin))) continue;
      if (filterFloorsMax && (!addr.floors_count || addr.floors_count > Number(filterFloorsMax))) continue;
      if (addr.id != null) result.add(addr.id);
    }
    return result;
  }, [filterAddressIds, excludedAddressIds, addresses, filterHouseSeriesIds, filterWallMaterialIds, filterFloorsMin, filterFloorsMax]);

  // ─── Фильтрация ───
  const filteredAds = useMemo(() => {
    let result = allAds;

    // Основной фильтр
    if (filterStatus) result = result.filter(a => a.status === filterStatus);
    if (filterSources.length > 0) result = result.filter(a => filterSources.includes(normalizeSource(a.source)));
    if (filterPropertyTypes.length > 0) result = result.filter(a => filterPropertyTypes.includes(a.property_type));
    if (filterCategoryIds.length > 0) result = result.filter(a => a.category_id != null && filterCategoryIds.includes(a.category_id));
    if (filterPriceMin) result = result.filter(a => a.price != null && a.price >= Number(filterPriceMin));
    if (filterPriceMax) result = result.filter(a => a.price != null && a.price <= Number(filterPriceMax));
    if (filterAreaMin) result = result.filter(a => a.area_total != null && a.area_total >= Number(filterAreaMin));
    if (filterAreaMax) result = result.filter(a => a.area_total != null && a.area_total <= Number(filterAreaMax));
    if (filterFloorMin) result = result.filter(a => a.floor != null && a.floor >= Number(filterFloorMin));
    if (filterFloorMax) result = result.filter(a => a.floor != null && a.floor <= Number(filterFloorMax));
    if (filterYearMin) result = result.filter(a => { const y = a.year_built ?? a.house_details?.build_year; return y != null && y >= Number(filterYearMin); });
    if (filterYearMax) result = result.filter(a => { const y = a.year_built ?? a.house_details?.build_year; return y != null && y <= Number(filterYearMax); });
    if (filterSellerTypes.length > 0) result = result.filter(a => filterSellerTypes.includes(a.seller_info?.type || a.seller_type));
    if (filterDateFrom) result = result.filter(a => a.created && new Date(a.created) >= new Date(filterDateFrom));
    if (filterDateTo) result = result.filter(a => a.created && new Date(a.created) <= new Date(filterDateTo + 'T23:59:59'));
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(a => (a.address || '').toLowerCase().includes(q) || (a.title || '').toLowerCase().includes(q));
    }

    // Фильтр обработки: «Определить адрес» — показывает address_needed + low/very_low confidence
    if (filterProcessingStatus === 'address_needed') {
      result = result.filter(a =>
        a.processing_status === 'address_needed' ||
        (a.address_id && (a.address_match_confidence === 'low' || a.address_match_confidence === 'very_low'))
      );
    } else if (filterProcessingStatus === 'needs_update') {
      // «Актуализировать» — все объявления прошедшие этап адреса с устаревшими данными
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const archiveCutoff = new Date(Date.now() - archiveDays * 24 * 60 * 60 * 1000);
      result = result.filter(a => {
        if (a.processing_status === 'address_needed') return false;
        // Архивные старше N дней — пропускаем
        if (a.status === 'archived' && a.updated && new Date(a.updated) < archiveCutoff) return false;
        return !a.updated || new Date(a.updated) < oneDayAgo;
      });
    } else if (filterProcessingStatus === 'duplicate_check_needed') {
      result = result.filter(a => a.processing_status === 'duplicate_check_needed' && !a.object_id);
    } else if (filterProcessingStatus) {
      result = result.filter(a => a.processing_status === filterProcessingStatus);
    }
    if (filterAddressId) result = result.filter(a => a.address_id === filterAddressId);
    if (filterContactType) result = result.filter(a => (a.seller_info?.type || a.seller_type) === filterContactType);
    if (filterProcessingCategoryId) result = result.filter(a => a.category_id === filterProcessingCategoryId);
    if (filterProcessingFloor) result = result.filter(a => a.floor != null && a.floor === Number(filterProcessingFloor));

    // Фильтр по выбранным адресам (из полигона), исключая отключённые
    if (filterAddressIds.size > 0) result = result.filter(a => a.address_id != null && filterAddressIds.has(a.address_id) && !excludedAddressIds.has(a.address_id));

    // Фильтр по серии дома, материалу стен и этажности (через адрес)
    if (filterHouseSeriesIds.length > 0 || filterWallMaterialIds.length > 0 || filterFloorsMin || filterFloorsMax) {
      const addrMap = new Map<number, AdAddress>();
      for (const addr of addresses) { if (addr.id != null) addrMap.set(addr.id, addr); }
      result = result.filter(a => {
        if (!a.address_id) return false;
        const addr = addrMap.get(a.address_id);
        if (!addr) return false;
        if (filterHouseSeriesIds.length > 0 && (!addr.house_series_id || !filterHouseSeriesIds.includes(addr.house_series_id))) return false;
        if (filterWallMaterialIds.length > 0 && (!addr.wall_material_id || !filterWallMaterialIds.includes(addr.wall_material_id))) return false;
        if (filterFloorsMin && (!addr.floors_count || addr.floors_count < Number(filterFloorsMin))) return false;
        if (filterFloorsMax && (!addr.floors_count || addr.floors_count > Number(filterFloorsMax))) return false;
        return true;
      });
    }

    return result;
  }, [allAds, filterStatus, filterSources, filterPropertyTypes, filterCategoryIds, filterPriceMin, filterPriceMax,
    filterAreaMin, filterAreaMax, filterFloorMin, filterFloorMax, filterYearMin, filterYearMax,
    filterSellerTypes, filterDateFrom, filterDateTo, searchQuery,
    filterProcessingStatus, filterAddressId, filterContactType, filterProcessingCategoryId, filterProcessingFloor,
    filterAddressIds, excludedAddressIds, addresses, filterHouseSeriesIds, filterWallMaterialIds, filterFloorsMin, filterFloorsMax, archiveDays]);

  const filteredObjects = useMemo(() => {
    let result = allObjects;
    if (filterStatus) result = result.filter(o => o.status === filterStatus);
    if (filterPropertyTypes.length > 0) result = result.filter(o => o.property_type && filterPropertyTypes.includes(o.property_type));
    if (filterPriceMin) result = result.filter(o => o.current_price != null && o.current_price >= Number(filterPriceMin));
    if (filterPriceMax) result = result.filter(o => o.current_price != null && o.current_price <= Number(filterPriceMax));
    if (filterAreaMin) result = result.filter(o => o.area_total != null && o.area_total >= Number(filterAreaMin));
    if (filterAreaMax) result = result.filter(o => o.area_total != null && o.area_total <= Number(filterAreaMax));
    if (filterFloorMin) result = result.filter(o => o.floor != null && o.floor >= Number(filterFloorMin));
    if (filterFloorMax) result = result.filter(o => o.floor != null && o.floor <= Number(filterFloorMax));
    // Фильтр обработки
    if (filterAddressId) result = result.filter(o => o.address_id === filterAddressId);
    if (filterProcessingFloor) result = result.filter(o => o.floor != null && o.floor === Number(filterProcessingFloor));
    // Фильтр по выбранным адресам (из полигона)
    if (filterAddressIds.size > 0) result = result.filter(o => o.address_id != null && filterAddressIds.has(o.address_id) && !excludedAddressIds.has(o.address_id));
    // Фильтр по серии дома, материалу стен и этажности (через адрес)
    if (filterHouseSeriesIds.length > 0 || filterWallMaterialIds.length > 0 || filterFloorsMin || filterFloorsMax) {
      const addrMap = new Map<number, AdAddress>();
      for (const addr of addresses) { if (addr.id != null) addrMap.set(addr.id, addr); }
      result = result.filter(o => {
        if (!o.address_id) return false;
        const addr = addrMap.get(o.address_id);
        if (!addr) return false;
        if (filterHouseSeriesIds.length > 0 && (!addr.house_series_id || !filterHouseSeriesIds.includes(addr.house_series_id))) return false;
        if (filterWallMaterialIds.length > 0 && (!addr.wall_material_id || !filterWallMaterialIds.includes(addr.wall_material_id))) return false;
        if (filterFloorsMin && (!addr.floors_count || addr.floors_count < Number(filterFloorsMin))) return false;
        if (filterFloorsMax && (!addr.floors_count || addr.floors_count > Number(filterFloorsMax))) return false;
        return true;
      });
    }
    return result;
  }, [allObjects, filterStatus, filterPropertyTypes, filterPriceMin, filterPriceMax,
    filterAreaMin, filterAreaMax, filterFloorMin, filterFloorMax,
    filterAddressId, filterProcessingFloor, filterAddressIds, excludedAddressIds, addresses, filterHouseSeriesIds, filterWallMaterialIds, filterFloorsMin, filterFloorsMax]);

  // ─── Строки таблицы ───
  const tableRows = useMemo(() => {
    const rows: TableRow[] = [];
    const isUpdateFilter = filterProcessingStatus === 'needs_update';
    // Сначала объекты (не показываем при фильтре "Актуализировать")
    if (!isUpdateFilter) {
      for (const obj of filteredObjects) {
        rows.push({ kind: 'object', data: obj });
        if (expandedObjects.has(obj.id!)) {
          const objAds = objectAds.get(obj.id!) || [];
          for (const ad of objAds) {
            rows.push({ kind: 'expanded_ad', data: ad, parentObjectId: obj.id! });
          }
        }
      }
    }
    // Потом объявления без объекта (при "Актуализировать" — все объявления)
    const objectAdIds = new Set(allAds.filter(a => a.object_id).map(a => a.id));
    for (const ad of filteredAds) {
      if (!objectAdIds.has(ad.id) || isUpdateFilter) {
        rows.push({ kind: 'ad', data: ad });
      }
    }

    // Сортировка
    if (sortColumn) {
      const mul = sortDir === 'asc' ? 1 : -1;
      const getVal = (row: TableRow): number => {
        const d = row.data as any;
        if (sortColumn === 'price') {
          return d.price ?? d.current_price ?? -Infinity;
        }
        if (sortColumn === 'created') {
          return d.created ? new Date(d.created).getTime() : 0;
        }
        if (sortColumn === 'updated') {
          return d.updated ? new Date(d.updated).getTime() : 0;
        }
        return 0;
      };
      rows.sort((a, b) => {
        // expanded_ad всегда следует за parent object — не сортируем
        if (a.kind === 'expanded_ad' || b.kind === 'expanded_ad') return 0;
        return (getVal(a) - getVal(b)) * mul;
      });
    }

    return rows;
  }, [filteredObjects, filteredAds, expandedObjects, objectAds, allAds, sortColumn, sortDir, filterProcessingStatus]);

  const totalPages = Math.ceil(tableRows.length / pageSize);
  const pagedRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    return tableRows.slice(start, start + pageSize);
  }, [tableRows, page, pageSize]);

  // ─── Активные фильтры ───
  const activeFilterTags = useMemo(() => {
    const tags: { key: string; label: string }[] = [];
    if (filterStatus) tags.push({ key: 'status', label: `Статус: ${filterStatus === 'active' ? 'Активные' : 'Архивные'}` });
    if (filterSources.length > 0) tags.push({ key: 'sources', label: `Источник: ${filterSources.map(s => SOURCE_LABELS[s] || s).join(', ')}` });
    if (filterPropertyTypes.length > 0) tags.push({ key: 'ptypes', label: `Тип: ${filterPropertyTypes.map(t => PROPERTY_TYPE_FULL[t] || t).join(', ')}` });
    if (filterCategoryIds.length > 0) tags.push({ key: 'cats', label: `Категория: ${filterCategoryIds.length} выбрано` });
    if (filterPriceMin || filterPriceMax) tags.push({ key: 'price', label: `Цена: ${filterPriceMin ? Number(filterPriceMin).toLocaleString('ru-RU') : '—'} – ${filterPriceMax ? Number(filterPriceMax).toLocaleString('ru-RU') : '—'}` });
    if (filterAreaMin || filterAreaMax) tags.push({ key: 'area', label: `Площадь: ${filterAreaMin || '—'} – ${filterAreaMax || '—'} м²` });
    if (filterFloorMin || filterFloorMax) tags.push({ key: 'floor', label: `Этаж: ${filterFloorMin || '—'} – ${filterFloorMax || '—'}` });
    if (filterYearMin || filterYearMax) tags.push({ key: 'year', label: `Год: ${filterYearMin || '—'} – ${filterYearMax || '—'}` });
    if (filterSellerTypes.length > 0) tags.push({ key: 'seller', label: `Продавец: ${filterSellerTypes.map(s => SELLER_TYPE_LABELS[s] || s).join(', ')}` });
    if (filterDateFrom || filterDateTo) tags.push({ key: 'dates', label: `Даты: ${filterDateFrom || '—'} – ${filterDateTo || '—'}` });
    if (filterProcessingStatus) tags.push({ key: 'proc', label: `Обработка: ${PROCESSING_STATUS_LABELS[filterProcessingStatus]}` });
    if (filterAddressId) {
      const addr = addresses.find(a => a.id === filterAddressId);
      if (addr) tags.push({ key: 'addr', label: `Адрес: ${addr.address}` });
    }
    if (filterContactType) tags.push({ key: 'contact', label: `Контакт: ${SELLER_TYPE_LABELS[filterContactType] || filterContactType}` });
    if (filterProcessingCategoryId) {
      const cat = categories.find(c => c.id === filterProcessingCategoryId);
      if (cat) tags.push({ key: 'pcat', label: `Кат. обработки: ${cat.title}` });
    }
    if (filterProcessingFloor) tags.push({ key: 'pfloor', label: `Этаж обработки: ${filterProcessingFloor}` });
    if (searchQuery) tags.push({ key: 'query', label: `Поиск: ${searchQuery}` });
    if (filterAddressIds.size > 0) {
      const active = filterAddressIds.size - excludedAddressIds.size;
      tags.push({ key: 'polygonAddresses', label: excludedAddressIds.size > 0 ? `Полигон: ${active} из ${filterAddressIds.size} адресов` : `Полигон: ${filterAddressIds.size} адрес(ов)` });
    }
    if (filterHouseSeriesIds.length > 0) {
      const names = filterHouseSeriesIds.map(id => availableHouseSeries.find(r => r.server_id === id)?.name || id);
      tags.push({ key: 'houseSeries', label: `Серия: ${names.join(', ')}` });
    }
    if (filterWallMaterialIds.length > 0) {
      const names = filterWallMaterialIds.map(id => availableWallMaterials.find(r => r.server_id === id)?.name || id);
      tags.push({ key: 'wallMaterial', label: `Материал стен: ${names.join(', ')}` });
    }
    if (filterFloorsMin || filterFloorsMax) tags.push({ key: 'addrFloors', label: `Этажность дома: ${filterFloorsMin || '—'} – ${filterFloorsMax || '—'}` });
    return tags;
  }, [filterStatus, filterSources, filterPropertyTypes, filterCategoryIds, filterPriceMin, filterPriceMax, filterAreaMin, filterAreaMax,
    filterFloorMin, filterFloorMax, filterYearMin, filterYearMax, filterSellerTypes, filterDateFrom, filterDateTo,
    filterProcessingStatus, filterAddressId, filterContactType, filterProcessingCategoryId, filterProcessingFloor,
    searchQuery, addresses, categories, filterAddressIds, filterHouseSeriesIds, filterWallMaterialIds, filterFloorsMin, filterFloorsMax, availableHouseSeries, availableWallMaterials]);

  const removeFilterTag = (key: string) => {
    if (key === 'status') setFilterStatus('');
    if (key === 'sources') setFilterSources([]);
    if (key === 'ptypes') setFilterPropertyTypes([]);
    if (key === 'cats') setFilterCategoryIds([]);
    if (key === 'price') { setFilterPriceMin(''); setFilterPriceMax(''); }
    if (key === 'area') { setFilterAreaMin(''); setFilterAreaMax(''); }
    if (key === 'floor') { setFilterFloorMin(''); setFilterFloorMax(''); }
    if (key === 'year') { setFilterYearMin(''); setFilterYearMax(''); }
    if (key === 'seller') setFilterSellerTypes([]);
    if (key === 'dates') { setFilterDateFrom(''); setFilterDateTo(''); }
    if (key === 'proc') setFilterProcessingStatus('');
    if (key === 'addr') setFilterAddressId('');
    if (key === 'contact') setFilterContactType('');
    if (key === 'pcat') setFilterProcessingCategoryId('');
    if (key === 'pfloor') setFilterProcessingFloor('');
    if (key === 'query') setSearchQuery('');
    if (key === 'polygonAddresses') { setFilterAddressIds(new Set()); localStorage.removeItem('ret_ads_filter_address_ids'); }
    if (key === 'houseSeries') setFilterHouseSeriesIds([]);
    if (key === 'wallMaterial') setFilterWallMaterialIds([]);
    if (key === 'addrFloors') { setFilterFloorsMin(''); setFilterFloorsMax(''); }
  };

  const clearAllFilters = () => {
    setFilterStatus(''); setFilterSources([]); setFilterPropertyTypes([]); setFilterCategoryIds([]);
    setFilterPriceMin(''); setFilterPriceMax(''); setFilterAreaMin(''); setFilterAreaMax('');
    setFilterFloorMin(''); setFilterFloorMax(''); setFilterYearMin(''); setFilterYearMax('');
    setFilterSellerTypes([]); setFilterDateFrom(''); setFilterDateTo('');
    setFilterProcessingStatus(''); setFilterAddressId(''); setFilterContactType('');
    setFilterProcessingCategoryId(''); setFilterProcessingFloor('');
    setSearchQuery(''); setActiveFilterId(null); setActiveFilterName(null);
    setFilterAddressIds(new Set()); localStorage.removeItem('ret_ads_filter_address_ids');
    setExcludedAddressIds(new Set()); localStorage.removeItem('ret_ads_excluded_address_ids');
    setFilterHouseSeriesIds([]); setFilterWallMaterialIds([]); setFilterFloorsMin(''); setFilterFloorsMax('');
  };

  // ─── Обработчики ───
  const toggleExpand = async (objectId: number) => {
    const next = new Set(expandedObjects);
    if (next.has(objectId)) {
      next.delete(objectId);
    } else {
      next.add(objectId);
      if (!objectAds.has(objectId)) {
        const ads = allAds
          .filter(a => a.object_id === objectId)
          .sort((a, b) => {
            const ta = new Date(a.updated || a.created || 0).getTime();
            const tb = new Date(b.updated || b.created || 0).getTime();
            return tb - ta; // по убыванию даты обновления
          });
        setObjectAds(prev => new Map(prev).set(objectId, ads));
      }
    }
    setExpandedObjects(next);
  };

  const toggleSelect = (id: number, type: 'ad' | 'object') => {
    const nextIds = new Set(selectedIds);
    const nextTypes = new Map(selectedTypes);
    if (nextIds.has(id)) { nextIds.delete(id); nextTypes.delete(id); }
    else { nextIds.add(id); nextTypes.set(id, type); }
    setSelectedIds(nextIds); setSelectedTypes(nextTypes);
  };

  const toggleSelectAll = () => {
    if (selectedIds.size > 0) { setSelectedIds(new Set()); setSelectedTypes(new Map()); return; }
    const nextIds = new Set<number>(); const nextTypes = new Map<number, 'ad' | 'object'>();
    for (const row of pagedRows) {
      const id = row.kind === 'object' ? row.data.id! : row.data.id!;
      const type = row.kind === 'object' ? 'object' : 'ad';
      if (id != null) { nextIds.add(id); nextTypes.set(id, type); }
    }
    setSelectedIds(nextIds); setSelectedTypes(nextTypes);
  };

  // Быстрый фильтр по строке
  /** Заполнить фильтры обработки данными из строки (как в neocenka-extension) */
  const quickFilter = (row: TableRow) => {
    // Показать панель фильтра обработки, если скрыта
    if (!showProcessingFilter) setShowProcessingFilter(true);
    // Сбрасываем статус обработки и страницу
    setFilterProcessingStatus('');
    setPage(1);

    if (row.kind === 'object') {
      const o = row.data;
      if (o.address_id) setFilterAddressId(o.address_id);
      if (o.floor != null) setFilterProcessingFloor(String(o.floor));
    } else {
      const a = row.data;
      if (a.address_id) setFilterAddressId(a.address_id);
      if (a.category_id) setFilterProcessingCategoryId(a.category_id);
      if (a.floor != null) setFilterProcessingFloor(String(a.floor));
    }
  };

  // ─── Загрузка данных (категории + источники из настроек) ───
  const ensureListingData = async () => {
    if (categoriesLoadedRef.current) return;
    try {
      // Загрузить настройки пользователя из chrome.storage
      let selectedCatIds: number[] = [];
      let selectedSrcIds: number[] = [];
      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        const stored = await new Promise<Record<string, number[]>>((resolve) => {
          chrome.storage.local.get(
            ['listing_selected_categories', 'listing_selected_sources'],
            (r) => resolve(r as Record<string, number[]>)
          );
        });
        selectedCatIds = stored.listing_selected_categories || [];
        selectedSrcIds = stored.listing_selected_sources || [];
      }

      // Загрузить и отфильтровать категории — только выбранные пользователем
      let allCats: ListingCategoryRaw[];
      const saved = await db.table('listing_categories').toArray();
      if (saved.length > 0) {
        allCats = saved.map((c: any) => ({ id: c.source_id, title: c.name, typeId: c.type_id ?? 0, sectionId: c.section_id ?? 0 }));
      } else {
        // Пробуем загрузить с сервера
        try {
          const serverCats = await getAvailableCategories();
          allCats = serverCats.map(c => ({ id: c.source_id, title: c.title, typeId: c.type_id ?? 0, sectionId: c.section_id ?? 0 }));
        } catch {
          allCats = [];
        }
      }
      // Фильтруем арендные секции (6,7,8,10) — работаем только с продажей
      const saleOnlyCats = allCats.filter(c => ![6, 7, 8, 10].includes(c.sectionId));
      const filteredCats = selectedCatIds.length > 0
        ? saleOnlyCats.filter(c => selectedCatIds.includes(c.id))
        : saleOnlyCats;
      setCategories(filteredCats);
      categoriesLoadedRef.current = true;

      // В панели загрузки — все показанные категории выбраны по умолчанию
      setImportCategoryIds(filteredCats.map(c => c.id));

      // Источники — только выбранные пользователем
      const allSourceEntries = Object.entries(SOURCE_IDS) as [string, number][];
      if (selectedSrcIds.length > 0) {
        const enabled = allSourceEntries.filter(([, id]) => selectedSrcIds.includes(id)).map(([key, id]) => ({ id, key }));
        setEnabledSources(enabled);
        setImportSourceIds(enabled.map(s => s.id));
      } else {
        setEnabledSources(allSourceEntries.map(([key, id]) => ({ id, key })));
      }
    } catch {}
  };

  // ─── Загрузка данных ───
  const handleOpenImport = async () => {
    setShowImportPanel(!showImportPanel);
    if (!showImportPanel) {
      await ensureListingData();
    }
  };

  const handleImport = () => {
    if (!polygonsCoords || polygonsCoords.length === 0) { setImportError('Нарисуйте полигон на карте'); return; }
    setImportError('');
    startAdsImport({
      polygons: polygonsCoords,
      sourceIds: importSourceIds.length > 0 ? importSourceIds : undefined,
      categoryIds: importCategoryIds.length > 0 ? importCategoryIds : undefined,
      sellerTypes: importSellerTypeIds.length > 0 ? importSellerTypeIds : undefined,
      dateFrom: importDateFrom || undefined,
      dateTo: importDateTo || undefined,
      isNew: importIsNew,
    });
  };

  const handleMatchAddresses = async () => {
    setMatchRunning(true);
    setMatchProgress(null);
    try {
      const result = await adsAddressService.matchAdsToAddresses(
        (processed, total) => {
          setMatchProgress({ done: processed, total });
        },
        polygonsCoords ?? undefined,
      );
      await loadData();
      const addrs = await db.table<AdAddress>('ad_addresses').toArray();
      addrs.sort((a, b) => (a.address || '').localeCompare(b.address || '', 'ru'));
      setAddresses(addrs);
      setToast({ message: `Адреса определены: ${result.matched} совпадений, ${result.unmatched} без адреса`, type: 'success' });
    } catch {
      setToast({ message: 'Ошибка при определении адресов', type: 'error' });
    } finally {
      setMatchRunning(false);
      setMatchProgress(null);
    }
  };

  const adsInPolygonCount = useMemo(() => {
    if (!polygonsCoords || polygonsCoords.length === 0) return 0;
    return allAds.filter(ad => {
      const lat = ad.coordinates.lat;
      const lng = ad.coordinates.lng;
      if (lat == null || lng == null) return false;
      return polygonsCoords.some(poly => pointInPolygon(lat, lng, poly));
    }).length;
  }, [allAds, polygonsCoords]);

  const adsWithCoordsCount = useMemo(() => {
    return allAds.filter(ad => ad.coordinates.lat != null && ad.coordinates.lng != null).length;
  }, [allAds]);

  const handleDeleteInPolygon = async () => {
    if (!polygonsCoords || polygonsCoords.length === 0) return;
    setDeleteRunning(true);
    try {
      const idsToDelete = allAds
        .filter(ad => {
          const lat = ad.coordinates.lat;
          const lng = ad.coordinates.lng;
          if (lat == null || lng == null) return false;
          return polygonsCoords.some(poly => pointInPolygon(lat, lng, poly));
        })
        .map(ad => ad.id!)
        .filter((id): id is number => id != null);
      await db.ads.bulkDelete(idsToDelete);
      await loadData();
      await loadStats();
      setDeleteConfirm(false);
      setToast({ message: `Удалено ${idsToDelete.length} объявлений`, type: 'success' });
    } catch {
      setToast({ message: 'Ошибка при удалении', type: 'error' });
    } finally {
      setDeleteRunning(false);
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedIds.size === 0) return;
    setDeleteRunning(true);
    try {
      const adIds: number[] = [];
      const objectIds: number[] = [];
      selectedIds.forEach(id => {
        const type = selectedTypes.get(id);
        if (type === 'object') objectIds.push(id);
        else adIds.push(id);
      });

      // Удаляем объявления
      if (adIds.length > 0) await db.ads.bulkDelete(adIds);

      // Удаляем объекты (и их объявления)
      if (objectIds.length > 0) {
        for (const objId of objectIds) {
          await db.ads.where('object_id').equals(objId).delete();
        }
        await db.ad_objects.bulkDelete(objectIds);
      }

      setSelectedIds(new Set());
      setSelectedTypes(new Map());
      await loadData();
      await loadStats();
      setDeleteSelectedConfirm(false);
      setToast({ message: `Удалено: ${adIds.length} объявлений, ${objectIds.length} объектов`, type: 'success' });
    } catch {
      setToast({ message: 'Ошибка при удалении', type: 'error' });
    } finally {
      setDeleteRunning(false);
    }
  };

  // ─── Объединение / разбиение объектов ───

  /** Объединение историй цен из нескольких объявлений */
  const mergePriceHistory = useCallback((ads: Ad[]): PriceHistoryItem[] => {
    type Entry = { date: string; price: number; adId: number };
    const entries: Entry[] = [];

    for (const ad of ads) {
      // Записи из price_history
      if (ad.price_history && ad.price_history.length > 0) {
        for (const h of ad.price_history) {
          const price = h.new_price ?? h.price;
          if (price != null && h.date) {
            entries.push({ date: h.date, price, adId: ad.id ?? 0 });
          }
        }
      }
      // Текущая цена как финальная точка
      if (ad.price != null) {
        const date = ad.updated || ad.created || new Date().toISOString();
        entries.push({ date, price: ad.price, adId: ad.id ?? 0 });
      }
    }

    // Сортировка по дате
    entries.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // Удаление дубликатов: ключ = (дата_без_времени, цена, adId)
    const seen = new Set<string>();
    const unique: PriceHistoryItem[] = [];
    for (const e of entries) {
      const day = e.date.slice(0, 10);
      const key = `${day}|${e.price}|${e.adId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push({ date: e.date, new_price: e.price, price: e.price });
    }

    return unique;
  }, []);

  /** Пересчёт объекта из массива объявлений */
  const recalculateObjectFromAds = useCallback((ads: Ad[]): Omit<AdObject, 'id' | 'created_at' | 'updated_at'> => {
    if (ads.length === 0) {
      return {
        address_id: null, property_type: null, area_total: null, area_living: null,
        area_kitchen: null, floor: null, floors_total: null, rooms: null,
        status: 'archive', current_price: null, price_per_meter: null,
        price_history: [], listings_count: 0, active_listings_count: 0,
        owner_status: '', sale_deal: null, created: null, updated: null, last_recalculated_at: new Date().toISOString(),
      };
    }

    // Преобладающий тип (наиболее частый)
    const typeCounts: Record<string, number> = {};
    for (const ad of ads) {
      if (ad.property_type) typeCounts[ad.property_type] = (typeCounts[ad.property_type] || 0) + 1;
    }
    const dominantType = Object.entries(typeCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;

    // Преобладающий этаж
    const floorCounts: Record<number, number> = {};
    for (const ad of ads) {
      if (ad.floor != null) floorCounts[ad.floor] = (floorCounts[ad.floor] || 0) + 1;
    }
    const dominantFloor = Object.entries(floorCounts)
      .sort((a, b) => b[1] - a[1] || Number(a[0]) - Number(b[0]))[0]
      ? [Number(Object.entries(floorCounts).sort((a, b) => b[1] - a[1] || Number(a[0]) - Number(b[0]))[0]?.[0])]
      : null;

    // Минимальные площади
    const areas = ads.map(a => a.area_total).filter((v): v is number => v != null);
    const areasLiving = ads.map(a => a.area_living).filter((v): v is number => v != null);
    const areasKitchen = ads.map(a => a.area_kitchen).filter((v): v is number => v != null);

    // Комнаты из property_type
    const roomsMap: Record<string, number> = { studio: 0, '1k': 1, '2k': 2, '3k': 3, '4k+': 4 };
    const rooms = dominantType ? (roomsMap[dominantType] ?? null) : null;

    // Общий address_id
    const addressIds = [...new Set(ads.map(a => a.address_id).filter((v): v is number => v != null))];
    const commonAddressId = addressIds.length === 1 ? addressIds[0] : (addressIds.length > 0 ? addressIds[0] : null);

    // Статус
    const hasActive = ads.some(a => a.status === 'active');
    const status = hasActive ? 'active' : 'archive';

    // Даты
    const dates = ads.map(a => a.created).filter((v): v is string => !!v);
    const updatedDates = ads.map(a => a.updated || a.created).filter((v): v is string => !!v);
    const earliest = dates.length > 0 ? dates.sort()[0] : null;
    const latest = updatedDates.length > 0 ? updatedDates.sort().reverse()[0] : null;

    // История цен
    const priceHistory = mergePriceHistory(ads);
    const currentPrice = priceHistory.length > 0 ? priceHistory[priceHistory.length - 1].new_price ?? priceHistory[priceHistory.length - 1].price ?? null : null;
    const areaTotal = areas.length > 0 ? Math.min(...areas) : null;
    const pricePerMeter = (currentPrice != null && areaTotal != null && areaTotal > 0)
      ? Math.round(currentPrice / areaTotal)
      : null;

    // Статус собственника
    const hasOwner = ads.some(a =>
      a.seller_type === 'owner' || a.seller_info?.type === 'owner'
    );
    const ownerStatus = hasOwner ? 'есть от собственника' : 'только от агентов';

    // Подсчёт объявлений
    const listingsCount = ads.length;
    const activeListingsCount = ads.filter(a => a.status === 'active').length;

    return {
      address_id: commonAddressId,
      property_type: dominantType,
      area_total: areaTotal,
      area_living: areasLiving.length > 0 ? Math.min(...areasLiving) : null,
      area_kitchen: areasKitchen.length > 0 ? Math.min(...areasKitchen) : null,
      floor: dominantFloor?.[0] ?? null,
      floors_total: ads[0]?.floors_total ?? null,
      rooms,
      status,
      current_price: currentPrice,
      price_per_meter: pricePerMeter,
      price_history: priceHistory,
      listings_count: listingsCount,
      active_listings_count: activeListingsCount,
      owner_status: ownerStatus,
      sale_deal: null, // сохраняется отдельно через onLinkDeal
      created: earliest,
      updated: latest,
      last_recalculated_at: new Date().toISOString(),
    };
  }, [mergePriceHistory]);

  /** Пересчёт и сохранение объекта при изменении одного объявления */
  const recalculateAndSaveObject = useCallback(async (objectId: number) => {
    const objectAds = await db.ads.where('object_id').equals(objectId).toArray();
    if (objectAds.length === 0) return;

    const existing = await db.table<AdObject>('ad_objects').get(objectId);
    const updates = recalculateObjectFromAds(objectAds);
    await db.table('ad_objects').update(objectId, {
      ...updates,
      sale_deal: existing?.sale_deal ?? null,
      updated_at: new Date().toISOString(),
    });
  }, [recalculateObjectFromAds]);

  /** Объединить выбранные объявления/объекты в один объект */
  const handleMergeSelected = async () => {
    if (selectedIds.size === 0) return;

    const adIds: number[] = [];
    const objectIds: number[] = [];
    selectedIds.forEach(id => {
      const type = selectedTypes.get(id);
      if (type === 'object') objectIds.push(id);
      else adIds.push(id);
    });

    // Собираем все объявления
    const allMergeAds: Ad[] = [];

    // Обычные объявления
    for (const adId of adIds) {
      const ad = allAds.find(a => a.id === adId);
      if (ad) allMergeAds.push(ad);
    }

    // Объявления из выбранных объектов
    for (const objId of objectIds) {
      const objAds = await db.ads.where('object_id').equals(objId).toArray();
      allMergeAds.push(...objAds);
    }

    if (allMergeAds.length === 0) return;

    // Проверка address_id — предупреждение если разные
    const addressIds = [...new Set(allMergeAds.map(a => a.address_id).filter(Boolean))];
    if (addressIds.length > 1) {
      setToast({ message: 'Нельзя объединить: объявления привязаны к разным адресам', type: 'error' });
      return;
    }

    try {
      // Создаём новый объект
      const newObj = recalculateObjectFromAds(allMergeAds);
      const newObjectId = await db.table('ad_objects').add({
        ...newObj,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      // Привязываем все объявления к новому объекту
      const allAdIds = allMergeAds.map(a => a.id).filter((id): id is number => id != null);
      for (const adId of allAdIds) {
        const ad = allMergeAds.find(a => a.id === adId);
        const updates: Record<string, unknown> = { object_id: newObjectId as number };
        // Если дубли обработаны — переводим в processed
        if (ad && ad.processing_status === 'duplicate_check_needed') {
          updates.processing_status = 'processed';
        }
        await db.ads.update(adId, updates);
      }

      // Удаляем старые объекты
      if (objectIds.length > 0) {
        await db.table('ad_objects').bulkDelete(objectIds);
      }

      // Сброс выбора, обновление UI
      setSelectedIds(new Set());
      setSelectedTypes(new Map());
      await loadData();
      setToast({ message: `Объединено ${allMergeAds.length} объявлений в объект`, type: 'success' });
    } catch {
      setToast({ message: 'Ошибка при объединении', type: 'error' });
    }
  };

  /** Разбить выбранные объекты — отвязать все объявления и удалить объекты */
  const handleSplitSelected = async () => {
    const objectIds: number[] = [];
    selectedIds.forEach(id => {
      if (selectedTypes.get(id) === 'object') objectIds.push(id);
    });

    if (objectIds.length === 0) {
      setToast({ message: 'Выберите хотя бы один объект для разбиения', type: 'error' });
      return;
    }

    try {
      for (const objId of objectIds) {
        // Отвязываем все объявления
        const objAds = await db.ads.where('object_id').equals(objId).toArray();
        for (const ad of objAds) {
          if (ad.id != null) {
            await db.ads.update(ad.id, { object_id: null });
          }
        }
      }

      // Удаляем объекты
      await db.table('ad_objects').bulkDelete(objectIds);

      setSelectedIds(new Set());
      setSelectedTypes(new Map());
      await loadData();
      setToast({ message: `Разбито ${objectIds.length} объектов`, type: 'success' });
    } catch {
      setToast({ message: 'Ошибка при разбиении', type: 'error' });
    }
  };

  // ─── Привязка адресов ───
  const handleLinkAd = async (adId: number, addressId: number) => {
    await adsAddressService.linkAdToAddress(adId, addressId);
    await loadData();
    setAssignAd(null);
    setToast({ message: 'Адрес привязан', type: 'success' });
  };

  const handleUnlinkAd = async (adId: number) => {
    await adsAddressService.unlinkAdFromAddress(adId);
    await loadData();
    setAssignAd(null);
    setToast({ message: 'Привязка отменена', type: 'success' });
  };

  const handleConfirmAd = async (adId: number) => {
    await adsAddressService.confirmAdAddress(adId);
    await loadData();
    setAssignAd(null);
    setToast({ message: 'Адрес подтверждён', type: 'success' });
  };

  const handleOpenCreateAddress = (ad: Ad) => {
    setAssignAd(null);
    setCreateAddressForAd(ad);
    setAddressModalMode('create');
    setDetailAddress({
      id: undefined,
      server_id: null,
      house_id: null,
      address: ad.address || '',
      coordinates: { ...ad.coordinates },
      type: 'house',
      region: null,
      cadno: null,
      house_type: null,
      serie: null,
      house_series_id: null,
      house_class_id: null,
      ceiling_material_id: null,
      wall_material_id: null,
      house_problem_id: null,
      floors_count: null,
      build_year: null,
      entrances_count: null,
      living_spaces_count: null,
      area_total: null,
      area_live: null,
      ceiling_height: null,
      gas_supply: null,
      individual_heating: null,
      has_playground: false,
      has_sports_area: false,
      comment: '',
      source: 'user',
      synced_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  };

  const handleAddressSaved = async (savedAddr: AdAddress) => {
    // Если создавали новый адрес для объявления — привязываем его
    if (addressModalMode === 'create' && createAddressForAd && savedAddr.id) {
      await adsAddressService.linkAdToAddress(createAddressForAd.id!, savedAddr.id);
      setCreateAddressForAd(null);
      await loadData();
      setToast({ message: 'Новый адрес создан и привязан', type: 'success' });
    } else {
      // Обновление списка адресов
      setAddresses(prev => prev.map(a => a.id === savedAddr.id ? savedAddr : a));
    }
  };

  /** Собрать CIAN-объявления из текущего фильтра и запустить batch-обновление */
  const handleBatchUpdate = () => {
    const archiveCutoff = new Date(Date.now() - archiveDays * 24 * 60 * 60 * 1000);
    const isActualizable = (ad: Ad) =>
      ad.status === 'active' || (ad.updated && new Date(ad.updated) >= archiveCutoff);
    const cianAdsSet = new Set<number>();
    const cianAds: Ad[] = [];
    const filteredObjectIds = new Set(filteredObjects.map(o => o.id));
    const addIfCian = (ad: Ad) => {
      if (ad.url?.includes('cian.ru') && ad.id && !cianAdsSet.has(ad.id) && isActualizable(ad)) {
        cianAdsSet.add(ad.id);
        cianAds.push(ad);
      }
    };
    for (const ad of filteredAds) addIfCian(ad);
    for (const ad of allAds) {
      if (ad.object_id && filteredObjectIds.has(ad.object_id)) addIfCian(ad);
    }
    if (cianAds.length === 0) {
      setToast({ message: 'Нет CIAN объявлений для обновления', type: 'info' });
      return;
    }
    if (!startCianBatchUpdate(cianAds, archiveDays)) {
      setToast({ message: 'CIAN: актуализация уже запущена', type: 'info' });
    }
  };

  /** Собрать Avito-объявления из текущего фильтра и запустить batch-обновление */
  const handleAvitoBatchUpdate = () => {
    const archiveCutoff = new Date(Date.now() - archiveDays * 24 * 60 * 60 * 1000);
    const isActualizable = (ad: Ad) =>
      ad.status === 'active' || (ad.updated && new Date(ad.updated) >= archiveCutoff);
    const avitoAdsSet = new Set<number>();
    const avitoAds: Ad[] = [];
    const filteredObjectIds = new Set(filteredObjects.map(o => o.id));
    const addIfAvito = (ad: Ad) => {
      if (ad.url?.includes('avito.ru') && ad.id && !avitoAdsSet.has(ad.id) && isActualizable(ad)) {
        avitoAdsSet.add(ad.id);
        avitoAds.push(ad);
      }
    };
    for (const ad of filteredAds) addIfAvito(ad);
    for (const ad of allAds) {
      if (ad.object_id && filteredObjectIds.has(ad.object_id)) addIfAvito(ad);
    }
    if (avitoAds.length === 0) {
      setToast({ message: 'Нет Avito объявлений для обновления', type: 'info' });
      return;
    }
    if (!startAvitoBatchUpdate(avitoAds, archiveDays)) {
      setToast({ message: 'Avito: актуализация уже запущена', type: 'info' });
    }
  };

  const handleRunAll = async () => {
    // 1. Загрузка объявлений
    if (runImport) {
      handleImport();
      // Ждём завершения ads-import задачи
      await new Promise<void>(resolve => {
        const check = () => {
          const task = importTasksRef.current.find(t => t.type === 'ads-import' && t.status === 'running');
          if (!task) resolve();
          else setTimeout(check, 500);
        };
        setTimeout(check, 500);
      });
    }

    // 2. Определение адресов
    if (runAddress) {
      await handleMatchAddresses();
    }

    // 3. Обновление CIAN + Avito параллельно
    if (runUpdate) {
      handleBatchUpdate();
      handleAvitoBatchUpdate();
      await new Promise<void>(resolve => {
        const check = () => {
          const running = importTasksRef.current.some(t =>
            (t.type === 'cian-update' || t.type === 'avito-update') && t.status === 'running'
          );
          if (!running) resolve();
          else setTimeout(check, 500);
        };
        setTimeout(check, 500);
      });
    }
  };

  const toggleNumFilter = (arr: number[], item: number, setter: (v: number[]) => void) => {
    setter(arr.includes(item) ? arr.filter(x => x !== item) : [...arr, item]);
  };

  const handlePolygonsChange = useCallback((polygons: [number, number][][] | null) => {
    const incomingJson = polygons ? JSON.stringify(polygons) : 'null';
    const currentJson = polygonsCoordsJsonRef.current;
    const polygonChanged = incomingJson !== currentJson;

    // Обновляем полигон в state и localStorage
    setPolygonsCoords(polygons);
    polygonsCoordsJsonRef.current = incomingJson;
    if (polygons) localStorage.setItem('ret_ads_polygon_coords', JSON.stringify(polygons));
    else localStorage.removeItem('ret_ads_polygon_coords');

    // Сбросить исключённые адреса только если полигон реально изменился (пользователь нарисовал новый)
    if (polygonChanged) {
      setExcludedAddressIds(new Set());
      localStorage.removeItem('ret_ads_excluded_address_ids');
    }

    // Всегда пересчитываем адреса внутри полигона по текущей базе адресов
    if (polygons && polygons.length > 0 && addresses.length > 0) {
      const ids = new Set<number>();
      for (const addr of addresses) {
        const lat = addr.coordinates.lat;
        const lng = addr.coordinates.lng;
        if (lat != null && lng != null && polygons.some(poly => pointInPolygon(lat, lng, poly))) {
          if (addr.id != null) ids.add(addr.id);
        }
      }
      setFilterAddressIds(ids);
      localStorage.setItem('ret_ads_filter_address_ids', JSON.stringify([...ids]));
    } else if (!polygons) {
      // Полигон удалён — сбросить адреса
      setFilterAddressIds(new Set());
      localStorage.removeItem('ret_ads_filter_address_ids');
    }
    // Если полигон есть, но адреса ещё не загружены — не трогаем filterAddressIds
  }, [addresses]);

  const handleSelectAllInPolygon = useCallback(() => {
    setExcludedAddressIds(new Set());
    localStorage.removeItem('ret_ads_excluded_address_ids');
  }, []);

  const handleAddressToggle = useCallback((address: AdAddress) => {
    setExcludedAddressIds(prev => {
      const next = new Set(prev);
      if (address.id != null) {
        if (next.has(address.id)) next.delete(address.id);
        else next.add(address.id);
      }
      localStorage.setItem('ret_ads_excluded_address_ids', JSON.stringify([...next]));
      return next;
    });
  }, []);

  const handleFlyToRegion = (regionCode: string) => {
    const info = REGION_CENTERS[regionCode];
    if (!info) return;
    setFlyToTarget(null);
    requestAnimationFrame(() => {
      setFlyToTarget({ lat: info.lat, lon: info.lon, zoom: info.zoom });
    });
  };

  // ─── Форматтеры ───
  const toggleSort = (col: 'price' | 'created' | 'updated') => {
    if (sortColumn === col) {
      if (sortDir === 'desc') setSortDir('asc');
      else { setSortColumn(null); setSortDir('desc'); }
    } else {
      setSortColumn(col);
      setSortDir('desc');
    }
  };
  const sortIcon = (col: 'price' | 'created' | 'updated') => {
    if (sortColumn !== col) return ' ↕';
    return sortDir === 'desc' ? ' ↓' : ' ↑';
  };
  const fmtPrice = (price: number | null): string => {
    if (price == null) return '—';
    return price.toLocaleString('ru-RU');
  };
  const fmtDate = (date: string | null): string => {
    if (!date) return '—';
    try { return new Date(date).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' }); }
    catch { return date; }
  };

  // ─── Рендер строки ───
  const renderRow = (row: TableRow, idx: number) => {
    if (row.kind === 'object') {
      const o = row.data;
      const id = o.id!;
      const isSelected = selectedIds.has(id);
      const isExpanded = expandedObjects.has(id);
      const createdDays = daysAgo(o.created);
      const updatedDays = daysAgo(o.updated);
      const objAddress = o.address_id ? addresses.find(x => x.id === o.address_id)?.address : null;
      const exposureDays = o.created && o.updated
        ? Math.floor((new Date(o.updated).getTime() - new Date(o.created).getTime()) / 86400000)
        : createdDays;
      return (
        <tr key={`obj-${id}`} className={`cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors ${isSelected ? 'bg-orange-50 dark:bg-orange-900/10' : ''}`}
          onClick={() => openObjectDetail(o)}>
          <td className="px-2 py-1.5"><input type="checkbox" checked={isSelected} onChange={() => toggleSelect(id, 'object')} onClick={e => e.stopPropagation()} className="h-3 w-3 rounded border-zinc-300 text-blue-600" /></td>
          <td className="px-1 py-1.5"><button onClick={e => { e.stopPropagation(); quickFilter(row); }} className="text-zinc-400 hover:text-blue-600" title="Быстрый фильтр"><FunnelIcon className="size-3.5" /></button></td>
          <td className="px-2 py-1.5 text-xs">
            <div className="flex items-center gap-1 flex-nowrap">
              <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium shrink-0 ${o.status === 'active' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-700 dark:text-zinc-400'}`}>{o.status === 'active' ? 'Активен' : 'Архив'}</span>
              {o.sale_deal && <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 shrink-0">Продажа</span>}
              <button onClick={e => { e.stopPropagation(); toggleExpand(id); }} className="inline-flex items-center gap-0.5 text-[10px] text-zinc-600 dark:text-zinc-400 hover:text-blue-600 whitespace-nowrap">
                <svg className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
                {o.listings_count} ({o.active_listings_count} акт.)
              </button>
            </div>
          </td>
          <td className="px-2 py-1.5 text-[11px] text-zinc-600 dark:text-zinc-400 whitespace-nowrap">
            <div>{fmtDate(o.created)}</div>
            {exposureDays != null && <div className="text-[9px] text-zinc-400">эксп. {exposureDays} дн.</div>}
          </td>
          <td className="px-2 py-1.5 text-[11px] text-zinc-600 dark:text-zinc-400 whitespace-nowrap">
            <div>{fmtDate(o.updated)}</div>
            {updatedDays != null && <div className={`text-[9px] ${updatedDays > 7 ? 'text-red-500' : 'text-green-600'}`}>{updatedDays} дн. назад</div>}
          </td>
          <td className="px-2 py-1.5 text-[11px] text-zinc-700 dark:text-zinc-300 whitespace-nowrap">
            {o.property_type ? PROPERTY_TYPE_FULL[o.property_type] || o.property_type : '—'}
            {o.property_type && ' кв.'}
            {o.area_total != null ? `, ${o.area_total}${o.area_living ? '/' + o.area_living : ''}${o.area_kitchen ? '/' + o.area_kitchen : ''}м²` : ''}
            {o.floor != null ? `, ${o.floor}/${o.floors_total ?? '?'} эт.` : ''}
          </td>
          <td className="px-2 py-1.5 text-[11px] max-w-[320px]">
            <span className="text-blue-600 dark:text-blue-400 truncate block">{objAddress || 'Адрес не определен'}</span>
          </td>
          <td className="px-2 py-1.5 text-[11px] text-right whitespace-nowrap">
            <div className="text-green-600 dark:text-green-400 font-medium">{fmtPrice(o.current_price)}</div>
            {o.price_per_meter != null && <div className="text-zinc-500 dark:text-zinc-500">{o.price_per_meter.toLocaleString('ru-RU')} ₽/м²</div>}
          </td>
          <td className="px-2 py-1.5 text-[11px] text-zinc-600 dark:text-zinc-400">
            <span className={o.owner_status === 'есть от собственника' ? 'text-green-600' : o.owner_status === 'было от собственника' ? 'text-yellow-600' : 'text-zinc-400'}>{o.owner_status || '—'}</span>
          </td>
        </tr>
      );
    }

    const a = row.data;
    const id = a.id!;
    const isSelected = selectedIds.has(id);
    const isChild = row.kind === 'expanded_ad';
    const createdDays = daysAgo(a.created);
    const updatedDays = daysAgo(a.updated);
    const addrFromDb = a.address_id ? addresses.find(x => x.id === a.address_id)?.address : null;

    return (
      <tr key={`ad-${id}${isChild ? '-child' : ''}`}
        className={`${isChild ? 'bg-orange-50/40 dark:bg-orange-900/5' : ''} cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors ${isSelected ? 'bg-orange-50 dark:bg-orange-900/10' : ''}`}
        onClick={() => setDetailAd(a)}>
        {isChild && (
          <td className="px-2 py-1.5" colSpan={2}>
            <div className="border-l-2 border-orange-300 dark:border-orange-700 pl-3 ml-1">&nbsp;</div>
          </td>
        )}
        {!isChild && (
          <>
            <td className="px-2 py-1.5"><input type="checkbox" checked={isSelected} onChange={() => toggleSelect(id, 'ad')} onClick={e => e.stopPropagation()} className="h-3 w-3 rounded border-zinc-300 text-blue-600" /></td>
            <td className="px-1 py-1.5"><button onClick={e => { e.stopPropagation(); quickFilter(row); }} className="text-zinc-400 hover:text-blue-600" title="Быстрый фильтр"><FunnelIcon className="size-3.5" /></button></td>
          </>
        )}
        <td className="px-2 py-1.5 text-xs space-y-0.5">
          <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${a.status === 'active' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-700 dark:text-zinc-400'}`}>{a.status === 'active' ? 'Активен' : 'Архив'}</span>
          {(() => {
            // Вычисляемый статус обработки для бейджа
            const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
            let badgeStatus = a.processing_status;
            if (a.processing_status === 'processed') {
              if (!a.updated || new Date(a.updated) < oneDayAgo) {
                badgeStatus = 'needs_update';
              }
            }
            if (!badgeStatus || badgeStatus === 'processed') return null;
            return (
              <span className={`inline-flex items-center px-1 py-0.5 rounded text-[9px] font-medium ${
                badgeStatus === 'address_needed' ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' :
                badgeStatus === 'duplicate_check_needed' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' :
                'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
              }`}>{PROCESSING_STATUS_LABELS[badgeStatus]}</span>
            );
          })()}
        </td>
        <td className="px-2 py-1.5 text-[11px] text-zinc-600 dark:text-zinc-400 whitespace-nowrap">
          <div>{fmtDate(a.created)}</div>
          {createdDays != null && <div className="text-[9px] text-zinc-400">эксп. {createdDays} дн.</div>}
        </td>
        <td className="px-2 py-1.5 text-[11px] text-zinc-600 dark:text-zinc-400 whitespace-nowrap">
          <div>{fmtDate(a.updated)}</div>
          {updatedDays != null && <div className={`text-[9px] ${updatedDays > 7 ? 'text-red-500' : 'text-green-600'}`}>{updatedDays} дн. назад</div>}
        </td>
        <td className="px-2 py-1.5 text-[11px] text-zinc-700 dark:text-zinc-300 whitespace-nowrap">
          {a.property_type ? PROPERTY_TYPE_LABELS[a.property_type] || a.property_type : ''}{a.area_total != null ? `, ${a.area_total}${a.area_living ? '/' + a.area_living : ''}${a.area_kitchen ? '/' + a.area_kitchen : ''}м²` : ''}{a.floor != null ? `, ${a.floor}/${a.floors_total ?? '?'} эт.` : ''}
        </td>
        <td className="px-2 py-1.5 text-[11px] max-w-[320px]">
          {/* Исходный адрес объявления */}
          <div
            className={`truncate-left ${a.address ? 'text-blue-600 dark:text-blue-400' : 'text-red-600 dark:text-red-400'}`}
            title={a.address || 'Адрес не указан'}
          >{a.address || 'Адрес не указан'}</div>
          {/* Адрес из БД (результат матчинга) */}
          <div
            className={`truncate-left text-[10px] ${addrFromDb ? 'text-zinc-500 dark:text-zinc-400' : 'text-red-500 dark:text-red-400'}`}
            title={addrFromDb ? (a.address_match_confidence === 'low' || a.address_match_confidence === 'very_low' ? `${addrFromDb} (${CONFIDENCE_LABELS[a.address_match_confidence] || ''})` : addrFromDb) : 'Адрес не определен'}
          >
            {addrFromDb ? (
              <span>
                {addrFromDb}
                {a.address_match_confidence && (a.address_match_confidence === 'low' || a.address_match_confidence === 'very_low') && (
                  <span className="text-red-400"> ({CONFIDENCE_LABELS[a.address_match_confidence]})</span>
                )}
                {a.address_match_confidence === 'manual' && (
                  <span className="text-green-500"> (Подтвержден)</span>
                )}
              </span>
            ) : 'Адрес не определен'}
          </div>
        </td>
        <td className="px-2 py-1.5 text-[11px] text-right whitespace-nowrap">
          <div className="text-green-600 dark:text-green-400 font-medium">{fmtPrice(a.price)}</div>
          {a.price_per_meter != null && <div className="text-zinc-500 dark:text-zinc-500">{a.price_per_meter.toLocaleString('ru-RU')} ₽/м²</div>}
        </td>
        <td className="px-2 py-1.5 text-[11px] text-zinc-600 dark:text-zinc-400">
          {a.url && <a href={a.url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="text-blue-600 hover:underline text-[10px] block">{SOURCE_LABELS[normalizeSource(a.source)] || a.source_metadata?.original_source || a.source}</a>}
          <div className="text-[10px]">{SELLER_TYPE_LABELS[a.seller_info?.type || a.seller_type] || a.seller_type || ''}</div>
          {a.seller_info?.name && <div className="text-[10px] text-zinc-400 truncate max-w-[100px]">{a.seller_info.name}</div>}
        </td>
      </tr>
    );
  };

  // ─── JSX ───
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1400px] px-4 py-4 sm:px-6">

        {/* Toast уведомление */}
        {toast && (
          <div className={`fixed top-4 right-4 z-50 max-w-sm rounded-lg border px-4 py-3 shadow-lg transition-all ${
            toast.type === 'success' ? 'bg-green-50 border-green-200 dark:bg-green-950 dark:border-green-800' :
            toast.type === 'error' ? 'bg-red-50 border-red-200 dark:bg-red-950 dark:border-red-800' :
            'bg-blue-50 border-blue-200 dark:bg-blue-950 dark:border-blue-800'
          }`}>
            <div className="flex items-start gap-2">
              {toast.type === 'success' && (
                <svg className="h-4 w-4 mt-0.5 text-green-600 dark:text-green-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
              )}
              {toast.type === 'error' && (
                <svg className="h-4 w-4 mt-0.5 text-red-600 dark:text-red-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              )}
              <span className={`text-sm font-medium ${
                toast.type === 'success' ? 'text-green-800 dark:text-green-200' :
                toast.type === 'error' ? 'text-red-800 dark:text-red-200' :
                'text-blue-800 dark:text-blue-200'
              }`}>{toast.message}</span>
              <button onClick={() => setToast(null)} className="ml-2 shrink-0 opacity-50 hover:opacity-100">
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
          </div>
        )}

        {/* Header */}
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-semibold text-zinc-900 dark:text-white">
              Поиск объявлений
            </h1>
          </div>
          {activeFilterName && (
            <span className="flex items-center gap-1 rounded-lg bg-blue-50 px-2.5 py-1 text-[11px] font-medium text-blue-600 dark:bg-blue-900/20 dark:text-blue-400">
              <svg className="size-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" /></svg>
              <span className="truncate max-w-[200px]">{activeFilterName}</span>
              {filterChanged ? (
                <>
                  <button onClick={handleSaveToActiveFilter} className="ml-1 inline-flex items-center gap-0.5 rounded bg-blue-600 px-1.5 py-0.5 text-[10px] text-white hover:bg-blue-700 border-none cursor-pointer">
                    <ArrowPathIcon className="size-2.5" />Сохранить
                  </button>
                  <button onClick={handleCancelFilterChanges} className="inline-flex items-center gap-0.5 rounded bg-zinc-200 px-1.5 py-0.5 text-[10px] text-zinc-600 hover:bg-zinc-300 border-none cursor-pointer dark:bg-zinc-700 dark:text-zinc-300">
                    <XMarkIcon className="size-2.5" />Отменить
                  </button>
                </>
              ) : null}
              <button onClick={() => { setActiveFilterId(null); setActiveFilterName(null); setActiveFilterStateJson(null); }} className="text-blue-400 hover:text-blue-600 ml-0.5">&times;</button>
            </span>
          )}
          <div className="flex items-center gap-2">
            {/* Сохранённые фильтры */}
            <Button color={showSavedPanel ? 'dark' : 'white'} onClick={() => setShowSavedPanel(true)}>
              <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" /></svg>
              Сохранённые
            </Button>
            <Button onClick={handleOpenImport} color={showImportPanel ? 'dark' : 'white'}><ArrowDownTrayIcon className="size-4" />Обработка объявлений</Button>
            <Button onClick={() => setShowReports(!showReports)} color={showReports ? 'dark' : 'white'}><ChartBarIcon className="size-4" />Отчёты</Button>
            <Button onClick={() => { setShowFilters(!showFilters); if (!showFilters) ensureListingData(); }} color={showFilters ? 'dark' : 'white'}><FunnelIcon className="size-4" />Фильтр</Button>
          </div>
        </div>

        {/* Import panel */}
        {showImportPanel && (
          <div className="rounded-xl bg-white p-5 shadow-sm dark:bg-zinc-900 mb-4 space-y-5 border border-blue-200 dark:border-blue-800">
            {/* Раздел 1: Загрузка объявлений */}
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-zinc-700 dark:text-zinc-300 flex items-center gap-2"><ArrowDownTrayIcon className="size-4" /> Обработка объявлений</h3>
              {!polygonsCoords && <p className="text-xs text-amber-600 dark:text-amber-400">Нарисуйте полигон на карте в фильтрах.</p>}
              <div>
                <label className="block text-[11px] font-medium text-zinc-500 dark:text-zinc-400 mb-1 uppercase">Источник</label>
                <div className="flex flex-wrap gap-1.5">
                  {enabledSources.map(({ id, key }) => (
                    <button key={key} onClick={() => toggleNumFilter(importSourceIds, id, setImportSourceIds)} className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${importSourceIds.includes(id) ? 'bg-blue-600 text-white' : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700'}`}>{SOURCE_LABELS[key] || key}</button>
                  ))}
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-[11px] font-medium text-zinc-500 dark:text-zinc-400 uppercase">Категория</label>
                  <span className="text-[10px] text-zinc-400">{importCategoryIds.length} из {categories.length}</span>
                </div>
                {categories.length === 0 ? (
                  <span className="text-xs text-zinc-400">Загрузка категорий...</span>
                ) : (
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    {(() => {
                      const sectionMap = new Map<number, ListingCategoryRaw[]>();
                      for (const c of categories) {
                        if (!sectionMap.has(c.sectionId)) sectionMap.set(c.sectionId, []);
                        sectionMap.get(c.sectionId)!.push(c);
                      }
                      return Array.from(sectionMap.entries()).map(([sectionId, cats]) => {
                        const allSelected = cats.every(c => importCategoryIds.includes(c.id));
                        return (
                          <div key={sectionId}>
                            <button
                              onClick={() => {
                                const catIds = cats.map(c => c.id);
                                if (allSelected) {
                                  setImportCategoryIds(prev => prev.filter(id => !catIds.includes(id)));
                                } else {
                                  setImportCategoryIds(prev => [...new Set([...prev, ...catIds])]);
                                }
                              }}
                              className="flex items-center gap-1.5 text-[10px] font-medium text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 mb-1"
                            >
                              <span className={`inline-flex h-3 w-3 items-center justify-center rounded border text-[8px] ${allSelected ? 'bg-blue-600 border-blue-600 text-white' : 'border-zinc-300 dark:border-zinc-600'}`}>
                                {allSelected && '✓'}
                              </span>
                              {SECTION_LABELS[sectionId] || `Раздел ${sectionId}`}
                            </button>
                            <div className="flex flex-wrap gap-1 pl-4">
                              {cats.map(c => (
                                <button key={c.id} onClick={() => toggleNumFilter(importCategoryIds, c.id, setImportCategoryIds)} className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${importCategoryIds.includes(c.id) ? 'bg-blue-600 text-white' : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700'}`}>{c.title}</button>
                              ))}
                            </div>
                          </div>
                        );
                      });
                    })()}
                  </div>
                )}
              </div>
              <div>
                <label className="block text-[11px] font-medium text-zinc-500 dark:text-zinc-400 mb-1 uppercase">Продавец</label>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries({ owner: 'Собственник', agent: 'Агент', developer: 'Застройщик' }).map(([key, label]) => {
                    const apiId = SELLER_TYPE_API_MAP[key];
                    return <button key={key} onClick={() => toggleNumFilter(importSellerTypeIds, apiId, setImportSellerTypeIds)} className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${importSellerTypeIds.includes(apiId) ? 'bg-blue-600 text-white' : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700'}`}>{label}</button>;
                  })}
                </div>
                {importSellerTypeIds.length === 0 && <span className="text-[10px] text-zinc-400">Все типы (если не выбрано)</span>}
              </div>
              <div>
                <label className="block text-[11px] font-medium text-zinc-500 dark:text-zinc-400 mb-1 uppercase">Тип недвижимости</label>
                <div className="flex flex-wrap gap-1.5">
                  <button onClick={() => setImportIsNew(0)} className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${importIsNew === 0 ? 'bg-blue-600 text-white' : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700'}`}>Вторичка</button>
                  <button onClick={() => setImportIsNew(1)} className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${importIsNew === 1 ? 'bg-blue-600 text-white' : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700'}`}>Новостройка</button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-[11px] font-medium text-zinc-500 dark:text-zinc-400 mb-1">Дата от</label><input type="date" value={importDateFrom} onChange={e => setImportDateFrom(e.target.value)} className="w-full rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-700 px-2 py-1.5 text-sm text-zinc-900 dark:text-white" /></div>
                <div><label className="block text-[11px] font-medium text-zinc-500 dark:text-zinc-400 mb-1">Дата до</label><input type="date" value={importDateTo} onChange={e => setImportDateTo(e.target.value)} className="w-full rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-700 px-2 py-1.5 text-sm text-zinc-900 dark:text-white" /></div>
              </div>
              <button onClick={handleImport} disabled={adsImportRunning || !polygonsCoords} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2">
                {adsImportRunning && <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" /></svg>}
                {adsImportRunning ? 'Загрузка...' : 'Загрузить'}
              </button>
              {(() => {
                const t = importTasks.find(t => t.type === 'ads-import');
                if (!t) return null;
                return (
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      {t.status === 'running' && (
                        <span className="text-xs text-blue-600 dark:text-blue-400">{t.detail}</span>
                      )}
                      {t.status === 'done' && (
                        <span className="text-xs text-green-600 dark:text-green-400 font-medium">{t.detail}</span>
                      )}
                      {t.status === 'error' && (
                        <span className="text-xs text-red-600 dark:text-red-400 font-medium">{t.detail}</span>
                      )}
                    </div>
                    {t.status === 'running' && (
                      <div className="h-1.5 w-full max-w-xs rounded-full bg-zinc-200 dark:bg-zinc-700 overflow-hidden">
                        <div className="h-full rounded-full bg-blue-600 transition-all duration-300" style={{ width: `${t.progress}%` }} />
                      </div>
                    )}
                  </div>
                );
              })()}
              {importError && <p className="text-sm text-red-600 dark:text-red-400">{importError}</p>}
            </div>

            <hr className="border-zinc-200 dark:border-zinc-700" />

            {/* Раздел 2: Определение адресов */}
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-zinc-700 dark:text-zinc-300 flex items-center gap-2"><MapPinIcon className="size-4" /> Определение адресов</h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">Автоматическое определение адресов для объявлений без привязки к адресной базе.</p>
              <p className="text-xs text-zinc-400">Без адреса: {allAds.filter(a => !a.address_id).length} / Низкая точность: {allAds.filter(a => a.address_id && (a.address_match_confidence === 'low' || a.address_match_confidence === 'very_low')).length}</p>
              <button onClick={handleMatchAddresses} disabled={matchRunning} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2">
                {matchRunning && <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" /></svg>}
                {matchRunning ? 'Определение...' : 'Определить адреса'}
              </button>
              {matchProgress && matchProgress.total > 0 && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
                    <span>Обработано: {matchProgress.done} / {matchProgress.total}</span>
                    <span>{Math.round((matchProgress.done / matchProgress.total) * 100)}%</span>
                  </div>
                  <div className="h-1.5 w-full max-w-xs rounded-full bg-zinc-200 dark:bg-zinc-700 overflow-hidden">
                    <div className="h-full rounded-full bg-blue-600 transition-all duration-300" style={{ width: `${(matchProgress.done / matchProgress.total) * 100}%` }} />
                  </div>
                </div>
              )}
            </div>

            <hr className="border-zinc-200 dark:border-zinc-700" />

            {/* Раздел 3: Обновление объявлений */}
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-zinc-700 dark:text-zinc-300 flex items-center gap-2"><ArrowPathIcon className="size-4" /> Обновление объявлений</h3>

              {/* CIAN прогресс */}
              {cianTask && (() => {
                const eta = cianTask.startTime && cianTask.current && cianTask.total && cianTask.current > 0
                  ? (() => { const rem = ((Date.now() - cianTask.startTime) / cianTask.current) * (cianTask.total - cianTask.current); const s = Math.ceil(rem / 1000); return s < 60 ? `≈ ${s} сек` : `≈ ${Math.floor(s / 60)} мин ${s % 60 > 0 ? `${s % 60} сек` : ''}`; })()
                  : null;
                return (
                  <div className="space-y-1 p-2.5 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-medium text-blue-700 dark:text-blue-300">
                        CIAN: {cianTask.phase === 'check' ? 'Проверка...' : cianTask.phase === 'parse' ? 'Парсинг...' : 'Завершено'}
                      </span>
                      <span className="text-[11px] text-blue-600 dark:text-blue-400 tabular-nums">
                        {cianTask.current}/{cianTask.total} {eta && `(${eta})`}
                      </span>
                    </div>
                    <div className="w-full bg-blue-200 dark:bg-blue-900 rounded-full h-1.5">
                      <div className="bg-blue-600 h-1.5 rounded-full transition-all duration-300" style={{ width: `${cianTask.progress}%` }} />
                    </div>
                    {cianTask.detail && <p className="text-[10px] text-blue-600 dark:text-blue-400">{cianTask.detail}</p>}
                  </div>
                );
              })()}

              {/* Avito прогресс */}
              {avitoTask && (() => {
                const eta = avitoTask.startTime && avitoTask.current && avitoTask.total && avitoTask.current > 0
                  ? (() => { const rem = ((Date.now() - avitoTask.startTime) / avitoTask.current) * (avitoTask.total - avitoTask.current); const s = Math.ceil(rem / 1000); return s < 60 ? `≈ ${s} сек` : `≈ ${Math.floor(s / 60)} мин ${s % 60 > 0 ? `${s % 60} сек` : ''}`; })()
                  : null;
                return (
                  <div className="space-y-1 p-2.5 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-medium text-green-700 dark:text-green-300">
                        Avito: {avitoTask.phase === 'check' ? 'Проверка...' : avitoTask.phase === 'parse' ? 'Парсинг...' : 'Завершено'}
                      </span>
                      <span className="text-[11px] text-green-600 dark:text-green-400 tabular-nums">
                        {avitoTask.current}/{avitoTask.total} {eta && `(${eta})`}
                      </span>
                    </div>
                    <div className="w-full bg-green-200 dark:bg-green-900 rounded-full h-1.5">
                      <div className="bg-green-600 h-1.5 rounded-full transition-all duration-300" style={{ width: `${avitoTask.progress}%` }} />
                    </div>
                    {avitoTask.detail && <p className="text-[10px] text-green-600 dark:text-green-400">{avitoTask.detail}</p>}
                  </div>
                );
              })()}

              {/* Кнопки и настройки — всегда видны */}
              {!cianTask?.status?.startsWith('running') && !avitoTask?.status?.startsWith('running') && (
                <>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    В фильтре: {(() => {
                      const filteredObjectIds = new Set(filteredObjects.map(o => o.id));
                      const cianFiltered = allAds.filter(a =>
                        a.url?.includes('cian.ru') && (
                          filteredAds.some(fa => fa.id === a.id) ||
                          (a.object_id && filteredObjectIds.has(a.object_id))
                        )
                      );
                      const active = cianFiltered.filter(a => a.status === 'active').length;
                      const archived = cianFiltered.length - active;
                      return `${cianFiltered.length} CIAN (активных: ${active}, архив: ${archived})`;
                    })()}
                  </p>
                  <p className="text-xs text-zinc-400">Быстрая проверка цены и статуса, полный парсинг только для изменившихся.</p>
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-zinc-500 dark:text-zinc-400 whitespace-nowrap">Архивные не старше</label>
                    <input
                      type="number"
                      min={1}
                      max={90}
                      value={archiveDays}
                      onChange={e => setArchiveDays(Math.max(1, Number(e.target.value) || 7))}
                      className="w-14 rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-700 px-1.5 py-1 text-xs text-zinc-900 dark:text-white text-center"
                    />
                    <span className="text-xs text-zinc-500 dark:text-zinc-400">дней</span>
                  </div>
                </>
              )}
              <div className="flex gap-2">
                <button
                  onClick={() => { handleBatchUpdate(); handleAvitoBatchUpdate(); }}
                  disabled={(!!cianTask && cianTask.status === 'running') || (!!avitoTask && avitoTask.status === 'running')}
                  className="rounded-md bg-violet-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
                >
                  <ArrowPathIcon className="size-3.5" />
                  Актуализировать всё
                </button>
                <button
                  onClick={handleBatchUpdate}
                  disabled={!!cianTask && cianTask.status === 'running'}
                  className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
                >
                  <ArrowPathIcon className="size-3.5" />
                  CIAN
                </button>
                <button
                  onClick={handleAvitoBatchUpdate}
                  disabled={!!avitoTask && avitoTask.status === 'running'}
                  className="rounded-md bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
                >
                  <ArrowPathIcon className="size-3.5" />
                  Avito
                </button>
              </div>
            </div>

            <hr className="border-zinc-200 dark:border-zinc-700" />

            {/* Раздел 4: Удаление объявлений */}
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-zinc-700 dark:text-zinc-300 flex items-center gap-2"><TrashIcon className="size-4" /> Удаление объявлений</h3>
              <p className="text-xs text-zinc-400">Всего: {allAds.length}, с координатами: {adsWithCoordsCount}</p>
              {!polygonsCoords && <p className="text-xs text-amber-600 dark:text-amber-400">Нарисуйте полигон на карте для удаления объявлений в области.</p>}
              {polygonsCoords && (
                <>
                  <p className="text-xs text-zinc-400">Объявлений в полигоне: {adsInPolygonCount}</p>
                  {!deleteConfirm ? (
                    <button onClick={() => setDeleteConfirm(true)} disabled={adsInPolygonCount === 0} className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2">
                      <TrashIcon className="size-4" /> Удалить в полигоне
                    </button>
                  ) : (
                    <div className="flex items-center gap-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-3">
                      <p className="text-xs text-red-700 dark:text-red-300 font-medium">Удалить {adsInPolygonCount} объявлений в полигоне?</p>
                      <button onClick={handleDeleteInPolygon} disabled={deleteRunning} className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50 flex items-center gap-1.5">
                        {deleteRunning && <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" /></svg>}
                        Да, удалить
                      </button>
                      <button onClick={() => setDeleteConfirm(false)} className="rounded-md bg-zinc-200 dark:bg-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-300 dark:hover:bg-zinc-600">
                        Отмена
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>

            <hr className="border-zinc-200 dark:border-zinc-700" />

            {/* Чекбоксы последовательного запуска */}
            <div className="space-y-2">
              <h3 className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase">Последовательный запуск</h3>
              <div className="flex flex-wrap items-center gap-4">
                <label className="flex items-center gap-1.5 text-xs text-zinc-700 dark:text-zinc-300"><input type="checkbox" checked={runImport} onChange={e => setRunImport(e.target.checked)} className="rounded border-zinc-300 text-blue-600 h-3 w-3" />Загрузить объявления</label>
                <label className="flex items-center gap-1.5 text-xs text-zinc-700 dark:text-zinc-300"><input type="checkbox" checked={runAddress} onChange={e => setRunAddress(e.target.checked)} className="rounded border-zinc-300 text-blue-600 h-3 w-3" />Определить адреса</label>
                <label className="flex items-center gap-1.5 text-xs text-zinc-700 dark:text-zinc-300"><input type="checkbox" checked={runUpdate} onChange={e => setRunUpdate(e.target.checked)} className="rounded border-zinc-300 text-blue-600 h-3 w-3" />Обновить объявления</label>
                <button onClick={handleRunAll} disabled={!runImport && !runAddress && !runUpdate} className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed">Запустить выбранные</button>
              </div>
            </div>
          </div>
        )}

        {/* Reports panel — между заголовком и тегами фильтров */}
        {showReports && (
          <AdsReportsPanel
            objects={filteredObjects}
            addresses={addresses.map(a => ({ id: a.id!, address: a.address }))}
            onObjectClick={openObjectDetail}
          />
        )}

        {/* Compact filter summary — всегда видима */}
        {activeFilterTags.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 mb-4">
            <span className="text-[10px] text-zinc-500">Фильтры:</span>
            {activeFilterTags.map(t => (
              <span key={t.key} className="inline-flex items-center gap-1 rounded-full bg-blue-100 dark:bg-blue-900/30 px-2 py-0.5 text-[10px] font-medium text-blue-700 dark:text-blue-300">
                {t.label}
                <button onClick={() => removeFilterTag(t.key)} className="text-blue-500 hover:text-blue-700"><XMarkIcon className="size-3" /></button>
              </span>
            ))}
          </div>
        )}

        {/* Фильтр — между тегами и картой */}
        {showFilters && (
          <div className="rounded-xl bg-white dark:bg-zinc-900 p-5 shadow-sm border border-blue-200 dark:border-blue-800 mb-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Фильтр</h4>
              <button onClick={clearAllFilters} className="inline-flex items-center gap-1 px-2 py-1 text-[11px] text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"><XMarkIcon className="size-3" />Очистить все</button>
            </div>

            {/* Источник */}
            <div className="mb-3">
              <label className="block text-[11px] font-medium text-zinc-500 dark:text-zinc-400 mb-1 uppercase">Источник</label>
              <div className="flex flex-wrap gap-1.5">
                {enabledSources.map(({ key }) => (
                  <button key={key} onClick={() => setFilterSources(prev => prev.includes(key) ? prev.filter(s => s !== key) : [...prev, key])}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${filterSources.includes(key) ? 'bg-blue-600 text-white' : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700'}`}>{SOURCE_LABELS[key] || key}</button>
                ))}
              </div>
            </div>

            {/* Категория */}
            <div className="mb-3">
              <div className="flex items-center justify-between mb-1">
                <label className="block text-[11px] font-medium text-zinc-500 dark:text-zinc-400 uppercase">Категория</label>
                <span className="text-[10px] text-zinc-400">{filterCategoryIds.length} из {categories.length}</span>
              </div>
              {categories.length === 0 ? (
                <span className="text-xs text-zinc-400">Загрузка категорий...</span>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {(() => {
                    const sectionMap = new Map<number, ListingCategoryRaw[]>();
                    for (const c of categories) {
                      if (!sectionMap.has(c.sectionId)) sectionMap.set(c.sectionId, []);
                      sectionMap.get(c.sectionId)!.push(c);
                    }
                    return Array.from(sectionMap.entries()).map(([sectionId, cats]) => {
                      const allSelected = cats.every(c => filterCategoryIds.includes(c.id));
                      return (
                        <div key={sectionId}>
                          <button
                            onClick={() => {
                              const catIds = cats.map(c => c.id);
                              if (allSelected) {
                                setFilterCategoryIds(prev => prev.filter(id => !catIds.includes(id)));
                              } else {
                                setFilterCategoryIds(prev => [...new Set([...prev, ...catIds])]);
                              }
                            }}
                            className="flex items-center gap-1.5 text-[10px] font-medium text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 mb-1"
                          >
                            <span className={`inline-flex h-3 w-3 items-center justify-center rounded border text-[8px] ${allSelected ? 'bg-blue-600 border-blue-600 text-white' : 'border-zinc-300 dark:border-zinc-600'}`}>
                              {allSelected && '✓'}
                            </span>
                            {SECTION_LABELS[sectionId] || `Раздел ${sectionId}`}
                          </button>
                          <div className="flex flex-wrap gap-1 pl-4">
                            {cats.map(c => (
                              <button key={c.id} onClick={() => setFilterCategoryIds(prev => prev.includes(c.id) ? prev.filter(id => id !== c.id) : [...prev, c.id])}
                                className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${filterCategoryIds.includes(c.id) ? 'bg-blue-600 text-white' : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700'}`}>{c.title}</button>
                            ))}
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>
              )}
            </div>

            {/* Диапазоны: цена, площадь, этаж, год */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
              <div>
                <label className="block text-[11px] font-medium text-zinc-500 dark:text-zinc-400 mb-1">Цена от</label>
                <input type="number" placeholder="0" value={filterPriceMin} onChange={e => setFilterPriceMin(e.target.value)} className="w-full rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-700 px-2 py-1.5 text-sm text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-zinc-500 dark:text-zinc-400 mb-1">Цена до</label>
                <input type="number" placeholder="∞" value={filterPriceMax} onChange={e => setFilterPriceMax(e.target.value)} className="w-full rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-700 px-2 py-1.5 text-sm text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-zinc-500 dark:text-zinc-400 mb-1">Площадь от (м²)</label>
                <input type="number" placeholder="0" value={filterAreaMin} onChange={e => setFilterAreaMin(e.target.value)} className="w-full rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-700 px-2 py-1.5 text-sm text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-zinc-500 dark:text-zinc-400 mb-1">Площадь до (м²)</label>
                <input type="number" placeholder="∞" value={filterAreaMax} onChange={e => setFilterAreaMax(e.target.value)} className="w-full rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-700 px-2 py-1.5 text-sm text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-zinc-500 dark:text-zinc-400 mb-1">Этаж от</label>
                <input type="number" min={1} max={100} placeholder="1" value={filterFloorMin} onChange={e => setFilterFloorMin(e.target.value)} className="w-full rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-700 px-2 py-1.5 text-sm text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-zinc-500 dark:text-zinc-400 mb-1">Этаж до</label>
                <input type="number" min={1} max={100} placeholder="∞" value={filterFloorMax} onChange={e => setFilterFloorMax(e.target.value)} className="w-full rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-700 px-2 py-1.5 text-sm text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-zinc-500 dark:text-zinc-400 mb-1">Год постройки от</label>
                <input type="number" min={1900} max={2030} placeholder="1900" value={filterYearMin} onChange={e => setFilterYearMin(e.target.value)} className="w-full rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-700 px-2 py-1.5 text-sm text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-zinc-500 dark:text-zinc-400 mb-1">Год постройки до</label>
                <input type="number" min={1900} max={2030} placeholder="2030" value={filterYearMax} onChange={e => setFilterYearMax(e.target.value)} className="w-full rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-700 px-2 py-1.5 text-sm text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>

            {/* Параметры дома */}
            {availableHouseSeries.length > 0 && (
              <div className="mb-3">
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-[11px] font-medium text-zinc-500 dark:text-zinc-400 uppercase">Серия дома</label>
                  <span className="text-[10px] text-zinc-400">{filterHouseSeriesIds.length} из {availableHouseSeries.length}{filterAddressIds.size > 0 ? ' (в полигоне)' : ''}</span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {availableHouseSeries.map(s => (
                    <button key={s.server_id} onClick={() => setFilterHouseSeriesIds(prev => prev.includes(s.server_id!) ? prev.filter(x => x !== s.server_id) : [...prev, s.server_id!])}
                      className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${filterHouseSeriesIds.includes(s.server_id!) ? 'bg-blue-600 text-white' : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700'}`}>{s.name}</button>
                  ))}
                </div>
              </div>
            )}
            {availableWallMaterials.length > 0 && (
              <div className="mb-3">
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-[11px] font-medium text-zinc-500 dark:text-zinc-400 uppercase">Материал стен</label>
                  <span className="text-[10px] text-zinc-400">{filterWallMaterialIds.length} из {availableWallMaterials.length}{filterAddressIds.size > 0 ? ' (в полигоне)' : ''}</span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {availableWallMaterials.map(s => (
                    <button key={s.server_id} onClick={() => setFilterWallMaterialIds(prev => prev.includes(s.server_id!) ? prev.filter(x => x !== s.server_id) : [...prev, s.server_id!])}
                      className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${filterWallMaterialIds.includes(s.server_id!) ? 'bg-blue-600 text-white' : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700'}`}>{s.name}</button>
                  ))}
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="block text-[11px] font-medium text-zinc-500 dark:text-zinc-400 mb-1">Этажность дома от</label>
                <input type="number" min={1} max={100} placeholder="1" value={filterFloorsMin} onChange={e => setFilterFloorsMin(e.target.value)} className="w-full rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-700 px-2 py-1.5 text-sm text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-zinc-500 dark:text-zinc-400 mb-1">Этажность дома до</label>
                <input type="number" min={1} max={100} placeholder="∞" value={filterFloorsMax} onChange={e => setFilterFloorsMax(e.target.value)} className="w-full rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-700 px-2 py-1.5 text-sm text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>

            {/* Продавец */}
            <div className="mb-3">
              <label className="block text-[11px] font-medium text-zinc-500 dark:text-zinc-400 mb-1 uppercase">Продавец</label>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(SELLER_TYPE_LABELS).map(([key, label]) => (
                  <button key={key} onClick={() => setFilterSellerTypes(prev => prev.includes(key) ? prev.filter(s => s !== key) : [...prev, key])}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${filterSellerTypes.includes(key) ? 'bg-blue-600 text-white' : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700'}`}>{label}</button>
                ))}
              </div>
            </div>

            {/* Статус + Даты */}
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="block text-[11px] font-medium text-zinc-500 dark:text-zinc-400 mb-1">Статус</label>
                <div className="flex gap-1">
                  <button onClick={() => setFilterStatus('')} className={`px-2 py-1 rounded text-[10px] font-medium transition-colors ${!filterStatus ? 'bg-blue-600 text-white' : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300'}`}>Все</button>
                  <button onClick={() => setFilterStatus('active')} className={`px-2 py-1 rounded text-[10px] font-medium transition-colors ${filterStatus === 'active' ? 'bg-green-600 text-white' : 'bg-zinc-100 text-green-700 hover:bg-green-100 dark:bg-zinc-800 dark:text-green-400'}`}>Активные</button>
                  <button onClick={() => setFilterStatus('archived')} className={`px-2 py-1 rounded text-[10px] font-medium transition-colors ${filterStatus === 'archived' ? 'bg-zinc-600 text-white' : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300'}`}>Архивные</button>
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-medium text-zinc-500 dark:text-zinc-400 mb-1">Дата создания от</label>
                <input type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)} className="rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-700 px-2 py-1.5 text-sm text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-zinc-500 dark:text-zinc-400 mb-1">Дата создания до</label>
                <input type="date" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)} className="rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-700 px-2 py-1.5 text-sm text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
          </div>
        )}

        {/* Карта — всегда видима, сворачиваемая */}
        <div className="overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-700 mb-4">
          <button className="flex w-full items-center gap-2 bg-zinc-50 px-3.5 py-2.5 text-sm font-medium text-zinc-950 transition-colors hover:bg-zinc-100 dark:bg-zinc-800 dark:text-white dark:hover:bg-zinc-700" onClick={() => setShowMapFilter(!showMapFilter)}>
            <MapPinIcon className="size-4" />
            <span>Поиск по карте</span>
            {polygonsCoords && <Badge color="blue" className="ml-2">{polygonsCoords.length} полигон(ов)</Badge>}
            <ChevronDownIcon className={`ml-auto size-4 transition-transform ${showMapFilter ? 'rotate-180' : ''}`} />
          </button>
          {showMapFilter && subscriptionRegionCodes.length > 0 && (() => {
            const regionList = subscriptionRegionCodes
              .map(code => ({ code, ...REGION_CENTERS[code] }))
              .filter(r => r.name);
            if (regionList.length === 0) return null;
            return (
              <div className="flex flex-wrap gap-1.5 border-b border-zinc-200 dark:border-zinc-700 px-3.5 py-2 bg-zinc-50 dark:bg-zinc-800">
                <span className="flex items-center text-xs text-zinc-400 dark:text-zinc-500">Перейти:</span>
                {regionList.map(region => (
                  <button
                    key={region.code}
                    onClick={() => handleFlyToRegion(region.code)}
                    className="cursor-pointer rounded-md bg-zinc-100 px-2 py-1 text-xs font-medium text-zinc-700 transition-colors hover:bg-blue-100 hover:text-blue-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-blue-900/30 dark:hover:text-blue-400"
                  >
                    {region.name}
                  </button>
                ))}
              </div>
            );
          })()}
          {showMapFilter && (
            <SearchByPolygon quarters={[]} quarterStats={{}} onQuartersSelected={(_c, p) => handlePolygonsChange(p ?? null)} initialPolygons={polygonsCoords} flyTo={flyToTarget} addresses={addresses} addressStats={addressStatsMap} referenceData={{ wallMaterials: refWallMaterials, houseSeries: refHouseSeries, houseClasses: refHouseClasses, ceilingMaterials: refCeilingMaterials }} onAddressClick={(addr) => { setAddressModalMode('edit'); setDetailAddress(addr); }} selectedAddressIds={filterAddressIds} highlightedAddressIds={highlightedAddressIds} excludedAddressIds={excludedAddressIds} onAddressToggle={handleAddressToggle} onSelectAllInPolygon={handleSelectAllInPolygon} polygonsCoords={polygonsCoords} />
          )}
        </div>

        {/* Фильтр обработки — над таблицей */}
        {showProcessingFilter && (
          <div className="rounded-xl bg-zinc-50 dark:bg-zinc-800/50 p-4 border border-zinc-200 dark:border-zinc-700 mb-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-xs font-medium text-zinc-600 dark:text-zinc-400 uppercase">Фильтр обработки</h4>
              <button onClick={() => { setFilterProcessingStatus(''); setFilterAddressId(''); setFilterContactType(''); setFilterProcessingCategoryId(''); setFilterProcessingFloor(''); }} className="text-[10px] text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300">Очистить</button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <div>
                <label className="block text-[10px] font-medium text-zinc-500 dark:text-zinc-400 mb-1">Статус обработки</label>
                <select value={filterProcessingStatus} onChange={e => setFilterProcessingStatus(e.target.value)} className="w-full rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-700 px-2 py-1.5 text-xs text-zinc-900 dark:text-white">
                  <option value="">Все статусы</option>
                  <option value="address_needed">Определить адрес</option>
                  <option value="duplicate_check_needed">Обработать на дубли</option>
                  <option value="needs_update">Актуализировать</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-medium text-zinc-500 dark:text-zinc-400 mb-1">Адрес</label>
                <select value={filterAddressId} onChange={e => setFilterAddressId(Number(e.target.value) || '')} className="w-full rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-700 px-2 py-1.5 text-xs text-zinc-900 dark:text-white">
                  <option value="">Все адреса</option>
                  {addresses.map(a => <option key={a.id} value={a.id}>{a.address}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-medium text-zinc-500 dark:text-zinc-400 mb-1">Категория</label>
                <select value={filterProcessingCategoryId} onChange={e => setFilterProcessingCategoryId(Number(e.target.value) || '')} className="w-full rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-700 px-2 py-1.5 text-xs text-zinc-900 dark:text-white">
                  <option value="">Все категории</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-medium text-zinc-500 dark:text-zinc-400 mb-1">Этаж</label>
                <input type="number" min={1} max={100} placeholder="Этаж" value={filterProcessingFloor} onChange={e => setFilterProcessingFloor(e.target.value)} className="w-full rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-700 px-2 py-1.5 text-xs text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-[10px] font-medium text-zinc-500 dark:text-zinc-400 mb-1">Контакт</label>
                <select value={filterContactType} onChange={e => setFilterContactType(e.target.value)} className="w-full rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-700 px-2 py-1.5 text-xs text-zinc-900 dark:text-white">
                  <option value="">Все контакты</option>
                  {Object.entries(SELLER_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
            </div>
          </div>
        )}

        {/* Action buttons + table */}
        <div className="rounded-xl bg-white shadow-sm dark:bg-zinc-900 overflow-hidden">
          {/* Toolbar */}
          <div className="flex items-center gap-2 border-b border-zinc-200 dark:border-zinc-700 px-4 py-2">
            <input type="checkbox" checked={pagedRows.length > 0 && selectedIds.size > 0} onChange={toggleSelectAll} className="h-3 w-3 rounded border-zinc-300 text-blue-600" title="Выбрать все на странице" />
            <button disabled={selectedIds.size === 0} onClick={handleMergeSelected} className="px-2 py-1 rounded text-[11px] font-medium bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 hover:bg-orange-200 disabled:opacity-30 disabled:cursor-not-allowed">Объединить</button>
            <button disabled={selectedIds.size === 0 || ![...selectedTypes.values()].some(t => t === 'object')} onClick={handleSplitSelected} className="px-2 py-1 rounded text-[11px] font-medium bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400 hover:bg-sky-200 disabled:opacity-30 disabled:cursor-not-allowed">Разбить</button>
            {!deleteSelectedConfirm ? (
              <button disabled={selectedIds.size === 0} onClick={() => setDeleteSelectedConfirm(true)} className="px-2 py-1 rounded text-[11px] font-medium bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400 hover:bg-red-100 disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1"><TrashIcon className="size-3" />Удалить</button>
            ) : (
              <div className="flex items-center gap-1">
                <span className="text-[10px] text-red-600 dark:text-red-400">Удалить {selectedIds.size}?</span>
                <button onClick={handleDeleteSelected} disabled={deleteRunning} className="px-2 py-1 rounded text-[10px] font-medium bg-red-600 text-white hover:bg-red-700 disabled:opacity-50">Да</button>
                <button onClick={() => setDeleteSelectedConfirm(false)} className="px-2 py-1 rounded text-[10px] font-medium bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-700 dark:text-zinc-300">Нет</button>
              </div>
            )}
            {selectedIds.size > 0 && <span className="text-[10px] text-blue-600 dark:text-blue-400 ml-2">{selectedIds.size} выбрано</span>}
            <div className="flex-1" />
            <label className="flex items-center gap-1 text-[11px] text-zinc-500 dark:text-zinc-400 cursor-pointer">
              <input type="checkbox" checked={showProcessingFilter} onChange={e => setShowProcessingFilter(e.target.checked)} className="h-3 w-3 rounded border-zinc-300 text-blue-600" />
              Фильтр обработки
            </label>
            <span className="text-xs text-zinc-500 dark:text-zinc-400">{loading ? 'Загрузка...' : `Всего: ${tableRows.length}`}</span>
          </div>

          {/* Pagination top */}
          {totalPages > 1 && (
            <PaginationBar
              page={page} totalPages={totalPages} pageSize={pageSize}
              totalItems={tableRows.length}
              onPageChange={setPage}
              onPageSizeChange={s => { setPageSize(s); setPage(1); }}
            />
          )}

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 dark:bg-zinc-800 border-b border-zinc-200 dark:border-zinc-700">
                <tr className="text-left text-[10px] font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                  <th className="px-2 py-2 w-6"></th>
                  <th className="px-1 py-2 w-6"></th>
                  <th className="px-2 py-2 w-32">Статус</th>
                  <th className="px-2 py-2 w-24 cursor-pointer select-none whitespace-nowrap hover:text-zinc-700 dark:hover:text-zinc-200" onClick={() => toggleSort('created')}>Создано{sortIcon('created')}</th>
                  <th className="px-2 py-2 w-24 cursor-pointer select-none whitespace-nowrap hover:text-zinc-700 dark:hover:text-zinc-200" onClick={() => toggleSort('updated')}>Обновлено{sortIcon('updated')}</th>
                  <th className="px-2 py-2">Характеристики</th>
                  <th className="px-2 py-2">Адрес</th>
                  <th className="px-2 py-2 w-28 text-right cursor-pointer select-none hover:text-zinc-700 dark:hover:text-zinc-200" onClick={() => toggleSort('price')}>Цена{sortIcon('price')}</th>
                  <th className="px-2 py-2 w-28">Контакт</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {!loading && tableRows.length === 0 ? (
                  <tr><td colSpan={9} className="px-4 py-12 text-center text-zinc-400 text-sm">Нет данных. Откройте «Обработка объявлений» для импорта.</td></tr>
                ) : pagedRows.map((row, idx) => renderRow(row, idx))}
              </tbody>
            </table>
          </div>

          {/* Pagination bottom */}
          {totalPages > 1 && (
            <PaginationBar
              page={page} totalPages={totalPages} pageSize={pageSize}
              totalItems={tableRows.length} position="bottom"
              onPageChange={setPage}
              onPageSizeChange={s => { setPageSize(s); setPage(1); }}
            />
          )}
        </div>
      </div>

      {/* Detail Ad Modal */}
      {detailAd && (
        <AdDetailModal
          ad={detailAd}
          addresses={addresses}
          referenceData={{
            wallMaterials: refWallMaterials,
            houseSeries: refHouseSeries,
            houseClasses: refHouseClasses,
            ceilingMaterials: refCeilingMaterials,
            houseProblems: refHouseProblems,
          }}
          onClose={() => setDetailAd(null)}
          onSave={async (updated) => {
            // Сохраняем в БД
            if (updated.id) {
              await adsRepository.update(updated.id, updated);
            }
            setAllAds(prev => prev.map(a => a.id === updated.id ? updated : a));
            // Если объявление привязано к объекту — пересчитать объект
            if (updated.object_id) {
              await recalculateAndSaveObject(updated.object_id);
              await loadData();
            }
          }}
          onDelete={async (deleted) => {
            if (deleted.id) {
              await db.table('ads').delete(deleted.id);
            }
            setAllAds(prev => prev.filter(a => a.id !== deleted.id));
            setDetailAd(null);
          }}
          onAddressChange={async () => {
            await loadData();
            // Обновляем detailAd свежими данными
            const fresh = await db.table<Ad>('ads').get(detailAd.id!);
            if (fresh) setDetailAd(fresh);
          }}
          onOpenCreateAddress={handleOpenCreateAddress}
          onOpenEditAddress={(addr) => { setAddressModalMode('edit'); setDetailAddress(addr); }}
        />
      )}

      {/* Detail Object Modal */}
      {detailObject && (
        <AdObjectDetailModal
          obj={detailObject}
          listings={objectAds.get(detailObject.id!) || []}
          addresses={addresses}
          dealsModuleActive={dealsModuleActive}
          onClose={() => setDetailObject(null)}
          onAdClick={(ad) => { setDetailObject(null); setDetailAd(ad); }}
          onLinkDeal={async (objectId, saleDeal) => {
            await db.table('ad_objects').update(objectId, { sale_deal: saleDeal });
            setDetailObject(prev => prev ? { ...prev, sale_deal: saleDeal } : prev);
            await loadData();
          }}
          onUnlinkDeal={async (objectId) => {
            await db.table('ad_objects').update(objectId, { sale_deal: null });
            setDetailObject(prev => prev ? { ...prev, sale_deal: null } : prev);
            await loadData();
          }}
        />
      )}

      {/* Address Assign Modal — привязка/смена адреса */}
      {assignAd && (
        <AdAddressAssignModal
          ad={assignAd}
          addresses={addresses}
          referenceData={{
            wallMaterials: refWallMaterials,
            houseSeries: refHouseSeries,
            houseClasses: refHouseClasses,
            ceilingMaterials: refCeilingMaterials,
            houseProblems: refHouseProblems,
          }}
          onClose={() => setAssignAd(null)}
          onLink={handleLinkAd}
          onUnlink={handleUnlinkAd}
          onConfirm={handleConfirmAd}
          onOpenCreate={handleOpenCreateAddress}
          onOpenEdit={(addr) => { setAssignAd(null); setAddressModalMode('edit'); setDetailAddress(addr); }}
        />
      )}

      {/* Address Modal — редактирование / создание адреса */}
      {detailAddress && (
        <AdAddressModal
          address={detailAddress}
          mode={addressModalMode}
          referenceData={{
            wallMaterials: refWallMaterials,
            houseSeries: refHouseSeries,
            houseClasses: refHouseClasses,
            ceilingMaterials: refCeilingMaterials,
            houseProblems: refHouseProblems,
          }}
          onClose={() => { setDetailAddress(null); setCreateAddressForAd(null); }}
          onSave={handleAddressSaved}
        />
      )}

      {/* Saved Filters Panel */}
      <AdsSavedFiltersPanel
        open={showSavedPanel}
        onClose={() => setShowSavedPanel(false)}
        currentState={getFilterState()}
        onApply={handleApplySavedFilter}
        activeFilterId={activeFilterId}
      />
    </div>
  );
};

export default AdsPage;
