/**
 * Страница «Поиск объявлений»
 * Единая таблица с объявлениями и объектами (по аналогии с neocenka-extension)
 */

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { adsRepository } from '@/db/repositories/ads.repository';
import { db } from '@/db/database';
import type { Ad, AdObject, AdAddress, AdStats, ReferenceItem } from '@/types';
import { REGION_CENTERS } from '@/constants/regions';
import {
  getInparsToken,
  loadInparsToken,
  loadCategories,
  checkSubscription,
  INPARS_SOURCE_IDS,
  type InparsCategoryRaw,
} from '@/services/inpars-service';
import { useImportTasks } from '@/contexts/ImportTaskContext';
import SearchByPolygon from '@/components/SearchByPolygon/SearchByPolygon';
import { Button } from '@/components/catalyst/button';
import { Badge } from '@/components/catalyst/badge';
import AdDetailModal from './AdDetailModal';
import AdObjectDetailModal from './AdObjectDetailModal';
import AdAddressModal from './AdAddressModal';
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
const SOURCE_COLORS: Record<string, string> = {
  avito: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  cian: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  domclick: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  yandex: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  youla: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  unknown: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-300',
};
const SECTION_LABELS: Record<number, string> = {
  1: 'Жилая (Продажа)', 4: 'Коммерческая (Продажа)', 5: 'Загородная (Продажа)', 6: 'Жилая (Аренда)', 7: 'Коммерческая (Аренда)', 8: 'Загородная (Аренда)', 9: 'Гараж (Продажа)', 10: 'Гараж (Аренда)', 11: 'Готовый бизнес (Продажа)',
};
const SELLER_TYPE_LABELS: Record<string, string> = { owner: 'Собственник', agent: 'Агент', developer: 'Застройщик' };
/** sellerType для API Inpars: 1=собственник, 2=агент, 3=застройщик */
const SELLER_TYPE_API_MAP: Record<string, number> = { owner: 1, agent: 2, developer: 3 };
const PROCESSING_STATUS_LABELS: Record<string, string> = {
  address_needed: 'Определить адрес', duplicate_check_needed: 'Обработать на дубли', needs_update: 'Актуализировать', processed: 'Обработано',
};
const CONFIDENCE_LABELS: Record<string, string> = {
  high: '(Подтвержден)', medium: '(Средняя)', low: '(Низкая)', very_low: '(Очень низкая)', manual: '(Ручной)',
};
const PAGE_SIZE = 25;

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

