import { db } from '../database';
import { Deal, SearchFilters, SearchResult, SearchLightResult, SearchAggregates } from '@/types';

const DEFAULT_PAGE_SIZE = 50;

/**
 * Применяет фильтры к коллекции. Возвращает отфильтрованный массив.
 * Единственное место где происходит загрузка + фильтрация данных.
 */
function applyFilters(filters: SearchFilters): Promise<Deal[]> {
  let collection = db.deals.toCollection();

  if (filters.region_codes?.length) {
    collection = db.deals.where('region_code').anyOf(filters.region_codes);
  }

  let filteredDeals = collection.toArray();

  // Предвычисляем Set'ы для O(1) проверок
  const districtsSet = filters.districts?.length ? new Set(filters.districts) : null;
  const citiesSet = filters.cities?.length ? new Set(filters.cities) : null;
  const typeCodesSet = filters.realestate_type_codes?.length ? new Set(filters.realestate_type_codes) : null;
  const docTypesSet = filters.doc_types?.length ? new Set(filters.doc_types) : null;
  const yearQuartersSet = filters.year_quarters?.length ? new Set(filters.year_quarters) : null;
  const wallCodesSet = filters.wall_material_codes?.length ? new Set(filters.wall_material_codes) : null;
  const cadNumbersSet = filters.quarter_cad_numbers?.length ? new Set(filters.quarter_cad_numbers) : null;

  // Предвычисляем термины поиска
  let cityTerms: string[] | null = null;
  if (filters.search_city) {
    cityTerms = filters.search_city.split(/[,;]/).map(s => s.trim().toLowerCase()).filter(s => s.length > 0);
    if (cityTerms.length === 0) cityTerms = null;
  }
  let streetTerms: string[] | null = null;
  if (filters.search_street) {
    streetTerms = filters.search_street.split(/[,;]/).map(s => s.trim().toLowerCase()).filter(s => s.length > 0);
    if (streetTerms.length === 0) streetTerms = null;
  }

  const priceMin = filters.price_min;
  const priceMax = filters.price_max;
  const areaMin = filters.area_min;
  const areaMax = filters.area_max;
  const yearBuildMin = filters.year_build_min;
  const yearBuildMax = filters.year_build_max;
  const floorMin = filters.floor_min;
  const floorMax = filters.floor_max;
  const filterYear = filters.year;
  const filterQuarters = filters.quarters?.length ? new Set(filters.quarters) : null;

  return filteredDeals.then(deals => {
    return deals.filter(d => {
      if (districtsSet && !districtsSet.has(d.district)) return false;
      if (citiesSet && !citiesSet.has(d.city)) return false;
      if (typeCodesSet && !typeCodesSet.has(d.realestate_type_code)) return false;
      if (docTypesSet && !docTypesSet.has(d.doc_type)) return false;

      // Фильтр по периоду
      if (yearQuartersSet) {
        if (!yearQuartersSet.has(d.year_quarter)) return false;
      } else if (filterYear || filterQuarters) {
        const idx = d.year_quarter.indexOf('-Q');
        const year = parseInt(d.year_quarter.substring(0, idx));
        if (filterYear && year !== filterYear) return false;
        if (filterQuarters) {
          const quarter = parseInt(d.year_quarter.substring(idx + 2));
          if (!filterQuarters.has(quarter)) return false;
        }
      }

      if (priceMin !== undefined && d.deal_price < priceMin) return false;
      if (priceMax !== undefined && d.deal_price > priceMax) return false;
      if (areaMin !== undefined && d.area < areaMin) return false;
      if (areaMax !== undefined && d.area > areaMax) return false;
      if (yearBuildMin !== undefined && (d.year_build === null || d.year_build < yearBuildMin)) return false;
      if (yearBuildMax !== undefined && (d.year_build === null || d.year_build > yearBuildMax)) return false;
      if (floorMin !== undefined && (d.floor === null || d.floor < floorMin)) return false;
      if (floorMax !== undefined && (d.floor === null || d.floor > floorMax)) return false;
      if (wallCodesSet) {
        // Нормализация: код в БД может быть с ведущим нулём (061...) или без (61...)
        const wm = d.wall_material_code;
        if (!wm) return false;
        if (!wallCodesSet.has(wm) && !wallCodesSet.has(wm.startsWith('0') ? wm.substring(1) : '0' + wm)) return false;
      }

      if (cityTerms) {
        const cityLower = d.city.toLowerCase();
        if (!cityTerms.some(term => cityLower.includes(term))) return false;
      }
      if (streetTerms) {
        const streetLower = d.street.toLowerCase();
        if (!streetTerms.some(term => streetLower.includes(term))) return false;
      }

      if (cadNumbersSet && !cadNumbersSet.has(d.quarter_cad_number)) return false;

      return true;
    });
  });
}

