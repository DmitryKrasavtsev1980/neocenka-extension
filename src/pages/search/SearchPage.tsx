import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { dealsRepository, getDatabaseStats, cadastralRepository } from '@/db';
import { Deal, SearchFilters, SearchResult, DealsStats, CadastralQuarter } from '@/types';
import {
  REAL_ESTATE_TYPES,
  DOCUMENT_TYPES,
  WALL_MATERIALS,
  getRealEstateTypeName,
  getWallMaterialName,
} from '@/constants/catalogs';
import { Dashboard } from '@/components/Dashboard';
import DealMap from '@/components/DealMap';
import SearchByPolygon from '@/components/SearchByPolygon/SearchByPolygon';
import HeatMap from '@/components/HeatMap/HeatMap';
import './SearchPage.css';

type SortField = 'period' | 'price' | 'area' | 'year_quarter';
type SortOrder = 'asc' | 'desc';
type ViewTab = 'table' | 'map' | 'heatmap';

export const SearchPage: React.FC = () => {
  const [stats, setStats] = useState<DealsStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [allFilteredDeals, setAllFilteredDeals] = useState<Deal[]>([]);
  const [page, setPage] = useState(1);
  const [initialLoadDone, setInitialLoadDone] = useState(false);

  // Сортировка
  const [sortField, setSortField] = useState<SortField>('period');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

  // Фильтры
  const [selectedRegions, setSelectedRegions] = useState<string[]>([]);
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [selectedDocTypes, setSelectedDocTypes] = useState<string[]>([]);
  const [selectedPeriods, setSelectedPeriods] = useState<string[]>([]); // Формат: "2024-Q1"
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
  const [activeTab, setActiveTab] = useState<ViewTab>('table');
  const [cadastralQuarters, setCadastralQuarters] = useState<CadastralQuarter[]>([]);
  const [selectedCadNumbers, setSelectedCadNumbers] = useState<string[]>([]);

  // Генерируем список доступных периодов из статистики
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

  // Начальная загрузка данных
  useEffect(() => {
    if (stats && stats.totalDeals > 0 && !initialLoadDone) {
      setInitialLoadDone(true);
      doSearch();
    }
  }, [stats, initialLoadDone]);

  const loadStats = async () => {
    const dbStats = await getDatabaseStats();
    setStats(dbStats);
  };

  const doSearch = useCallback(async () => {
    setLoading(true);
    try {
      // Парсим выбранные периоды
      let yearFilter: number | undefined;
      let quarterFilter: number[] | undefined;
      let yearQuartersFilter: string[] | undefined;

      if (selectedPeriods.length > 0) {
        // Если выбраны конкретные периоды, используем их
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

      console.log('[SearchPage] Выполняем поиск с фильтрами:', searchFilters);

      // Загружаем страницу результатов
      const searchResult = await dealsRepository.search(searchFilters, page);
      console.log('[SearchPage] Результат поиска:', searchResult.total, 'сделок');
      setResult(searchResult);

      // Загружаем все отфильтрованные данные для аналитики
      const allDeals = await dealsRepository.searchAll(searchFilters);
      console.log('[SearchPage] Загружено для аналитики:', allDeals.length, 'сделок');

      // Проверяем year_quarter в данных
      if (allDeals.length > 0) {
        const periods = [...new Set(allDeals.map(d => d.year_quarter))];
        console.log('[SearchPage] Периоды в данных:', periods);
      }

      setAllFilteredDeals(allDeals);
    } catch (error) {
      console.error('Ошибка поиска:', error);
    } finally {
      setLoading(false);
    }
  }, [selectedRegions, selectedTypes, selectedDocTypes, selectedPeriods, selectedWallMaterials, priceMin, priceMax, areaMin, areaMax, floorMin, floorMax, yearBuildMin, yearBuildMax, searchCity, searchStreet, selectedCadNumbers, page]);

  // Поиск при смене страницы
  useEffect(() => {
    if (initialLoadDone) {
      doSearch();
    }
  }, [page]);

  const handleSearch = () => {
    setPage(1);
    doSearch();
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
    setPage(1);
    setResult(null);
    setAllFilteredDeals([]);
  };

  const handleQuartersSelected = (cadNumbers: string[]) => {
    setSelectedCadNumbers(cadNumbers);
    setPage(1);
  };

  const toggleRegion = (region: string) => {
    setSelectedRegions((prev) =>
      prev.includes(region) ? prev.filter((r) => r !== region) : [...prev, region]
    );
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
  };

  const sortDeals = (deals: Deal[]): Deal[] => {
    const sorted = [...deals];
    sorted.sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case 'period':
          comparison = a.period_start_date.localeCompare(b.period_start_date);
          break;
        case 'price':
          comparison = a.deal_price - b.deal_price;
          break;
        case 'area':
          comparison = a.area - b.area;
          break;
        case 'year_quarter':
          comparison = a.year_quarter.localeCompare(b.year_quarter);
          break;
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });
    return sorted;
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

  const formatPricePerMeterShort = (price: number, area: number): string | null => {
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

  // Экспорт в HTML
  const exportToHtml = () => {
    const deals = allFilteredDeals;
    if (deals.length === 0) {
      alert('Нет данных для экспорта');
      return;
    }

    // Вычисляем статистику
    const totalSum = deals.reduce((acc, d) => acc + d.deal_price, 0);
    const avgPrice = Math.round(totalSum / deals.length);
    const prices = deals.map(d => d.deal_price).filter(p => p > 0).sort((a, b) => a - b);
    const medianPrice = prices.length > 0 ? prices[Math.floor(prices.length / 2)] : 0;
    const areas = deals.map(d => d.area).filter(a => a > 0);
    const avgArea = areas.length > 0 ? Math.round(areas.reduce((a, b) => a + b, 0) / areas.length) : 0;

    // Формируем описание фильтров
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

    const html = `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Отчёт по сделкам - ${new Date().toLocaleDateString('ru-RU')}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; color: #333; line-height: 1.5; }
    .report-container { max-width: 1400px; margin: 0 auto; padding: 20px; }
    .report-header { background: #fff; border-radius: 8px; padding: 20px; margin-bottom: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .report-header h1 { font-size: 24px; margin-bottom: 10px; }
    .report-date { color: #666; font-size: 14px; }
    .filters-summary { background: #e8f0fe; border-radius: 8px; padding: 15px; margin-top: 15px; }
    .filters-summary h3 { font-size: 14px; margin-bottom: 10px; color: #1a73e8; }
    .filters-list { display: flex; flex-wrap: wrap; gap: 8px; }
    .filter-tag { background: #fff; padding: 4px 10px; border-radius: 4px; font-size: 12px; border: 1px solid #d0d0d0; }
    .metrics-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-bottom: 20px; }
    .metric-card { background: #fff; border-radius: 8px; padding: 20px; text-align: center; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .metric-value { font-size: 24px; font-weight: 600; color: #1a73e8; }
    .metric-label { font-size: 13px; color: #666; margin-top: 5px; }
    .table-container { background: #fff; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); overflow: hidden; }
    .table-header { padding: 15px 20px; border-bottom: 1px solid #e0e0e0; }
    .table-header h2 { font-size: 18px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 12px 15px; text-align: left; border-bottom: 1px solid #e0e0e0; }
    th { background: #f8f9fa; font-weight: 600; font-size: 13px; color: #666; position: sticky; top: 0; cursor: pointer; user-select: none; }
    th:hover { background: #e8e8e8; }
    th.sortable::after { content: ' ⇅'; opacity: 0.5; }
    th.sort-asc::after { content: ' ↑'; opacity: 1; color: #1a73e8; }
    th.sort-desc::after { content: ' ↓'; opacity: 1; color: #1a73e8; }
    tr:hover { background: #f8f9fa; }
    .price { font-weight: 600; color: #34a853; }
    .price-per-meter { font-size: 11px; color: #666; margin-top: 2px; }
    .type-badge { display: inline-block; padding: 3px 8px; border-radius: 4px; font-size: 11px; font-weight: 500; }
    .type-badge-002001001000 { background: #e8f5e9; color: #2e7d32; }
    .type-badge-002001002000 { background: #e3f2fd; color: #1565c0; }
    .type-badge-002001003000 { background: #fff3e0; color: #e65100; }
    .type-badge-002001009000 { background: #fce4ec; color: #c2185b; }
    .location { font-size: 13px; }
    .location .city { font-weight: 500; }
    .location .street { color: #666; display: block; }
    .location .district { color: #999; font-size: 12px; display: block; }
    .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; margin-top: 20px; }
    @media print { body { background: #fff; } .report-container { max-width: 100%; } }
  </style>
</head>
<body>
  <div class="report-container">
    <div class="report-header">
      <h1>📊 Отчёт по сделкам с недвижимостью</h1>
      <div class="report-date">Дата формирования: ${new Date().toLocaleString('ru-RU')}</div>
      ${filterDescriptions.length > 0 ? `
      <div class="filters-summary">
        <h3>Применённые фильтры:</h3>
        <div class="filters-list">
          ${filterDescriptions.map(d => `<span class="filter-tag">${d}</span>`).join('\n          ')}
        </div>
      </div>
      ` : ''}
    </div>

    <div class="metrics-row">
      <div class="metric-card">
        <div class="metric-value">${formatNumber(deals.length)}</div>
        <div class="metric-label">Сделок</div>
      </div>
      <div class="metric-card">
        <div class="metric-value">${formatPrice(totalSum)} ₽</div>
        <div class="metric-label">Общая сумма</div>
      </div>
      <div class="metric-card">
        <div class="metric-value">${formatPrice(avgPrice)} ₽</div>
        <div class="metric-label">Средняя цена</div>
      </div>
      <div class="metric-card">
        <div class="metric-value">${formatPrice(medianPrice)} ₽</div>
        <div class="metric-label">Медианная цена</div>
      </div>
      <div class="metric-card">
        <div class="metric-value">${formatNumber(avgArea)} м²</div>
        <div class="metric-label">Средняя площадь</div>
      </div>
    </div>

    <div class="table-container">
      <div class="table-header">
        <h2>Сделки (${formatNumber(deals.length)} записей)</h2>
      </div>
      <table id="dealsTable">
        <thead>
          <tr>
            <th class="sortable" data-sort="period">Период</th>
            <th class="sortable" data-sort="type">Тип</th>
            <th>Локация</th>
            <th class="sortable" data-sort="area">Площадь</th>
            <th class="sortable" data-sort="floor">Этаж</th>
            <th class="sortable" data-sort="year">Год</th>
            <th>Материал</th>
            <th class="sortable" data-sort="price">Цена</th>
            <th>Док.</th>
          </tr>
        </thead>
        <tbody>
          ${deals.map(deal => `
          <tr data-period="${deal.year_quarter}" data-type="${deal.realestate_type_code}" data-area="${deal.area}" data-floor="${deal.floor || 0}" data-year="${deal.year_build || 0}" data-price="${deal.deal_price}">
            <td>${formatPeriod(deal.year_quarter)}</td>
            <td><span class="type-badge type-badge-${deal.realestate_type_code}">${getRealEstateTypeName(deal.realestate_type_code).substring(0, 3)}</span></td>
            <td>
              <div class="location">
                ${deal.city ? `<span class="city">${deal.city}</span>` : ''}
                ${deal.street ? `<span class="street">${deal.street}</span>` : ''}
                ${deal.district ? `<span class="district">${deal.district}</span>` : ''}
                ${deal.quarter_cad_number ? `<a href="https://map.ru/pkk?query=${deal.quarter_cad_number}" target="_blank" rel="noopener noreferrer" class="cad-number" onclick="navigator.clipboard.writeText('${deal.quarter_cad_number}')">📍 ${deal.quarter_cad_number}</a>` : ''}
              </div>
            </td>
            <td>${deal.area > 0 ? formatNumber(deal.area) : '—'}${deal.number > 1 ? ` ×${deal.number}` : ''}</td>
            <td>${deal.floor || '—'}</td>
            <td>${deal.year_build || '—'}</td>
            <td>${getWallMaterialName(deal.wall_material_code)}</td>
            <td class="price">
              <div class="price-value">${formatPrice(deal.deal_price)} ₽</div>
              ${deal.area > 0 ? `<div class="price-per-meter">${formatPricePerMeter(deal.deal_price, deal.area)}</div>` : ''}
            </td>
            <td>${deal.doc_type}</td>
          </tr>
          `).join('')}
        </tbody>
      </table>
    </div>

    <div class="footer">
      Сформировано автоматически • ${new Date().toLocaleString('ru-RU')}
    </div>
  </div>
  <script>
    let currentSort = { field: null, order: 'desc' };

    document.querySelectorAll('th.sortable').forEach(th => {
      th.addEventListener('click', () => {
        const field = th.dataset.sort;
        const table = document.getElementById('dealsTable');
        const tbody = table.querySelector('tbody');
        const rows = Array.from(tbody.querySelectorAll('tr'));

        // Определяем направление сортировки
        if (currentSort.field === field) {
          currentSort.order = currentSort.order === 'asc' ? 'desc' : 'asc';
        } else {
          currentSort.field = field;
          currentSort.order = 'desc';
        }

        // Обновляем визуальные индикаторы
        document.querySelectorAll('th.sortable').forEach(h => {
          h.classList.remove('sort-asc', 'sort-desc');
        });
        th.classList.add(currentSort.order === 'asc' ? 'sort-asc' : 'sort-desc');

        // Сортируем строки
        rows.sort((a, b) => {
          let valA = a.dataset[field];
          let valB = b.dataset[field];

          // Числовая сортировка для числовых полей
          if (['area', 'floor', 'year', 'price'].includes(field)) {
            valA = parseFloat(valA) || 0;
            valB = parseFloat(valB) || 0;
          }

          if (valA < valB) return currentSort.order === 'asc' ? -1 : 1;
          if (valA > valB) return currentSort.order === 'asc' ? 1 : -1;
          return 0;
        });

        // Перемещаем отсортированные строки
        rows.forEach(row => tbody.appendChild(row));
      });
    });
  </script>
</body>
</html>`;

    // Создаём и скачиваем файл
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

  if (stats && stats.totalDeals === 0) {
    return (
      <div className="search-page">
        <div className="no-data-message">
          <h2>Нет данных для поиска</h2>
          <p>Сначала импортируйте данные о сделках</p>
          <a href="../import/import.html" className="btn btn-primary">
            Перейти к импорту
          </a>
        </div>
      </div>
    );
  }

  const sortedDeals = result ? sortDeals(result.deals) : [];

  return (
    <div className="search-page">
      <header className="page-header">
        <h1>🔍 Поиск сделок</h1>
        <div className="header-stats">
          <span>{stats ? formatNumber(stats.totalDeals) : 0} сделок в базе</span>
          <a href="../import/import.html" className="nav-link">
            📥 Импорт
          </a>
        </div>
      </header>

      {/* Табы навигации */}
      <div className="view-tabs">
        <button
          className={`view-tab ${activeTab === 'table' ? 'active' : ''}`}
          onClick={() => setActiveTab('table')}
        >
          Таблица
        </button>
        <button
          className={`view-tab ${activeTab === 'map' ? 'active' : ''}`}
          onClick={() => setActiveTab('map')}
        >
          Карта (поиск по полигону)
        </button>
        <button
          className={`view-tab ${activeTab === 'heatmap' ? 'active' : ''}`}
          onClick={() => setActiveTab('heatmap')}
        >
          Тепловая карта
        </button>
        {selectedCadNumbers.length > 0 && (
          <span className="tab-filter-badge">
            Фильтр: {selectedCadNumbers.length} кварталов
          </span>
        )}
      </div>

      {/* Таб: Таблица (поиск + фильтры + результаты) */}
      {activeTab === 'table' && (
      <div className="search-container">
        {/* Быстрый поиск */}
        <div className="quick-search">
          <input
            type="text"
            placeholder="Город (через запятую для нескольких)..."
            value={searchCity}
            onChange={(e) => setSearchCity(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          />
          <input
            type="text"
            placeholder="Улица (через запятую для нескольких)..."
            value={searchStreet}
            onChange={(e) => setSearchStreet(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          />
          <button className="btn btn-primary" onClick={handleSearch}>
            Найти
          </button>
          <button className="btn btn-secondary" onClick={() => setShowFilters(!showFilters)}>
            {showFilters ? 'Скрыть фильтры' : 'Фильтры'}
          </button>
        </div>

        {/* Расширенные фильтры */}
        {showFilters && (
          <div className="filters">
            <div className="filter-row">
              <div className="filter-group">
                <h4>Тип объекта</h4>
                <div className="filter-options">
                  {Object.entries(REAL_ESTATE_TYPES).map(([code, name]) => (
                    <label key={code} className="filter-checkbox">
                      <input
                        type="checkbox"
                        checked={selectedTypes.includes(code)}
                        onChange={() => toggleType(code)}
                      />
                      <span>{name}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="filter-group">
                <h4>Тип документа</h4>
                <div className="filter-options">
                  {Object.entries(DOCUMENT_TYPES).map(([code, name]) => (
                    <label key={code} className="filter-checkbox">
                      <input
                        type="checkbox"
                        checked={selectedDocTypes.includes(code)}
                        onChange={() => toggleDocType(code)}
                      />
                      <span>{name}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            {/* Фильтр по периодам - новый дизайн */}
            <div className="filter-row">
              <div className="filter-group filter-group-full">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <h4 style={{ margin: 0 }}>Период (год-квартал)</h4>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={{ fontSize: '11px', padding: '4px 8px' }}
                      onClick={selectAllPeriods}
                    >
                      Выбрать все
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={{ fontSize: '11px', padding: '4px 8px' }}
                      onClick={clearPeriods}
                    >
                      Очистить
                    </button>
                  </div>
                </div>
                <div className="filter-options periods-grid">
                  {availablePeriods.map((period) => (
                    <label key={period} className="filter-checkbox">
                      <input
                        type="checkbox"
                        checked={selectedPeriods.includes(period)}
                        onChange={() => togglePeriod(period)}
                      />
                      <span>{formatPeriod(period)}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="filter-row">
              <div className="filter-group filter-group-wide">
                <h4>Цена (руб)</h4>
                <div className="range-inputs">
                  <input
                    type="number"
                    placeholder="От"
                    value={priceMin}
                    onChange={(e) => setPriceMin(e.target.value)}
                  />
                  <span className="range-separator">—</span>
                  <input
                    type="number"
                    placeholder="До"
                    value={priceMax}
                    onChange={(e) => setPriceMax(e.target.value)}
                  />
                </div>
              </div>

              <div className="filter-group filter-group-wide">
                <h4>Площадь (м²)</h4>
                <div className="range-inputs">
                  <input
                    type="number"
                    placeholder="От"
                    value={areaMin}
                    onChange={(e) => setAreaMin(e.target.value)}
                  />
                  <span className="range-separator">—</span>
                  <input
                    type="number"
                    placeholder="До"
                    value={areaMax}
                    onChange={(e) => setAreaMax(e.target.value)}
                  />
                </div>
              </div>
            </div>

            <div className="filter-row">
              <div className="filter-group filter-group-wide">
                <h4>Этаж</h4>
                <div className="range-inputs">
                  <input
                    type="number"
                    placeholder="От"
                    value={floorMin}
                    onChange={(e) => setFloorMin(e.target.value)}
                  />
                  <span className="range-separator">—</span>
                  <input
                    type="number"
                    placeholder="До"
                    value={floorMax}
                    onChange={(e) => setFloorMax(e.target.value)}
                  />
                </div>
              </div>

              <div className="filter-group filter-group-wide">
                <h4>Год постройки</h4>
                <div className="range-inputs">
                  <input
                    type="number"
                    placeholder="От"
                    value={yearBuildMin}
                    onChange={(e) => setYearBuildMin(e.target.value)}
                  />
                  <span className="range-separator">—</span>
                  <input
                    type="number"
                    placeholder="До"
                    value={yearBuildMax}
                    onChange={(e) => setYearBuildMax(e.target.value)}
                  />
                </div>
              </div>
            </div>

            <div className="filter-row">
              <div className="filter-group filter-group-full">
                <h4>Материал стен</h4>
                <div className="filter-options wall-materials">
                  {Object.entries(WALL_MATERIALS).map(([code, name]) => (
                    <label key={code} className="filter-checkbox">
                      <input
                        type="checkbox"
                        checked={selectedWallMaterials.includes(code)}
                        onChange={() => toggleWallMaterial(code)}
                      />
                      <span>{name}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            {stats && stats.regions.length > 0 && stats.regions.length <= 20 && (
              <div className="filter-row">
                <div className="filter-group filter-group-full">
                  <h4>Регион</h4>
                  <div className="filter-options regions">
                    {stats.regions.map((region) => (
                      <label key={region} className="filter-checkbox">
                        <input
                          type="checkbox"
                          checked={selectedRegions.includes(region)}
                          onChange={() => toggleRegion(region)}
                        />
                        <span>{region}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <div className="filter-actions">
              <button className="btn btn-primary" onClick={handleSearch}>
                Применить фильтры
              </button>
              <button className="btn btn-secondary" onClick={exportToHtml}>
                📤 Экспорт в HTML
              </button>
            </div>
          </div>
        )}

        {/* Дашборд аналитики */}
        {allFilteredDeals.length > 0 && (
          <Dashboard deals={allFilteredDeals} totalDeals={result?.total || allFilteredDeals.length} />
        )}

        {/* Результаты */}
        <div className="results">
          {loading ? (
            <div className="loading">Поиск...</div>
          ) : result ? (
            <>
              <div className="results-header">
                <span>Найдено: {formatNumber(result.total)} сделок</span>
                <button className="btn btn-secondary" onClick={exportToHtml}>
                  📤 Экспорт в HTML
                </button>
              </div>

              {result.deals.length === 0 ? (
                <div className="no-results">Ничего не найдено</div>
              ) : (
                <>
                  <div className="results-table-wrapper">
                    <table className="results-table">
                      <thead>
                        <tr>
                          <th
                            className="sortable"
                            onClick={() => handleSort('year_quarter')}
                          >
                            Период <span className="sort-icon">{getSortIcon('year_quarter')}</span>
                          </th>
                          <th>Тип</th>
                          <th>Локация</th>
                          <th
                            className="sortable"
                            onClick={() => handleSort('area')}
                          >
                            Пл. <span className="sort-icon">{getSortIcon('area')}</span>
                          </th>
                          <th>Этаж</th>
                          <th>Год</th>
                          <th>Материал</th>
                          <th
                            className="sortable"
                            onClick={() => handleSort('price')}
                          >
                            Цена <span className="sort-icon">{getSortIcon('price')}</span>
                          </th>
                          <th>Док.</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sortedDeals.map((deal) => (
                          <tr
                            key={deal.id}
                            onClick={() => setSelectedDealForMap(deal)}
                            style={{ cursor: 'pointer' }}
                            className={selectedDealForMap?.id === deal.id ? 'selected-row' : ''}
                          >
                            <td className="period">{formatPeriod(deal.year_quarter)}</td>
                            <td>
                              <span className="type-badge type-badge-small">
                                {getRealEstateTypeName(deal.realestate_type_code).substring(0, 3)}
                              </span>
                            </td>
                            <td>
                              <div className="location">
                                {deal.city && <span className="city">{deal.city}</span>}
                                {deal.street && <span className="street">{deal.street}</span>}
                                {deal.district && (
                                  <span className="district">{deal.district}</span>
                                )}
                                {deal.quarter_cad_number && (
                                  <a
                                    href={`https://map.ru/pkk?query=${deal.quarter_cad_number}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="cad-number"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      navigator.clipboard.writeText(deal.quarter_cad_number);
                                    }}
                                    title="Клик: открыть карту и скопировать номер"
                                  >
                                    📍 {deal.quarter_cad_number}
                                  </a>
                                )}
                              </div>
                            </td>
                            <td className="area">
                              {deal.area > 0 ? `${formatNumber(deal.area)}` : '—'}
                              {deal.number > 1 && <span className="count">×{deal.number}</span>}
                            </td>
                            <td className="floor">{deal.floor || '—'}</td>
                            <td className="year">{deal.year_build || '—'}</td>
                            <td className="material">{getWallMaterialName(deal.wall_material_code)}</td>
                            <td className="price">
                              <div className="price-value">{formatPrice(deal.deal_price)} ₽</div>
                              {formatPricePerMeter(deal.deal_price, deal.area) && (
                                <div className="price-per-meter">{formatPricePerMeter(deal.deal_price, deal.area)}</div>
                              )}
                            </td>
                            <td>
                              <span className={`doc-type doc-type-small ${deal.doc_type}`}>
                                {deal.doc_type}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Пагинация */}
                  {result.totalPages > 1 && (
                    <div className="pagination">
                      <button
                        className="btn btn-secondary"
                        disabled={page === 1}
                        onClick={() => setPage((p) => p - 1)}
                      >
                        ← Назад
                      </button>
                      <span className="page-info">
                        Страница {page} из {result.totalPages}
                      </span>
                      <button
                        className="btn btn-secondary"
                        disabled={page === result.totalPages}
                        onClick={() => setPage((p) => p + 1)}
                      >
                        Вперёд →
                      </button>
                    </div>
                  )}
                </>
              )}
            </>
          ) : (
            <div className="no-results">Загрузка данных...</div>
          )}
        </div>
      </div>
      )}

      {/* Таб: Карта (поиск по полигону) */}
      {activeTab === 'map' && (
        <SearchByPolygon
          quarters={cadastralQuarters}
          deals={allFilteredDeals}
          onQuartersSelected={handleQuartersSelected}
        />
      )}

      {/* Таб: Тепловая карта */}
      {activeTab === 'heatmap' && (
        <HeatMap
          quarters={cadastralQuarters}
          deals={allFilteredDeals}
        />
      )}

      {/* Карта сделки */}
      {selectedDealForMap && (
        <DealMap
          deals={allFilteredDeals}
          selectedDeal={selectedDealForMap}
          onClose={() => setSelectedDealForMap(null)}
        />
      )}
    </div>
  );
};

export default SearchPage;
