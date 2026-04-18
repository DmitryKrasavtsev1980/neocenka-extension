import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { dealsRepository, getDatabaseStats, cadastralRepository } from '@/db';
import { Deal, SearchFilters, SearchResult, DealsStats, CadastralQuarter, SearchAggregates } from '@/types';
import {
  REAL_ESTATE_TYPES,
  DOCUMENT_TYPES,
  WALL_MATERIALS,
  getRealEstateTypeName,
  getWallMaterialName,
} from '@/constants/catalogs';
import { REGION_CENTERS } from '@/constants/regions';
import { Dashboard } from '@/components/Dashboard';
import DealMap from '@/components/DealMap';
import SearchByPolygon from '@/components/SearchByPolygon/SearchByPolygon';
import { Button } from '@/components/catalyst/button';
import { Input } from '@/components/catalyst/input';
import { Checkbox, CheckboxField } from '@/components/catalyst/checkbox';
import { Badge } from '@/components/catalyst/badge';
import { Heading } from '@/components/catalyst/heading';
import {
  ArrowDownTrayIcon,
  FunnelIcon,
  XMarkIcon,
  ChevronDownIcon,
  BookmarkSquareIcon,
  ArrowPathIcon,
} from '@heroicons/react/16/solid';
import SavedFiltersPanel, { SavedFilterState } from './SavedFiltersPanel';
import SegmentationPanel from './SegmentationPanel';

type SortField = 'period' | 'price' | 'area' | 'year_quarter' | 'floor' | 'year_build' | 'type' | 'material' | 'doc';
type SortOrder = 'asc' | 'desc';

interface SearchPageProps {
  onNavigate?: (page: 'modules' | 'search' | 'import' | 'profile') => void;
}

