/**
 * Страница настроек модуля «Рекламные объявления»
 * — Подключение через сервер Неоценка
 * — Загрузка справочников (категории)
 * — Выбор категорий для использования в фильтрах
 */

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  SOURCE_IDS,
} from '@/services/listing-transform';
import {
  getAvailableCategories,
  getAvailableRegions,
  getAvailableSources,
  type CategoryAdmin,
  type RegionAdmin,
  type SourceAdmin,
} from '@/services/data-request-service';
import { db } from '@/db/database';
import type { ListingCategory } from '@/types';
import { addressSyncService } from '@/services/address-sync-service';
import { adsAddressService } from '@/services/ads-address-service';
import { REGION_CENTERS } from '@/constants/regions';
import { getAddressesStats, getModules, type ModuleInfo } from '@/services/api-service';

const TYPE_ID_LABELS: Record<number, string> = {
  1: 'Аренда',
  2: 'Продажа',
};

const SECTION_LABELS: Record<number, string> = {
  1: 'Жилая', 4: 'Коммерческая', 5: 'Загородная',
  9: 'Гараж', 11: 'Готовый бизнес',
};

const STORAGE_KEY_SELECTED_CATEGORIES = 'listing_selected_categories';
const STORAGE_KEY_SELECTED_SOURCES = 'listing_selected_sources';

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

interface ExportSavedFilter {
  id: string;
  name: string;
  groupId: string | null;
  sortOrder: number;
  createdAt: number;
  state: Record<string, unknown>;
}

interface ExportFilterGroup {
  id: string;
  name: string;
  color: string;
  sortOrder: number;
  isCollapsed: boolean;
}

