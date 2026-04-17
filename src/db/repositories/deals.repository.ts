import { db } from '../database';
import { Deal, SearchFilters, SearchResult } from '@/types';

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
