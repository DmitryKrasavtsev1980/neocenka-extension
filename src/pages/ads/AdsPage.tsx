/**
 * Страница «Поиск объявлений»
 * Единая таблица с объявлениями и объектами (по аналогии с neocenka-extension)
 */

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { adsRepository } from '@/db/repositories/ads.repository';
import { db } from '@/db/database';
import type { Ad, AdObject, AdAddress, AdStats } from '@/types';
import {
  getInparsToken,
  loadCategories,
  INPARS_SOURCE_IDS,
  type InparsCategoryRaw,
} from '@/services/inpars-service';
import { useImportTasks } from '@/contexts/ImportTaskContext';
import SearchByPolygon from '@/components/SearchByPolygon/SearchByPolygon';
import { Button } from '@/components/catalyst/button';
import { Badge } from '@/components/catalyst/badge';
import AdDetailModal from './AdDetailModal';
import AdObjectDetailModal from './AdObjectDetailModal';
import {
  FunnelIcon,
  ArrowDownTrayIcon,
  ChevronDownIcon,
  XMarkIcon,
  ArrowPathIcon,
  MapPinIcon,
} from '@heroicons/react/16/solid';

// ─── Константы ───

const PROPERTY_TYPE_LABELS: Record<string, string> = {
  studio: 'Студия', '1k': '1-к', '2k': '2-к', '3k': '3-к', '4k+': '4+к',
};
const PROPERTY_TYPE_FULL: Record<string, string> = {
  studio: 'Студия', '1k': '1-комн.', '2k': '2-комн.', '3k': '3-комн.', '4k+': '4+ комн.',
};
const SOURCE_LABELS: Record<string, string> = {
  avito: 'Авито', cian: 'ЦИАН', domclick: 'Домклик', youla: 'Юла', unknown: '?',
};
const SOURCE_COLORS: Record<string, string> = {
  avito: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  cian: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  domclick: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  youla: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  unknown: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-300',
};
const INPARS_SOURCE_LABELS: Record<string, string> = { avito: 'Авито', cian: 'ЦИАН', youla: 'Юла', domclick: 'Домклик' };
const SELLER_TYPE_LABELS: Record<string, string> = { owner: 'Собственник', agent: 'Агент', agency: 'Агентство', developer: 'Девелопер' };
const PROCESSING_STATUS_LABELS: Record<string, string> = {
  address_needed: 'Определить адрес', duplicate_check_needed: 'Обработать на дубли', needs_update: 'Актуализировать', processed: 'Обработано',
};
const CONFIDENCE_LABELS: Record<string, string> = {
  high: '(Подтвержден)', medium: '(Средняя)', low: '(Низкая)', very_low: '(Очень низкая)', manual: '(Ручной)',
};
const PAGE_SIZE = 25;