const AdsSettingsPage: React.FC = () => {
  // Справочники
  const [regions, setRegions] = useState<RegionAdmin[]>([]);
  const [sources, setSources] = useState<SourceAdmin[]>([]);

  // Подписка на модуль ads
  const [adsModule, setAdsModule] = useState<ModuleInfo | null>(null);

  // Справочники — категории
  const [allCategories, setAllCategories] = useState<{ source_id: number; title: string; type_id: number | null; section_id: number | null }[]>([]);

  // Выбранные пользователем категории (source_id[])
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
  const [addressDeleting, setAddressDeleting] = useState(false);
  const [addressUnlinking, setAddressUnlinking] = useState(false);
  const [addressUnlinkResult, setAddressUnlinkResult] = useState<number | null>(null);
  const [addressSubmitting, setAddressSubmitting] = useState(false);
  const [addressSubmitResult, setAddressSubmitResult] = useState<{ submitted: number } | null>(null);

  // Выбранные регионы для синхронизации адресов
  const STORAGE_KEY_SYNC_REGIONS = 'address_sync_regions';
  const [selectedSyncRegions, setSelectedSyncRegions] = useState<string[]>([]);
  const [showRegionPicker, setShowRegionPicker] = useState(false);
  const [regionStats, setRegionStats] = useState<Record<string, number>>({});
  const [regionStatsLoading, setRegionStatsLoading] = useState(false);
  const [regionSearch, setRegionSearch] = useState('');

  // Экспорт/Импорт
  const [exportMode, setExportMode] = useState<'data' | 'prompt'>('data');
  const [exporting, setExporting] = useState(false);
  const [importResult, setImportResult] = useState('');
  const importRef = useRef<HTMLInputElement>(null);

  // Сохранённые фильтры для экспорта
  const [savedFilters, setSavedFilters] = useState<ExportSavedFilter[]>([]);
  const [savedGroups, setSavedGroups] = useState<ExportFilterGroup[]>([]);
  const [selectedFilterIds, setSelectedFilterIds] = useState<Set<string>>(new Set());
  const [filteredPreviewCount, setFilteredPreviewCount] = useState<number | null>(null);

  // Группировка категорий по разделам (только продажа — секции 6,7,8,10 исключены)
  const RENT_SECTIONS = new Set([6, 7, 8, 10]);
  const categoriesBySection = useMemo(() => {
    const map = new Map<number, { section: { id: number; title: string } | undefined; categories: typeof allCategories }>();
    for (const cat of allCategories) {
      const sid = cat.section_id ?? 0;
      if (RENT_SECTIONS.has(sid)) continue;
      if (!map.has(sid)) {
        const title = SECTION_LABELS[sid] || (sid ? `Раздел ${sid}` : '');
        map.set(sid, {
          section: sid ? { id: sid, title } : undefined,
          categories: [],
        });
      }
      map.get(sid)!.categories.push(cat);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a - b)
      .map(([, val]) => val);
  }, [allCategories]);

  useEffect(() => {
    (async () => {
      // Загрузить информацию о подписке на модуль ads
      try {
        const data = await getModules();
        const ads = data.modules.find((m: ModuleInfo) => m.code === 'ads');
        if (ads) setAdsModule(ads);
      } catch {
        // Не критично
      }

      // Загрузить регионы с сервера
      try {
        const serverRegions = await getAvailableRegions();
        setRegions(serverRegions);
      } catch {
        // Не критично
      }

      // Загрузить источники с сервера
      try {
        const serverSources = await getAvailableSources();
        setSources(serverSources);
      } catch {
        // Не критично
      }

      // Загрузить категории — автоматически из IndexedDB или с сервера
      let loadedCategories: { source_id: number; title: string; type_id: number | null; section_id: number | null }[] = [];
      try {
        const table = db.table<ListingCategory>('listing_categories');
        const saved = await table.toArray();
        let saleOnly = saved.filter(c => ![6, 7, 8, 10].includes(c.section_id ?? 0));

        if (saleOnly.length === 0) {
          // IndexedDB пуста — загружаем с сервера и сохраняем
          const serverCategories = await getAvailableCategories();
          const serverSale = serverCategories.filter(c => ![6, 7, 8, 10].includes(c.section_id ?? 0));
          const now = new Date().toISOString();
          for (const cat of serverSale) {
            await table.add({
              source_id: cat.source_id,
              name: cat.title,
              name_en: '',
              parent_id: null,
              section_id: cat.section_id,
              type_id: cat.type_id,
              is_active: true,
              sort_order: 0,
              description: '',
              level: 0,
              has_children: false,
              imported_at: now,
            });
          }
          saleOnly = serverSale.map(c => ({
            source_id: c.source_id,
            title: c.title,
            type_id: c.type_id,
            section_id: c.section_id,
          }));
        } else {
          saleOnly = saleOnly.map(c => ({
            source_id: c.source_id!,
            title: c.name,
            type_id: c.type_id ?? null,
            section_id: c.section_id ?? null,
          }));
        }

        if (saleOnly.length > 0) {
          loadedCategories = saleOnly;
          setAllCategories(saleOnly);
        }
      } catch {
        // Не критично
      }

      // Загрузить выбранные категории и источники
      const [selCats, selSources] = await Promise.all([
        loadFromStorage<number[]>(STORAGE_KEY_SELECTED_CATEGORIES),
        loadFromStorage<number[]>(STORAGE_KEY_SELECTED_SOURCES),
      ]);
      // Если категории не выбраны — по умолчанию Жилая (section_id=1)
      if (selCats.length === 0 && loadedCategories.length > 0) {
        const defaultCatIds = loadedCategories
          .filter(c => c.section_id === 1)
          .map(c => c.source_id);
        setSelectedCategoryIds(defaultCatIds);
        saveToStorage(STORAGE_KEY_SELECTED_CATEGORIES, defaultCatIds);
      } else {
        setSelectedCategoryIds(selCats);
      }
      // Если источники не выбраны — по умолчанию avito и cian
      if (selSources.length === 0) {
        const defaultSources = [1, 2]; // avito, cian
        setSelectedSourceIds(defaultSources);
        saveToStorage(STORAGE_KEY_SELECTED_SOURCES, defaultSources);
      } else {
        setSelectedSourceIds(selSources);
      }

      // Статистика адресной базы
      const stats = await addressSyncService.getLocalStats();
      setAddressCount(stats.total);
      const lastSync = await addressSyncService.getLastSyncDate();
      setAddressLastSync(lastSync);

      // Загрузить выбранные регионы для синхронизации
      const savedRegions = await loadFromStorage<string[]>(STORAGE_KEY_SYNC_REGIONS);
      if (savedRegions) setSelectedSyncRegions(savedRegions);
    })();
  }, []);


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
        .filter(c => c.section_id === sectionId)
        .map(c => c.source_id);
      const allSelected = sectionCatIds.every(id => prev.includes(id));
      const next = allSelected
        ? prev.filter(id => !sectionCatIds.includes(id))
        : [...new Set([...prev, ...sectionCatIds])];
      saveToStorage(STORAGE_KEY_SELECTED_CATEGORIES, next);
      return next;
    });
  }, [allCategories]);

  const selectAllCats = useCallback(() => {
    const allIds = allCategories.map(c => c.source_id);
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
    const allIds = Object.values(SOURCE_IDS);
    setSelectedSourceIds(allIds);
    saveToStorage(STORAGE_KEY_SELECTED_SOURCES, allIds);
  }, []);

  const deselectAllSources = useCallback(() => {
    setSelectedSourceIds([]);
    saveToStorage(STORAGE_KEY_SELECTED_SOURCES, []);
  }, []);

  // Загрузка сохранённых фильтров для экспорта
  useEffect(() => {
    (async () => {
      try {
        const result = await new Promise<{ filters: ExportSavedFilter[]; groups: ExportFilterGroup[] }>((resolve) => {
          if (typeof chrome !== 'undefined' && chrome.storage?.local) {
            chrome.storage.local.get(['ret_ads_saved_filters_v2', 'ret_ads_filter_groups'], (r) => {
              const rawFilters = r.ret_ads_saved_filters_v2;
              const rawGroups = r.ret_ads_filter_groups;
              let filters: ExportSavedFilter[] = [];
              let groups: ExportFilterGroup[] = [];
              try { filters = Array.isArray(rawFilters) ? rawFilters : JSON.parse(rawFilters); } catch {}
              try { groups = Array.isArray(rawGroups) ? rawGroups : JSON.parse(rawGroups); } catch {}
              resolve({
                filters: Array.isArray(filters) ? filters : [],
                groups: Array.isArray(groups) ? groups : [],
              });
            });
          } else {
            resolve({ filters: [], groups: [] });
          }
        });
        setSavedFilters(result.filters || []);
        setSavedGroups(result.groups || []);
      } catch {
        // Не критично
      }
    })();
  }, []);

  const LLM_PROMPT = `Ты — эксперт-аналитик рынка недвижимости. Проанализируй прилагаемые данные об объявлениях, объектах недвижимости.

Задачи:
1. Оцени рыночную стоимость каждого объекта на основе сопоставимых объявлений в том же районе/доме.
2. Определи средний срок продажи (в днях) для каждого типа недвижимости в разрезе районов.
3. Выяви недооценённые и переоценённые объекты (отклонение >15% от рынка).
4. Сгруппируй объекты по районам/домам и рассчитай среднюю цену за м², медианную цену, разброс.
5. Укажи факторы, влияющие на цену (этаж, площадь, материал стен, тип дома и т.д.).
6. Дай рекомендации по стратегии продаж: какие объекты стоит продавать быстрее, какие — держать.

Формат ответа: структурированный отчёт на русском языке с таблицами и выводами.`;

  // Нормализация source (как в AdsPage)
  const normalizeSource = (s: string | null | undefined): string => {
    if (!s) return '';
    if (SOURCE_LABELS[s]) return s;
    const keys = Object.keys(SOURCE_LABELS);
    for (const k of keys) {
      if (s.startsWith(k + '.') || s === SOURCE_LABELS[k]) return k;
    }
    return s;
  };

  // Применение сохранённого фильтра к массиву ads (аналог filteredAds из AdsPage)
  const applyFilterToAds = (ads: any[], state: Record<string, unknown>, addresses: any[]): any[] => {
    let result = ads;

    const sources = (state.sources as string[]) || [];
    const propertyTypes = (state.propertyTypes as string[]) || [];
    const categoryIds = (state.categoryIds as number[]) || [];
    const priceMin = (state.priceMin as string) || '';
    const priceMax = (state.priceMax as string) || '';
    const areaMin = (state.areaMin as string) || '';
    const areaMax = (state.areaMax as string) || '';
    const floorMin = (state.floorMin as string) || '';
    const floorMax = (state.floorMax as string) || '';
    const yearMin = (state.yearMin as string) || '';
    const yearMax = (state.yearMax as string) || '';
    const sellerTypes = (state.sellerTypes as string[]) || [];
    const status = (state.status as string) || '';
    const dateFrom = (state.dateFrom as string) || '';
    const dateTo = (state.dateTo as string) || '';
    const searchQuery = (state.searchQuery as string) || '';
    const processingStatus = (state.processingStatus as string) || '';
    const addressId = state.addressId as number | '' | undefined;
    const contactType = (state.contactType as string) || '';
    const processingCategoryId = state.processingCategoryId as number | '' | undefined;
    const processingFloor = (state.processingFloor as string) || '';
    const filterAddressIds = new Set((state.filterAddressIds as number[]) || []);
    const excludedAddressIds = new Set((state.excludedAddressIds as number[]) || []);
    const houseSeriesIds = (state.houseSeriesIds as string[]) || [];
    const wallMaterialIds = (state.wallMaterialIds as string[]) || [];
    const floorsMin = (state.floorsMin as string) || '';
    const floorsMax = (state.floorsMax as string) || '';

    if (status) result = result.filter(a => a.status === status);
    if (sources.length > 0) result = result.filter(a => sources.includes(normalizeSource(a.source)));
    if (propertyTypes.length > 0) result = result.filter(a => propertyTypes.includes(a.property_type));
    if (categoryIds.length > 0) result = result.filter(a => a.category_id != null && categoryIds.includes(a.category_id));
    if (priceMin) result = result.filter(a => a.price != null && a.price >= Number(priceMin));
    if (priceMax) result = result.filter(a => a.price != null && a.price <= Number(priceMax));
    if (areaMin) result = result.filter(a => a.area_total != null && a.area_total >= Number(areaMin));
    if (areaMax) result = result.filter(a => a.area_total != null && a.area_total <= Number(areaMax));
    if (floorMin) result = result.filter(a => a.floor != null && a.floor >= Number(floorMin));
    if (floorMax) result = result.filter(a => a.floor != null && a.floor <= Number(floorMax));
    if (yearMin) result = result.filter(a => { const y = a.year_built ?? a.house_details?.build_year; return y != null && y >= Number(yearMin); });
    if (yearMax) result = result.filter(a => { const y = a.year_built ?? a.house_details?.build_year; return y != null && y <= Number(yearMax); });
    if (sellerTypes.length > 0) result = result.filter(a => sellerTypes.includes(a.seller_info?.type || a.seller_type));
    if (dateFrom) result = result.filter(a => a.created && new Date(a.created) >= new Date(dateFrom));
    if (dateTo) result = result.filter(a => a.created && new Date(a.created) <= new Date(dateTo + 'T23:59:59'));
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(a => (a.address || '').toLowerCase().includes(q) || (a.title || '').toLowerCase().includes(q));
    }
    if (processingStatus === 'address_needed') {
      result = result.filter(a => a.processing_status === 'address_needed' || (a.address_id && (a.address_match_confidence === 'low' || a.address_match_confidence === 'very_low')));
    } else if (processingStatus === 'duplicate_check_needed') {
      result = result.filter(a => a.processing_status === 'duplicate_check_needed' && !a.object_id);
    } else if (processingStatus) {
      result = result.filter(a => a.processing_status === processingStatus);
    }
    if (addressId) result = result.filter(a => a.address_id === addressId);
    if (contactType) result = result.filter(a => (a.seller_info?.type || a.seller_type) === contactType);
    if (processingCategoryId) result = result.filter(a => a.category_id === processingCategoryId);
    if (processingFloor) result = result.filter(a => a.floor != null && a.floor === Number(processingFloor));
    if (filterAddressIds.size > 0) result = result.filter(a => a.address_id != null && filterAddressIds.has(a.address_id) && !excludedAddressIds.has(a.address_id));

    if (houseSeriesIds.length > 0 || wallMaterialIds.length > 0 || floorsMin || floorsMax) {
      const addrMap = new Map<number, any>();
      for (const addr of addresses) { if (addr.id != null) addrMap.set(addr.id, addr); }
      result = result.filter(a => {
        if (!a.address_id) return false;
        const addr = addrMap.get(a.address_id);
        if (!addr) return false;
        if (houseSeriesIds.length > 0 && (!addr.house_series_id || !houseSeriesIds.includes(addr.house_series_id))) return false;
        if (wallMaterialIds.length > 0 && (!addr.wall_material_id || !wallMaterialIds.includes(addr.wall_material_id))) return false;
        if (floorsMin && (!addr.floors_count || addr.floors_count < Number(floorsMin))) return false;
        if (floorsMax && (!addr.floors_count || addr.floors_count > Number(floorsMax))) return false;
        return true;
      });
    }

    return result;
  };

  // Предпросмотр количества при выборе фильтров
  useEffect(() => {
    if (selectedFilterIds.size === 0) {
      setFilteredPreviewCount(null);
      return;
    }
    (async () => {
      try {
        const allAds = await db.table('ads').toArray() as any[];
        const allAddresses = await db.table('ad_addresses').toArray() as any[];
        const selectedFilters = savedFilters.filter(f => selectedFilterIds.has(f.id));
        const combinedAdIds = new Set<number>();
        for (const filter of selectedFilters) {
          const filtered = applyFilterToAds(allAds, filter.state, allAddresses);
          for (const ad of filtered) { if (ad.id) combinedAdIds.add(ad.id); }
        }
        setFilteredPreviewCount(combinedAdIds.size);
      } catch {
        setFilteredPreviewCount(null);
      }
    })();
  }, [selectedFilterIds, savedFilters]);

  const handleExport = async () => {
    if (selectedFilterIds.size === 0) {
      alert('Выберите хотя бы один фильтр');
      return;
    }
    setExporting(true);
    try {
      const allAds = await db.table('ads').toArray() as any[];
      const allAddresses = await db.table('ad_addresses').toArray() as any[];
      const selectedFilters = savedFilters.filter(f => selectedFilterIds.has(f.id));

      // Объединяем результаты всех выбранных фильтров
      const combinedAdIds = new Set<number>();
      for (const filter of selectedFilters) {
        const filtered = applyFilterToAds(allAds, filter.state, allAddresses);
        for (const ad of filtered) { if (ad.id) combinedAdIds.add(ad.id); }
      }

      const filteredAds = allAds.filter(a => combinedAdIds.has(a.id));
      const objectIds = new Set(filteredAds.map(a => a.object_id).filter(Boolean));

      // Загружаем объекты
      const allObjects = objectIds.size > 0
        ? (await db.table('ad_objects').where('id').anyOf([...objectIds]).toArray()) as any[]
        : [];

      // Собираем ссылки на адреса (server_id + текст для поиска при импорте)
      const addressIds = new Set<number>();
      for (const ad of filteredAds) { if (ad.address_id) addressIds.add(ad.address_id); }
      for (const obj of allObjects) { if (obj.address_id) addressIds.add(obj.address_id); }
      const addressRefs = allAddresses
        .filter(a => addressIds.has(a.id))
        .map(a => ({ _local_id: a.id, server_id: a.server_id, address: a.address }));

      const data: Record<string, any> = {
        version: 2,
        exportedAt: new Date().toISOString(),
        filters: selectedFilters.map(f => ({
          name: f.name,
          groupName: savedGroups.find(g => g.id === f.groupId)?.name || null,
        })),
        ads: filteredAds.map(a => { const { id, ...rest } = a; return { _local_id: id, ...rest }; }),
        objects: allObjects.map(o => { const { id, ...rest } = o; return { _local_id: id, ...rest }; }),
        address_refs: addressRefs,
      };

      if (exportMode === 'prompt') {
        data.prompt = LLM_PROMPT;
      }

      const json = JSON.stringify(data, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const date = new Date().toISOString().slice(0, 10);
      a.download = `neocenka-data-${date}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert('Ошибка экспорта: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setExporting(false);
    }
  };

  const handleImport = async (file: File) => {
    setImportResult('');
    try {
      const text = await file.text();
      const data = JSON.parse(text);

      if (!data.version || data.version < 1) {
        throw new Error('Неподдерживаемый формат файла');
      }

      let importedObjects = 0;
      let importedAds = 0;
      let skippedObjects = 0;
      let skippedAds = 0;
      let unresolvedAddresses = 0;

      // Строим маппинг address_ref._local_id → локальный address.id
      const addressRefMap = new Map<number, number>();
      if (data.address_refs && Array.isArray(data.address_refs)) {
        const existingAddresses = await db.table('ad_addresses').toArray() as any[];
        const byServerId = new Map<number, any>();
        const byAddrText = new Map<string, any>();
        for (const a of existingAddresses) {
          if (a.server_id) byServerId.set(a.server_id, a);
          if (a.address) byAddrText.set(a.address.toLowerCase().trim(), a);
        }

        for (const ref of data.address_refs) {
          const existing = (ref.server_id && byServerId.get(ref.server_id))
            || (ref.address && byAddrText.get(ref.address.toLowerCase().trim()));
          if (existing) {
            addressRefMap.set(ref._local_id, existing.id);
          } else {
            unresolvedAddresses++;
          }
        }
      }

      // Импорт объектов
      const objectIdMap = new Map<number, number>();
      if (data.objects && Array.isArray(data.objects)) {
        const existingObjects = await db.table('ad_objects').toArray();
        const objKey = (o: any) => {
          const aid = addressRefMap.get(o.address_id) || o.address_id;
          return `${aid}_${o.property_type}_${o.area_total}`;
        };
        const existingObjKeys = new Set(existingObjects.map(o => objKey(o)));

        for (const obj of data.objects) {
          const { _local_id, ...fields } = obj;
          delete fields.id;

          // Перемаппить address_id через refs
          if (fields.address_id && addressRefMap.has(fields.address_id)) {
            fields.address_id = addressRefMap.get(fields.address_id)!;
          }

          const key = objKey(fields);
          if (existingObjKeys.has(key)) {
            const existing = existingObjects.find(o => objKey(o) === key);
            if (existing) objectIdMap.set(_local_id, existing.id!);
            skippedObjects++;
          } else {
            const newId = await db.table('ad_objects').add(fields);
            objectIdMap.set(_local_id, newId as number);
            importedObjects++;
          }
        }
      }

      // Импорт объявлений
      if (data.ads && Array.isArray(data.ads)) {
        const existingAds = await db.table('ads').toArray();
        const adKeys = new Set(existingAds.map(a => `${a.source}__${a.external_id}`));

        for (const ad of data.ads) {
          const { _local_id, ...fields } = ad;
          delete fields.id;

          // Перемаппить object_id и address_id
          if (fields.object_id && objectIdMap.has(fields.object_id)) {
            fields.object_id = objectIdMap.get(fields.object_id)!;
          }
          if (fields.address_id && addressRefMap.has(fields.address_id)) {
            fields.address_id = addressRefMap.get(fields.address_id)!;
          }

          const key = `${fields.source}__${fields.external_id}`;
          if (adKeys.has(key)) {
            skippedAds++;
          } else {
            await db.table('ads').add(fields);
            importedAds++;
          }
        }
      }

      const parts: string[] = [];
      if (data.objects) parts.push(`объектов: +${importedObjects}${skippedObjects ? ` (пропущено ${skippedObjects})` : ''}`);
      if (data.ads) parts.push(`объявлений: +${importedAds}${skippedAds ? ` (пропущено ${skippedAds})` : ''}`);
      if (unresolvedAddresses > 0) parts.push(`адресов не найдено: ${unresolvedAddresses}`);
      setImportResult(`Импортировано: ${parts.join(', ')}`);
    } catch (e) {
      setImportResult(`Ошибка: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const handleDeleteAddresses = async () => {
    if (!confirm('Удалить все загруженные адреса из локальной базы?')) return;
    setAddressDeleting(true);
    try {
      await addressSyncService.clearLocal();
      setAddressCount(0);
      setAddressLastSync(null);
      setAddressSyncResult(null);
    } catch (e) {
      setAddressError(e instanceof Error ? e.message : String(e));
    } finally {
      setAddressDeleting(false);
    }
  };

  const handleUnlinkAddresses = async () => {
    if (!confirm('Отвязать адреса от всех объявлений? Статус будет сброшен на «Требуется определение адреса».')) return;
    setAddressUnlinking(true);
    setAddressUnlinkResult(null);
    try {
      const result = await adsAddressService.unlinkAllAddresses();
      setAddressUnlinkResult(result.unlinked);
    } catch (e) {
      setAddressError(e instanceof Error ? e.message : String(e));
    } finally {
      setAddressUnlinking(false);
    }
  };

  const handleSubmitChanges = async () => {
    setAddressSubmitting(true);
    setAddressSubmitResult(null);
    setAddressError('');
    try {
      const result = await addressSyncService.submitChanges();
      setAddressSubmitResult(result);
    } catch (e) {
      setAddressError(e instanceof Error ? e.message : String(e));
    } finally {
      setAddressSubmitting(false);
    }
  };

  const handleSyncAddresses = async () => {
    if (selectedSyncRegions.length === 0) {
      setAddressError('Выберите хотя бы один регион для загрузки');
      return;
    }

    setAddressSyncing(true);
    setAddressError('');
    setAddressSyncResult(null);
    setAddressProgress(null);

    try {
      const result = await addressSyncService.syncFromServer(selectedSyncRegions, (loaded, total) => {
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

  const toggleSyncRegion = (code: string) => {
    setSelectedSyncRegions(prev => {
      const next = prev.includes(code) ? prev.filter(r => r !== code) : [...prev, code];
      saveToStorage(STORAGE_KEY_SYNC_REGIONS, next);
      return next;
    });
  };

  const handleOpenRegionPicker = async () => {
    setShowRegionPicker(true);
    setRegionSearch('');
    if (Object.keys(regionStats).length === 0) {
      setRegionStatsLoading(true);
      try {
        const stats = await getAddressesStats();
        setRegionStats(stats.by_region || {});
      } catch {
        // Не критично
      } finally {
        setRegionStatsLoading(false);
      }
    }
  };

  // Фильтрованный список регионов
  const filteredRegions = useMemo(() => {
    const entries = Object.entries(REGION_CENTERS).sort(([a], [b]) => a.localeCompare(b));
    if (!regionSearch) return entries;
    const q = regionSearch.toLowerCase();
    return entries.filter(([code, info]) =>
      code.includes(q) || info.name.toLowerCase().includes(q)
    );
  }, [regionSearch]);

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto p-6 space-y-6">
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-white">Настройки</h1>

        {/* Подключение через сервер — информация о подписке */}
        <div className="rounded-xl bg-white p-5 shadow-sm dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 space-y-3">
          <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Подключение к источникам данных</h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Загрузка объявлений осуществляется через сервер Неоценка.
            Данные предоставляются из доступных источников (Авито, ЦИАН, Домклик и др.).
          </p>

          {adsModule?.access ? (
            <>
              {/* Активная подписка */}
              {(() => {
                const isExpired = adsModule.access.expires_at && new Date(adsModule.access.expires_at) < new Date();
                const isTrial = adsModule.access.period === 'trial';
                const isCompany = adsModule.access.source === 'company';
                const expiresAt = adsModule.access.expires_at
                  ? new Date(adsModule.access.expires_at).toLocaleDateString('ru-RU')
                  : null;
                const regionNames = adsModule.access.regions.includes('*')
                  ? 'Все регионы'
                  : adsModule.access.regions.map(code => {
                      const found = adsModule.available_regions?.find(r => r.code === code);
                      return found ? found.name : code;
                    }).join(', ');
                const daysLeft = adsModule.access.expires_at
                  ? Math.ceil((new Date(adsModule.access.expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
                  : null;

                if (isExpired) {
                  return (
                    <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-3 space-y-1.5">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white text-xs font-bold">!</span>
                        <span className="text-sm text-red-700 dark:text-red-400 font-medium">
                          {isCompany ? 'Корпоративная лицензия истекла' : 'Подписка истекла'}
                        </span>
                      </div>
                      <p className="text-xs text-red-600 dark:text-red-400">
                        Доступ к данным приостановлен. {isCompany ? 'Обратитесь к администратору компании.' : 'Для возобновления перейдите в «Мои модули».'}
                      </p>
                    </div>
                  );
                }

                return (
                  <div className="rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 p-3 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-green-500 text-white text-xs font-bold">✓</span>
                      <span className="text-sm text-green-700 dark:text-green-400 font-medium">
                        {isCompany ? 'Корпоративная лицензия' : isTrial ? 'Пробный период' : 'Подписка активна'}
                      </span>
                    </div>
                    {expiresAt && (
                      <p className="text-xs text-green-700 dark:text-green-300">
                        Действует до: {expiresAt}
                        {daysLeft !== null && daysLeft <= 7 && (
                          <span className="text-amber-600 dark:text-amber-400 ml-1">({daysLeft} дн.)</span>
                        )}
                      </p>
                    )}
                    <p className="text-xs text-green-700 dark:text-green-300">
                      Регионы: {regionNames}
                    </p>
                  </div>
                );
              })()}
            </>
          ) : adsModule?.pending_payment ? (
            /* Ожидает платёж */
            <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-3 space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-amber-500 text-white text-xs font-bold">⏳</span>
                <span className="text-sm text-amber-700 dark:text-amber-400 font-medium">Ожидает подтверждения оплаты</span>
              </div>
              <p className="text-xs text-amber-600 dark:text-amber-400">
                Заявка отправлена {new Date(adsModule.pending_payment.created_at).toLocaleDateString('ru-RU')}. Администратор подтвердит в ближайшее время.
              </p>
            </div>
          ) : (
            /* Нет подписки */
            <div className="rounded-lg bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 p-3 space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-zinc-400 text-white text-xs font-bold">—</span>
                <span className="text-sm text-zinc-600 dark:text-zinc-400 font-medium">Нет активной подписки</span>
              </div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Для доступа к данным оформите подписку в разделе «Мои модули».
              </p>
            </div>
          )}
        </div>

        {/* Адресная база — синхронизация */}
        <div className="rounded-xl bg-white p-5 shadow-sm dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 space-y-3">
          <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Адресная база</h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Загрузка адресов с характеристиками домов с сервера. Адреса используются для привязки объявлений и отображения на карте.
          </p>

          {/* Выбор регионов */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <button
                onClick={handleOpenRegionPicker}
                className="rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-600"
              >
                Выбрать регионы
              </button>
              {selectedSyncRegions.length > 0 && (
                <span className="text-xs text-zinc-500 dark:text-zinc-400">
                  Выбрано: {selectedSyncRegions.length} — {selectedSyncRegions.slice(0, 3).map(r => REGION_CENTERS[r]?.name || r).join(', ')}{selectedSyncRegions.length > 3 ? '...' : ''}
                </span>
              )}
            </div>

            {/* Выбранные регионы — чипы */}
            {selectedSyncRegions.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {selectedSyncRegions.map(code => (
                  <button
                    key={code}
                    onClick={() => toggleSyncRegion(code)}
                    className="inline-flex items-center gap-1 rounded-md bg-blue-100 dark:bg-blue-900/30 px-2 py-0.5 text-xs font-medium text-blue-700 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-900/50"
                  >
                    {REGION_CENTERS[code]?.name || code}
                    <span className="text-blue-400 dark:text-blue-500">&times;</span>
                  </button>
                ))}
                <button
                  onClick={() => { setSelectedSyncRegions([]); saveToStorage(STORAGE_KEY_SYNC_REGIONS, []); }}
                  className="text-xs text-zinc-400 hover:text-red-500 ml-1"
                >
                  Очистить
                </button>
              </div>
            )}

            {/* Модальное окно выбора регионов */}
            {showRegionPicker && (
              <div className="border border-zinc-200 dark:border-zinc-600 rounded-lg bg-white dark:bg-zinc-800 shadow-lg max-h-80 flex flex-col">
                <div className="p-2 border-b border-zinc-200 dark:border-zinc-700 flex items-center justify-between gap-2">
                  <input
                    type="text"
                    value={regionSearch}
                    onChange={e => setRegionSearch(e.target.value)}
                    placeholder="Поиск региона..."
                    className="flex-1 rounded border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-700 px-2 py-1 text-xs text-zinc-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                    autoFocus
                  />
                  <button
                    onClick={() => setShowRegionPicker(false)}
                    className="text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
                  >
                    Закрыть
                  </button>
                </div>
                <div className="overflow-y-auto flex-1 p-1">
                  {regionStatsLoading && (
                    <div className="text-xs text-zinc-400 p-2 text-center">Загрузка статистики...</div>
                  )}
                  {!regionStatsLoading && filteredRegions.map(([code, info]) => {
                    const cnt = regionStats[code];
                    return (
                      <label
                        key={code}
                        className="flex items-center gap-2 px-2 py-1 hover:bg-zinc-50 dark:hover:bg-zinc-700 rounded cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={selectedSyncRegions.includes(code)}
                          onChange={() => toggleSyncRegion(code)}
                          className="rounded border-zinc-300 dark:border-zinc-600 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-xs text-zinc-700 dark:text-zinc-300 flex-1">
                          {code} — {info.name}
                        </span>
                        {cnt !== undefined && (
                          <span className="text-xs text-zinc-400">{cnt.toLocaleString('ru-RU')}</span>
                        )}
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={handleSyncAddresses}
              disabled={addressSyncing || selectedSyncRegions.length === 0}
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
            {addressCount > 0 && (
              <button
                onClick={handleDeleteAddresses}
                disabled={addressDeleting || addressSyncing}
                className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {addressDeleting ? 'Удаление...' : 'Удалить адреса'}
              </button>
            )}
            <button
              onClick={handleUnlinkAddresses}
              disabled={addressUnlinking}
              className="rounded-md bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {addressUnlinking ? 'Отвязка...' : 'Отвязать от объявлений'}
            </button>
            <button
              onClick={handleSubmitChanges}
              disabled={addressSubmitting}
              className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {addressSubmitting ? 'Отправка...' : 'Отправить на модерацию'}
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

          {addressUnlinkResult !== null && (
            <div className="rounded-md bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 px-3 py-2 text-sm text-orange-700 dark:text-orange-300">
              Отвязано адресов от объявлений: {addressUnlinkResult.toLocaleString('ru-RU')}. Статус сброшен на «Требуется определение адреса».
            </div>
          )}

          {addressSubmitResult && (
            <div className="rounded-md bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">
              Отправлено предложений на модерацию: {addressSubmitResult.submitted}. Администратор рассмотрит изменения.
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
                  ? `${section.title}`
                  : 'Без раздела';
                const sectionId = categories[0]?.section_id ?? 0;
                const allSectionSelected = categories.every(c => selectedCategoryIds.includes(c.source_id));

                return (
                  <div key={sectionId} className="space-y-1.5">
                    <button
                      onClick={() => selectAllInSection(sectionId)}
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
                          key={cat.source_id}
                          onClick={() => toggleCategory(cat.source_id)}
                          className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                            selectedCategoryIds.includes(cat.source_id)
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

        {/* Источники для загрузки */}
        <div className="rounded-xl bg-white p-5 shadow-sm dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Источники для загрузки
            </h2>
            <span className="text-xs text-zinc-500 dark:text-zinc-400">
              Выбрано: {selectedSourceIds.length} из {Object.keys(SOURCE_IDS).length}
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
              const id = SOURCE_IDS[key];
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
        {/* Экспорт/Импорт данных */}
        <div className="rounded-xl bg-white p-5 shadow-sm dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 space-y-4">
          <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Экспорт / Импорт данных
          </h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Выберите сохранённые фильтры для экспорта данных. Экспортируются объявления, объекты и ссылки на адреса.
            Адреса и сделки Росреестра должны быть загружены в целевом расширении до импорта.
          </p>

          {/* Список сохранённых фильтров */}
          {savedFilters.length === 0 ? (
            <div className="rounded-lg bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 p-3 text-xs text-zinc-500 dark:text-zinc-400 text-center">
              Нет сохранённых фильтров. Создайте фильтры на странице поиска объявлений.
            </div>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {/* Фильтры без группы */}
              {savedFilters
                .filter(f => !f.groupId)
                .sort((a, b) => a.sortOrder - b.sortOrder)
                .map(filter => (
                  <label key={filter.id} className="flex items-center gap-2 px-2 py-1.5 hover:bg-zinc-50 dark:hover:bg-zinc-800 rounded cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedFilterIds.has(filter.id)}
                      onChange={() => setSelectedFilterIds(prev => {
                        const next = new Set(prev);
                        if (next.has(filter.id)) next.delete(filter.id); else next.add(filter.id);
                        return next;
                      })}
                      className="rounded border-zinc-300 dark:border-zinc-600 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-xs text-zinc-700 dark:text-zinc-300 flex-1">{filter.name}</span>
                  </label>
                ))
              }
              {/* Фильтры по группам */}
              {savedGroups
                .sort((a, b) => a.sortOrder - b.sortOrder)
                .map(group => {
                  const groupFilters = savedFilters
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
                        <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400" style={{ color: group.color || undefined }}>
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
                              onChange={() => setSelectedFilterIds(prev => {
                                const next = new Set(prev);
                                if (next.has(filter.id)) next.delete(filter.id); else next.add(filter.id);
                                return next;
                              })}
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
          )}

          {/* Выбрано / Предпросмотр */}
          {selectedFilterIds.size > 0 && (
            <div className="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
              <span>Выбрано фильтров: {selectedFilterIds.size}</span>
              {filteredPreviewCount !== null && (
                <span>Найдено объявлений: {filteredPreviewCount.toLocaleString('ru-RU')}</span>
              )}
            </div>
          )}

          {/* Режим экспорта */}
          <div className="space-y-2">
            <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400 uppercase">Режим</span>
            <div className="flex gap-2">
              <button
                onClick={() => setExportMode('data')}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  exportMode === 'data'
                    ? 'bg-blue-600 text-white'
                    : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700'
                }`}
              >
                Данные
              </button>
              <button
                onClick={() => setExportMode('prompt')}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  exportMode === 'prompt'
                    ? 'bg-blue-600 text-white'
                    : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700'
                }`}
              >
                Данные с промптом
              </button>
            </div>
            {exportMode === 'prompt' && (
              <p className="text-[10px] text-zinc-400">
                К JSON-файлу будет добавлен промпт для LLM-модели с задачей анализа данных и оценки стоимости/сроков продажи недвижимости.
              </p>
            )}
          </div>

          {/* Кнопки */}
          <div className="flex items-center gap-3">
            <button
              onClick={handleExport}
              disabled={selectedFilterIds.size === 0 || exporting}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {exporting ? (
                <>
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Экспорт...
                </>
              ) : (
                <>
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                  Экспорт
                </>
              )}
            </button>
            <button
              onClick={() => importRef.current?.click()}
              className="rounded-md bg-zinc-100 dark:bg-zinc-800 px-4 py-2 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 flex items-center gap-2"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
              Импорт
            </button>
            <input
              ref={importRef}
              type="file"
              accept=".json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleImport(file);
                e.target.value = '';
              }}
            />
            {importResult && (
              <span className="text-xs text-green-600 dark:text-green-400">{importResult}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdsSettingsPage;
