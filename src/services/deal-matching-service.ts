/**
 * Автоматический поиск и привязка сделок Росреестра к объектам недвижимости.
 *
 * Алгоритм:
 * 1. Загрузить объекты без привязанной сделки
 * 2. Для каждого: определить кадастровый квартал по координатам адреса
 * 3. Найти сделки в квартале с фильтрами (этаж, площадь ±2м², период)
 * 4. Скоринг по разнице площади и цены — выбрать лучшую
 * 5. Привязать автоматически
 */

import { db } from '@/db/database';
import { dealsRepository } from '@/db/repositories/deals.repository';
import { cadastralRepository } from '@/db/repositories/cadastral.repository';
import type { AdObject, AdAddress, SaleDeal } from '@/types';
import type { Deal } from '@/types';

// --- Геометрия ---

function pointInPolygon(lat: number, lng: number, polygon: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [latI, lngI] = polygon[i];
    const [latJ, lngJ] = polygon[j];
    if (((latI > lat) !== (latJ > lat)) &&
        (lng < (lngJ - lngI) * (lat - latI) / (latJ - latI) + lngI)) {
      inside = !inside;
    }
  }
  return inside;
}

function polygonArea(polygon: [number, number][]): number {
  let area = 0;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    area += (polygon[j][0] + polygon[i][0]) * (polygon[j][1] - polygon[i][1]);
  }
  return Math.abs(area / 2);
}

// --- Период ---

function getRelevantYearQuarters(dateStr: string | null): string[] {
  const date = dateStr ? new Date(dateStr) : new Date();
  const year = date.getFullYear();
  const month = date.getMonth();
  const quarter = Math.floor(month / 3) + 1;
  const result = [`${year}-Q${quarter}`];
  if (quarter === 4) {
    result.push(`${year + 1}-Q1`);
  } else {
    result.push(`${year}-Q${quarter + 1}`);
  }
  return result;
}

// --- Поиск кадастрового квартала ---

interface QuarterGeo {
  cad_number: string;
  geojson: any;
}

function findCadQuarter(lat: number, lng: number, quarters: QuarterGeo[]): string | null {
  // Фильтруем мусорные кварталы (XX:YY:000000)
  const realQuarters = quarters.filter(q => {
    const parts = q.cad_number.split(':');
    if (parts.length >= 3 && /^0+$/.test(parts[2])) return false;
    return true;
  });

  let bestCadNumber: string | null = null;
  let bestArea = Infinity;

  for (const q of realQuarters) {
    if (q.geojson?.geometry?.type === 'Polygon') {
      const coords = q.geojson.geometry.coordinates[0] as number[][];
      const polygon: [number, number][] = coords.map(c => [c[1], c[0]]);
      if (pointInPolygon(lat, lng, polygon)) {
        const pa = polygonArea(polygon);
        if (pa < bestArea) {
          bestArea = pa;
          bestCadNumber = q.cad_number;
        }
      }
    }
  }

  return bestCadNumber;
}

// --- Скоринг ---

const AREA_WEIGHT = 0.6;
const PRICE_WEIGHT = 0.4;
const AREA_TOLERANCE = 2; // ±2 м²
const AREA_MAX_DIFF_PCT = 0.10; // 10%
const PRICE_MAX_DIFF_PCT = 0.30; // 30%

function scoreDeal(obj: AdObject, deal: Deal): number | null {
  // Площадь
  const objArea = obj.area_total;
  if (objArea == null || objArea <= 0) return null;
  const areaDiff = Math.abs(deal.area - objArea);
  if (areaDiff > AREA_TOLERANCE) return null;
  const areaDiffPct = areaDiff / objArea;
  if (areaDiffPct > AREA_MAX_DIFF_PCT) return null;

  // Цена
  const objPrice = obj.current_price;
  let priceScore = 1.0;
  if (objPrice != null && objPrice > 0 && deal.deal_price > 0) {
    const priceDiffPct = Math.abs(deal.deal_price - objPrice) / Math.max(deal.deal_price, objPrice);
    if (priceDiffPct > PRICE_MAX_DIFF_PCT) return null;
    priceScore = 1 - priceDiffPct;
  }

  const areaScore = 1 - areaDiffPct;
  return AREA_WEIGHT * areaScore + PRICE_WEIGHT * priceScore;
}