export const SearchPage: React.FC<SearchPageProps> = ({ onNavigate }) => {
  const [stats, setStats] = useState<DealsStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [aggregates, setAggregates] = useState<SearchAggregates | null>(null);
  const [page, setPage] = useState(1);
  const [initialLoadDone, setInitialLoadDone] = useState(false);
  const [searchTrigger, setSearchTrigger] = useState(0);

  const [sortField, setSortField] = useState<SortField>('period');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [pageSize, setPageSize] = useState<number>(25);

  const [selectedRegions, setSelectedRegions] = useState<string[]>([]);
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [selectedDocTypes, setSelectedDocTypes] = useState<string[]>([]);
  const [selectedPeriods, setSelectedPeriods] = useState<string[]>([]);
  const [selectedWallMaterials, setSelectedWallMaterials] = useState<string[]>([]);
  const [priceMin, setPriceMin] = useState<string>('');
  const [priceMax, setPriceMax] = useState<string>('');
  const [areaMin, setAreaMin] = useState<string>('');
  const [areaMax, setAreaMax] = useState<string>('');
  const [floorMin, setFloorMin] = useState<string>('');
  const [floorMax, setFloorMax] = useState<string>('');
  const [yearBuildMin, setYearBuildMin] = useState<string>('');
  const [yearBuildMax, setYearBuildMax] = useState<string>('');
  const [searchCity, setSearchCity] = useState('');
  const [searchStreet, setSearchStreet] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [selectedDealForMap, setSelectedDealForMap] = useState<Deal | null>(null);
  const [cadastralQuarters, setCadastralQuarters] = useState<CadastralQuarter[]>([]);
  const [selectedCadNumbers, setSelectedCadNumbers] = useState<string[]>([]);
  const [showMapFilter, setShowMapFilter] = useState(false);
  const [availableWallMaterials, setAvailableWallMaterials] = useState<string[] | null>(null);
  const [wallMaterialsLoading, setWallMaterialsLoading] = useState(false);
  const [polygonsCoords, setPolygonsCoords] = useState<[number, number][][] | null>(() => {
    try {
      const saved = localStorage.getItem('ret_polygon_coords');
      if (!saved) return null;
      const parsed = JSON.parse(saved);
      // Совместимость: старый формат — один полигон [number, number][]
      if (parsed && Array.isArray(parsed) && parsed.length > 0 && Array.isArray(parsed[0]) && !Array.isArray(parsed[0][0])) {
        return [parsed];
      }
      return parsed;
    } catch { return null; }
  });
  const [flyToTarget, setFlyToTarget] = useState<{ lat: number; lon: number; zoom: number } | null>(null);
  const [showSavedPanel, setShowSavedPanel] = useState(false);
  const [activeFilterId, setActiveFilterId] = useState<string | null>(null);
  const [activeFilterName, setActiveFilterName] = useState<string | null>(null);
  const [activeFilterGroupName, setActiveFilterGroupName] = useState<string | null>(null);
  const [activeFilterStateJson, setActiveFilterStateJson] = useState<string | null>(null);
  const pendingFilterSyncRef = useRef(false);
  const getCurrentFilterStateRef = useRef<(() => SavedFilterState) | null>(null);

  // Регионы с данными из справочника для навигации по карте
  const loadedRegions = useMemo(() => {
    if (!stats) return [];
    return stats.regions
      .map((code) => ({ code, ...REGION_CENTERS[code] }))
      .filter((r) => r.name);
  }, [stats]);

  const handleFlyToRegion = (regionCode: string) => {
    const info = REGION_CENTERS[regionCode];
    if (!info) return;
    // Сбрасываем в null чтобы повторный клик на тот же регион тоже работал
    setFlyToTarget(null);
    requestAnimationFrame(() => {
      setFlyToTarget({ lat: info.lat, lon: info.lon, zoom: info.zoom });
    });
  };

  const availablePeriods = useMemo(() => {
    if (!stats) return [];
    const periods: string[] = [];
    stats.years.forEach((year) => {
      [1, 2, 3, 4].forEach((q) => {
        periods.push(`${year}-Q${q}`);
      });
    });
    return periods;
  }, [stats]);

  useEffect(() => {
    loadStats();
    loadCadastralQuarters();
  }, []);

  const loadCadastralQuarters = async () => {
    const quarters = await cadastralRepository.getAllWithGeojson();
    setCadastralQuarters(quarters);
  };

  const loadStats = async () => {
    const dbStats = await getDatabaseStats();
    setStats(dbStats);
  };

  // === Filter persistence ===
  const LAST_FILTER_KEY = 'ret_last_filter';

  const getCurrentFilterState = useCallback((): SavedFilterState => ({
    selectedRegions, selectedTypes, selectedDocTypes, selectedPeriods, selectedWallMaterials,
    priceMin, priceMax, areaMin, areaMax, floorMin, floorMax, yearBuildMin, yearBuildMax,
    searchCity, searchStreet, selectedCadNumbers, polygonCoords: polygonsCoords,
  }), [selectedRegions, selectedTypes, selectedDocTypes, selectedPeriods, selectedWallMaterials,
    priceMin, priceMax, areaMin, areaMax, floorMin, floorMax, yearBuildMin, yearBuildMax,
    searchCity, searchStreet, selectedCadNumbers, polygonsCoords]);
  getCurrentFilterStateRef.current = getCurrentFilterState;

  const saveCurrentFilter = useCallback(() => {
    const state = getCurrentFilterState();
    chrome.storage.local.set({ [LAST_FILTER_KEY]: JSON.stringify(state) });
  }, [getCurrentFilterState]);

  const restoreLastFilter = useCallback(async (): Promise<SavedFilterState | null> => {
    return new Promise((resolve) => {
      chrome.storage.local.get(LAST_FILTER_KEY, (result: any) => {
        const raw = result?.[LAST_FILTER_KEY];
        if (!raw) { resolve(null); return; }
        try { resolve(JSON.parse(raw)); }
        catch { resolve(null); }
      });
    });
  }, []);

  const applyFilterState = useCallback((state: SavedFilterState) => {
    setSelectedRegions(state.selectedRegions);
    setSelectedTypes(state.selectedTypes);
    setSelectedDocTypes(state.selectedDocTypes);
    setSelectedPeriods(state.selectedPeriods);
    setSelectedWallMaterials(state.selectedWallMaterials);
    setPriceMin(state.priceMin);
    setPriceMax(state.priceMax);
    setAreaMin(state.areaMin);
    setAreaMax(state.areaMax);
    setFloorMin(state.floorMin);
    setFloorMax(state.floorMax);
    setYearBuildMin(state.yearBuildMin);
    setYearBuildMax(state.yearBuildMax);
    setSearchCity(state.searchCity);
    setSearchStreet(state.searchStreet);
    setSelectedCadNumbers(state.selectedCadNumbers);
    if (state.polygonCoords) {
      setPolygonsCoords(state.polygonCoords);
      localStorage.setItem('ret_polygon_coords', JSON.stringify(state.polygonCoords));
    } else {
      setPolygonsCoords(null);
      localStorage.removeItem('ret_polygon_coords');
    }
    setPage(1);
  }, []);

  // Filter summary text
  const filterSummary = useMemo(() => {
    const parts: string[] = [];
    if (searchCity) parts.push(searchCity);
    if (searchStreet) parts.push(searchStreet);
    if (selectedCadNumbers.length > 0) parts.push(`${selectedCadNumbers.length} кв.`);
    else if (polygonsCoords) parts.push(`${polygonsCoords.length} полигон(ов)`);
    if (selectedPeriods.length > 0) {
      const years = new Set(selectedPeriods.map(p => p.split('-')[0]));
      if (selectedPeriods.length <= 3) {
        parts.push(selectedPeriods.map(p => p.replace('Q', 'К')).join(', '));
      } else if (years.size === 1) {
        parts.push(`${years.values().next().value} (${selectedPeriods.length} кв.)`);
      } else {
        parts.push(`${selectedPeriods.length} периодов`);
      }
    }
    if (selectedTypes.length > 0) {
      const names = selectedTypes.map(t => getRealEstateTypeName(t).substring(0, 10));
      parts.push(names.join(', '));
    }
    if (selectedDocTypes.length > 0) parts.push(`${selectedDocTypes.length} док.`);
    if (selectedWallMaterials.length > 0) {
      const names = selectedWallMaterials.map(m => getWallMaterialName(m).substring(0, 10));
      parts.push(names.join(', '));
    }
    if (priceMin || priceMax) {
      const min = priceMin ? `${(parseFloat(priceMin) / 1000).toFixed(0)}K` : '';
      const max = priceMax ? `${(parseFloat(priceMax) / 1000).toFixed(0)}K` : '';
      parts.push(`Цена ${min}-${max}`);
    }
    if (areaMin || areaMax) {
      const min = areaMin || '';
      const max = areaMax || '';
      parts.push(`Площ. ${min}-${max}`);
    }
    if (floorMin || floorMax) parts.push(`Этаж ${floorMin || '?'}-${floorMax || '?'}`);
    if (yearBuildMin || yearBuildMax) parts.push(`Год ${yearBuildMin || '?'}-${yearBuildMax || '?'}`);
    return parts.length > 0 ? parts.join(' • ') : 'Все сделки';
  }, [searchCity, searchStreet, selectedCadNumbers, polygonsCoords, selectedPeriods, selectedTypes, selectedDocTypes, selectedWallMaterials, priceMin, priceMax, areaMin, areaMax, floorMin, floorMax, yearBuildMin, yearBuildMax]);

  const doSearch = useCallback(async () => {
    setLoading(true);
    try {
      let yearQuartersFilter: string[] | undefined;
      if (selectedPeriods.length > 0) {
        yearQuartersFilter = selectedPeriods;
      }

      const searchFilters: SearchFilters = {
        region_codes: selectedRegions.length > 0 ? selectedRegions : undefined,
        realestate_type_codes: selectedTypes.length > 0 ? selectedTypes : undefined,
        doc_types: selectedDocTypes.length > 0 ? selectedDocTypes : undefined,
        year_quarters: yearQuartersFilter,
        price_min: priceMin ? parseFloat(priceMin) : undefined,
        price_max: priceMax ? parseFloat(priceMax) : undefined,
        area_min: areaMin ? parseFloat(areaMin) : undefined,
        area_max: areaMax ? parseFloat(areaMax) : undefined,
        floor_min: floorMin ? parseInt(floorMin) : undefined,
        floor_max: floorMax ? parseInt(floorMax) : undefined,
        year_build_min: yearBuildMin ? parseInt(yearBuildMin) : undefined,
        year_build_max: yearBuildMax ? parseInt(yearBuildMax) : undefined,
        wall_material_codes: selectedWallMaterials.length > 0 ? selectedWallMaterials : undefined,
        search_city: searchCity || undefined,
        search_street: searchStreet || undefined,
        quarter_cad_numbers: selectedCadNumbers.length > 0 ? selectedCadNumbers : undefined,
      };

      const lightResult = await dealsRepository.searchLight(searchFilters, page, pageSize, sortField, sortOrder);
      setResult({
        deals: lightResult.pageDeals,
        total: lightResult.totalCount,
        page,
        pageSize,
        totalPages: lightResult.totalPages,
      });
      setAggregates(lightResult.aggregates);
      saveCurrentFilter();
    } catch (error) {
      console.error('Ошибка поиска:', error);
    } finally {
      setLoading(false);
    }
  }, [selectedRegions, selectedTypes, selectedDocTypes, selectedPeriods, selectedWallMaterials, priceMin, priceMax, areaMin, areaMax, floorMin, floorMax, yearBuildMin, yearBuildMax, searchCity, searchStreet, selectedCadNumbers, page, pageSize, sortField, sortOrder, saveCurrentFilter]);

  // Trigger doSearch after state has been committed (avoids stale closure)
  useEffect(() => {
    if (searchTrigger > 0) doSearch();
  }, [searchTrigger]); // eslint-disable-line react-hooks/exhaustive-deps

  // Initial load: restore saved filter and search
  useEffect(() => {
    if (!stats || initialLoadDone) return;
    if (stats.totalDeals > 0) {
      restoreLastFilter().then((saved) => {
        if (saved) applyFilterState(saved);
        setSearchTrigger(n => n + 1);
        setInitialLoadDone(true);
      });
    } else {
      setInitialLoadDone(true);
    }
  }, [stats, initialLoadDone, restoreLastFilter, applyFilterState]);

  // Пагинация полностью клиентская — useEffect не нужен

  const handleSearch = () => {
    setPage(1);
    doSearch();
  };

  const handleApplySavedFilter = (state: SavedFilterState, filterId?: string, filterName?: string, groupName?: string) => {
    applyFilterState(state);
    setActiveFilterId(filterId ?? null);
    setActiveFilterName(filterName ?? null);
    setActiveFilterGroupName(groupName ?? null);
    setActiveFilterStateJson(filterId ? JSON.stringify(state) : null);
    pendingFilterSyncRef.current = !!filterId;
    setSearchTrigger(n => n + 1);
  };

  // Проверяем, изменился ли активный фильтр
  const filterChanged = useMemo(() => {
    if (!activeFilterId || !activeFilterStateJson) return false;
    const current = getCurrentFilterState();
    return JSON.stringify(current) !== activeFilterStateJson;
  }, [activeFilterId, activeFilterStateJson, getCurrentFilterState]);

  // After applying a saved filter, re-sync activeFilterStateJson once state settles
  // (coordinates may drift slightly through Leaflet round-trip)
  useEffect(() => {
    if (!pendingFilterSyncRef.current || !activeFilterId) return;
    const timer = setTimeout(() => {
      pendingFilterSyncRef.current = false;
      setActiveFilterStateJson(JSON.stringify(getCurrentFilterStateRef.current()));
    }, 300);
    return () => clearTimeout(timer);
  }, [getCurrentFilterState, activeFilterId]);

  const handleCancelFilterChanges = () => {
    if (!activeFilterStateJson) return;
    const savedState = JSON.parse(activeFilterStateJson) as SavedFilterState;
    applyFilterState(savedState);
    pendingFilterSyncRef.current = true;
    setSearchTrigger(n => n + 1);
  };

  const handleReset = () => {
    setSelectedRegions([]);
    setSelectedTypes([]);
    setSelectedDocTypes([]);
    setSelectedPeriods([]);
    setSelectedWallMaterials([]);
    setPriceMin('');
    setPriceMax('');
    setAreaMin('');
    setAreaMax('');
    setFloorMin('');
    setFloorMax('');
    setYearBuildMin('');
    setYearBuildMax('');
    setSearchCity('');
    setSearchStreet('');
    setSelectedCadNumbers([]);
    setPolygonsCoords(null);
    localStorage.removeItem('ret_polygon_coords');
    setActiveFilterId(null);
    setActiveFilterName(null);
    setActiveFilterGroupName(null);
    setActiveFilterStateJson(null);
    setPage(1);
    setResult(null);
    setAggregates(null);
  };

  const prevCadNumbersRef = useRef<string[]>([]);
  const handleQuartersSelected = (cadNumbers: string[], polysCoords?: [number, number][][]) => {
    const changed = cadNumbers.length !== prevCadNumbersRef.current.length
      || cadNumbers.some((cn, i) => cn !== prevCadNumbersRef.current[i]);
    prevCadNumbersRef.current = cadNumbers;
    setSelectedCadNumbers(cadNumbers);

    // Update wall materials directly for reliability
    if (cadNumbers.length > 0) {
      setWallMaterialsLoading(true);
      dealsRepository.getWallMaterialsByCadNumbers(cadNumbers).then(codes => {
        const normalized = codes.map(code => {
          if (WALL_MATERIALS[code]) return code;
          if (code.startsWith('0') && WALL_MATERIALS[code.substring(1)]) return code.substring(1);
          if (WALL_MATERIALS['0' + code]) return '0' + code;
          return code;
        });
        setAvailableWallMaterials(normalized);
        setWallMaterialsLoading(false);
      });
    } else {
      setAvailableWallMaterials(null);
      setWallMaterialsLoading(false);
    }

    if (polysCoords && polysCoords.length > 0) {
      setPolygonsCoords(polysCoords);
      localStorage.setItem('ret_polygon_coords', JSON.stringify(polysCoords));
    } else if (cadNumbers.length === 0) {
      setPolygonsCoords(null);
      localStorage.removeItem('ret_polygon_coords');
    }
    if (changed) setPage(1);
  };

  const toggleRegion = (region: string) => {
    setSelectedRegions((prev) =>
      prev.includes(region) ? prev.filter((r) => r !== region) : [...prev, region]
    );
  };

  const handleSetAreaRange = (min: string, max: string) => {
    setAreaMin(min);
    setAreaMax(max);
    setShowFilters(true);
    setPage(1);
    setTimeout(() => doSearch(), 0);
  };

  const toggleType = (type: string) => {
    setSelectedTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
  };

  const toggleDocType = (docType: string) => {
    setSelectedDocTypes((prev) =>
      prev.includes(docType) ? prev.filter((d) => d !== docType) : [...prev, docType]
    );
  };

  const toggleWallMaterial = (material: string) => {
    setSelectedWallMaterials((prev) =>
      prev.includes(material) ? prev.filter((m) => m !== material) : [...prev, material]
    );
  };

  const togglePeriod = (period: string) => {
    setSelectedPeriods((prev) =>
      prev.includes(period) ? prev.filter((p) => p !== period) : [...prev, period]
    );
  };

  const selectAllPeriods = () => {
    setSelectedPeriods(availablePeriods);
  };

  const clearPeriods = () => {
    setSelectedPeriods([]);
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
    setSearchTrigger((n) => n + 1);
  };


  const formatNumber = (num: number): string => {
    return new Intl.NumberFormat('ru-RU').format(num);
  };

  const formatPrice = (price: number): string => {
    return formatNumber(Math.round(price));
  };

  const formatPricePerMeter = (price: number, area: number): string | null => {
    if (!area || area <= 0) return null;
    const pricePerMeter = Math.round(price / area);
    return `${formatNumber(pricePerMeter)} ₽/м²`;
  };

  const formatPeriod = (yearQuarter: string): string => {
    const [year, quarter] = yearQuarter.split('-Q');
    return `Q${quarter} ${year}`;
  };

  const getSortIcon = (field: SortField): string => {
    if (sortField !== field) return '⇅';
    return sortOrder === 'asc' ? '↑' : '↓';
  };

  const exportToHtml = async () => {
    // Загружаем все сделки по текущему фильтру по требованию (ленивая загрузка)
    const searchFilters: SearchFilters = {
      region_codes: selectedRegions.length > 0 ? selectedRegions : undefined,
      realestate_type_codes: selectedTypes.length > 0 ? selectedTypes : undefined,
      doc_types: selectedDocTypes.length > 0 ? selectedDocTypes : undefined,
      year_quarters: selectedPeriods.length > 0 ? selectedPeriods : undefined,
      price_min: priceMin ? parseFloat(priceMin) : undefined,
      price_max: priceMax ? parseFloat(priceMax) : undefined,
      area_min: areaMin ? parseFloat(areaMin) : undefined,
      area_max: areaMax ? parseFloat(areaMax) : undefined,
      floor_min: floorMin ? parseInt(floorMin) : undefined,
      floor_max: floorMax ? parseInt(floorMax) : undefined,
      year_build_min: yearBuildMin ? parseInt(yearBuildMin) : undefined,
      year_build_max: yearBuildMax ? parseInt(yearBuildMax) : undefined,
      wall_material_codes: selectedWallMaterials.length > 0 ? selectedWallMaterials : undefined,
      search_city: searchCity || undefined,
      search_street: searchStreet || undefined,
      quarter_cad_numbers: selectedCadNumbers.length > 0 ? selectedCadNumbers : undefined,
    };
    const deals = await dealsRepository.searchAll(searchFilters);
    if (deals.length === 0) {
      alert('Нет данных для экспорта');
      return;
    }

    const totalSum = deals.reduce((acc, d) => acc + d.deal_price, 0);
    const avgPrice = Math.round(totalSum / deals.length);
    const prices = deals.map(d => d.deal_price).filter(p => p > 0).sort((a, b) => a - b);
    const medianPrice = prices.length > 0 ? prices[Math.floor(prices.length / 2)] : 0;
    const areas = deals.map(d => d.area).filter(a => a > 0);
    const avgArea = areas.length > 0 ? Math.round(areas.reduce((a, b) => a + b, 0) / areas.length) : 0;

    const filterDescriptions: string[] = [];
    if (selectedRegions.length > 0) filterDescriptions.push(`Регионы: ${selectedRegions.join(', ')}`);
    if (selectedTypes.length > 0) filterDescriptions.push(`Типы: ${selectedTypes.map(t => getRealEstateTypeName(t)).join(', ')}`);
    if (selectedDocTypes.length > 0) filterDescriptions.push(`Документы: ${selectedDocTypes.join(', ')}`);
    if (selectedPeriods.length > 0) filterDescriptions.push(`Периоды: ${selectedPeriods.map(formatPeriod).join(', ')}`);
    if (selectedWallMaterials.length > 0) filterDescriptions.push(`Материалы стен: ${selectedWallMaterials.map(m => getWallMaterialName(m)).join(', ')}`);
    if (priceMin || priceMax) filterDescriptions.push(`Цена: ${priceMin || '0'} - ${priceMax || '∞'} ₽`);
    if (areaMin || areaMax) filterDescriptions.push(`Площадь: ${areaMin || '0'} - ${areaMax || '∞'} м²`);
    if (floorMin || floorMax) filterDescriptions.push(`Этаж: ${floorMin || '0'} - ${floorMax || '∞'}`);
    if (yearBuildMin || yearBuildMax) filterDescriptions.push(`Год постройки: ${yearBuildMin || '0'} - ${yearBuildMax || '∞'}`);
    if (searchCity) filterDescriptions.push(`Город: ${searchCity}`);
    if (searchStreet) filterDescriptions.push(`Улица: ${searchStreet}`);

    const dealCadNumbers = new Set(deals.map(d => d.quarter_cad_number).filter(Boolean));
    const hasMapData = polygonsCoords || dealCadNumbers.size > 0;

    const quartersData = cadastralQuarters
      .filter(q => q.geojson && q.center_lat && q.center_lon && dealCadNumbers.has(q.cad_number))
      .map(q => ({
        cad_number: q.cad_number,
        center_lat: q.center_lat,
        center_lon: q.center_lon,
        geometry: q.geojson!.geometry,
      }));

    const dealsData = deals.map(d => ({
      id: d.id,
      quarter_cad_number: d.quarter_cad_number,
      city: d.city,
      street: d.street,
      district: d.district,
      deal_price: d.deal_price,
      area: d.area,
      year_quarter: d.year_quarter,
      realestate_type_code: d.realestate_type_code,
      floor: d.floor,
      year_build: d.year_build,
      wall_material_code: d.wall_material_code,
      doc_type: d.doc_type,
      number: d.number,
      region_code: d.region_code,
    }));

    // === Analytics data ===
    const COLORS = ['#1a73e8', '#34a853', '#ea4335', '#fbbc04', '#9c27b0', '#00bcd4', '#ff5722', '#795548'];

    const typeGroups: Record<string, number> = {};
    deals.forEach(d => { const n = getRealEstateTypeName(d.realestate_type_code); typeGroups[n] = (typeGroups[n] || 0) + 1; });
    const byType = Object.entries(typeGroups).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);

    const docTypeGroups: Record<string, number> = {};
    deals.forEach(d => { const n = DOCUMENT_TYPES[d.doc_type] || d.doc_type; docTypeGroups[n] = (docTypeGroups[n] || 0) + 1; });
    const byDocType = Object.entries(docTypeGroups).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);

    const wmGroups: Record<string, number> = {};
    deals.forEach(d => { if (d.wall_material_code) { const n = getWallMaterialName(d.wall_material_code); wmGroups[n] = (wmGroups[n] || 0) + 1; } });
    const byWallMaterial = Object.entries(wmGroups).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 8);

    const qGroups: Record<string, { count: number; sum: number; prices: number[]; ppms: number[] }> = {};
    deals.forEach(d => {
      if (!qGroups[d.year_quarter]) qGroups[d.year_quarter] = { count: 0, sum: 0, prices: [], ppms: [] };
      qGroups[d.year_quarter].count += d.number || 1;
      qGroups[d.year_quarter].sum += d.deal_price;
      qGroups[d.year_quarter].prices.push(d.deal_price);
      if (d.area > 0) qGroups[d.year_quarter].ppms.push(d.deal_price / d.area);
    });
    const byQuarter = Object.entries(qGroups).map(([name, data]) => ({
      name: name.replace('-Q', ' Q'),
      sortKey: name,
      count: data.count,
      avgPrice: data.prices.length > 0 ? Math.round(data.prices.reduce((a, b) => a + b, 0) / data.prices.length) : 0,
      avgPricePerMeter: data.ppms.length > 0 ? Math.round(data.ppms.reduce((a, b) => a + b, 0) / data.ppms.length) : 0,
    })).sort((a, b) => a.sortKey.localeCompare(b.sortKey));

    const regGroups: Record<string, number> = {};
    deals.forEach(d => { if (d.region_code) regGroups[d.region_code] = (regGroups[d.region_code] || 0) + 1; });
    const topRegions = Object.entries(regGroups).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 10);

    const priceMinVal = prices[0] || 0;
    const priceMaxVal = prices[prices.length - 1] || 0;
    const areaMinVal = areas.length > 0 ? Math.min(...areas) : 0;
    const areaMaxVal = areas.length > 0 ? Math.max(...areas) : 0;

    // SVG chart helpers
    const renderPieChart = (data: { name: string; value: number }[], maxLabelLen = 10): string => {
      if (data.length === 0) return '<div style="text-align:center;color:#a1a1aa;padding:40px 0">Нет данных</div>';
      const total = data.reduce((s, d) => s + d.value, 0);
      const cx = 150, cy = 120, r = 90;
      let cumAngle = -90;
      const slices = data.map((d, i) => {
        const pct = d.value / total;
        const startAngle = cumAngle;
        const endAngle = cumAngle + pct * 360;
        cumAngle = endAngle;
        const startRad = (startAngle * Math.PI) / 180;
        const endRad = (endAngle * Math.PI) / 180;
        const x1 = cx + r * Math.cos(startRad);
        const y1 = cy + r * Math.sin(startRad);
        const x2 = cx + r * Math.cos(endRad);
        const y2 = cy + r * Math.sin(endRad);
        const largeArc = pct > 0.5 ? 1 : 0;
        const color = COLORS[i % COLORS.length];
        const midRad = ((startAngle + (endAngle - startAngle) / 2) * Math.PI) / 180;
        const labelR = r + 24;
        const lx = cx + labelR * Math.cos(midRad);
        const ly = cy + labelR * Math.sin(midRad);
        const labelName = d.name.length > maxLabelLen ? d.name.substring(0, maxLabelLen) + '...' : d.name;
        const label = pct >= 0.04 ? `<text x="${lx}" y="${ly}" text-anchor="middle" dominant-baseline="middle" fill="#52525b" font-size="10" font-family="Inter,sans-serif">${labelName} (${Math.round(pct * 100)}%)</text>` : '';
        return pct > 0
          ? `<path d="M${cx},${cy} L${x1},${y1} A${r},${r} 0 ${largeArc},1 ${x2},${y2} Z" fill="${color}" stroke="#fff" stroke-width="1.5"/>${label}`
          : '';
      });
      return `<svg viewBox="0 0 300 240" style="width:100%;height:auto">${slices.join('')}</svg>`;
    };

    const renderLineChart = (data: { name: string; count: number }[]): string => {
      if (data.length === 0) return '<div style="text-align:center;color:#a1a1aa;padding:40px 0">Нет данных</div>';
      const w = 700, h = 220, padL = 60, padR = 20, padT = 20, padB = 40;
      const maxVal = Math.max(...data.map(d => d.count), 1);
      const chartW = w - padL - padR;
      const chartH = h - padT - padB;
      const step = data.length > 1 ? chartW / (data.length - 1) : chartW;
      const points = data.map((d, i) => ({
        x: padL + (data.length > 1 ? i * step : chartW / 2),
        y: padT + chartH - (d.count / maxVal) * chartH,
        ...d,
      }));
      const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
      const yTicks = [0, Math.round(maxVal * 0.25), Math.round(maxVal * 0.5), Math.round(maxVal * 0.75), maxVal];
      const yTickLabels = yTicks.map(v => `<text x="${padL - 8}" y="${padT + chartH - (v / maxVal) * chartH}" text-anchor="end" dominant-baseline="middle" fill="#a1a1aa" font-size="11" font-family="Inter,sans-serif">${formatNumber(v)}</text>`).join('');
      const xLabels = points.map(p => {
        const label = p.name.length > 7 ? p.name.substring(0, 7) : p.name;
        return `<text x="${p.x}" y="${h - 8}" text-anchor="middle" fill="#a1a1aa" font-size="10" font-family="Inter,sans-serif">${label}</text>`;
      }).join('');
      const dots = points.map(p => `<circle cx="${p.x}" cy="${p.y}" r="4" fill="#1a73e8" stroke="#fff" stroke-width="1.5"/>`).join('');
      const gridLines = yTicks.map(v => `<line x1="${padL}" y1="${padT + chartH - (v / maxVal) * chartH}" x2="${w - padR}" y2="${padT + chartH - (v / maxVal) * chartH}" stroke="#e4e4e7" stroke-dasharray="3 3"/>`).join('');
      return `<svg viewBox="0 0 ${w} ${h}" style="width:100%;height:auto">${gridLines}${yTickLabels}${xLabels}<path d="${linePath}" fill="none" stroke="#1a73e8" stroke-width="2"/>${dots}</svg>`;
    };

    const renderComposedChart = (data: { name: string; count: number; avgPrice: number; avgPricePerMeter: number }[]): string => {
      if (data.length === 0) return '<div style="text-align:center;color:#a1a1aa;padding:40px 0">Нет данных</div>';
      const w = 700, h = 250, padL = 70, padR = 50, padT = 20, padB = 40;
      const chartW = w - padL - padR;
      const chartH = h - padT - padB;
      const maxCount = Math.max(...data.map(d => d.count), 1);
      const maxPrice = Math.max(...data.map(d => Math.max(d.avgPrice, d.avgPricePerMeter)), 1);
      const barW = Math.min(data.length > 1 ? (chartW / data.length) * 0.5 : 30, 30);
      const gridLinesY = [0, 0.25, 0.5, 0.75, 1].map(pct => {
        const y = padT + chartH - pct * chartH;
        return `<line x1="${padL}" y1="${y}" x2="${w - padR}" y2="${y}" stroke="#e4e4e7" stroke-dasharray="3 3"/>`;
      }).join('');
      const yLeftLabels = [0, 0.25, 0.5, 0.75, 1].map(pct => {
        const v = Math.round(pct * maxPrice);
        const y = padT + chartH - pct * chartH;
        return `<text x="${padL - 8}" y="${y}" text-anchor="end" dominant-baseline="middle" fill="#a1a1aa" font-size="10" font-family="Inter,sans-serif">${v >= 1000000 ? (v / 1000000).toFixed(1) + 'M' : v >= 1000 ? (v / 1000).toFixed(0) + 'K' : String(v)}</text>`;
      }).join('');
      const yRightLabels = [0, 0.25, 0.5, 0.75, 1].map(pct => {
        const v = Math.round(pct * maxCount);
        const y = padT + chartH - pct * chartH;
        return `<text x="${w - padR + 8}" y="${y}" dominant-baseline="middle" fill="#a1a1aa" font-size="10" font-family="Inter,sans-serif">${formatNumber(v)}</text>`;
      }).join('');
      const step = data.length > 1 ? chartW / data.length : chartW;
      const bars = data.map((d, i) => {
        const cx = padL + step * i + step / 2;
        const barH = (d.count / maxCount) * chartH;
        return `<rect x="${cx - barW / 2}" y="${padT + chartH - barH}" width="${barW}" height="${barH}" fill="#e8f0fe" rx="2"/>`;
      }).join('');
      const avgPricePoints = data.map((d, i) => {
        const x = padL + step * i + step / 2;
        const y = padT + chartH - (d.avgPrice / maxPrice) * chartH;
        return { x, y };
      });
      const ppmPoints = data.map((d, i) => {
        const x = padL + step * i + step / 2;
        const y = padT + chartH - (d.avgPricePerMeter / maxPrice) * chartH;
        return { x, y };
      });
      const avgLine = avgPricePoints.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
      const ppmLine = ppmPoints.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
      const avgDots = avgPricePoints.map(p => `<circle cx="${p.x}" cy="${p.y}" r="4" fill="#34a853" stroke="#fff" stroke-width="1.5"/>`).join('');
      const ppmDots = ppmPoints.map(p => `<circle cx="${p.x}" cy="${p.y}" r="4" fill="#ea4335" stroke="#fff" stroke-width="1.5"/>`).join('');
      const xLabels = data.map((d, i) => {
        const x = padL + step * i + step / 2;
        const label = d.name.length > 7 ? d.name.substring(0, 7) : d.name;
        return `<text x="${x}" y="${h - 8}" text-anchor="middle" fill="#a1a1aa" font-size="10" font-family="Inter,sans-serif">${label}</text>`;
      }).join('');
      const legend = `<circle cx="${padL}" cy="${h - 2}" r="4" fill="#34a853"/><text x="${padL + 10}" y="${h - 2}" dominant-baseline="middle" fill="#71717a" font-size="10" font-family="Inter,sans-serif">Средняя цена</text>`
        + `<circle cx="${padL + 120}" cy="${h - 2}" r="4" fill="#ea4335"/><text x="${padL + 130}" y="${h - 2}" dominant-baseline="middle" fill="#71717a" font-size="10" font-family="Inter,sans-serif">Цена за м2</text>`
        + `<rect x="${padL + 220}" y="${h - 6}" width="10" height="10" fill="#e8f0fe" rx="1"/><text x="${padL + 236}" y="${h - 2}" dominant-baseline="middle" fill="#71717a" font-size="10" font-family="Inter,sans-serif">Кол-во сделок</text>`;
      return `<svg viewBox="0 0 ${w} ${h + 16}" style="width:100%;height:auto">${gridLinesY}${yLeftLabels}${yRightLabels}${bars}<path d="${avgLine}" fill="none" stroke="#34a853" stroke-width="2"/>${avgDots}<path d="${ppmLine}" fill="none" stroke="#ea4335" stroke-width="2"/>${ppmDots}${xLabels}${legend}</svg>`;
    };

    const renderBarChart = (data: { name: string; value: number }[]): string => {
      if (data.length === 0) return '<div style="text-align:center;color:#a1a1aa;padding:40px 0">Нет данных</div>';
      const barH = 22, gap = 6, labelW = 80, padR = 20, padT = 10;
      const h = padT + data.length * (barH + gap) + 10;
      const maxVal = Math.max(...data.map(d => d.value), 1);
      const bars = data.map((d, i) => {
        const y = padT + i * (barH + gap);
        const bw = Math.max(((d.value / maxVal) * (600 - labelW - padR)), 2);
        const label = d.name.length > 10 ? d.name.substring(0, 10) + '...' : d.name;
        return `<text x="${labelW - 8}" y="${y + barH / 2}" text-anchor="end" dominant-baseline="middle" fill="#52525b" font-size="11" font-family="Inter,sans-serif">${label}</text>`
          + `<rect x="${labelW}" y="${y}" width="${bw}" height="${barH}" fill="${COLORS[i % COLORS.length]}" rx="3"/>`
          + `<text x="${labelW + bw + 8}" y="${y + barH / 2}" dominant-baseline="middle" fill="#71717a" font-size="11" font-family="Inter,sans-serif">${formatNumber(d.value)}</text>`;
      }).join('');
      return `<svg viewBox="0 0 600 ${h}" style="width:100%;height:auto">${bars}</svg>`;
    };

    const html = `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Отчёт по сделкам - ${new Date().toLocaleDateString('ru-RU')}</title>
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <style>
    *,*::before,*::after{margin:0;padding:0;box-sizing:border-box}
    :root{--blue-600:#2563eb;--blue-50:#eff6ff;--green-600:#16a34a;--green-400:#4ade80;--green-50:#f0fdf4;--red-500:#ef4444;--zinc-50:#fafafa;--zinc-100:#f4f4f5;--zinc-200:#e4e4e7;--zinc-300:#d4d4d8;--zinc-400:#a1a1aa;--zinc-500:#71717a;--zinc-600:#52525b;--zinc-700:#3f3f46;--zinc-800:#27272a;--zinc-900:#18181b;--zinc-950:#09090b}
    body{font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:var(--zinc-100);color:var(--zinc-900);line-height:1.5;-webkit-font-smoothing:antialiased}
    .container{max-width:1400px;margin:0 auto;padding:24px}
    @media(max-width:640px){.container{padding:12px}}
    .card{background:#fff;border-radius:12px;box-shadow:0 1px 3px rgba(0,0,0,0.08),0 1px 2px rgba(0,0,0,0.04);overflow:hidden}
    .header-card{padding:24px;margin-bottom:16px}
    @media(max-width:640px){.header-card{padding:16px}}
    .header-card h1{font-size:22px;font-weight:600;color:var(--zinc-950);margin-bottom:4px}
    .header-card .date{color:var(--zinc-500);font-size:13px}
    .filters-box{background:var(--blue-50);border-radius:8px;padding:14px 16px;margin-top:16px}
    .filters-box h3{font-size:12px;font-weight:500;text-transform:uppercase;letter-spacing:.05em;color:var(--blue-600);margin-bottom:8px}
    .filters-tags{display:flex;flex-wrap:wrap;gap:6px}
    .ftag{background:#fff;padding:4px 10px;border-radius:6px;font-size:12px;color:var(--zinc-700);border:1px solid var(--zinc-200)}
    .metrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin-bottom:16px}
    @media(max-width:640px){.metrics{grid-template-columns:repeat(2,1fr);gap:8px}}
    .mc{padding:20px;text-align:center}
    @media(max-width:640px){.mc{padding:14px 10px}}
    .mc .val{font-size:22px;font-weight:600;color:var(--zinc-950)}
    @media(max-width:640px){.mc .val{font-size:16px}}
    .mc .lbl{font-size:12px;color:var(--zinc-500);margin-top:4px}
    .map-section{margin-bottom:16px;padding:20px}
    @media(max-width:640px){.map-section{padding:12px}}
    .map-title{font-size:14px;font-weight:600;color:var(--zinc-900);margin-bottom:12px}
    #reportMap{height:500px;border-radius:8px;z-index:1}
    @media(max-width:640px){#reportMap{height:300px}}
    .tbl-card{margin-bottom:16px}
    .tbl-top{display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--zinc-200);padding:12px 20px}
    @media(max-width:640px){.tbl-top{padding:10px 12px}}
    .tbl-top span{font-size:13px;color:var(--zinc-500)}
    .tbl-wrap{overflow-x:auto;-webkit-overflow-scrolling:touch}
    table{width:100%;border-collapse:collapse;min-width:900px}
    th{white-space:nowrap;background:var(--zinc-50);padding:10px 12px;text-align:left;font-size:11px;font-weight:500;text-transform:uppercase;letter-spacing:.05em;color:var(--zinc-500);border-bottom:1px solid var(--zinc-200);position:sticky;top:0;z-index:1}
    th.sortable{cursor:pointer;user-select:none;transition:background .15s}
    th.sortable:hover{background:var(--zinc-100)}
    th .sort-icon{margin-left:4px;font-size:10px;opacity:.5}
    th.active-sort .sort-icon{opacity:1}
    td{padding:8px 12px;border-bottom:1px solid var(--zinc-100);vertical-align:top}
    tr.row{cursor:pointer;transition:background .15s}
    tr.row:hover{background:var(--zinc-50)}
    .td-period{white-space:nowrap;font-size:13px;font-weight:500;color:var(--zinc-950)}
    .badge{display:inline-flex;align-items:center;border-radius:9999px;padding:2px 10px;font-size:11px;font-weight:500;border:1px solid var(--zinc-200);color:var(--zinc-600);background:var(--zinc-100)}
    .badge-green{background:var(--green-50);color:var(--green-600);border-color:rgba(22,163,74,.2)}
    .badge-red{background:#fef2f2;color:var(--red-500);border-color:rgba(239,68,68,.2)}
    .loc{display:flex;flex-direction:column;gap:1px;max-width:250px}
    .loc-city{font-size:13px;font-weight:500;color:var(--zinc-950);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .loc-street{font-size:12px;color:var(--zinc-500);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .loc-dist{font-size:11px;color:var(--zinc-400)}
    .loc-cad{font-size:11px;color:var(--zinc-400);margin-top:2px}
    .td-area{white-space:nowrap;font-size:12px;color:var(--zinc-500)}
    .td-center{white-space:nowrap;text-align:center;font-size:12px;color:var(--zinc-500)}
    .td-mat{max-width:100px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;color:var(--zinc-500)}
    .td-price{white-space:nowrap}
    .price-val{font-size:13px;font-weight:600;color:var(--green-600)}
    .price-psm{font-size:11px;color:var(--zinc-400);margin-top:1px}
    .deal-map-overlay{position:fixed;inset:0;z-index:9999;display:none;background:rgba(0,0,0,0.3)}
    .deal-map-overlay.active{display:block}
    .deal-map-panel{position:fixed;right:0;top:0;height:100vh;width:50%;z-index:10000;display:none;flex-direction:column;border-left:1px solid var(--zinc-200);background:#fff;box-shadow:-4px 0 24px rgba(0,0,0,0.12)}
    .deal-map-panel.active{display:flex}
    @media(max-width:1024px){.deal-map-panel{width:70%}}
    @media(max-width:640px){.deal-map-panel{width:100%}}
    .dm-header{display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--zinc-200);background:var(--zinc-50);padding:12px 16px;flex-shrink:0}
    .dm-header-left{display:flex;align-items:center;gap:12px}
    .dm-icon{display:flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:8px;background:var(--blue-600)}
    .dm-icon svg{width:16px;height:16px;fill:#fff}
    .dm-title{font-size:13px;font-weight:600;color:var(--zinc-950)}
    .dm-subtitle{font-size:12px;color:var(--zinc-500)}
    .dm-close{display:flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:8px;border:none;background:none;cursor:pointer;color:var(--zinc-500);transition:background .15s}
    .dm-close:hover{background:var(--zinc-200);color:var(--zinc-700)}
    .dm-close svg{width:20px;height:20px;fill:currentColor}
    .dm-map{flex:1;min-height:400px}
    .footer{text-align:center;padding:24px;color:var(--zinc-400);font-size:12px;margin-top:16px}
    .analytics-card{background:#fff;border-radius:12px;box-shadow:0 1px 3px rgba(0,0,0,0.08),0 1px 2px rgba(0,0,0,0.04);overflow:hidden;margin-bottom:16px}
    .analytics-header{display:flex;justify-content:space-between;align-items:center;padding:16px 20px;cursor:pointer;user-select:none;transition:background .15s}
    .analytics-header:hover{background:var(--zinc-50)}
    .analytics-header h2{font-size:16px;font-weight:600;color:var(--zinc-800);margin:0}
    .analytics-toggle{display:flex;align-items:center;gap:8px;font-size:13px;color:var(--zinc-500)}
    .analytics-toggle .arrow{font-size:12px;transition:transform .2s}
    .analytics-toggle .arrow.open{transform:rotate(180deg)}
    .analytics-metrics{display:flex;gap:12px;padding:0 20px 16px;overflow-x:auto}
    .analytics-metric{flex:1;min-width:140px;background:linear-gradient(135deg,#f8fafc,#eff6ff);border-radius:10px;padding:14px 16px;text-align:center}
    .analytics-metric .val{font-size:18px;font-weight:700;color:var(--blue-600);white-space:nowrap}
    .analytics-metric .lbl{font-size:11px;color:var(--zinc-500);margin-top:4px;text-transform:uppercase;letter-spacing:.03em}
    .analytics-body{padding:16px 20px 20px;border-top:1px solid var(--zinc-200);display:none}
    .analytics-body.open{display:block}
    .chart-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:16px;margin-bottom:16px}
    @media(max-width:768px){.chart-grid{grid-template-columns:1fr}}
    .chart-section{background:var(--zinc-50);border-radius:10px;padding:16px}
    .chart-section.full-width{grid-column:1/-1}
    .chart-section h3{font-size:13px;font-weight:500;color:var(--zinc-500);margin:0 0 12px;text-transform:uppercase;letter-spacing:.05em}
    .chart-section svg text{font-family:Inter,-apple-system,sans-serif}
    .range-info{display:flex;flex-wrap:wrap;gap:16px;padding:16px 0;border-top:1px solid var(--zinc-200)}
    .range-info-item{flex:1;min-width:200px}
    .range-info-item h4{font-size:12px;font-weight:500;color:var(--zinc-500);margin:0 0 8px;text-transform:uppercase;letter-spacing:.03em}
    .range-values{display:flex;flex-wrap:wrap;gap:12px}
    .range-val{display:flex;align-items:center;gap:6px}
    .range-val .rl{font-size:12px;color:var(--zinc-400)}
    .range-val .rv{font-size:13px;font-weight:600;color:var(--zinc-800)}
  </style>
</head>
<body>
  <div class="container">
    <div class="card header-card">
      <h1>Отчёт по сделкам с недвижимостью</h1>
      <div class="date">Дата формирования: ${new Date().toLocaleString('ru-RU')}</div>
      ${filterDescriptions.length > 0 ? `
      <div class="filters-box">
        <h3>Применённые фильтры</h3>
        <div class="filters-tags">
          ${filterDescriptions.map(d => `<span class="ftag">${d}</span>`).join('\n          ')}
        </div>
      </div>` : ''}
    </div>
    <div class="metrics">
      <div class="card mc"><div class="val">${formatNumber(deals.length)}</div><div class="lbl">Сделок</div></div>
      <div class="card mc"><div class="val">${formatPrice(totalSum)} ₽</div><div class="lbl">Общая сумма</div></div>
      <div class="card mc"><div class="val">${formatPrice(avgPrice)} ₽</div><div class="lbl">Средняя цена</div></div>
      <div class="card mc"><div class="val">${formatPrice(medianPrice)} ₽</div><div class="lbl">Медианная цена</div></div>
      <div class="card mc"><div class="val">${formatNumber(avgArea)} м²</div><div class="lbl">Средняя площадь</div></div>
    </div>
    <div class="analytics-card">
      <div class="analytics-header" onclick="toggleAnalytics()">
        <h2>Аналитика</h2>
        <div class="analytics-toggle"><span id="analyticsToggleText">Развернуть</span><span class="arrow" id="analyticsArrow">&#9650;</span></div>
      </div>
      <div class="analytics-metrics">
        <div class="analytics-metric"><div class="val">${formatNumber(deals.length)}</div><div class="lbl">Сделок</div></div>
        <div class="analytics-metric"><div class="val">${formatPrice(totalSum)} ₽</div><div class="lbl">Общая сумма</div></div>
        <div class="analytics-metric"><div class="val">${formatPrice(avgPrice)} ₽</div><div class="lbl">Средняя цена</div></div>
        <div class="analytics-metric"><div class="val">${formatPrice(medianPrice)} ₽</div><div class="lbl">Медианная цена</div></div>
      </div>
      <div class="analytics-body" id="analyticsBody">
        <div class="chart-grid">
          <div class="chart-section full-width">
            <h3>Динамика сделок по периодам</h3>
            ${renderLineChart(byQuarter)}
          </div>
          <div class="chart-section full-width">
            <h3>Динамика средней цены по периодам</h3>
            ${renderComposedChart(byQuarter)}
          </div>
          <div class="chart-section">
            <h3>По типу объекта</h3>
            ${renderPieChart(byType)}
          </div>
          <div class="chart-section">
            <h3>По типу договора</h3>
            ${renderPieChart(byDocType)}
          </div>
          <div class="chart-section">
            <h3>По материалу стен</h3>
            ${renderPieChart(byWallMaterial, 8)}
          </div>
          <div class="chart-section">
            <h3>Топ-10 регионов</h3>
            ${renderBarChart(topRegions)}
          </div>
        </div>
        <div class="range-info">
          <div class="range-info-item">
            <h4>Ценовой диапазон</h4>
            <div class="range-values">
              <div class="range-val"><span class="rl">Мин:</span><span class="rv">${formatPrice(priceMinVal)} ₽</span></div>
              <div class="range-val"><span class="rl">Макс:</span><span class="rv">${formatPrice(priceMaxVal)} ₽</span></div>
              <div class="range-val"><span class="rl">Средняя:</span><span class="rv">${formatPrice(avgPrice)} ₽</span></div>
              <div class="range-val"><span class="rl">Медиана:</span><span class="rv">${formatPrice(medianPrice)} ₽</span></div>
            </div>
          </div>
          <div class="range-info-item">
            <h4>Площадь (м²)</h4>
            <div class="range-values">
              <div class="range-val"><span class="rl">Мин:</span><span class="rv">${formatNumber(areaMinVal)}</span></div>
              <div class="range-val"><span class="rl">Макс:</span><span class="rv">${formatNumber(areaMaxVal)}</span></div>
              <div class="range-val"><span class="rl">Средняя:</span><span class="rv">${formatNumber(avgArea)}</span></div>
            </div>
          </div>
        </div>
      </div>
    </div>
    ${hasMapData ? `
    <div class="card map-section">
      <div class="map-title">Карта${polygonsCoords ? ' (область поиска)' : ''}</div>
      <div id="reportMap"></div>
    </div>` : ''}
    <div class="card tbl-card">
      <div class="tbl-top"><span>Найдено: ${formatNumber(deals.length)} сделок</span></div>
      <div class="tbl-wrap">
        <table id="dealsTable">
          <thead><tr>
            <th class="sortable" onclick="sortBy('year_quarter')">Период <span class="sort-icon" id="sort-year_quarter">⇅</span></th>
            <th class="sortable" onclick="sortBy('type')">Тип <span class="sort-icon" id="sort-type">⇅</span></th><th>Локация</th>
            <th class="sortable" onclick="sortBy('area')">Пл. <span class="sort-icon" id="sort-area">⇅</span></th>
            <th class="sortable" onclick="sortBy('floor')">Этаж <span class="sort-icon" id="sort-floor">⇅</span></th>
            <th class="sortable" onclick="sortBy('year_build')">Год <span class="sort-icon" id="sort-year_build">⇅</span></th>
            <th class="sortable" onclick="sortBy('material')">Материал <span class="sort-icon" id="sort-material">⇅</span></th>
            <th class="sortable" onclick="sortBy('price')">Цена <span class="sort-icon" id="sort-price">⇅</span></th>
            <th class="sortable" onclick="sortBy('doc')">Док. <span class="sort-icon" id="sort-doc">⇅</span></th>
          </tr></thead>
          <tbody id="dealsBody"></tbody>
        </table>
      </div>
    </div>
    <div class="footer">Сформировано автоматически • ${new Date().toLocaleString('ru-RU')}</div>
  </div>
  <div class="deal-map-overlay" id="dmOverlay" onclick="closeDealMap()"></div>
  <div class="deal-map-panel" id="dmPanel">
    <div class="dm-header">
      <div class="dm-header-left">
        <div class="dm-icon"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path fill-rule="evenodd" d="m9.69 18.933.003.001C9.89 19.02 10 19 10 19s.11.02.308-.066l.002-.001.006-.003.018-.008a5.741 5.741 0 0 0 .281-.14c.186-.096.446-.24.757-.433.62-.384 1.445-.966 2.274-1.765C15.302 14.988 17 12.493 17 9A7 7 0 1 0 3 9c0 3.492 1.698 5.988 3.355 7.584a13.731 13.731 0 0 0 2.274 1.765 11.307 11.307 0 0 0 .757.433l.04.021.01.006.004.002ZM10 11.25a2.25 2.25 0 1 0 0-4.5 2.25 2.25 0 0 0 0 4.5Z" clip-rule="evenodd"/></svg></div>
        <div><div class="dm-title">Расположение на карте</div><div class="dm-subtitle" id="dmQuarter"></div></div>
      </div>
      <button class="dm-close" onclick="closeDealMap()"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z"/></svg></button>
    </div>
    <div class="dm-map" id="dmMap"></div>
  </div>

  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"><\/script>
  <script>
    const allDeals = ${JSON.stringify(dealsData)};
    const allQuarters = ${JSON.stringify(quartersData)};
    const filterPolygon = ${JSON.stringify(polygonsCoords)};
    const realEstateTypes = ${JSON.stringify(Object.fromEntries(Object.entries(REAL_ESTATE_TYPES)))};
    const wallMaterials = ${JSON.stringify(Object.fromEntries(Object.entries(WALL_MATERIALS)))};
    const fmt = (n) => new Intl.NumberFormat('ru-RU').format(n);
    const fmtPrice = (p) => fmt(Math.round(p));

    function getWallName(code) {
      if (!code) return '';
      if (wallMaterials[code]) return wallMaterials[code];
      if (code.startsWith('0') && wallMaterials[code.substring(1)]) return wallMaterials[code.substring(1)];
      if (wallMaterials['0' + code]) return wallMaterials['0' + code];
      return code;
    }

    function getRealTypeName(code) {
      return realEstateTypes[code] || code;
    }

    let tileLayerFactory = null;

    async function initTileSystem() {
      try {
        const [
          { leafletLayer, paintRules, labelRules },
          { LIGHT }
        ] = await Promise.all([
          import('https://esm.sh/protomaps-leaflet@5.1.0'),
          import('https://esm.sh/@protomaps/basemaps@5.7.2')
        ]);
        tileLayerFactory = (map) => {
          return leafletLayer({
            url: 'https://55ff837e6c44-neo-maps.s3.ru1.storage.beget.cloud/maps/russia_z14.pmtiles',
            attribution: 'OpenStreetMap, Protomaps',
            paintRules: paintRules(LIGHT),
            labelRules: labelRules(LIGHT, 'ru'),
            maxDataZoom: 14,
          }).addTo(map);
        };
      } catch(_e) {
        // Protomaps failed, falling back to OSM
        tileLayerFactory = (map) => {
          L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; OpenStreetMap contributors',
            maxZoom: 19,
          }).addTo(map);
        };
      }
    }

    function createTileLayer(map) {
      if (tileLayerFactory) tileLayerFactory(map);
    }

    // Analytics toggle
    window.toggleAnalytics = function() {
      const body = document.getElementById('analyticsBody');
      const arrow = document.getElementById('analyticsArrow');
      const text = document.getElementById('analyticsToggleText');
      if (body.classList.contains('open')) {
        body.classList.remove('open');
        arrow.classList.remove('open');
        text.textContent = 'Развернуть';
      } else {
        body.classList.add('open');
        arrow.classList.add('open');
        text.textContent = 'Свернуть';
      }
    };

    // Sorting
    let sortField = 'year_quarter';
    let sortOrder = 'desc';
    let sortedIndices = allDeals.map((_, i) => i);

    function doSort() {
      sortedIndices.sort((a, b) => {
        const da = allDeals[a], db = allDeals[b];
        let cmp = 0;
        if (sortField === 'year_quarter') cmp = da.year_quarter.localeCompare(db.year_quarter);
        else if (sortField === 'price') cmp = da.deal_price - db.deal_price;
        else if (sortField === 'area') cmp = da.area - db.area;
        else if (sortField === 'floor') cmp = (da.floor||0) - (db.floor||0);
        else if (sortField === 'year_build') cmp = (da.year_build||0) - (db.year_build||0);
        else if (sortField === 'type') cmp = (getRealTypeName(da.realestate_type_code)||'').localeCompare(getRealTypeName(db.realestate_type_code)||'');
        else if (sortField === 'material') cmp = (getWallName(da.wall_material_code)||'').localeCompare(getWallName(db.wall_material_code)||'');
        else if (sortField === 'doc') cmp = (da.doc_type||'').localeCompare(db.doc_type||'');
        return sortOrder === 'asc' ? cmp : -cmp;
      });
    }

    function renderTable() {
      const body = document.getElementById('dealsBody');
      body.innerHTML = sortedIndices.map(i => {
        const d = allDeals[i];
        const ppm = d.area > 0 ? fmtPrice(d.deal_price / d.area) + ' ₽/м²' : '';
        return '<tr class="row" onclick="openDealMap(' + i + ')">'
          + '<td class="td-period">' + d.year_quarter + '</td>'
          + '<td><span class="badge">' + getRealTypeName(d.realestate_type_code).substring(0, 3) + '</span></td>'
          + '<td><div class="loc">'
          + (d.city ? '<span class="loc-city">' + d.city + '</span>' : '')
          + (d.street ? '<span class="loc-street">' + d.street + '</span>' : '')
          + (d.district ? '<span class="loc-dist">' + d.district + '</span>' : '')
          + (d.quarter_cad_number ? '<span class="loc-cad">' + d.quarter_cad_number + '</span>' : '')
          + '</div></td>'
          + '<td class="td-area">' + (d.area > 0 ? fmt(d.area) : '—') + (d.number > 1 ? ' <span style="color:var(--zinc-400)">×' + d.number + '</span>' : '') + '</td>'
          + '<td class="td-center">' + (d.floor || '—') + '</td>'
          + '<td class="td-center">' + (d.year_build || '—') + '</td>'
          + '<td class="td-mat">' + (getWallName(d.wall_material_code) || '—') + '</td>'
          + '<td class="td-price"><div class="price-val">' + fmtPrice(d.deal_price) + ' ₽</div>' + (ppm ? '<div class="price-psm">' + ppm + '</div>' : '') + '</td>'
          + '<td><span class="badge ' + (d.doc_type === 'ДКП' ? 'badge-green' : d.doc_type === 'ДДУ' ? 'badge-red' : '') + '">' + d.doc_type + '</span></td>'
          + '</tr>';
      }).join('');

      ['year_quarter', 'type', 'area', 'floor', 'year_build', 'material', 'price', 'doc'].forEach(f => {
        const el = document.getElementById('sort-' + f);
        const th = el.parentElement;
        if (f === sortField) {
          el.textContent = sortOrder === 'asc' ? '↑' : '↓';
          th.classList.add('active-sort');
        } else {
          el.textContent = '⇅';
          th.classList.remove('active-sort');
        }
      });
    }

    window.sortBy = function(field) {
      if (sortField === field) sortOrder = sortOrder === 'asc' ? 'desc' : 'asc';
      else { sortField = field; sortOrder = 'desc'; }
      doSort();
      renderTable();
    };

    // Map — report
    let reportMap = null;
    ${hasMapData ? `
    function initReportMap() {
      const el = document.getElementById('reportMap');
      if (!el) return;
      reportMap = L.map(el, { attributionControl: false }).setView([55.7558, 37.6173], 10);
      L.control.attribution({ prefix: false }).addTo(reportMap);
      createTileLayer(reportMap);
      const allBounds = L.latLngBounds([]);
      allQuarters.forEach(q => {
        try {
          const coords = q.geometry.coordinates[0].map(c => [c[1], c[0]]);
          const polygon = L.polygon(coords, { color: '#3b82f6', weight: 1.5, fillColor: '#3b82f6', fillOpacity: 0.08 }).addTo(reportMap);
          const qDeals = allDeals.filter(d => d.quarter_cad_number === q.cad_number);
          const stats = qDeals.length > 0
            ? 'Сделок: ' + qDeals.length + '<br>Ср. цена: ' + fmtPrice(qDeals.reduce((s,d)=>s+d.deal_price,0)/qDeals.length) + ' ₽'
            : 'Нет сделок';
          polygon.bindPopup('<div style="font-family:Inter,sans-serif;min-width:180px"><strong>' + q.cad_number + '</strong><br>' + stats + '</div>');
          allBounds.extend(polygon.getBounds());
        } catch(e) {}
      });
      if (filterPolygon && Array.isArray(filterPolygon)) {
        filterPolygon.forEach(poly => {
          if (poly && poly.length >= 3) {
            const fPoly = L.polygon(poly.map(c => [c[0], c[1]]), { color: '#ef4444', weight: 2, dashArray: '8 4', fillColor: '#ef4444', fillOpacity: 0.06 }).addTo(reportMap);
            allBounds.extend(fPoly.getBounds());
          }
        });
      }
      if (allBounds.isValid()) reportMap.fitBounds(allBounds, { padding: [30, 30] });
    }` : ''}

    // DealMap side panel
    let dmMap = null;
    window.openDealMap = function(idx) {
      const deal = allDeals[idx];
      if (!deal) return;
      document.getElementById('dmQuarter').textContent = deal.quarter_cad_number || '';
      document.getElementById('dmOverlay').classList.add('active');
      document.getElementById('dmPanel').classList.add('active');
      setTimeout(() => {
        if (dmMap) { dmMap.remove(); dmMap = null; }
        dmMap = L.map(document.getElementById('dmMap'), { attributionControl: false }).setView([55.7558, 37.6173], 10);
        createTileLayer(dmMap);
        if (deal.quarter_cad_number) {
          const quarter = allQuarters.find(q => q.cad_number === deal.quarter_cad_number);
          if (quarter) {
            try {
              const coords = quarter.geometry.coordinates[0].map(c => [c[1], c[0]]);
              const polygon = L.polygon(coords, { color: '#3b82f6', weight: 3, fillColor: '#3b82f6', fillOpacity: 0.15 }).addTo(dmMap);
              const ppm = deal.area > 0 ? fmtPrice(deal.deal_price / deal.area) + ' ₽/м²' : '';
              polygon.bindPopup('<div style="font-family:Inter,-apple-system,sans-serif;min-width:220px;padding:4px">'
                + '<div style="font-size:11px;font-weight:500;color:#71717a;text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px">Кадастровый квартал</div>'
                + '<div style="font-size:14px;font-weight:600;color:#18181b;margin-bottom:8px">' + deal.quarter_cad_number + '</div>'
                + '<div style="border-top:1px solid #e4e4e7;margin:8px 0"></div>'
                + '<div style="font-size:13px;color:#3f3f46;line-height:1.6">'
                + '<div><strong>Адрес:</strong> ' + [deal.city,deal.street].filter(Boolean).join(', ') + '</div>'
                + '<div><strong>Площадь:</strong> ' + (deal.area > 0 ? fmt(deal.area) + ' м²' : '—') + '</div>'
                + '<div><strong>Цена:</strong> ' + fmtPrice(deal.deal_price) + ' ₽</div>'
                + (ppm ? '<div><strong>Цена/м²:</strong> ' + ppm + '</div>' : '')
                + '<div><strong>Период:</strong> ' + deal.year_quarter + '</div>'
                + '</div></div>');
              if (filterPolygon && Array.isArray(filterPolygon) && filterPolygon.length > 0) {
                const b = polygon.getBounds();
                filterPolygon.forEach(poly => {
                  if (poly && poly.length >= 3) {
                    const fPoly = L.polygon(poly.map(c => [c[0], c[1]]), { color: '#ef4444', weight: 2, dashArray: '8 4', fillColor: '#ef4444', fillOpacity: 0.06 }).addTo(dmMap);
                    b.extend(fPoly.getBounds());
                  }
                });
                dmMap.fitBounds(b, { padding: [50, 50] });
              } else {
                dmMap.fitBounds(polygon.getBounds(), { padding: [50, 50] });
              }
            } catch(e) {}
          }
        }
      }, 150);
    };

    window.closeDealMap = function() {
      document.getElementById('dmOverlay').classList.remove('active');
      document.getElementById('dmPanel').classList.remove('active');
      if (dmMap) { dmMap.remove(); dmMap = null; }
    };

    document.addEventListener('keydown', e => { if (e.key === 'Escape') window.closeDealMap(); });

    // Init: render table immediately, load tiles async then init map
    doSort();
    renderTable();

    initTileSystem().then(() => {
      ${hasMapData ? `initReportMap();` : ''}
    });
  <\/script>
</body>
</html>`;

    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `report-${new Date().toISOString().split('T')[0]}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Данные для таблицы — приходят из searchLight (уже отсортированные по дате)
  const pagedDeals = result?.deals || [];
  const totalFiltered = result?.total || 0;
  const totalPages = result?.totalPages || 0;
  const currentPage = Math.min(page, totalPages || 1);

  if (stats && stats.totalDeals === 0) {
    return (
      <div className="mx-auto max-w-5xl p-6">
        <div className="rounded-xl bg-white p-16 text-center shadow-sm dark:bg-zinc-900">
          <Heading level={2}>Нет данных для поиска</Heading>
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">Сначала импортируйте данные о сделках</p>
          <button onClick={() => onNavigate?.('import')} className="mt-6 inline-block bg-transparent border-none p-0 cursor-pointer">
            <Button color="blue">Перейти к импорту</Button>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl p-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <Heading level={1}>Поиск сделок</Heading>
        <div className="flex items-center gap-4 text-sm text-zinc-500 dark:text-zinc-400">
          <span>{stats ? formatNumber(stats.totalDeals) : 0} сделок в базе</span>
          <button
            onClick={() => onNavigate?.('import')}
            className="text-blue-600 hover:underline text-sm bg-transparent border-none cursor-pointer dark:text-blue-400"
          >
            Импорт
          </button>
        </div>
      </div>

      <div className="space-y-4">
        {/* Filter bar */}
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1 rounded-lg bg-zinc-100 px-3 py-2 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400 truncate">
            {filterSummary}
          </div>
          {activeFilterName && (
            <span className="flex items-center gap-1 rounded-md bg-blue-50 px-2 py-1 text-[11px] font-medium text-blue-600 dark:bg-blue-950 dark:text-blue-400">
              <BookmarkSquareIcon className="size-3" />
              {activeFilterGroupName && <span className="opacity-70">{activeFilterGroupName} • </span>}
              {activeFilterName}
            </span>
          )}
          <Button onClick={() => setShowSavedPanel(true)}>
            <BookmarkSquareIcon className="size-4" />
            Сохранённые
          </Button>
          <Button onClick={() => setShowFilters(!showFilters)}>
            <FunnelIcon className="size-4" />
            {showFilters ? 'Скрыть' : 'Фильтры'}
          </Button>
        </div>

        {/* Active filter actions (save/cancel) + reset — above filter panel */}
        {showFilters && (
          <div className="flex items-center gap-2">
            {activeFilterName && filterChanged && (
              <>
                <button
                  onClick={() => {
                    if (!activeFilterId) return;
                    const currentState = getCurrentFilterState();
                    const STORAGE_KEY = 'ret_saved_filters_v2';
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
                  }}
                  className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-blue-700 border-none cursor-pointer transition-colors"
                >
                  <ArrowPathIcon className="size-3" />
                  Сохранить в «{activeFilterName}»
                </button>
                <button
                  onClick={handleCancelFilterChanges}
                  className="inline-flex items-center gap-1 rounded-md bg-zinc-100 px-2 py-1 text-[11px] font-medium text-zinc-700 hover:bg-zinc-200 border-none cursor-pointer transition-colors dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                >
                  <XMarkIcon className="size-3" />
                  Отменить
                </button>
              </>
            )}
            <button
              onClick={handleReset}
              className="inline-flex items-center gap-1 rounded-md bg-zinc-100 px-2 py-1 text-[11px] font-medium text-zinc-700 hover:bg-zinc-200 border-none cursor-pointer transition-colors dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
            >
              Сбросить фильтры
            </button>
          </div>
        )}

        {/* Filters */}
        {showFilters && (
          <div className="rounded-xl bg-white p-5 shadow-sm dark:bg-zinc-900">
            {/* City / Street */}
            <div className="mb-4 flex flex-wrap gap-3">
              <div className="min-w-[180px] flex-1">
                <Input
                  type="text"
                  placeholder="Город (через запятую для нескольких)..."
                  value={searchCity}
                  onChange={(e) => setSearchCity(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                />
              </div>
              <div className="min-w-[180px] flex-1">
                <Input
                  type="text"
                  placeholder="Улица (через запятую для нескольких)..."
                  value={searchStreet}
                  onChange={(e) => setSearchStreet(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                />
              </div>
            </div>

            {/* Real Estate Type */}
            <div className="mb-4 flex flex-wrap gap-5">
              <div className="min-w-[200px] flex-1">
                <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Тип объекта</h4>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(REAL_ESTATE_TYPES).map(([code, name]) => (
                    <label key={code} className="flex cursor-pointer items-center gap-1.5 rounded-md bg-zinc-50 px-2.5 py-1.5 text-xs hover:bg-zinc-100 dark:bg-zinc-800 dark:hover:bg-zinc-700">
                      <input
                        type="checkbox"
                        className="size-3.5"
                        checked={selectedTypes.includes(code)}
                        onChange={() => toggleType(code)}
                      />
                      <span className="text-zinc-700 dark:text-zinc-300">{name}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="min-w-[200px] flex-1">
                <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Тип документа</h4>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(DOCUMENT_TYPES).map(([code, name]) => (
                    <label key={code} className="flex cursor-pointer items-center gap-1.5 rounded-md bg-zinc-50 px-2.5 py-1.5 text-xs hover:bg-zinc-100 dark:bg-zinc-800 dark:hover:bg-zinc-700">
                      <input
                        type="checkbox"
                        className="size-3.5"
                        checked={selectedDocTypes.includes(code)}
                        onChange={() => toggleDocType(code)}
                      />
                      <span className="text-zinc-700 dark:text-zinc-300">{name}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            {/* Periods */}
            <div className="mb-4">
              <div className="mb-2 flex items-center justify-between">
                <h4 className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Период (год-квартал)</h4>
                <div className="flex gap-2">
                  <Button className="!py-1 !px-2 !text-[11px]" onClick={selectAllPeriods}>Выбрать все</Button>
                  <Button className="!py-1 !px-2 !text-[11px]" onClick={clearPeriods}>Очистить</Button>
                </div>
              </div>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(100px,1fr))] gap-2">
                {availablePeriods.map((period) => (
                  <label key={period} className="flex cursor-pointer items-center gap-1.5 rounded-md bg-zinc-50 px-2.5 py-1.5 text-xs hover:bg-zinc-100 dark:bg-zinc-800 dark:hover:bg-zinc-700">
                    <input
                      type="checkbox"
                      className="size-3.5"
                      checked={selectedPeriods.includes(period)}
                      onChange={() => togglePeriod(period)}
                    />
                    <span className="text-zinc-700 dark:text-zinc-300">{formatPeriod(period)}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Price & Area ranges */}
            <div className="mb-4 flex flex-wrap gap-5">
              <div className="min-w-[250px] flex-1">
                <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Цена (руб)</h4>
                <div className="flex items-center gap-2">
                  <Input type="number" placeholder="От" value={priceMin} onChange={(e) => setPriceMin(e.target.value)} />
                  <span className="text-zinc-400">—</span>
                  <Input type="number" placeholder="До" value={priceMax} onChange={(e) => setPriceMax(e.target.value)} />
                </div>
              </div>
              <div className="min-w-[250px] flex-1">
                <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Площадь (м²)</h4>
                <div className="flex items-center gap-2">
                  <Input type="number" placeholder="От" value={areaMin} onChange={(e) => setAreaMin(e.target.value)} />
                  <span className="text-zinc-400">—</span>
                  <Input type="number" placeholder="До" value={areaMax} onChange={(e) => setAreaMax(e.target.value)} />
                </div>
              </div>
            </div>

            {/* Floor & Year ranges */}
            <div className="mb-4 flex flex-wrap gap-5">
              <div className="min-w-[250px] flex-1">
                <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Этаж</h4>
                <div className="flex items-center gap-2">
                  <Input type="number" placeholder="От" value={floorMin} onChange={(e) => setFloorMin(e.target.value)} />
                  <span className="text-zinc-400">—</span>
                  <Input type="number" placeholder="До" value={floorMax} onChange={(e) => setFloorMax(e.target.value)} />
                </div>
              </div>
              <div className="min-w-[250px] flex-1">
                <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Год постройки</h4>
                <div className="flex items-center gap-2">
                  <Input type="number" placeholder="От" value={yearBuildMin} onChange={(e) => setYearBuildMin(e.target.value)} />
                  <span className="text-zinc-400">—</span>
                  <Input type="number" placeholder="До" value={yearBuildMax} onChange={(e) => setYearBuildMax(e.target.value)} />
                </div>
              </div>
            </div>

            {/* Wall Materials */}
            <div className="mb-4">
              <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Материал стен
                {wallMaterialsLoading ? (
                  <svg className="ml-1 inline size-3 animate-spin text-zinc-400" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                ) : availableWallMaterials && (
                  <span className="ml-1 text-[10px] font-normal text-zinc-400">(доступно: {availableWallMaterials.length})</span>
                )}
              </h4>
              <div className="flex max-h-[200px] flex-wrap gap-2 overflow-y-auto">
                {Object.entries(WALL_MATERIALS)
                  .filter(([code]) => {
                    if (!availableWallMaterials) return true;
                    return availableWallMaterials.includes(code);
                  })
                  .map(([code, name]) => (
                  <label key={code} className="flex cursor-pointer items-center gap-1.5 rounded-md bg-zinc-50 px-2.5 py-1.5 text-xs hover:bg-zinc-100 dark:bg-zinc-800 dark:hover:bg-zinc-700">
                    <input
                      type="checkbox"
                      className="size-3.5"
                      checked={selectedWallMaterials.includes(code)}
                      onChange={() => toggleWallMaterial(code)}
                    />
                    <span className="text-zinc-700 dark:text-zinc-300">{name}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Regions */}
            {stats && stats.regions.length > 0 && stats.regions.length <= 20 && (
              <div className="mb-4">
                <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Регион</h4>
                <div className="flex max-h-[150px] flex-wrap gap-2 overflow-y-auto">
                  {stats.regions.map((region) => (
                    <label key={region} className="flex cursor-pointer items-center gap-1.5 rounded-md bg-zinc-50 px-2.5 py-1.5 text-xs hover:bg-zinc-100 dark:bg-zinc-800 dark:hover:bg-zinc-700">
                      <input
                        type="checkbox"
                        className="size-3.5"
                        checked={selectedRegions.includes(region)}
                        onChange={() => toggleRegion(region)}
                      />
                      <span className="text-zinc-700 dark:text-zinc-300">{region}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Map filter */}
            <div className="mb-4 overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-700">
              <button
                className="flex w-full items-center gap-2 bg-zinc-50 px-3.5 py-2.5 text-sm font-medium text-zinc-950 transition-colors hover:bg-zinc-100 dark:bg-zinc-800 dark:text-white dark:hover:bg-zinc-700"
                onClick={() => setShowMapFilter(!showMapFilter)}
              >
                <span>Поиск по карте</span>
                {selectedCadNumbers.length > 0 && (
                  <Badge color="blue" className="ml-2">Активен: {selectedCadNumbers.length} кварталов</Badge>
                )}
                <ChevronDownIcon className={`ml-auto size-4 transition-transform ${showMapFilter ? 'rotate-180' : ''}`} />
              </button>
              <div className={`transition-[max-height] duration-300 ease-in-out ${showMapFilter ? 'max-h-[1200px]' : 'max-h-0'} overflow-hidden`}>
                {loadedRegions.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 border-b border-zinc-200 px-3.5 py-2 dark:border-zinc-700">
                    <span className="flex items-center text-xs text-zinc-400 dark:text-zinc-500">Перейти:</span>
                    {loadedRegions.map((region) => (
                      <button
                        key={region.code}
                        className="cursor-pointer rounded-md bg-zinc-100 px-2 py-1 text-xs font-medium text-zinc-700 transition-colors hover:bg-blue-100 hover:text-blue-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-blue-900/30 dark:hover:text-blue-400"
                        onClick={() => handleFlyToRegion(region.code)}
                      >
                        {region.name}
                      </button>
                    ))}
                  </div>
                )}
                <SearchByPolygon
                  quarters={cadastralQuarters}
                  quarterStats={aggregates?.byCadNumber || {}}
                  onQuartersSelected={handleQuartersSelected}
                  initialPolygons={polygonsCoords}
                  flyTo={flyToTarget}
                />
              </div>
            </div>

            {/* Segmentation */}
            <div className="mb-4">
              <SegmentationPanel
                dealsCount={totalFiltered}
                areasByWallMaterial={aggregates?.areasByWallMaterial || {}}
                onSetAreaRange={handleSetAreaRange}
              />
            </div>

            {/* Actions */}
            <div className="flex gap-3 border-t border-zinc-200 pt-4 dark:border-zinc-700">
              <Button color="blue" onClick={handleSearch}>Применить фильтры</Button>
              <div className="flex-1" />
              <Button onClick={exportToHtml}>
                <ArrowDownTrayIcon className="size-4" />
                Экспорт в HTML
              </Button>
            </div>
          </div>
        )}

        {/* Dashboard */}
        {aggregates && aggregates.count > 0 && (
          <Dashboard key="dashboard" aggregates={aggregates} totalDeals={totalFiltered} />
        )}

        {/* Results */}
        <div className="rounded-xl bg-white shadow-sm dark:bg-zinc-900">
          {!initialLoadDone || (loading && !result) ? (
            <div className="flex items-center justify-center gap-2 py-12 text-zinc-500 dark:text-zinc-400">
              <svg className="h-4 w-4 animate-spin text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <span>Загрузка данных...</span>
            </div>
          ) : totalFiltered > 0 ? (
            <>
              <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-3 text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
                <div className="flex items-center gap-3">
                  <span>Найдено: {formatNumber(totalFiltered)} сделок</span>
                  <select
                    value={pageSize}
                    disabled={loading}
                    onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); setSearchTrigger((n) => n + 1); }}
                    className="rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs text-zinc-700 outline-none focus:border-blue-500 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
                  >
                    <option value={25}>25 на странице</option>
                    <option value={50}>50 на странице</option>
                    <option value={100}>100 на странице</option>
                    <option value={200}>200 на странице</option>
                  </select>
                </div>
                <Button onClick={exportToHtml} disabled={loading}>
                  <ArrowDownTrayIcon className="size-4" />
                  Экспорт
                </Button>
              </div>

              {pagedDeals.length === 0 ? (
                <div className="py-12 text-center text-zinc-500 dark:text-zinc-400">Ничего не найдено</div>
              ) : (
                <>
                  <div className="relative overflow-x-auto">
                    <table className="w-full min-w-[900px] border-collapse">
                      <thead>
                        <tr>
                          <th className="cursor-pointer whitespace-nowrap bg-zinc-50 px-3 py-2.5 text-left text-[11px] font-medium uppercase text-zinc-500 hover:bg-zinc-100 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700" onClick={() => handleSort('year_quarter')}>
                            Период <span className="ml-1 text-[10px]">{getSortIcon('year_quarter')}</span>
                          </th>
                          <th className="cursor-pointer whitespace-nowrap bg-zinc-50 px-3 py-2.5 text-left text-[11px] font-medium uppercase text-zinc-500 hover:bg-zinc-100 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700" onClick={() => handleSort('type')}>
                            Тип <span className="ml-1 text-[10px]">{getSortIcon('type')}</span>
                          </th>
                          <th className="whitespace-nowrap bg-zinc-50 px-3 py-2.5 text-left text-[11px] font-medium uppercase text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">Локация</th>
                          <th className="cursor-pointer whitespace-nowrap bg-zinc-50 px-3 py-2.5 text-left text-[11px] font-medium uppercase text-zinc-500 hover:bg-zinc-100 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700" onClick={() => handleSort('area')}>
                            Пл. <span className="ml-1 text-[10px]">{getSortIcon('area')}</span>
                          </th>
                          <th className="cursor-pointer whitespace-nowrap bg-zinc-50 px-3 py-2.5 text-left text-[11px] font-medium uppercase text-zinc-500 hover:bg-zinc-100 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700" onClick={() => handleSort('floor')}>
                            Этаж <span className="ml-1 text-[10px]">{getSortIcon('floor')}</span>
                          </th>
                          <th className="cursor-pointer whitespace-nowrap bg-zinc-50 px-3 py-2.5 text-left text-[11px] font-medium uppercase text-zinc-500 hover:bg-zinc-100 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700" onClick={() => handleSort('year_build')}>
                            Год <span className="ml-1 text-[10px]">{getSortIcon('year_build')}</span>
                          </th>
                          <th className="cursor-pointer whitespace-nowrap bg-zinc-50 px-3 py-2.5 text-left text-[11px] font-medium uppercase text-zinc-500 hover:bg-zinc-100 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700" onClick={() => handleSort('material')}>
                            Материал <span className="ml-1 text-[10px]">{getSortIcon('material')}</span>
                          </th>
                          <th className="cursor-pointer whitespace-nowrap bg-zinc-50 px-3 py-2.5 text-left text-[11px] font-medium uppercase text-zinc-500 hover:bg-zinc-100 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700" onClick={() => handleSort('price')}>
                            Цена <span className="ml-1 text-[10px]">{getSortIcon('price')}</span>
                          </th>
                          <th className="cursor-pointer whitespace-nowrap bg-zinc-50 px-3 py-2.5 text-left text-[11px] font-medium uppercase text-zinc-500 hover:bg-zinc-100 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700" onClick={() => handleSort('doc')}>
                            Док. <span className="ml-1 text-[10px]">{getSortIcon('doc')}</span>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {pagedDeals.map((deal) => (
                          <tr
                            key={deal.id}
                            onClick={() => setSelectedDealForMap(deal)}
                            className={`cursor-pointer border-b border-zinc-100 transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800 ${selectedDealForMap?.id === deal.id ? 'bg-blue-50 dark:bg-blue-900/20' : ''}`}
                          >
                            <td className="whitespace-nowrap px-3 py-2 text-sm font-medium text-zinc-950 dark:text-white">{formatPeriod(deal.year_quarter)}</td>
                            <td className="px-3 py-2">
                              <Badge color="zinc">{getRealEstateTypeName(deal.realestate_type_code).substring(0, 3)}</Badge>
                            </td>
                            <td className="max-w-[250px] px-3 py-2">
                              <div className="flex flex-col gap-px">
                                {deal.city && <span className="truncate text-sm font-medium text-zinc-950 dark:text-white">{deal.city}</span>}
                                {deal.street && <span className="truncate text-xs text-zinc-500 dark:text-zinc-400">{deal.street}</span>}
                                {deal.district && <span className="text-[11px] text-zinc-400 dark:text-zinc-500">{deal.district}</span>}
                                {deal.quarter_cad_number && (
                                  <span className="mt-1 text-[11px] text-zinc-400 dark:text-zinc-500">
                                    {deal.quarter_cad_number}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="whitespace-nowrap px-3 py-2 text-xs text-zinc-500 dark:text-zinc-400">
                              {deal.area > 0 ? `${formatNumber(deal.area)}` : '—'}
                              {deal.number > 1 && <span className="ml-0.5 text-zinc-400">×{deal.number}</span>}
                            </td>
                            <td className="whitespace-nowrap px-3 py-2 text-center text-xs text-zinc-500 dark:text-zinc-400">{deal.floor || '—'}</td>
                            <td className="whitespace-nowrap px-3 py-2 text-center text-xs text-zinc-500 dark:text-zinc-400">{deal.year_build || '—'}</td>
                            <td className="max-w-[100px] truncate px-3 py-2 text-xs text-zinc-500 dark:text-zinc-400">{getWallMaterialName(deal.wall_material_code)}</td>
                            <td className="whitespace-nowrap px-3 py-2">
                              <div className="text-sm font-semibold text-green-600 dark:text-green-400">{formatPrice(deal.deal_price)} ₽</div>
                              {formatPricePerMeter(deal.deal_price, deal.area) && (
                                <div className="text-[11px] text-zinc-500 dark:text-zinc-400">{formatPricePerMeter(deal.deal_price, deal.area)}</div>
                              )}
                            </td>
                            <td className="px-3 py-2">
                              <Badge color={deal.doc_type === 'ДКП' ? 'green' : deal.doc_type === 'ДДУ' ? 'red' : 'zinc'}>
                                {deal.doc_type}
                              </Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {loading && (
                      <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/70 dark:bg-zinc-900/70" style={{ pointerEvents: 'auto' }}>
                        <div className="flex items-center gap-2 rounded-lg bg-white px-5 py-3 shadow-md dark:bg-zinc-800">
                          <svg className="h-4 w-4 animate-spin text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                          </svg>
                          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Загрузка...</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Pagination */}
                  {totalPages > 1 && (
                    <div className="flex items-center justify-center gap-4 border-t border-zinc-200 px-5 py-4 dark:border-zinc-700">
                      <Button disabled={loading || currentPage === 1} onClick={() => {
                        setPage((p) => p - 1);
                        setSearchTrigger((n) => n + 1);
                      }}>
                        Назад
                      </Button>
                      <span className="text-sm text-zinc-500 dark:text-zinc-400">
                        Страница {currentPage} из {totalPages}
                      </span>
                      <Button disabled={loading || currentPage === totalPages} onClick={() => {
                        setPage((p) => p + 1);
                        setSearchTrigger((n) => n + 1);
                      }}>
                        Вперёд
                      </Button>
                    </div>
                  )}
                </>
              )}
            </>
          ) : (
            <div className="py-12 text-center text-zinc-500 dark:text-zinc-400">Сделки не найдены. Измените параметры фильтра.</div>
          )}
        </div>
      </div>

      {/* Saved Filters Panel */}
      <SavedFiltersPanel
        open={showSavedPanel}
        onClose={() => setShowSavedPanel(false)}
        currentState={getCurrentFilterState()}
        onApply={handleApplySavedFilter}
        activeFilterId={activeFilterId}
      />

      {/* Deal Map */}
      {selectedDealForMap && (
        <DealMap
          quarters={cadastralQuarters}
          selectedDeal={selectedDealForMap}
          filterPolygons={polygonsCoords}
          onClose={() => setSelectedDealForMap(null)}
        />
      )}
    </div>
  );
};

export default SearchPage;
