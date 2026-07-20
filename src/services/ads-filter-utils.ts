/**
 * Утилита применения сохранённого фильтра к массиву ads.
 * Вынесена из AdsPage/AdsSettingsPage для переиспользования в shared-view-builder.
 */

import { pointInPolygons } from '@/utils/geometry';

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

/** Нормализация source (как в AdsPage) */
export function normalizeSource(s: string | null | undefined): string {
  if (!s) return '';
  if (SOURCE_LABELS[s]) return s;
  const keys = Object.keys(SOURCE_LABELS);
  for (const k of keys) {
    if (s.startsWith(k + '.') || s === SOURCE_LABELS[k]) return k;
  }
  return s;
}

export interface FilterState {
  sources?: string[];
  propertyTypes?: string[];
  categoryIds?: number[];
  priceMin?: string;
  priceMax?: string;
  areaMin?: string;
  areaMax?: string;
  floorMin?: string;
  floorMax?: string;
  yearMin?: string;
  yearMax?: string;
  sellerTypes?: string[];
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  searchQuery?: string;
  processingStatus?: string;
  addressId?: number | '';
  contactType?: string;
  processingCategoryId?: number | '';
  processingFloor?: string;
  filterAddressIds?: number[];
  excludedAddressIds?: number[];
  houseSeriesIds?: string[];
  wallMaterialIds?: string[];
  floorsMin?: string;
  floorsMax?: string;
  /** Полигоны (массив контуров, каждый контур — массив [lat, lng]) */
  polygonsCoords?: [number, number][][] | null;
  /** Общий фильтр: применяются только полигоны, остальные поля игнорируются */
  is_general?: boolean;
  [key: string]: unknown;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export function applyFilterToAds(
  ads: any[],
  state: FilterState,
  addresses: any[],
): any[] {
  // Короткое замыкание для «общего» фильтра: игнорируем все поля кроме полигонов.
  // Общий фильтр показывает все объекты и объявления, попадающие в его полигоны.
  if (state.is_general === true) {
    const polygonsCoords = state.polygonsCoords as [number, number][][] | null | undefined;
    if (!polygonsCoords || polygonsCoords.length === 0) return ads;
    const addrMap = new Map<number, any>();
    for (const addr of addresses) { if (addr.id != null) addrMap.set(addr.id, addr); }
    return ads.filter(a => {
      const adLat = a.coordinates?.lat;
      const adLng = a.coordinates?.lng;
      if (adLat != null && adLng != null && isFinite(adLat) && isFinite(adLng)) {
        return pointInPolygons(adLat, adLng, polygonsCoords);
      }
      if (a.address_id) {
        const addr = addrMap.get(a.address_id);
        const aLat = addr?.coordinates?.lat;
        const aLng = addr?.coordinates?.lng;
        if (aLat != null && aLng != null && isFinite(aLat) && isFinite(aLng)) {
          return pointInPolygons(aLat, aLng, polygonsCoords);
        }
      }
      return false;
    });
  }

  let result = ads;

  const sources = state.sources || [];
  const propertyTypes = state.propertyTypes || [];
  const categoryIds = state.categoryIds || [];
  const priceMin = state.priceMin || '';
  const priceMax = state.priceMax || '';
  const areaMin = state.areaMin || '';
  const areaMax = state.areaMax || '';
  const floorMin = state.floorMin || '';
  const floorMax = state.floorMax || '';
  const yearMin = state.yearMin || '';
  const yearMax = state.yearMax || '';
  const sellerTypes = state.sellerTypes || [];
  const status = state.status || '';
  const dateFrom = state.dateFrom || '';
  const dateTo = state.dateTo || '';
  const searchQuery = state.searchQuery || '';
  const processingStatus = state.processingStatus || '';
  const addressId = state.addressId;
  const contactType = state.contactType || '';
  const processingCategoryId = state.processingCategoryId;
  const processingFloor = state.processingFloor || '';
  const filterAddressIds = new Set(state.filterAddressIds || []);
  const excludedAddressIds = new Set(state.excludedAddressIds || []);
  const houseSeriesIds = state.houseSeriesIds || [];
  const wallMaterialIds = state.wallMaterialIds || [];
  const floorsMin = state.floorsMin || '';
  const floorsMax = state.floorsMax || '';

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

  // Фильтр по полигону: сначала по координатам самого объявления,
  // затем (если у объявления нет координат) по координатам привязанного адреса.
  const polygonsCoords = state.polygonsCoords as [number, number][][] | null | undefined;
  if (polygonsCoords && polygonsCoords.length > 0) {
    const addrMap = new Map<number, any>();
    for (const addr of addresses) { if (addr.id != null) addrMap.set(addr.id, addr); }
    result = result.filter(a => {
      const adLat = a.coordinates?.lat;
      const adLng = a.coordinates?.lng;
      if (adLat != null && adLng != null && isFinite(adLat) && isFinite(adLng)) {
        return pointInPolygons(adLat, adLng, polygonsCoords);
      }
      // Нет координат у объявления — пробуем координаты адреса
      if (a.address_id) {
        const addr = addrMap.get(a.address_id);
        const aLat = addr?.coordinates?.lat;
        const aLng = addr?.coordinates?.lng;
        if (aLat != null && aLng != null && isFinite(aLat) && isFinite(aLng)) {
          return pointInPolygons(aLat, aLng, polygonsCoords);
        }
      }
      return false;
    });
  }

  return result;
}