const AdsPage: React.FC<AdsPageProps> = () => {
  const { startAdsImport, tasks: importTasks } = useImportTasks();
  const adsImportRunning = importTasks.some(t => t.type === 'ads-import' && t.status === 'running');
  // ─── Данные ───
  const [allAds, setAllAds] = useState<Ad[]>([]);
  const [allObjects, setAllObjects] = useState<AdObject[]>([]);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<AdStats | null>(null);
  const [totalAds, setTotalAds] = useState(0);
  const [page, setPage] = useState(1);

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
  const [showProcessingFilter, setShowProcessingFilter] = useState(true);
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
  const [excludedAddressIds, setExcludedAddressIds] = useState<Set<number>>(() => {
    try {
      const saved = localStorage.getItem('ret_ads_excluded_address_ids');
      if (!saved) return new Set();
      const arr = JSON.parse(saved);
      return new Set(Array.isArray(arr) ? arr : []);
    } catch { return new Set(); }
  });

  // ─── Сохранённые фильтры ───
  const [savedFilters, setSavedFilters] = useState<{ id: string; name: string; state: string }[]>([]);
  const [showSavedDropdown, setShowSavedDropdown] = useState(false);
  const [saveFilterName, setSaveFilterName] = useState('');
  const [showSaveInput, setShowSaveInput] = useState(false);
  const [activeFilterId, setActiveFilterId] = useState<string | null>(null);
  const [activeFilterName, setActiveFilterName] = useState<string | null>(null);

  // ─── Загрузка из Inpars ───
  const [showImportPanel, setShowImportPanel] = useState(false);
  const categoriesLoadedRef = useRef(false);
  const [categories, setCategories] = useState<InparsCategoryRaw[]>([]);
  const [importSourceIds, setImportSourceIds] = useState<number[]>([]);
  const [importCategoryIds, setImportCategoryIds] = useState<number[]>([]);
  const [importSellerTypeIds, setImportSellerTypeIds] = useState<number[]>([]);
  const [enabledSources, setEnabledSources] = useState<{ id: number; key: string }[]>([]);
  const [importDateFrom, setImportDateFrom] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 367); return toDateString(d); });
  const [importDateTo, setImportDateTo] = useState(() => { const d = new Date(); d.setDate(d.getDate() + 1); return toDateString(d); });
  const [importError, setImportError] = useState('');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  // ─── Чекбоксы задач ───
  const [runImport, setRunImport] = useState(false);
  const [runAddress, setRunAddress] = useState(false);
  const [runUpdate, setRunUpdate] = useState(false);

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
  const [addressModalMode, setAddressModalMode] = useState<'edit' | 'create'>('edit');

  // ─── Карта ───
  const [showMapFilter, setShowMapFilter] = useState(false);
  const [flyToTarget, setFlyToTarget] = useState<{ lat: number; lon: number; zoom: number } | null>(null);
  const [subscriptionRegionCode, setSubscriptionRegionCode] = useState<string | null>(null);
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

  // ─── Загрузка данных ───
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [ads, objects] = await Promise.all([
        adsRepository.search({}, 1, 100000),
        db.table<AdObject>('ad_objects').toArray(),
      ]);
      setAllAds(ads.ads);
      setAllObjects(objects);
      setTotalAds(ads.total);
    } finally { setLoading(false); }
  }, []);

  const loadStats = useCallback(async () => {
    const [s, count] = await Promise.all([adsRepository.getStats(), adsRepository.count()]);
    setStats(s); setTotalAds(count);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => { loadStats(); }, [loadStats]);
  useEffect(() => { ensureInparsData(); }, []);

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

  // Загрузка сохранённых фильтров из localStorage + регион подписки
  useEffect(() => {
    (async () => {
      try {
        const raw = localStorage.getItem('ret_ads_saved_filters');
        if (raw) setSavedFilters(JSON.parse(raw));
      } catch {}
      // Восстановление последнего состояния фильтров
      try {
        const lastFilter = localStorage.getItem('ret_ads_last_filter');
        if (lastFilter) applyFilterState(JSON.parse(lastFilter));
      } catch {}
      // Подгрузить Inpars токен из chrome.storage и определить регион
      const token = await loadInparsToken();
      if (token) {
        try {
          // Получаем regionId из подписки
          const sub = await checkSubscription();
          if (sub.subscribed && sub.regionId) {
            const regionKey = String(sub.regionId);
            const info = REGION_CENTERS[regionKey];
            if (info) {
              setSubscriptionRegionCode(regionKey);
              // Центрируем по региону только если нет сохранённого полигона
              // (если полигон есть, SearchByPolygon сам сделает fitBounds)
              if (!polygonsCoords) {
                setFlyToTarget({ lat: info.lat, lon: info.lon, zoom: info.zoom });
              }
            }
          }
        } catch {}
      }
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
      localStorage.setItem('ret_ads_last_filter', JSON.stringify(getFilterState()));
    } catch {}
  }, [getFilterState]);

  const handleSaveFilter = () => {
    if (!saveFilterName.trim()) return;
    const id = activeFilterId || crypto.randomUUID();
    const state = JSON.stringify(getFilterState());
    const updated = activeFilterId
      ? savedFilters.map(f => f.id === id ? { ...f, name: saveFilterName, state } : f)
      : [...savedFilters, { id, name: saveFilterName, state }];
    setSavedFilters(updated);
    localStorage.setItem('ret_ads_saved_filters', JSON.stringify(updated));
    setActiveFilterId(id);
    setActiveFilterName(saveFilterName);
    setSaveFilterName('');
    setShowSaveInput(false);
  };

  const handleLoadFilter = (f: { id: string; name: string; state: string }) => {
    try {
      applyFilterState(JSON.parse(f.state));
      setActiveFilterId(f.id);
      setActiveFilterName(f.name);
      setShowSavedDropdown(false);
    } catch {}
  };

  const handleDeleteFilter = (id: string) => {
    const updated = savedFilters.filter(f => f.id !== id);
    setSavedFilters(updated);
    localStorage.setItem('ret_ads_saved_filters', JSON.stringify(updated));
    if (activeFilterId === id) { setActiveFilterId(null); setActiveFilterName(null); }
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
    if (filterSources.length > 0) result = result.filter(a => filterSources.includes(a.source));
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
    filterAddressIds, excludedAddressIds, addresses, filterHouseSeriesIds, filterWallMaterialIds, filterFloorsMin, filterFloorsMax]);

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
    // Сначала объекты
    for (const obj of filteredObjects) {
      rows.push({ kind: 'object', data: obj });
      if (expandedObjects.has(obj.id!)) {
        const objAds = objectAds.get(obj.id!) || [];
        for (const ad of objAds) {
          rows.push({ kind: 'expanded_ad', data: ad, parentObjectId: obj.id! });
        }
      }
    }
    // Потом объявления без объекта
    const objectAdIds = new Set(allAds.filter(a => a.object_id).map(a => a.id));
    for (const ad of filteredAds) {
      if (!objectAdIds.has(ad.id)) {
        rows.push({ kind: 'ad', data: ad });
      }
    }
    return rows;
  }, [filteredObjects, filteredAds, expandedObjects, objectAds, allAds]);

  const totalPages = Math.ceil(tableRows.length / PAGE_SIZE);
  const pagedRows = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return tableRows.slice(start, start + PAGE_SIZE);
  }, [tableRows, page]);

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
        const ads = allAds.filter(a => a.object_id === objectId);
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

    if (row.kind === 'object') {
      const o = row.data;
      if (o.address_id) setFilterAddressId(o.address_id);
      if (o.floor != null) setFilterProcessingFloor(String(o.floor));
    } else {
      const a = row.data;
      if (a.address_id) setFilterAddressId(a.address_id);
      if (a.category_id) setFilterProcessingCategoryId(a.category_id);
      if (a.floor != null) setFilterProcessingFloor(String(a.floor));
      // Статус обработки и контакт НЕ заполняются — как в neocenka-extension
    }
  };

  // ─── Загрузка данных Inpars (категории + источники из настроек) ───
  const ensureInparsData = async () => {
    if (categoriesLoadedRef.current) return;
    try {
      // Загрузить настройки пользователя из chrome.storage
      let selectedCatIds: number[] = [];
      let selectedSrcIds: number[] = [];
      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        const stored = await new Promise<Record<string, number[]>>((resolve) => {
          chrome.storage.local.get(
            ['inpars_selected_categories', 'inpars_selected_sources'],
            (r) => resolve(r as Record<string, number[]>)
          );
        });
        selectedCatIds = stored.inpars_selected_categories || [];
        selectedSrcIds = stored.inpars_selected_sources || [];
      }

      // Загрузить и отфильтровать категории — только выбранные пользователем
      const saved = await db.table('inpars_categories').toArray();
      let allCats: InparsCategoryRaw[];
      if (saved.length > 0) {
        allCats = saved.map((c: any) => ({ id: c.inpars_id, title: c.name, typeId: c.type_id ?? 0, sectionId: c.section_id ?? 0 }));
      } else if (getInparsToken()) {
        allCats = await loadCategories();
      } else {
        allCats = [];
      }
      const filteredCats = selectedCatIds.length > 0
        ? allCats.filter(c => selectedCatIds.includes(c.id))
        : allCats;
      setCategories(filteredCats);
      categoriesLoadedRef.current = true;

      // В панели загрузки — все показанные категории выбраны по умолчанию
      setImportCategoryIds(filteredCats.map(c => c.id));

      // Источники — только выбранные пользователем
      const allSourceEntries = Object.entries(INPARS_SOURCE_IDS) as [string, number][];
      if (selectedSrcIds.length > 0) {
        const enabled = allSourceEntries.filter(([, id]) => selectedSrcIds.includes(id)).map(([key, id]) => ({ id, key }));
        setEnabledSources(enabled);
        setImportSourceIds(enabled.map(s => s.id));
      } else {
        setEnabledSources(allSourceEntries.map(([key, id]) => ({ id, key })));
      }
    } catch {}
  };

  // ─── Загрузка из Inpars ───
  const handleOpenImport = async () => {
    setShowImportPanel(!showImportPanel);
    if (!showImportPanel) {
      await ensureInparsData();
    }
  };

  const handleImport = () => {
    if (!getInparsToken()) { setImportError('Сначала сохраните API ключ в Настройках'); return; }
    if (!polygonsCoords || polygonsCoords.length === 0) { setImportError('Нарисуйте полигон на карте'); return; }
    setImportError('');
    startAdsImport({
      polygons: polygonsCoords,
      sourceIds: importSourceIds.length > 0 ? importSourceIds : undefined,
      categoryIds: importCategoryIds.length > 0 ? importCategoryIds : undefined,
      sellerTypes: importSellerTypeIds.length > 0 ? importSellerTypeIds : undefined,
      dateFrom: importDateFrom || undefined,
      dateTo: importDateTo || undefined,
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

  const handleRunAll = () => {
    if (runImport) handleImport();
    if (runAddress) handleMatchAddresses();
    if (runUpdate) { alert('Обновление объявлений — в разработке'); }
  };

  const toggleNumFilter = (arr: number[], item: number, setter: (v: number[]) => void) => {
    setter(arr.includes(item) ? arr.filter(x => x !== item) : [...arr, item]);
  };

  const handlePolygonsChange = useCallback((polygons: [number, number][][] | null) => {
    setPolygonsCoords(polygons);
    if (polygons) localStorage.setItem('ret_ads_polygon_coords', JSON.stringify(polygons));
    else localStorage.removeItem('ret_ads_polygon_coords');

    // При смене полигона — сбросить исключённые адреса
    setExcludedAddressIds(new Set());
    localStorage.removeItem('ret_ads_excluded_address_ids');

    // Автовыбор адресов внутри полигона
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
    } else {
      setFilterAddressIds(new Set());
      localStorage.removeItem('ret_ads_filter_address_ids');
    }
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
      return (
        <tr key={`obj-${id}`} className={`cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors ${isSelected ? 'bg-orange-50 dark:bg-orange-900/10' : ''}`}
          onClick={() => setDetailObject(o)}>
          <td className="px-2 py-1.5"><input type="checkbox" checked={isSelected} onChange={() => toggleSelect(id, 'object')} onClick={e => e.stopPropagation()} className="h-3 w-3 rounded border-zinc-300 text-blue-600" /></td>
          <td className="px-1 py-1.5"><button onClick={e => { e.stopPropagation(); quickFilter(row); }} className="text-zinc-400 hover:text-blue-600" title="Быстрый фильтр"><FunnelIcon className="size-3.5" /></button></td>
          <td className="px-2 py-1.5 text-xs">
            <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${o.status === 'active' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-700 dark:text-zinc-400'}`}>{o.status === 'active' ? 'Активен' : 'Архив'}</span>
            <button onClick={e => { e.stopPropagation(); toggleExpand(id); }} className="ml-1 inline-flex items-center gap-0.5 text-[10px] text-zinc-600 dark:text-zinc-400 hover:text-blue-600">
              <svg className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
              Объявления: {o.listings_count} ({o.active_listings_count} акт.)
            </button>
          </td>
          <td className="px-2 py-1.5 text-[11px] text-zinc-600 dark:text-zinc-400 whitespace-nowrap">{fmtDate(o.created)}</td>
          <td className="px-2 py-1.5 text-[11px] text-zinc-600 dark:text-zinc-400 whitespace-nowrap">{fmtDate(o.updated)}</td>
          <td className="px-2 py-1.5 text-[11px] text-zinc-700 dark:text-zinc-300">
            {o.property_type ? PROPERTY_TYPE_LABELS[o.property_type] || o.property_type : '—'}
            {o.area_total != null ? `, ${o.area_total}м²` : ''}
          </td>
          <td className="px-2 py-1.5 text-[11px] max-w-[200px]">
            <span className="cursor-pointer text-blue-600 dark:text-blue-400 hover:underline truncate block" onClick={e => { e.stopPropagation(); if (o.address_id) { const a = addresses.find(x => x.id === o.address_id); if (a) setDetailAddress(a); } else setDetailObject(o); }}>{o.address_id ? 'Адрес #' + o.address_id : 'Адрес не определен'}</span>
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
        className={`${isChild ? 'bg-zinc-50/50 dark:bg-zinc-800/30' : ''} cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors ${isSelected ? 'bg-orange-50 dark:bg-orange-900/10' : ''}`}
        style={isChild ? { paddingLeft: '2rem' } : undefined}
        onClick={() => setDetailAd(a)}>
        <td className="px-2 py-1.5"><input type="checkbox" checked={isSelected} onChange={() => toggleSelect(id, 'ad')} onClick={e => e.stopPropagation()} className="h-3 w-3 rounded border-zinc-300 text-blue-600" /></td>
        <td className="px-1 py-1.5"><button onClick={e => { e.stopPropagation(); quickFilter(row); }} className="text-zinc-400 hover:text-blue-600" title="Быстрый фильтр"><FunnelIcon className="size-3.5" /></button></td>
        <td className="px-2 py-1.5 text-xs space-y-0.5">
          <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${a.status === 'active' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-700 dark:text-zinc-400'}`}>{a.status === 'active' ? 'Активен' : 'Архив'}</span>
          {a.processing_status && a.processing_status !== 'processed' && (
            <span className={`inline-flex items-center px-1 py-0.5 rounded text-[9px] font-medium ${
              a.processing_status === 'address_needed' ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' :
              a.processing_status === 'duplicate_check_needed' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' :
              'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
            }`}>{PROCESSING_STATUS_LABELS[a.processing_status]}</span>
          )}
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
            className={`truncate-left cursor-pointer ${a.address ? 'text-blue-600 hover:text-blue-800 dark:text-blue-400' : 'text-red-600 hover:text-red-800 dark:text-red-400'}`}
            title={a.address || 'Адрес не указан'}
            onClick={e => { e.stopPropagation(); setDetailAd(a); }}
          >{a.address || 'Адрес не указан'}</div>
          {/* Адрес из БД (результат матчинга) */}
          <div
            className={`truncate-left text-[10px] ${addrFromDb ? 'text-zinc-500 dark:text-zinc-400' : 'text-red-500 dark:text-red-400'}`}
            title={addrFromDb ? (a.address_match_confidence === 'low' || a.address_match_confidence === 'very_low' ? `${addrFromDb} (${CONFIDENCE_LABELS[a.address_match_confidence] || ''})` : addrFromDb) : 'Адрес не определен'}
          >
            {addrFromDb ? (
              <span className="cursor-pointer hover:text-blue-500" onClick={e => { e.stopPropagation(); const addrObj = a.address_id ? addresses.find(x => x.id === a.address_id) : null; if (addrObj) setDetailAddress(addrObj); }}>
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
          {a.url && <a href={a.url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="text-blue-600 hover:underline text-[10px] block">{a.source_metadata?.original_source || SOURCE_LABELS[a.source] || a.source}</a>}
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
              <button onClick={() => { setActiveFilterId(null); setActiveFilterName(null); }} className="text-blue-400 hover:text-blue-600 ml-0.5">&times;</button>
            </span>
          )}
          <div className="flex items-center gap-2">
            {/* Сохранённые фильтры */}
            <div className="relative">
              <Button color={showSavedDropdown ? 'dark' : 'white'} onClick={() => { setShowSavedDropdown(!showSavedDropdown); setShowSaveInput(false); }}>
                <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" /></svg>
                Сохранённые
              </Button>
              {showSavedDropdown && (
                <div className="absolute right-0 top-full mt-1 w-64 rounded-lg bg-white dark:bg-zinc-800 shadow-lg border border-zinc-200 dark:border-zinc-700 z-50 max-h-80 overflow-y-auto">
                  <div className="p-2 border-b border-zinc-100 dark:border-zinc-700">
                    {showSaveInput ? (
                      <div className="flex gap-1">
                        <input type="text" value={saveFilterName} onChange={e => setSaveFilterName(e.target.value)} placeholder="Название фильтра" onKeyDown={e => { if (e.key === 'Enter') handleSaveFilter(); }}
                          className="flex-1 rounded border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-700 px-2 py-1 text-xs text-zinc-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500" autoFocus />
                        <button onClick={handleSaveFilter} className="rounded bg-blue-600 px-2 py-1 text-xs text-white hover:bg-blue-700">OK</button>
                      </div>
                    ) : (
                      <button onClick={() => { setSaveFilterName(activeFilterName || ''); setShowSaveInput(true); }} className="w-full rounded bg-blue-600 px-2 py-1 text-xs text-white hover:bg-blue-700">
                        {activeFilterId ? 'Обновить фильтр' : 'Сохранить текущий'}
                      </button>
                    )}
                  </div>
                  {savedFilters.length === 0 ? (
                    <div className="p-3 text-xs text-zinc-400 text-center">Нет сохранённых фильтров</div>
                  ) : (
                    <div className="py-1">
                      {savedFilters.map(f => (
                        <div key={f.id} className={`flex items-center gap-2 px-2 py-1.5 hover:bg-zinc-50 dark:hover:bg-zinc-700/50 ${activeFilterId === f.id ? 'bg-blue-50 dark:bg-blue-900/20' : ''}`}>
                          <button onClick={() => handleLoadFilter(f)} className="flex-1 text-left text-xs text-zinc-700 dark:text-zinc-300 truncate">{f.name}</button>
                          <button onClick={() => handleDeleteFilter(f.id)} className="text-zinc-400 hover:text-red-500 shrink-0">
                            <svg className="size-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
            <Button onClick={handleOpenImport} color={showImportPanel ? 'dark' : 'white'}><ArrowDownTrayIcon className="size-4" />Загрузка</Button>
            <Button onClick={() => { setShowFilters(!showFilters); if (!showFilters) ensureInparsData(); }} color={showFilters ? 'dark' : 'white'}><FunnelIcon className="size-4" />Фильтры</Button>
          </div>
        </div>

        {/* Import panel */}
        {showImportPanel && (
          <div className="rounded-xl bg-white p-5 shadow-sm dark:bg-zinc-900 mb-4 space-y-5 border border-blue-200 dark:border-blue-800">
            {/* Раздел 1: Загрузка объявлений */}
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-zinc-700 dark:text-zinc-300 flex items-center gap-2"><ArrowDownTrayIcon className="size-4" /> Загрузка объявлений</h3>
              {!getInparsToken() && <p className="text-xs text-amber-600 dark:text-amber-400">API ключ не задан. Укажите его в Настройках.</p>}
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
                      const sectionMap = new Map<number, InparsCategoryRaw[]>();
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
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-[11px] font-medium text-zinc-500 dark:text-zinc-400 mb-1">Дата от</label><input type="date" value={importDateFrom} onChange={e => setImportDateFrom(e.target.value)} className="w-full rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-700 px-2 py-1.5 text-sm text-zinc-900 dark:text-white" /></div>
                <div><label className="block text-[11px] font-medium text-zinc-500 dark:text-zinc-400 mb-1">Дата до</label><input type="date" value={importDateTo} onChange={e => setImportDateTo(e.target.value)} className="w-full rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-700 px-2 py-1.5 text-sm text-zinc-900 dark:text-white" /></div>
              </div>
              <button onClick={handleImport} disabled={adsImportRunning || !polygonsCoords || !getInparsToken()} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2">
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

            {/* Раздел 3: Обновление объявлений (ЗАГЛУШКА) */}
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-zinc-700 dark:text-zinc-300 flex items-center gap-2"><ArrowPathIcon className="size-4" /> Обновление объявлений</h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">Обновление данных по существующим объявлениям. <span className="text-amber-600">В разработке</span></p>
              <p className="text-xs text-zinc-400">Активных объявлений: {allAds.filter(a => a.status === 'active').length}</p>
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

        {/* Filters */}
        {showFilters && (
          <div className="space-y-3 mb-4">
            {/* Основной фильтр (сегментный) — синяя панель */}
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

              {/* Категория (тип недвижимости) */}
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
                      const sectionMap = new Map<number, InparsCategoryRaw[]>();
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

              {/* Параметры дома (через адрес) */}
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

            {/* Карта */}
            <div className="overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-700">
              <button className="flex w-full items-center gap-2 bg-zinc-50 px-3.5 py-2.5 text-sm font-medium text-zinc-950 transition-colors hover:bg-zinc-100 dark:bg-zinc-800 dark:text-white dark:hover:bg-zinc-700" onClick={() => setShowMapFilter(!showMapFilter)}>
                <span>Поиск по карте</span>
                {polygonsCoords && <Badge color="blue" className="ml-2">{polygonsCoords.length} полигон(ов)</Badge>}
                <ChevronDownIcon className={`ml-auto size-4 transition-transform ${showMapFilter ? 'rotate-180' : ''}`} />
              </button>
              {showMapFilter && subscriptionRegionCode && (() => {
                const info = REGION_CENTERS[subscriptionRegionCode];
                if (!info) return null;
                return (
                  <div className="flex flex-wrap gap-1.5 border-b border-zinc-200 dark:border-zinc-700 px-3.5 py-2 bg-zinc-50 dark:bg-zinc-800">
                    <span className="flex items-center text-xs text-zinc-400 dark:text-zinc-500">Регион:</span>
                    <button
                      onClick={() => handleFlyToRegion(subscriptionRegionCode)}
                      className="rounded-md bg-blue-100 px-2 py-1 text-xs font-medium text-blue-700 transition-colors hover:bg-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:hover:bg-blue-800/40"
                    >
                      {info.name}
                    </button>
                  </div>
                );
              })()}
              {showMapFilter && (
                <SearchByPolygon quarters={[]} quarterStats={{}} onQuartersSelected={(_c, p) => handlePolygonsChange(p ?? null)} initialPolygons={polygonsCoords} flyTo={flyToTarget} addresses={addresses} addressStats={addressStatsMap} referenceData={{ wallMaterials: refWallMaterials, houseSeries: refHouseSeries, houseClasses: refHouseClasses, ceilingMaterials: refCeilingMaterials }} onAddressClick={(addr) => { setAddressModalMode('edit'); setDetailAddress(addr); }} selectedAddressIds={filterAddressIds} highlightedAddressIds={highlightedAddressIds} excludedAddressIds={excludedAddressIds} onAddressToggle={handleAddressToggle} onSelectAllInPolygon={handleSelectAllInPolygon} polygonsCoords={polygonsCoords} />
              )}
            </div>

          </div>
        )}

        {/* Active filters — всегда видны */}
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
                  <option value="processed">Обработано</option>
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
            <button disabled={selectedIds.size === 0} className="px-2 py-1 rounded text-[11px] font-medium bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 hover:bg-orange-200 disabled:opacity-30 disabled:cursor-not-allowed">Объединить</button>
            <button disabled={selectedIds.size === 0} className="px-2 py-1 rounded text-[11px] font-medium bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400 hover:bg-sky-200 disabled:opacity-30 disabled:cursor-not-allowed">Разбить</button>
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

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 dark:bg-zinc-800 border-b border-zinc-200 dark:border-zinc-700">
                <tr className="text-left text-[10px] font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                  <th className="px-2 py-2 w-6"></th>
                  <th className="px-1 py-2 w-6"></th>
                  <th className="px-2 py-2 w-32">Статус</th>
                  <th className="px-2 py-2 w-20">Создано</th>
                  <th className="px-2 py-2 w-20">Обновлено</th>
                  <th className="px-2 py-2">Характеристики</th>
                  <th className="px-2 py-2">Адрес</th>
                  <th className="px-2 py-2 w-28 text-right">Цена</th>
                  <th className="px-2 py-2 w-28">Контакт</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {!loading && tableRows.length === 0 ? (
                  <tr><td colSpan={9} className="px-4 py-12 text-center text-zinc-400 text-sm">Нет данных. Откройте «Загрузка» для импорта.</td></tr>
                ) : pagedRows.map((row, idx) => renderRow(row, idx))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-2 border-t border-zinc-200 dark:border-zinc-700">
              <span className="text-[11px] text-zinc-500">{((page - 1) * PAGE_SIZE) + 1}–{Math.min(page * PAGE_SIZE, tableRows.length)} из {tableRows.length}</span>
              <div className="flex gap-1">
                <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page <= 1} className="px-2 py-1 rounded text-[11px] border border-zinc-300 dark:border-zinc-600 disabled:opacity-30 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300">Назад</button>
                <span className="px-2 py-1 text-[11px] text-zinc-600 dark:text-zinc-400">{page}/{totalPages}</span>
                <button onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page >= totalPages} className="px-2 py-1 rounded text-[11px] border border-zinc-300 dark:border-zinc-600 disabled:opacity-30 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300">Далее</button>
              </div>
            </div>
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
          onSave={(updated) => {
            setAllAds(prev => prev.map(a => a.id === updated.id ? updated : a));
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
          onClose={() => setDetailObject(null)}
          onAdClick={(ad) => { setDetailObject(null); setDetailAd(ad); }}
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
    </div>
  );
};

export default AdsPage;