function toDateString(d: Date): string { return d.toISOString().slice(0, 10); }

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
  const [filterProcessingStatus, setFilterProcessingStatus] = useState('');
  const [filterAddressId, setFilterAddressId] = useState<number | ''>('');
  const [filterContactType, setFilterContactType] = useState('');
  const [addresses, setAddresses] = useState<AdAddress[]>([]);

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
  const [importDateFrom, setImportDateFrom] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 367); return toDateString(d); });
  const [importDateTo, setImportDateTo] = useState(() => { const d = new Date(); d.setDate(d.getDate() + 1); return toDateString(d); });
  const [importError, setImportError] = useState('');

  // ─── Чекбоксы задач ───
  const [runImport, setRunImport] = useState(false);
  const [runAddress, setRunAddress] = useState(false);
  const [runUpdate, setRunUpdate] = useState(false);

  // ─── Модалки ───
  const [detailAd, setDetailAd] = useState<Ad | null>(null);
  const [detailObject, setDetailObject] = useState<AdObject | null>(null);

  // ─── Карта ───
  const [showMapFilter, setShowMapFilter] = useState(false);
  const [polygonsCoords, setPolygonsCoords] = useState<[number, number][][] | null>(() => {
    try {
      const saved = localStorage.getItem('ret_ads_polygon_coords');
      if (!saved) return null;
      const parsed = JSON.parse(saved);
      if (parsed && Array.isArray(parsed) && parsed.length > 0 && Array.isArray(parsed[0]) && !Array.isArray(parsed[0][0])) return [parsed];
      return parsed;
    } catch { return null; }
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

  // Загрузка адресов для фильтра
  useEffect(() => {
    db.table<AdAddress>('ad_addresses').toArray().then(addrs => {
      addrs.sort((a, b) => (a.address || '').localeCompare(b.address || '', 'ru'));
      setAddresses(addrs);
    });
  }, []);

  // Загрузка сохранённых фильтров из localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem('ret_ads_saved_filters');
      if (raw) setSavedFilters(JSON.parse(raw));
    } catch {}
  }, []);

  // ─── Сохранение фильтров ───
  const getFilterState = useCallback(() => ({
    sources: filterSources, propertyTypes: filterPropertyTypes,
    priceMin: filterPriceMin, priceMax: filterPriceMax,
    areaMin: filterAreaMin, areaMax: filterAreaMax,
    floorMin: filterFloorMin, floorMax: filterFloorMax,
    yearMin: filterYearMin, yearMax: filterYearMax,
    sellerTypes: filterSellerTypes, status: filterStatus,
    dateFrom: filterDateFrom, dateTo: filterDateTo,
    searchQuery,
    processingStatus: filterProcessingStatus, addressId: filterAddressId, contactType: filterContactType,
  }), [filterSources, filterPropertyTypes, filterPriceMin, filterPriceMax, filterAreaMin, filterAreaMax,
    filterFloorMin, filterFloorMax, filterYearMin, filterYearMax, filterSellerTypes, filterStatus,
    filterDateFrom, filterDateTo, searchQuery, filterProcessingStatus, filterAddressId, filterContactType]);

  const applyFilterState = useCallback((state: Record<string, unknown>) => {
    setFilterSources((state.sources as string[]) || []);
    setFilterPropertyTypes((state.propertyTypes as string[]) || []);
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
  }, []);

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

  // ─── Фильтрация ───
  const filteredAds = useMemo(() => {
    let result = allAds;

    // Основной фильтр
    if (filterStatus) result = result.filter(a => a.status === filterStatus);
    if (filterSources.length > 0) result = result.filter(a => filterSources.includes(a.source));
    if (filterPropertyTypes.length > 0) result = result.filter(a => filterPropertyTypes.includes(a.property_type));
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

    // Фильтр обработки
    if (filterProcessingStatus) result = result.filter(a => a.processing_status === filterProcessingStatus);
    if (filterAddressId) result = result.filter(a => a.address_id === filterAddressId);
    if (filterContactType) result = result.filter(a => (a.seller_info?.type || a.seller_type) === filterContactType);

    return result;
  }, [allAds, filterStatus, filterSources, filterPropertyTypes, filterPriceMin, filterPriceMax,
    filterAreaMin, filterAreaMax, filterFloorMin, filterFloorMax, filterYearMin, filterYearMax,
    filterSellerTypes, filterDateFrom, filterDateTo, searchQuery,
    filterProcessingStatus, filterAddressId, filterContactType]);

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
    return result;
  }, [allObjects, filterStatus, filterPropertyTypes, filterPriceMin, filterPriceMax,
    filterAreaMin, filterAreaMax, filterFloorMin, filterFloorMax]);

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
    if (searchQuery) tags.push({ key: 'query', label: `Поиск: ${searchQuery}` });
    return tags;
  }, [filterStatus, filterSources, filterPropertyTypes, filterPriceMin, filterPriceMax, filterAreaMin, filterAreaMax,
    filterFloorMin, filterFloorMax, filterYearMin, filterYearMax, filterSellerTypes, filterDateFrom, filterDateTo,
    filterProcessingStatus, filterAddressId, filterContactType, searchQuery, addresses]);

  const removeFilterTag = (key: string) => {
    if (key === 'status') setFilterStatus('');
    if (key === 'sources') setFilterSources([]);
    if (key === 'ptypes') setFilterPropertyTypes([]);
    if (key === 'price') { setFilterPriceMin(''); setFilterPriceMax(''); }
    if (key === 'area') { setFilterAreaMin(''); setFilterAreaMax(''); }
    if (key === 'floor') { setFilterFloorMin(''); setFilterFloorMax(''); }
    if (key === 'year') { setFilterYearMin(''); setFilterYearMax(''); }
    if (key === 'seller') setFilterSellerTypes([]);
    if (key === 'dates') { setFilterDateFrom(''); setFilterDateTo(''); }
    if (key === 'proc') setFilterProcessingStatus('');
    if (key === 'addr') setFilterAddressId('');
    if (key === 'contact') setFilterContactType('');
    if (key === 'query') setSearchQuery('');
  };

  const clearAllFilters = () => {
    setFilterStatus(''); setFilterSources([]); setFilterPropertyTypes([]);
    setFilterPriceMin(''); setFilterPriceMax(''); setFilterAreaMin(''); setFilterAreaMax('');
    setFilterFloorMin(''); setFilterFloorMax(''); setFilterYearMin(''); setFilterYearMax('');
    setFilterSellerTypes([]); setFilterDateFrom(''); setFilterDateTo('');
    setFilterProcessingStatus(''); setFilterAddressId(''); setFilterContactType('');
    setSearchQuery(''); setActiveFilterId(null); setActiveFilterName(null);
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
  const quickFilter = (row: TableRow) => {
    if (row.kind === 'object') {
      const o = row.data;
      if (o.property_type && !filterPropertyTypes.includes(o.property_type)) setFilterPropertyTypes([...filterPropertyTypes, o.property_type]);
      if (o.address_id) setFilterAddressId(o.address_id);
    } else {
      const a = row.data;
      if (a.property_type && !filterPropertyTypes.includes(a.property_type)) setFilterPropertyTypes([...filterPropertyTypes, a.property_type]);
      if (a.address_id) setFilterAddressId(a.address_id);
      if (a.floor != null) setFilterFloorMin(String(a.floor));
      if (a.source && !filterSources.includes(a.source)) setFilterSources([...filterSources, a.source]);
    }
  };

  // ─── Загрузка из Inpars ───
  const handleOpenImport = async () => {
    setShowImportPanel(!showImportPanel);
    if (!showImportPanel && !categoriesLoadedRef.current) {
      try {
        const saved = await db.table('inpars_categories').toArray();
        if (saved.length > 0) {
          setCategories(saved.map((c: any) => ({ id: c.inpars_id, name: c.name })));
          categoriesLoadedRef.current = true;
        } else if (getInparsToken()) {
          const cats = await loadCategories();
          setCategories(cats);
          categoriesLoadedRef.current = true;
        }
      } catch {}
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
      dateFrom: importDateFrom || undefined,
      dateTo: importDateTo || undefined,
    });
  };

  const handleRunAll = () => {
    if (runImport) handleImport();
    // Заглушки для адресов и обновления
    if (runAddress) { alert('Определение адресов — в разработке'); }
    if (runUpdate) { alert('Обновление объявлений — в разработке'); }
  };

  const toggleNumFilter = (arr: number[], item: number, setter: (v: number[]) => void) => {
    setter(arr.includes(item) ? arr.filter(x => x !== item) : [...arr, item]);
  };

  const handlePolygonsChange = useCallback((polygons: [number, number][][] | null) => {
    setPolygonsCoords(polygons);
    if (polygons) localStorage.setItem('ret_ads_polygon_coords', JSON.stringify(polygons));
    else localStorage.removeItem('ret_ads_polygon_coords');
  }, []);

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
          onClick={() => toggleSelect(id, 'object')}>
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
            <span className="cursor-pointer text-blue-600 dark:text-blue-400 hover:underline truncate block" onClick={e => { e.stopPropagation(); setDetailObject(o); }}>{o.address_id ? 'Адрес #' + o.address_id : 'Адрес не определен'}</span>
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
        onClick={() => toggleSelect(id, 'ad')}>
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
        <td className="px-2 py-1.5 text-[11px] max-w-[200px]">
          <div className={`cursor-pointer truncate text-blue-600 dark:text-blue-400 hover:underline ${!a.address ? 'text-red-500 dark:text-red-400' : ''}`} onClick={e => { e.stopPropagation(); setDetailAd(a); }}>{a.address || 'Адрес не указан'}</div>
          {addrFromDb && <div className="truncate text-zinc-400 text-[10px]">{addrFromDb} {a.address_match_confidence ? <span className={a.address_match_confidence === 'low' || a.address_match_confidence === 'very_low' ? 'text-red-400' : 'text-green-500'}>{CONFIDENCE_LABELS[a.address_match_confidence]}</span> : ''}</div>}
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

        {/* Header */}
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-semibold text-zinc-900 dark:text-white">
              Поиск объявлений
              <span className="ml-2 text-sm font-normal text-zinc-500 dark:text-zinc-400">
                {totalAds.toLocaleString('ru-RU')} шт.
                {stats?.avgPrice != null && ` · ср. ${(stats.avgPrice / 1000000).toFixed(1)} млн`}
              </span>
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
            <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Поиск по адресу..."
              className="rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-700 px-3 py-1.5 text-sm text-zinc-900 dark:text-white w-48 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            {/* Сохранённые фильтры */}
            <div className="relative">
              <Button color="white" onClick={() => { setShowSavedDropdown(!showSavedDropdown); setShowSaveInput(false); }}>
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
            <Button onClick={() => setShowFilters(!showFilters)}><FunnelIcon className="size-4" />{showFilters ? 'Скрыть' : 'Фильтры'}</Button>
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
                  {Object.entries(INPARS_SOURCE_LABELS).map(([key, label]) => {
                    const id = INPARS_SOURCE_IDS[key];
                    return <button key={key} onClick={() => toggleNumFilter(importSourceIds, id, setImportSourceIds)} className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${importSourceIds.includes(id) ? 'bg-blue-600 text-white' : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700'}`}>{label}</button>;
                  })}
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-medium text-zinc-500 dark:text-zinc-400 mb-1 uppercase">Категория</label>
                <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
                  {categories.map(c => <button key={c.id} onClick={() => toggleNumFilter(importCategoryIds, c.id, setImportCategoryIds)} className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${importCategoryIds.includes(c.id) ? 'bg-blue-600 text-white' : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700'}`}>{c.name}</button>)}
                  {categories.length === 0 && <span className="text-xs text-zinc-400">Загрузка категорий...</span>}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-[11px] font-medium text-zinc-500 dark:text-zinc-400 mb-1">Дата от</label><input type="date" value={importDateFrom} onChange={e => setImportDateFrom(e.target.value)} className="w-full rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-700 px-2 py-1.5 text-sm text-zinc-900 dark:text-white" /></div>
                <div><label className="block text-[11px] font-medium text-zinc-500 dark:text-zinc-400 mb-1">Дата до</label><input type="date" value={importDateTo} onChange={e => setImportDateTo(e.target.value)} className="w-full rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-700 px-2 py-1.5 text-sm text-zinc-900 dark:text-white" /></div>
              </div>
              <button onClick={handleImport} disabled={adsImportRunning || !polygonsCoords || !getInparsToken()} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2">
                {adsImportRunning && <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" /></svg>}
                {adsImportRunning ? 'Загрузка в фоне...' : 'Загрузить'}
              </button>
              {importError && <p className="text-sm text-red-600 dark:text-red-400">{importError}</p>}
            </div>

            <hr className="border-zinc-200 dark:border-zinc-700" />

            {/* Раздел 2: Определение адресов (ЗАГЛУШКА) */}
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-zinc-700 dark:text-zinc-300 flex items-center gap-2"><MapPinIcon className="size-4" /> Определение адресов</h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">Автоматическое определение адресов для объявлений без адреса. <span className="text-amber-600">В разработке</span></p>
              <p className="text-xs text-zinc-400">Объявлений без адреса: {allAds.filter(a => !a.address_id || a.address_match_confidence === 'low' || a.address_match_confidence === 'very_low').length}</p>
            </div>

            <hr className="border-zinc-200 dark:border-zinc-700" />

            {/* Раздел 3: Обновление объявлений (ЗАГЛУШКА) */}
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-zinc-700 dark:text-zinc-300 flex items-center gap-2"><ArrowPathIcon className="size-4" /> Обновление объявлений</h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">Обновление данных по существующим объявлениям. <span className="text-amber-600">В разработке</span></p>
              <p className="text-xs text-zinc-400">Активных объявлений: {allAds.filter(a => a.status === 'active').length}</p>
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
            <div className="rounded-xl bg-blue-50 dark:bg-blue-950/30 p-4 border border-blue-200 dark:border-blue-800">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-xs font-medium text-blue-700 dark:text-blue-300 uppercase">Фильтр</h4>
                <button onClick={clearAllFilters} className="inline-flex items-center gap-1 px-2 py-1 text-[11px] text-blue-600 dark:text-blue-400 hover:text-blue-900 dark:hover:text-white"><XMarkIcon className="size-3" />Очистить все</button>
              </div>

              {/* Источник */}
              <div className="mb-3">
                <label className="block text-[10px] font-medium text-blue-600 dark:text-blue-400 mb-1">Источник</label>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(SOURCE_LABELS).map(([key, label]) => (
                    <button key={key} onClick={() => setFilterSources(prev => prev.includes(key) ? prev.filter(s => s !== key) : [...prev, key])}
                      className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${filterSources.includes(key) ? 'bg-blue-600 text-white' : 'bg-white text-blue-700 hover:bg-blue-100 dark:bg-blue-900/50 dark:text-blue-300 dark:hover:bg-blue-800/50 border border-blue-200 dark:border-blue-700'}`}>{label}</button>
                  ))}
                </div>
              </div>

              {/* Тип недвижимости */}
              <div className="mb-3">
                <label className="block text-[10px] font-medium text-blue-600 dark:text-blue-400 mb-1">Тип недвижимости</label>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(PROPERTY_TYPE_LABELS).map(([key, label]) => (
                    <button key={key} onClick={() => setFilterPropertyTypes(prev => prev.includes(key) ? prev.filter(t => t !== key) : [...prev, key])}
                      className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${filterPropertyTypes.includes(key) ? 'bg-blue-600 text-white' : 'bg-white text-blue-700 hover:bg-blue-100 dark:bg-blue-900/50 dark:text-blue-300 dark:hover:bg-blue-800/50 border border-blue-200 dark:border-blue-700'}`}>{label}</button>
                  ))}
                </div>
              </div>

              {/* Диапазоны: цена, площадь, этаж, год */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                <div>
                  <label className="block text-[10px] font-medium text-blue-600 dark:text-blue-400 mb-1">Цена от</label>
                  <input type="number" placeholder="0" value={filterPriceMin} onChange={e => setFilterPriceMin(e.target.value)} className="w-full rounded-md border border-blue-200 dark:border-blue-700 bg-white dark:bg-blue-900/50 px-2 py-1.5 text-xs text-zinc-900 dark:text-white placeholder:text-blue-300 dark:placeholder:text-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-[10px] font-medium text-blue-600 dark:text-blue-400 mb-1">Цена до</label>
                  <input type="number" placeholder="∞" value={filterPriceMax} onChange={e => setFilterPriceMax(e.target.value)} className="w-full rounded-md border border-blue-200 dark:border-blue-700 bg-white dark:bg-blue-900/50 px-2 py-1.5 text-xs text-zinc-900 dark:text-white placeholder:text-blue-300 dark:placeholder:text-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-[10px] font-medium text-blue-600 dark:text-blue-400 mb-1">Площадь от (м²)</label>
                  <input type="number" placeholder="0" value={filterAreaMin} onChange={e => setFilterAreaMin(e.target.value)} className="w-full rounded-md border border-blue-200 dark:border-blue-700 bg-white dark:bg-blue-900/50 px-2 py-1.5 text-xs text-zinc-900 dark:text-white placeholder:text-blue-300 dark:placeholder:text-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-[10px] font-medium text-blue-600 dark:text-blue-400 mb-1">Площадь до (м²)</label>
                  <input type="number" placeholder="∞" value={filterAreaMax} onChange={e => setFilterAreaMax(e.target.value)} className="w-full rounded-md border border-blue-200 dark:border-blue-700 bg-white dark:bg-blue-900/50 px-2 py-1.5 text-xs text-zinc-900 dark:text-white placeholder:text-blue-300 dark:placeholder:text-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-[10px] font-medium text-blue-600 dark:text-blue-400 mb-1">Этаж от</label>
                  <input type="number" min={1} max={100} placeholder="1" value={filterFloorMin} onChange={e => setFilterFloorMin(e.target.value)} className="w-full rounded-md border border-blue-200 dark:border-blue-700 bg-white dark:bg-blue-900/50 px-2 py-1.5 text-xs text-zinc-900 dark:text-white placeholder:text-blue-300 dark:placeholder:text-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-[10px] font-medium text-blue-600 dark:text-blue-400 mb-1">Этаж до</label>
                  <input type="number" min={1} max={100} placeholder="∞" value={filterFloorMax} onChange={e => setFilterFloorMax(e.target.value)} className="w-full rounded-md border border-blue-200 dark:border-blue-700 bg-white dark:bg-blue-900/50 px-2 py-1.5 text-xs text-zinc-900 dark:text-white placeholder:text-blue-300 dark:placeholder:text-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-[10px] font-medium text-blue-600 dark:text-blue-400 mb-1">Год постройки от</label>
                  <input type="number" min={1900} max={2030} placeholder="1900" value={filterYearMin} onChange={e => setFilterYearMin(e.target.value)} className="w-full rounded-md border border-blue-200 dark:border-blue-700 bg-white dark:bg-blue-900/50 px-2 py-1.5 text-xs text-zinc-900 dark:text-white placeholder:text-blue-300 dark:placeholder:text-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-[10px] font-medium text-blue-600 dark:text-blue-400 mb-1">Год постройки до</label>
                  <input type="number" min={1900} max={2030} placeholder="2030" value={filterYearMax} onChange={e => setFilterYearMax(e.target.value)} className="w-full rounded-md border border-blue-200 dark:border-blue-700 bg-white dark:bg-blue-900/50 px-2 py-1.5 text-xs text-zinc-900 dark:text-white placeholder:text-blue-300 dark:placeholder:text-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                </div>
              </div>

              {/* Продавец */}
              <div className="mb-3">
                <label className="block text-[10px] font-medium text-blue-600 dark:text-blue-400 mb-1">Продавец</label>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(SELLER_TYPE_LABELS).map(([key, label]) => (
                    <button key={key} onClick={() => setFilterSellerTypes(prev => prev.includes(key) ? prev.filter(s => s !== key) : [...prev, key])}
                      className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${filterSellerTypes.includes(key) ? 'bg-blue-600 text-white' : 'bg-white text-blue-700 hover:bg-blue-100 dark:bg-blue-900/50 dark:text-blue-300 dark:hover:bg-blue-800/50 border border-blue-200 dark:border-blue-700'}`}>{label}</button>
                  ))}
                </div>
              </div>

              {/* Статус + Даты */}
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <label className="block text-[10px] font-medium text-blue-600 dark:text-blue-400 mb-1">Статус</label>
                  <div className="flex gap-1">
                    <button onClick={() => setFilterStatus('')} className={`px-2 py-1 rounded text-[10px] font-medium transition-colors ${!filterStatus ? 'bg-blue-600 text-white' : 'bg-white text-blue-700 hover:bg-blue-100 dark:bg-blue-900/50 dark:text-blue-300 border border-blue-200 dark:border-blue-700'}`}>Все</button>
                    <button onClick={() => setFilterStatus('active')} className={`px-2 py-1 rounded text-[10px] font-medium transition-colors ${filterStatus === 'active' ? 'bg-green-600 text-white' : 'bg-white text-green-700 hover:bg-green-100 dark:bg-green-900/50 dark:text-green-300 border border-green-200 dark:border-green-700'}`}>Активные</button>
                    <button onClick={() => setFilterStatus('archived')} className={`px-2 py-1 rounded text-[10px] font-medium transition-colors ${filterStatus === 'archived' ? 'bg-zinc-600 text-white' : 'bg-white text-zinc-700 hover:bg-zinc-100 dark:bg-zinc-800/50 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-600'}`}>Архивные</button>
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-medium text-blue-600 dark:text-blue-400 mb-1">Дата создания от</label>
                  <input type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)} className="rounded-md border border-blue-200 dark:border-blue-700 bg-white dark:bg-blue-900/50 px-2 py-1 text-xs text-zinc-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-[10px] font-medium text-blue-600 dark:text-blue-400 mb-1">Дата создания до</label>
                  <input type="date" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)} className="rounded-md border border-blue-200 dark:border-blue-700 bg-white dark:bg-blue-900/50 px-2 py-1 text-xs text-zinc-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500" />
                </div>
              </div>
            </div>

            {/* Фильтр обработки — серая панель */}
            <div className="rounded-xl bg-zinc-50 dark:bg-zinc-800/50 p-4 border border-zinc-200 dark:border-zinc-700">
              <h4 className="text-xs font-medium text-zinc-600 dark:text-zinc-400 uppercase mb-3">Фильтр обработки</h4>
              <div className="grid grid-cols-3 gap-3">
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
                  <label className="block text-[10px] font-medium text-zinc-500 dark:text-zinc-400 mb-1">Контакт</label>
                  <select value={filterContactType} onChange={e => setFilterContactType(e.target.value)} className="w-full rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-700 px-2 py-1.5 text-xs text-zinc-900 dark:text-white">
                    <option value="">Все контакты</option>
                    {Object.entries(SELLER_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
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
              <div className={`transition-[max-height] duration-300 ease-in-out ${showMapFilter ? 'max-h-[1200px]' : 'max-h-0'} overflow-hidden`}>
                <SearchByPolygon quarters={[]} quarterStats={{}} onQuartersSelected={(_c, p) => handlePolygonsChange(p ?? null)} initialPolygons={polygonsCoords} />
              </div>
            </div>

            {/* Active filters */}
            {activeFilterTags.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[10px] text-zinc-500">Фильтры:</span>
                {activeFilterTags.map(t => (
                  <span key={t.key} className="inline-flex items-center gap-1 rounded-full bg-blue-100 dark:bg-blue-900/30 px-2 py-0.5 text-[10px] font-medium text-blue-700 dark:text-blue-300">
                    {t.label}
                    <button onClick={() => removeFilterTag(t.key)} className="text-blue-500 hover:text-blue-700"><XMarkIcon className="size-3" /></button>
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Action buttons + table */}
        <div className="rounded-xl bg-white shadow-sm dark:bg-zinc-900 overflow-hidden">
          {/* Toolbar */}
          <div className="flex items-center gap-2 border-b border-zinc-200 dark:border-zinc-700 px-4 py-2">
            <input type="checkbox" checked={pagedRows.length > 0 && selectedIds.size > 0} onChange={toggleSelectAll} className="h-3 w-3 rounded border-zinc-300 text-blue-600" title="Выбрать все на странице" />
            <button disabled={selectedIds.size === 0} className="px-2 py-1 rounded text-[11px] font-medium bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 hover:bg-orange-200 disabled:opacity-30 disabled:cursor-not-allowed">Объединить</button>
            <button disabled={selectedIds.size === 0} className="px-2 py-1 rounded text-[11px] font-medium bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400 hover:bg-sky-200 disabled:opacity-30 disabled:cursor-not-allowed">Разбить</button>
            {selectedIds.size > 0 && <span className="text-[10px] text-blue-600 dark:text-blue-400 ml-2">{selectedIds.size} выбрано</span>}
            <div className="flex-1" />
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
        <AdDetailModal ad={detailAd} onClose={() => setDetailAd(null)} onSave={(updated) => {
          // Обновляем ad в allAds
          setAllAds(prev => prev.map(a => a.id === updated.id ? updated : a));
        }} />
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
    </div>
  );
};

export default AdsPage;