function dealToSaleDeal(deal: Deal): SaleDeal {
  return {
    deal_price: deal.deal_price,
    deal_area: deal.area,
    deal_floor: deal.floor,
    deal_year_quarter: deal.year_quarter,
    deal_doc_type: deal.doc_type,
    deal_price_per_meter: deal.area > 0 ? Math.round(deal.deal_price / deal.area) : 0,
    deal_linked_at: new Date().toISOString(),
  };
}

// --- Основная функция ---

export interface DealMatchingProgress {
  current: number;
  total: number;
  detail: string;
}

export interface DealMatchingResult {
  matched: number;
  skipped: number;
  noDeal: number;
  noCoords: number;
  noCadQuarter: number;
  errors: string[];
}

export async function runDealMatching(
  onProgress: (progress: DealMatchingProgress) => void,
  scopeObjects?: AdObject[],
): Promise<DealMatchingResult> {
  const result: DealMatchingResult = {
    matched: 0,
    skipped: 0,
    noDeal: 0,
    noCoords: 0,
    noCadQuarter: 0,
    errors: [],
  };

  // 1. Загрузить объекты без сделки
  let objects: AdObject[];
  if (scopeObjects && scopeObjects.length > 0) {
    objects = scopeObjects.filter(o => !o.sale_deal);
  } else {
    objects = await db.table('ad_objects').filter(o => !o.sale_deal).toArray();
  }
  const total = objects.length;

  if (total === 0) {
    onProgress({ current: 0, total: 0, detail: 'Нет объектов для обработки' });
    return result;
  }

  onProgress({ current: 0, total, detail: `Загрузка кадастровых кварталов...` });

  // 2. Загрузить все адреса
  const addressIds = new Set(objects.map(o => o.address_id).filter((id): id is number => id != null));
  const addresses: AdAddress[] = await db.table('ad_addresses')
    .filter(a => addressIds.has(a.id!))
    .toArray();
  const addressMap = new Map<number, AdAddress>();
  for (const addr of addresses) {
    if (addr.id) addressMap.set(addr.id, addr);
  }

  // 3. Загрузить кадастровые кварталы (один раз)
  const quarters = await cadastralRepository.getAllWithGeojson();

  // 4. Обработка каждого объекта
  for (let i = 0; i < objects.length; i++) {
    const obj = objects[i];

    if ((i + 1) % 5 === 0 || i === 0) {
      onProgress({
        current: i + 1,
        total,
        detail: `Обработка объекта ${i + 1}/${total} (привязано: ${result.matched})`,
      });
    }

    try {
      // Адрес
      const addr = obj.address_id ? addressMap.get(obj.address_id) : undefined;
      if (!addr?.coordinates?.lat || !addr?.coordinates?.lng) {
        result.noCoords++;
        continue;
      }

      // Кадастровый квартал
      const cadNumber = findCadQuarter(addr.coordinates.lat, addr.coordinates.lng, quarters);
      if (!cadNumber) {
        result.noCadQuarter++;
        continue;
      }

      // Фильтры
      const yearQuarters = getRelevantYearQuarters(obj.updated ?? null);
      const floorMin = obj.floor != null ? obj.floor : undefined;
      const floorMax = obj.floor != null ? obj.floor : undefined;
      const areaMin = obj.area_total != null ? obj.area_total - AREA_TOLERANCE : undefined;
      const areaMax = obj.area_total != null ? obj.area_total + AREA_TOLERANCE : undefined;

      const searchResult = await dealsRepository.searchLight({
        quarter_cad_numbers: [cadNumber],
        year_quarters: yearQuarters,
        floor_min: floorMin,
        floor_max: floorMax,
        area_min: areaMin,
        area_max: areaMax,
      }, 1, 100);

      const deals = searchResult.pageDeals;
      if (deals.length === 0) {
        result.noDeal++;
        continue;
      }

      // Скоринг — выбрать лучшую сделку
      let bestDeal: Deal | null = null;
      let bestScore = -1;

      for (const deal of deals) {
        const score = scoreDeal(obj, deal);
        if (score !== null && score > bestScore) {
          bestScore = score;
          bestDeal = deal;
        }
      }

      if (bestDeal) {
        const saleDeal = dealToSaleDeal(bestDeal);
        await db.table('ad_objects').update(obj.id!, { sale_deal: saleDeal });
        result.matched++;
      } else {
        result.noDeal++;
      }
    } catch (e) {
      result.errors.push(`Объект ${obj.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  onProgress({
    current: total,
    total,
    detail: `Готово: привязано ${result.matched}, без сделки ${result.noDeal}, нет координат ${result.noCoords}, нет квартала ${result.noCadQuarter}`,
  });

  return result;
}