/**
 * Репозиторий для работы со сделками
 */
export const dealsRepository = {
  /**
   * Лёгкий поиск: cursor-based итерация без загрузки всех сделок в массив.
   * Возвращает текущую страницу + предвычисленные агрегаты для Dashboard.
   */
  async searchLight(filters: SearchFilters, page = 1, pageSize = DEFAULT_PAGE_SIZE, sortField: string = 'period', sortOrder: 'asc' | 'desc' = 'desc'): Promise<SearchLightResult> {
    // Предвычисляем Set'ы для O(1) проверок
    const districtsSet = filters.districts?.length ? new Set(filters.districts) : null;
    const citiesSet = filters.cities?.length ? new Set(filters.cities) : null;
    const typeCodesSet = filters.realestate_type_codes?.length ? new Set(filters.realestate_type_codes) : null;
    const docTypesSet = filters.doc_types?.length ? new Set(filters.doc_types) : null;
    const yearQuartersSet = filters.year_quarters?.length ? new Set(filters.year_quarters) : null;
    const wallCodesSet = filters.wall_material_codes?.length ? new Set(filters.wall_material_codes) : null;
    const cadNumbersSet = filters.quarter_cad_numbers?.length ? new Set(filters.quarter_cad_numbers) : null;

    let cityTerms: string[] | null = null;
    if (filters.search_city) {
      cityTerms = filters.search_city.split(/[,;]/).map(s => s.trim().toLowerCase()).filter(s => s.length > 0);
      if (cityTerms.length === 0) cityTerms = null;
    }
    let streetTerms: string[] | null = null;
    if (filters.search_street) {
      streetTerms = filters.search_street.split(/[,;]/).map(s => s.trim().toLowerCase()).filter(s => s.length > 0);
      if (streetTerms.length === 0) streetTerms = null;
    }

    const priceMin = filters.price_min;
    const priceMax = filters.price_max;
    const areaMin = filters.area_min;
    const areaMax = filters.area_max;
    const yearBuildMin = filters.year_build_min;
    const yearBuildMax = filters.year_build_max;
    const floorMin = filters.floor_min;
    const floorMax = filters.floor_max;
    const filterYear = filters.year;
    const filterQuarters = filters.quarters?.length ? new Set(filters.quarters) : null;

    // Функция проверки фильтров для одной сделки
    function matchesFilter(d: Deal): boolean {
      if (districtsSet && !districtsSet.has(d.district)) return false;
      if (citiesSet && !citiesSet.has(d.city)) return false;
      if (typeCodesSet && !typeCodesSet.has(d.realestate_type_code)) return false;
      if (docTypesSet && !docTypesSet.has(d.doc_type)) return false;

      if (yearQuartersSet) {
        if (!yearQuartersSet.has(d.year_quarter)) return false;
      } else if (filterYear || filterQuarters) {
        const idx = d.year_quarter.indexOf('-Q');
        const year = parseInt(d.year_quarter.substring(0, idx));
        if (filterYear && year !== filterYear) return false;
        if (filterQuarters) {
          const quarter = parseInt(d.year_quarter.substring(idx + 2));
          if (!filterQuarters.has(quarter)) return false;
        }
      }

      if (priceMin !== undefined && d.deal_price < priceMin) return false;
      if (priceMax !== undefined && d.deal_price > priceMax) return false;
      if (areaMin !== undefined && d.area < areaMin) return false;
      if (areaMax !== undefined && d.area > areaMax) return false;
      if (yearBuildMin !== undefined && (d.year_build === null || d.year_build < yearBuildMin)) return false;
      if (yearBuildMax !== undefined && (d.year_build === null || d.year_build > yearBuildMax)) return false;
      if (floorMin !== undefined && (d.floor === null || d.floor < floorMin)) return false;
      if (floorMax !== undefined && (d.floor === null || d.floor > floorMax)) return false;
      if (wallCodesSet) {
        const wm = d.wall_material_code;
        if (!wm) return false;
        if (!wallCodesSet.has(wm) && !wallCodesSet.has(wm.startsWith('0') ? wm.substring(1) : '0' + wm)) return false;
      }
      if (cityTerms) {
        const cityLower = d.city.toLowerCase();
        if (!cityTerms.some(term => cityLower.includes(term))) return false;
      }
      if (streetTerms) {
        const streetLower = d.street.toLowerCase();
        if (!streetTerms.some(term => streetLower.includes(term))) return false;
      }
      if (cadNumbersSet && !cadNumbersSet.has(d.quarter_cad_number)) return false;

      return true;
    }

    // Выбираем начальную коллекцию по индексу region_code (если есть)
    let collection: Dexie.Collection<Deal, number>;
    if (filters.region_codes?.length) {
      collection = db.deals.where('region_code').anyOf(filters.region_codes);
    } else {
      collection = db.deals.toCollection();
    }

    // Итерируем cursor'ом: собираем страницу + агрегаты
    const pageStart = (page - 1) * pageSize;
    const pageEnd = pageStart + pageSize;

    // Собираем ВСЕ совпадающие сделки для сортировки по дате и пагинации
    // Это всё равно дешевле, чем оригинальный toArray() + sort, т.к. мы
    // одновременно считаем агрегаты за один проход
    const matched: Deal[] = [];

    const byType: Record<string, number> = {};
    const byDocType: Record<string, number> = {};
    const byWallMaterial: Record<string, number> = {};
    const byQuarter: Record<string, { count: number; totalPrice: number; totalArea: number }> = {};
    const byCadNumber: Record<string, { count: number; totalPrice: number; totalArea: number }> = {};
    const areasByWallMaterial: Record<string, number[]> = {};
    let priceMin2 = Infinity, priceMax2 = -Infinity, priceSum = 0;
    let areaMin2 = Infinity, areaMax2 = -Infinity, areaSum = 0;
    let totalSum = 0;
    const prices: number[] = [];
    const areas: number[] = [];
    const regionGroups: Record<string, number> = {};

    await collection.each(d => {
      if (!matchesFilter(d)) return;

      // Сохраняем для последующей сортировки/пагинации
      matched.push(d);

      // Агрегаты
      byType[d.realestate_type_code] = (byType[d.realestate_type_code] || 0) + 1;
      byDocType[d.doc_type] = (byDocType[d.doc_type] || 0) + 1;
      if (d.wall_material_code) {
        // Нормализация: убираем ведущий 0, для составных кодов берём первую часть
        let wm = d.wall_material_code;
        if (wm.includes(';')) wm = wm.split(';')[0];
        if (wm.startsWith('0')) wm = wm.substring(1);
        byWallMaterial[wm] = (byWallMaterial[wm] || 0) + 1;
        if (!areasByWallMaterial[wm]) areasByWallMaterial[wm] = [];
        if (d.area > 0) areasByWallMaterial[wm].push(d.area);
      }

      const yq = d.year_quarter;
      if (!byQuarter[yq]) byQuarter[yq] = { count: 0, totalPrice: 0, totalArea: 0 };
      byQuarter[yq].count++;
      byQuarter[yq].totalPrice += d.deal_price;
      byQuarter[yq].totalArea += d.area;

      // Статистика по кад. кварталам
      if (d.quarter_cad_number) {
        if (!byCadNumber[d.quarter_cad_number]) byCadNumber[d.quarter_cad_number] = { count: 0, totalPrice: 0, totalArea: 0 };
        byCadNumber[d.quarter_cad_number].count++;
        byCadNumber[d.quarter_cad_number].totalPrice += d.deal_price;
        byCadNumber[d.quarter_cad_number].totalArea += d.area;
      }

      if (d.deal_price > 0) prices.push(d.deal_price);
      if (d.area > 0) areas.push(d.area);
      if (d.deal_price < priceMin2) priceMin2 = d.deal_price;
      if (d.deal_price > priceMax2) priceMax2 = d.deal_price;
      priceSum += d.deal_price;
      totalSum += d.deal_price;

      if (d.area < areaMin2) areaMin2 = d.area;
      if (d.area > areaMax2) areaMax2 = d.area;
      areaSum += d.area;

      if (d.region_code) {
        regionGroups[d.region_code] = (regionGroups[d.region_code] || 0) + 1;
      }
    });

    // Сортировка
    const mul = sortOrder === 'asc' ? 1 : -1;
    matched.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'price': cmp = a.deal_price - b.deal_price; break;
        case 'area': cmp = a.area - b.area; break;
        case 'floor': cmp = (a.floor || 0) - (b.floor || 0); break;
        case 'year_build': cmp = (a.year_build || 0) - (b.year_build || 0); break;
        case 'year_quarter': cmp = a.year_quarter.localeCompare(b.year_quarter); break;
        case 'type': cmp = a.realestate_type_code.localeCompare(b.realestate_type_code); break;
        case 'material': cmp = (a.wall_material_code || '').localeCompare(b.wall_material_code || ''); break;
        case 'doc': cmp = (a.doc_type || '').localeCompare(b.doc_type || ''); break;
        default: cmp = b.period_start_date.localeCompare(a.period_start_date); break;
      }
      return cmp * mul;
    });

    const totalCount = matched.length;
    const totalPages = Math.ceil(totalCount / pageSize);
    const pageDeals = matched.slice(pageStart, pageEnd);

    // Медиана
    const sortedPrices = prices.sort((a, b) => a - b);
    const sortedAreas = areas.sort((a, b) => a - b);
    const priceMedian = sortedPrices.length > 0 ? sortedPrices[Math.floor(sortedPrices.length / 2)] : 0;
    const areaMedian = sortedAreas.length > 0 ? sortedAreas[Math.floor(sortedAreas.length / 2)] : 0;
    const priceAvg = sortedPrices.length > 0 ? Math.round(priceSum / sortedPrices.length) : 0;
    const areaAvg = sortedAreas.length > 0 ? Math.round(areaSum / sortedAreas.length) : 0;

    // Топ регионов
    const topRegions = Object.entries(regionGroups)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);

    const count = totalCount;
    const aggregates: SearchAggregates = {
      byType,
      byDocType,
      byWallMaterial,
      byQuarter,
      byCadNumber,
      areasByWallMaterial,
      priceRange: count > 0 ? { min: priceMin2, max: priceMax2, sum: priceSum, avg: priceAvg, median: priceMedian } : { min: 0, max: 0, sum: 0, avg: 0, median: 0 },
      areaRange: count > 0 ? { min: areaMin2, max: areaMax2, sum: areaSum, avg: areaAvg, median: areaMedian } : { min: 0, max: 0, sum: 0, avg: 0, median: 0 },
      topRegions,
      totalSum,
      count,
    };

    return { pageDeals, totalCount, totalPages, aggregates };
  },

  /**
   * Массовая вставка сделок (батчами по 1000)
   */
  async bulkInsert(deals: Deal[], batchSize = 1000): Promise<void> {
    for (let i = 0; i < deals.length; i += batchSize) {
      const batch = deals.slice(i, i + batchSize);
      await db.deals.bulkAdd(batch);
    }
  },

  /**
   * Комбинированный поиск: возвращает и страницу, и все отфильтрованные данные
   * Загружает данные из БД только ОДИН раз
   */
  async searchCombined(filters: SearchFilters, page = 1, pageSize = DEFAULT_PAGE_SIZE, maxRecords = 100000): Promise<{
    pageResult: SearchResult;
    allDeals: Deal[];
  }> {
    const allFiltered = await applyFilters(filters);

    // Сортировка по дате (новые первые)
    allFiltered.sort((a, b) => b.period_start_date.localeCompare(a.period_start_date));

    const total = allFiltered.length;
    const totalPages = Math.ceil(total / pageSize);
    const start = (page - 1) * pageSize;
    const pageDeals = allFiltered.slice(start, start + pageSize);

    return {
      pageResult: {
        deals: pageDeals,
        total,
        page,
        pageSize,
        totalPages,
      },
      allDeals: allFiltered.slice(0, maxRecords),
    };
  },

  /**
   * Получение всех отфильтрованных сделок (для аналитики)
   * Ограничено 100000 записями для производительности
   */
  async searchAll(filters: SearchFilters, maxRecords = 100000): Promise<Deal[]> {
    const filtered = await applyFilters(filters);
    return filtered.slice(0, maxRecords);
  },

  /**
   * Поиск сделок с фильтрацией и пагинацией
   */
  async search(filters: SearchFilters, page = 1, pageSize = DEFAULT_PAGE_SIZE): Promise<SearchResult> {
    const allFiltered = await applyFilters(filters);

    // Сортировка по дате (новые первые)
    allFiltered.sort((a, b) => b.period_start_date.localeCompare(a.period_start_date));

    const total = allFiltered.length;
    const totalPages = Math.ceil(total / pageSize);
    const start = (page - 1) * pageSize;
    const deals = allFiltered.slice(start, start + pageSize);

    return {
      deals,
      total,
      page,
      pageSize,
      totalPages,
    };
  },

  /**
   * Получение уникальных значений для фильтров через each() — не загружает все объекты в массив
   */
  async getFilterOptions() {
    const regions = new Set<string>();
    const districts = new Set<string>();
    const cities = new Set<string>();
    const districtsByRegion: Record<string, Set<string>> = {};
    const citiesByRegion: Record<string, Set<string>> = {};

    await db.deals.each(d => {
      regions.add(d.region_code);

      if (d.district) {
        if (!districtsByRegion[d.region_code]) {
          districtsByRegion[d.region_code] = new Set();
        }
        districtsByRegion[d.region_code].add(d.district);
        districts.add(d.district);
      }

      if (d.city) {
        if (!citiesByRegion[d.region_code]) {
          citiesByRegion[d.region_code] = new Set();
        }
        citiesByRegion[d.region_code].add(d.city);
        cities.add(d.city);
      }
    });

    // Конвертируем Set'ы в отсортированные массивы
    const sortedRegions = [...regions].sort();
    const sortedDistricts = [...districts].sort();
    const sortedCities = [...cities].sort();

    const resultDistrictsByRegion: Record<string, string[]> = {};
    const resultCitiesByRegion: Record<string, string[]> = {};

    for (const key of Object.keys(districtsByRegion)) {
      resultDistrictsByRegion[key] = [...districtsByRegion[key]].sort();
    }
    for (const key of Object.keys(citiesByRegion)) {
      resultCitiesByRegion[key] = [...citiesByRegion[key]].sort();
    }

    return {
      regions: sortedRegions,
      districts: sortedDistricts,
      cities: sortedCities,
      districtsByRegion: resultDistrictsByRegion,
      citiesByRegion: resultCitiesByRegion,
    };
  },

  /**
   * Получить уникальные wall_material_code для сделок в указанных кад. кварталах
   */
  async getWallMaterialsByCadNumbers(cadNumbers: string[]): Promise<string[]> {
    if (cadNumbers.length === 0) return [];
    const cadSet = new Set(cadNumbers);
    const materials = new Set<string>();
    await db.deals.each(d => {
      if (cadSet.has(d.quarter_cad_number) && d.wall_material_code) {
        materials.add(d.wall_material_code);
      }
    });
    return [...materials].sort();
  },

  /**
   * Подсчёт общего количества сделок
   */
  async count(): Promise<number> {
    return db.deals.count();
  },

  /**
   * Удаление всех сделок
   */
  async clear(): Promise<void> {
    return db.deals.clear();
  },
};
