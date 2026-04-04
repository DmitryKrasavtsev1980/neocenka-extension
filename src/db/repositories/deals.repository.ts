import { db } from '../database';
import { Deal, SearchFilters, SearchResult } from '@/types';

const DEFAULT_PAGE_SIZE = 50;

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
   * Получение всех отфильтрованных сделок (для аналитики)
   * Ограничено 100000 записями для производительности
   */
  async searchAll(filters: SearchFilters, maxRecords = 100000): Promise<Deal[]> {
    let collection = db.deals.toCollection();

    // Применяем фильтры
    if (filters.region_codes?.length) {
      collection = db.deals.where('region_code').anyOf(filters.region_codes);
    }

    // Фильтруем остальные условия
    let filteredDeals = await collection.toArray();

    // Фильтр по районам
    if (filters.districts?.length) {
      filteredDeals = filteredDeals.filter((d) => filters.districts!.includes(d.district));
    }

    // Фильтр по населённым пунктам
    if (filters.cities?.length) {
      filteredDeals = filteredDeals.filter((d) => filters.cities!.includes(d.city));
    }

    // Фильтр по типу объекта
    if (filters.realestate_type_codes?.length) {
      filteredDeals = filteredDeals.filter((d) =>
        filters.realestate_type_codes!.includes(d.realestate_type_code)
      );
    }

    // Фильтр по типу документа
    if (filters.doc_types?.length) {
      filteredDeals = filteredDeals.filter((d) => filters.doc_types!.includes(d.doc_type));
    }

    // Фильтр по периоду
    if (filters.year_quarters?.length) {
      // Конкретные периоды
      filteredDeals = filteredDeals.filter((d) =>
        filters.year_quarters!.includes(d.year_quarter)
      );
    } else if (filters.year || filters.quarters?.length) {
      // Год + кварталы (старый способ)
      filteredDeals = filteredDeals.filter((d) => {
        const [yearStr, quarterStr] = d.year_quarter.split('-Q');
        const year = parseInt(yearStr);
        const quarter = parseInt(quarterStr);

        if (filters.year && year !== filters.year) return false;
        if (filters.quarters?.length && !filters.quarters.includes(quarter)) return false;
        return true;
      });
    }

    // Фильтр по цене
    if (filters.price_min !== undefined) {
      filteredDeals = filteredDeals.filter((d) => d.deal_price >= filters.price_min!);
    }
    if (filters.price_max !== undefined) {
      filteredDeals = filteredDeals.filter((d) => d.deal_price <= filters.price_max!);
    }

    // Фильтр по площади
    if (filters.area_min !== undefined) {
      filteredDeals = filteredDeals.filter((d) => d.area >= filters.area_min!);
    }
    if (filters.area_max !== undefined) {
      filteredDeals = filteredDeals.filter((d) => d.area <= filters.area_max!);
    }

    // Фильтр по году постройки
    if (filters.year_build_min !== undefined) {
      filteredDeals = filteredDeals.filter((d) => d.year_build !== null && d.year_build >= filters.year_build_min!);
    }
    if (filters.year_build_max !== undefined) {
      filteredDeals = filteredDeals.filter((d) => d.year_build !== null && d.year_build <= filters.year_build_max!);
    }

    // Фильтр по этажу
    if (filters.floor_min !== undefined) {
      filteredDeals = filteredDeals.filter((d) => d.floor !== null && d.floor >= filters.floor_min!);
    }
    if (filters.floor_max !== undefined) {
      filteredDeals = filteredDeals.filter((d) => d.floor !== null && d.floor <= filters.floor_max!);
    }

    // Фильтр по материалу стен
    if (filters.wall_material_codes?.length) {
      filteredDeals = filteredDeals.filter((d) =>
        filters.wall_material_codes!.includes(d.wall_material_code)
      );
    }

    // Поиск по городу
    if (filters.search_city) {
      const terms = filters.search_city
        .split(/[,;]/)
        .map((s) => s.trim().toLowerCase())
        .filter((s) => s.length > 0);
      if (terms.length > 0) {
        filteredDeals = filteredDeals.filter((d) =>
          terms.some((term) => d.city.toLowerCase().includes(term))
        );
      }
    }

    // Поиск по улице
    if (filters.search_street) {
      const terms = filters.search_street
        .split(/[,;]/)
        .map((s) => s.trim().toLowerCase())
        .filter((s) => s.length > 0);
      if (terms.length > 0) {
        filteredDeals = filteredDeals.filter((d) =>
          terms.some((term) => d.street.toLowerCase().includes(term))
        );
      }
    }

    // Ограничиваем количество для производительности
    return filteredDeals.slice(0, maxRecords);
  },

  /**
   * Поиск сделок с фильтрацией и пагинацией
   */
  async search(filters: SearchFilters, page = 1, pageSize = DEFAULT_PAGE_SIZE): Promise<SearchResult> {
    let collection = db.deals.toCollection();

    // Применяем фильтры
    if (filters.region_codes?.length) {
      collection = db.deals.where('region_code').anyOf(filters.region_codes);
    }

    // Фильтруем остальные условия
    let filteredDeals = await collection.toArray();

    // Фильтр по районам
    if (filters.districts?.length) {
      filteredDeals = filteredDeals.filter((d) => filters.districts!.includes(d.district));
    }

    // Фильтр по населённым пунктам
    if (filters.cities?.length) {
      filteredDeals = filteredDeals.filter((d) => filters.cities!.includes(d.city));
    }

    // Фильтр по типу объекта
    if (filters.realestate_type_codes?.length) {
      filteredDeals = filteredDeals.filter((d) =>
        filters.realestate_type_codes!.includes(d.realestate_type_code)
      );
    }

    // Фильтр по типу документа
    if (filters.doc_types?.length) {
      filteredDeals = filteredDeals.filter((d) => filters.doc_types!.includes(d.doc_type));
    }

    // Фильтр по периоду
    if (filters.year_quarters?.length) {
      // Конкретные периоды
      filteredDeals = filteredDeals.filter((d) =>
        filters.year_quarters!.includes(d.year_quarter)
      );
    } else if (filters.year || filters.quarters?.length) {
      // Год + кварталы (старый способ)
      filteredDeals = filteredDeals.filter((d) => {
        const [yearStr, quarterStr] = d.year_quarter.split('-Q');
        const year = parseInt(yearStr);
        const quarter = parseInt(quarterStr);

        if (filters.year && year !== filters.year) return false;
        if (filters.quarters?.length && !filters.quarters.includes(quarter)) return false;
        return true;
      });
    }

    // Фильтр по цене
    if (filters.price_min !== undefined) {
      filteredDeals = filteredDeals.filter((d) => d.deal_price >= filters.price_min!);
    }
    if (filters.price_max !== undefined) {
      filteredDeals = filteredDeals.filter((d) => d.deal_price <= filters.price_max!);
    }

    // Фильтр по площади
    if (filters.area_min !== undefined) {
      filteredDeals = filteredDeals.filter((d) => d.area >= filters.area_min!);
    }
    if (filters.area_max !== undefined) {
      filteredDeals = filteredDeals.filter((d) => d.area <= filters.area_max!);
    }

    // Фильтр по году постройки
    if (filters.year_build_min !== undefined) {
      filteredDeals = filteredDeals.filter((d) => d.year_build !== null && d.year_build >= filters.year_build_min!);
    }
    if (filters.year_build_max !== undefined) {
      filteredDeals = filteredDeals.filter((d) => d.year_build !== null && d.year_build <= filters.year_build_max!);
    }

    // Фильтр по этажу
    if (filters.floor_min !== undefined) {
      filteredDeals = filteredDeals.filter((d) => d.floor !== null && d.floor >= filters.floor_min!);
    }
    if (filters.floor_max !== undefined) {
      filteredDeals = filteredDeals.filter((d) => d.floor !== null && d.floor <= filters.floor_max!);
    }

    // Фильтр по материалу стен
    if (filters.wall_material_codes?.length) {
      filteredDeals = filteredDeals.filter((d) =>
        filters.wall_material_codes!.includes(d.wall_material_code)
      );
    }

    // Поиск по городу
    if (filters.search_city) {
      const terms = filters.search_city
        .split(/[,;]/)
        .map((s) => s.trim().toLowerCase())
        .filter((s) => s.length > 0);
      if (terms.length > 0) {
        filteredDeals = filteredDeals.filter((d) =>
          terms.some((term) => d.city.toLowerCase().includes(term))
        );
      }
    }

    // Поиск по улице
    if (filters.search_street) {
      const terms = filters.search_street
        .split(/[,;]/)
        .map((s) => s.trim().toLowerCase())
        .filter((s) => s.length > 0);
      if (terms.length > 0) {
        filteredDeals = filteredDeals.filter((d) =>
          terms.some((term) => d.street.toLowerCase().includes(term))
        );
      }
    }

    // Сортировка по дате (новые первые)
    filteredDeals.sort((a, b) => b.period_start_date.localeCompare(a.period_start_date));

    const total = filteredDeals.length;
    const totalPages = Math.ceil(total / pageSize);
    const start = (page - 1) * pageSize;
    const deals = filteredDeals.slice(start, start + pageSize);

    return {
      deals,
      total,
      page,
      pageSize,
      totalPages,
    };
  },

  /**
   * Получение уникальных значений для фильтров
   */
  async getFilterOptions() {
    const deals = await db.deals.toArray();

    const regions = [...new Set(deals.map((d) => d.region_code))].sort();
    const districts = [...new Set(deals.map((d) => d.district).filter(Boolean))].sort();
    const cities = [...new Set(deals.map((d) => d.city).filter(Boolean))].sort();

    // Группируем районы и города по регионам
    const districtsByRegion: Record<string, string[]> = {};
    const citiesByRegion: Record<string, string[]> = {};

    deals.forEach((d) => {
      if (!districtsByRegion[d.region_code]) {
        districtsByRegion[d.region_code] = [];
      }
      if (d.district && !districtsByRegion[d.region_code].includes(d.district)) {
        districtsByRegion[d.region_code].push(d.district);
      }

      if (!citiesByRegion[d.region_code]) {
        citiesByRegion[d.region_code] = [];
      }
      if (d.city && !citiesByRegion[d.region_code].includes(d.city)) {
        citiesByRegion[d.region_code].push(d.city);
      }
    });

    // Сортируем
    Object.keys(districtsByRegion).forEach((key) => {
      districtsByRegion[key].sort();
    });
    Object.keys(citiesByRegion).forEach((key) => {
      citiesByRegion[key].sort();
    });

    return {
      regions,
      districts,
      cities,
      districtsByRegion,
      citiesByRegion,
    };
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
