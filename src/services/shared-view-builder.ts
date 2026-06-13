/**
 * Сборщик payload для публичной ссылки «Поделиться фильтром».
 * Для каждого выбранного сохранённого фильтра собирает объявления, объекты,
 * полные адреса и привязанные сделки.
 */

import { db } from '@/db/database';
import { applyFilterToAds, type FilterState } from './ads-filter-utils';

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Проверка, входит ли точка [lat, lng] в полигон (координаты [lat, lng][]) */
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

export interface SavedFilterLite {
  id: string;
  name: string;
  groupId: string | null;
  sortOrder: number;
  createdAt: number;
  state: FilterState;
}

export interface SavedGroupLite {
  id: string;
  name: string;
  color: string;
  sortOrder: number;
  isCollapsed: boolean;
}

export interface SharedViewData {
  version: 1;
  createdAt: string;
  filters: Array<{
    id: string;
    name: string;
    groupName: string | null;
    groupColor: string | null;
    state?: FilterState;
  }>;
  filters_data: Record<string, FilterPayload>;
  listingCategories?: any[];
  refs?: {
    wallMaterials?: any[];
    houseSeries?: any[];
    houseClasses?: any[];
    ceilingMaterials?: any[];
  };
}

export interface FilterPayload {
  ads: any[];
  objects: any[];
  addresses: any[];
}

/**
 * Загрузить сохранённые фильтры и группы из chrome.storage.local.
 * Данные хранятся как JSON-строки (как в AdsSavedFiltersPanel).
 */
export async function loadSavedFiltersForShare(): Promise<{
  filters: SavedFilterLite[];
  groups: SavedGroupLite[];
}> {
  return new Promise((resolve) => {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      chrome.storage.local.get(
        ['ret_ads_saved_filters_v2', 'ret_ads_filter_groups'],
        (r) => {
          const rawFilters = r.ret_ads_saved_filters_v2;
          const rawGroups = r.ret_ads_filter_groups;
          let filters: SavedFilterLite[] = [];
          let groups: SavedGroupLite[] = [];
          try { filters = Array.isArray(rawFilters) ? rawFilters : JSON.parse(rawFilters); } catch { /* empty */ }
          try { groups = Array.isArray(rawGroups) ? rawGroups : JSON.parse(rawGroups); } catch { /* empty */ }
          resolve({
            filters: Array.isArray(filters) ? filters : [],
            groups: Array.isArray(groups) ? groups : [],
          });
        },
      );
    } else {
      resolve({ filters: [], groups: [] });
    }
  });
}

/**
 * Собрать данные для передачи в публичную ссылку.
 *
 * @param filterIds Идентификаторы выбранных сохранённых фильтров
 * @param filtersMetadata Метаданные фильтров и групп (для имён)
 */
export async function buildSharedViewData(
  filterIds: string[],
  filters: SavedFilterLite[],
  groups: SavedGroupLite[],
): Promise<SharedViewData> {
  const selectedFilters = filters.filter(f => filterIds.includes(f.id));

  // Загружаем всё сразу — фильтрация в памяти
  const [allAds, allAddresses, allObjects, listingCategories, refWallMaterials, refHouseSeries, refHouseClasses, refCeilingMaterials] = await Promise.all([
    db.table('ads').toArray() as Promise<any[]>,
    db.table('ad_addresses').toArray() as Promise<any[]>,
    db.table('ad_objects').toArray() as Promise<any[]>,
    db.table('listing_categories').toArray().catch(() => []) as Promise<any[]>,
    db.table('ad_wall_materials').toArray().catch(() => []) as Promise<any[]>,
    db.table('ad_house_series').toArray().catch(() => []) as Promise<any[]>,
    db.table('ad_house_classes').toArray().catch(() => []) as Promise<any[]>,
    db.table('ad_ceiling_materials').toArray().catch(() => []) as Promise<any[]>,
  ]);

  const groupMap = new Map<string, SavedGroupLite>();
  for (const g of groups) groupMap.set(g.id, g);

  const objectMap = new Map<number, any>();
  for (const o of allObjects) { if (o.id != null) objectMap.set(o.id, o); }

  const filters_data: Record<string, FilterPayload> = {};
  const filterMeta: SharedViewData['filters'] = [];

  for (const filter of selectedFilters) {
    const filteredAds = applyFilterToAds(allAds, filter.state, allAddresses);

    // Собираем уникальные object_id из объявлений
    const objectIds = new Set<number>();
    for (const ad of filteredAds) {
      if (ad.object_id != null) objectIds.add(ad.object_id);
    }

    // Адреса: если в фильтре есть полигоны — все адреса внутри полигонов
    // (чтобы карта показывала все дома района, а не только отфильтрованные).
    // Если полигонов нет — адреса из отфильтрованных объявлений.
    const polygons = (filter.state as any)?.polygonsCoords as [number, number][][] | undefined;
    let addresses: any[];
    if (polygons && polygons.length > 0) {
      addresses = allAddresses.filter(a =>
        a.coordinates?.lat != null && a.coordinates?.lng != null &&
        polygons.some(poly => poly.length >= 3 && pointInPolygon(a.coordinates.lat, a.coordinates.lng, poly)),
      );
    } else {
      const addressIds = new Set<number>();
      for (const ad of filteredAds) { if (ad.address_id != null) addressIds.add(ad.address_id); }
      addresses = allAddresses.filter(a => a.id != null && addressIds.has(a.id));
    }

    // Объекты — только отфильтрованные
    const objects = Array.from(objectIds)
      .map(id => objectMap.get(id))
      .filter(Boolean) as any[];

    const group = filter.groupId ? groupMap.get(filter.groupId) : null;
    filterMeta.push({
      id: filter.id,
      name: filter.name,
      groupName: group?.name ?? null,
      groupColor: group?.color ?? null,
      state: filter.state,
    });

    filters_data[filter.id] = {
      ads: filteredAds,
      objects,
      addresses,
    };
  }

  return {
    version: 1,
    createdAt: new Date().toISOString(),
    filters: filterMeta,
    filters_data,
    listingCategories,
    refs: {
      wallMaterials: refWallMaterials,
      houseSeries: refHouseSeries,
      houseClasses: refHouseClasses,
      ceilingMaterials: refCeilingMaterials,
    },
  };
}
