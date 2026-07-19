/**
 * Статистический сервис «Коридор рынка»
 *
 * Сегментация активных объявлений по аналогам (соседние объявления):
 *  - тот же property_type (категория квартир)
 *  - площадь ±15%
 *  - в радиусе N км
 *
 * Расчёт процентилей p10/p15/p25/p50/p75/p90 по price_per_meter.
 * Порог p15 (настраивается) → ad помечается как «низ рынка».
 */

import type { Ad, AdAddress } from '@/types';
import { pointInPolygons } from '@/utils/geometry';

/** Процентили выборки аналогов */
export interface MarketPercentiles {
  p5: number;
  p10: number;
  p15: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
  p95: number;
  count: number;
}

/** Позиция объявления на рынке */
export interface MarketPosition {
  /** Процентиль-ранг объявления (0-100). 5 = очень дёшево, 95 = очень дорого */
  percentileRank: number | null;
  /** Объявление ниже порога (низ рынка) */
  isLowMarket: boolean;
  /** Скидка/премия к медиане, % (отрицательная = дешевле медианы) */
  deltaToMedian: number | null;
  /** Процентили выборки аналогов */
  percentiles: MarketPercentiles | null;
  /** Цена за м² объявления */
  pricePerMeter: number | null;
  /** Кол-во аналогов */
  comparablesCount: number;
  /** Причина, если статистику нельзя посчитать */
  reason?: 'no_coords' | 'no_price' | 'too_few_comps' | 'no_area';
}

/** Опции расчёта */
export interface MarketStatsOptions {
  /** Радиус поиска аналогов, км */
  radiusKm: number;
  /** Порог «низа рынка» (процентиль), 5-30 */
  lowMarketThreshold: number;
  /** Минимальное число аналогов для статистики */
  minComparables: number;
  /** Допуск по площади, % (0.15 = ±15%) */
  areaTolerance: number;
  /** Использовать материал стен для фильтрации аналогов */
  useWallMaterial: boolean;
  /** Использовать год постройки для фильтрации аналогов */
  useYearBuilt: boolean;
  /** Допуск по году постройки, лет (±N) */
  yearTolerance: number;
  /** Использовать полигон с карты вместо радиуса */
  usePolygonInsteadOfRadius: boolean;
  /** Исключать первые этажи из аналогов (если target не на 1-м). Структурный дисконт ~10%. */
  excludeFirstFloor: boolean;
  /** Использовать этажность дома для фильтрации (группы: 1-4, 5, 6-9, 10-16, 17+) */
  useFloorsTotal: boolean;
  /** Фильтровать выбросы через IQR (межквартильный размах) перед расчётом перцентилей */
  useIqrFilter: boolean;
}

export const DEFAULT_MARKET_OPTIONS: MarketStatsOptions = {
  radiusKm: 1.0,
  lowMarketThreshold: 30,
  minComparables: 5,
  areaTolerance: 0.05,
  useWallMaterial: true,
  useYearBuilt: true,
  yearTolerance: 10,
  usePolygonInsteadOfRadius: true,
  excludeFirstFloor: true,
  useFloorsTotal: false,
  useIqrFilter: true,
};

/** Минимальный размер выборки для IQR-фильтра (иначе не имеет смысла) */
const IQR_MIN_SAMPLE = 8;

// ─── Геометрия ───

/**
 * Расстояние Хаверсина в метрах между двумя точками.
 * Используется для фильтрации аналогов в радиусе.
 */
export function haversineMeters(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): number {
  const R = 6371000; // радиус Земли, м
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// ─── Процентили ───

/**
 * Значение p-го процентиля из отсортированного по возрастанию массива.
 * Использует линейную интерполяцию между ближайшими рангами (как NumPy default).
 */
export function percentileValue(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return 0;
  if (sortedAsc.length === 1) return sortedAsc[0];
  const rank = (p / 100) * (sortedAsc.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  if (lo === hi) return sortedAsc[lo];
  const frac = rank - lo;
  return sortedAsc[lo] + (sortedAsc[hi] - sortedAsc[lo]) * frac;
}

/**
 * Процентиль-ранг значения в выборке (обратная функция percentileValue).
 * Возвращает 0-100: 0 = самое дешёвое, 100 = самое дорогое.
 */
export function percentileRankOf(value: number, sortedAsc: number[]): number {
  if (sortedAsc.length === 0) return 50;
  if (sortedAsc.length === 1) return value <= sortedAsc[0] ? 10 : 90;

  // Двоичный поиск позиции вставки
  let lo = 0, hi = sortedAsc.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (sortedAsc[mid] < value) lo = mid + 1;
    else hi = mid;
  }
  // lo = индекс первого элемента >= value
  if (lo === 0) {
    // value <= min → rank близко к 0 (но не 0, если value > -inf)
    const next = sortedAsc[0];
    if (value < next) return 0;
    return 0;
  }
  if (lo >= sortedAsc.length) {
    // value > max
    return 100;
  }
  // Интерполируем между (lo-1) и lo
  const prev = sortedAsc[lo - 1];
  const curr = sortedAsc[lo];
  if (curr === prev) return (lo / sortedAsc.length) * 100;
  const frac = (value - prev) / (curr - prev);
  const rank = (lo - 1 + frac) / (sortedAsc.length - 1);
  return Math.max(0, Math.min(100, rank * 100));
}

// ─── Координаты ───

/** Получить координаты объявления: приоритет у адреса, иначе собственные */
export function getAdCoords(
  ad: Ad,
  addrMap?: Map<number, AdAddress>,
): { lat: number; lng: number } | null {
  if (ad.address_id != null && addrMap) {
    const addr = addrMap.get(ad.address_id);
    const la = addr?.coordinates?.lat;
    const ln = addr?.coordinates?.lng;
    if (la != null && ln != null && isFinite(la) && isFinite(ln)) {
      return { lat: la, lng: ln };
    }
  }
  const la = ad.coordinates?.lat;
  const ln = ad.coordinates?.lng;
  if (la != null && ln != null && isFinite(la) && isFinite(ln)) {
    return { lat: la, lng: ln };
  }
  return null;
}

// ─── Характеристики дома ───

/** Получить материал стен: приоритет у адреса (надёжная база), потом у объявления */
export function getAdWallMaterial(ad: Ad, addrMap?: Map<number, AdAddress>): string {
  if (ad.address_id != null && addrMap) {
    const addr = addrMap.get(ad.address_id);
    if (addr?.house_type) return addr.house_type;
  }
  if (ad.house_type) return ad.house_type;
  if (ad.house_details?.material) return ad.house_details.material;
  return '';
}

/** Получить год постройки: приоритет у адреса (надёжная база), потом у объявления */
export function getAdYearBuilt(ad: Ad, addrMap?: Map<number, AdAddress>): number | null {
  if (ad.address_id != null && addrMap) {
    const addr = addrMap.get(ad.address_id);
    if (addr?.build_year != null) return addr.build_year;
  }
  if (ad.year_built != null) return ad.year_built;
  if (ad.house_details?.build_year != null) return ad.house_details.build_year;
  return null;
}

/** Получить этажность дома: приоритет у адреса, потом у объявления */
export function getAdFloorsTotal(ad: Ad, addrMap?: Map<number, AdAddress>): number | null {
  if (ad.address_id != null && addrMap) {
    const addr = addrMap.get(ad.address_id);
    if (addr?.floors_count != null) return addr.floors_count;
  }
  return ad.floors_total ?? null;
}

/**
 * Группа этажности для целей сегментации рынка:
 *   1-4  — «low»      (ИЖС, дореволюционный, малосемейки)
 *   5    — «five»     (хрущёвки — отдельный дешёвый сегмент)
 *   6-9  — «mid»      (брежневки, улучшенки)
 *   10-16 — «high»    (современные среднеэтажные)
 *   17+  — «tower»    (современные высотные, бизнес-класс)
 *
 * Группировка сохраняет объём выборки, отражает рыночные сегменты
 * и сильнее коррелирует с ценой, чем точное совпадение этажности.
 */
export function floorsToGroup(f: number | null): string | null {
  if (f == null || f <= 0) return null;
  if (f <= 4) return 'low';
  if (f === 5) return 'five';
  if (f <= 9) return 'mid';
  if (f <= 16) return 'high';
  return 'tower';
}

/**
 * IQR-фильтр выбросов: убрать значения за [Q1 - 3·IQR, Q3 + 3·IQR].
 * Множитель 3.0 (вместо классического 1.5) — на рынке недвижимости тяжёлые хвосты
 * и много легитимных дешёвых листингов; 1.5 их слишком агрессивно срезает.
 * Защищает от явных битых цен (лишний/недостающий ноль).
 * Если выборка слишком мала или после фильтра осталось < 5 — возвращает оригинал.
 */
export function applyIqrFilter(sortedAsc: number[]): number[] {
  if (sortedAsc.length < IQR_MIN_SAMPLE) return sortedAsc;
  const q1 = percentileValue(sortedAsc, 25);
  const q3 = percentileValue(sortedAsc, 75);
  const iqr = q3 - q1;
  if (iqr <= 0) return sortedAsc;
  const lo = q1 - 3.0 * iqr;
  const hi = q3 + 3.0 * iqr;
  const filtered = sortedAsc.filter(v => v >= lo && v <= hi);
  return filtered.length >= 5 ? filtered : sortedAsc;
}

// ─── Сегментация ───

/**
 * Подходит ли кандидат в аналоги к таргету по характеристикам (без учёта гео).
 * - Активный
 * - Тот же property_type
 * - Площадь в пределах допуска
 */
function isComparableByParams(
  target: Ad,
  candidate: Ad,
  areaTolerance: number,
): boolean {
  if (candidate.status !== 'active') return false;
  if ((target.property_type || '') !== (candidate.property_type || '')) return false;

  // Площадь: если есть у обоих — проверяем допуск; если нет у таргета — пропускаем
  const ta = target.area_total;
  const ca = candidate.area_total;
  if (ta != null && ca != null && ta > 0) {
    const ratio = ca / ta;
    if (ratio < 1 - areaTolerance || ratio > 1 + areaTolerance) return false;
  }
  return true;
}

// ─── Главная функция ───

/**
 * Рассчитать позицию объявления на рынке относительно других.
 *
 * Алгоритм:
 * 1. Находим координаты таргета (адрес или собственные).
 * 2. Ищем аналоги: активные, тот же property_type, ±площадь, материал/год (если включено),
 *    в радиусе или внутри полигона.
 * 3. Собираем price_per_meter из аналогов.
 * 4. Считаем процентили.
 * 5. Ранг таргета = его позиция в распределении.
 */
export function calculateMarketPosition(
  targetAd: Ad,
  allAds: Ad[],
  addresses: AdAddress[],
  options: Partial<MarketStatsOptions> = {},
  polygons?: [number, number][][] | null,
): MarketPosition {
  const opts = { ...DEFAULT_MARKET_OPTIONS, ...options };

  // Цена за метр таргета
  const targetPPM = targetAd.price_per_meter;
  if (targetPPM == null || targetPPM <= 0) {
    return {
      percentileRank: null,
      isLowMarket: false,
      deltaToMedian: null,
      percentiles: null,
      pricePerMeter: targetPPM ?? null,
      comparablesCount: 0,
      reason: 'no_price',
    };
  }

  // Координаты таргета
  const addrMap = new Map<number, AdAddress>();
  for (const a of addresses) if (a.id != null) addrMap.set(a.id, a);

  const targetCoords = getAdCoords(targetAd, addrMap);
  if (!targetCoords) {
    return {
      percentileRank: null,
      isLowMarket: false,
      deltaToMedian: null,
      percentiles: null,
      pricePerMeter: targetPPM,
      comparablesCount: 0,
      reason: 'no_coords',
    };
  }

  const radiusMeters = opts.radiusKm * 1000;
  const usePolygon = opts.usePolygonInsteadOfRadius && polygons && polygons.length > 0;
  const targetMaterial = opts.useWallMaterial ? getAdWallMaterial(targetAd, addrMap) : '';
  const targetYear = opts.useYearBuilt ? getAdYearBuilt(targetAd, addrMap) : null;
  const targetFloorsGroup = opts.useFloorsTotal ? floorsToGroup(getAdFloorsTotal(targetAd, addrMap)) : null;
  const targetIsFirstFloor = targetAd.floor === 1;

  // Собираем price_per_meter аналогов
  const ppmValues: number[] = [];
  for (const cand of allAds) {
    // Не сравниваем с собой
    if (cand.id === targetAd.id) continue;

    if (!isComparableByParams(targetAd, cand, opts.areaTolerance)) continue;

    // Исключаем первые этажи из аналогов, если target не на 1-м.
    // У первых этажей структурный дисконт ~10%, они искажают медиану вниз.
    if (opts.excludeFirstFloor && !targetIsFirstFloor && cand.floor === 1) continue;

    // Материал стен
    if (opts.useWallMaterial && targetMaterial) {
      const candMaterial = getAdWallMaterial(cand, addrMap);
      if (candMaterial && candMaterial !== targetMaterial) continue;
    }

    // Год постройки
    if (opts.useYearBuilt && targetYear != null) {
      const candYear = getAdYearBuilt(cand, addrMap);
      if (candYear != null && Math.abs(candYear - targetYear) > opts.yearTolerance) continue;
    }

    // Этажность дома (по группам)
    if (opts.useFloorsTotal && targetFloorsGroup != null) {
      const candGroup = floorsToGroup(getAdFloorsTotal(cand, addrMap));
      if (candGroup != null && candGroup !== targetFloorsGroup) continue;
    }

    const ppm = cand.price_per_meter;
    if (ppm == null || ppm <= 0) continue;

    const cc = getAdCoords(cand, addrMap);
    if (!cc) continue;

    // Гео-фильтр: полигон или радиус
    if (usePolygon) {
      if (!pointInPolygons(cc.lat, cc.lng, polygons!)) continue;
    } else {
      const dist = haversineMeters(targetCoords.lat, targetCoords.lng, cc.lat, cc.lng);
      if (dist > radiusMeters) continue;
    }

    ppmValues.push(ppm);
  }

  if (ppmValues.length < opts.minComparables) {
    return {
      percentileRank: null,
      isLowMarket: false,
      deltaToMedian: null,
      percentiles: null,
      pricePerMeter: targetPPM,
      comparablesCount: ppmValues.length,
      reason: 'too_few_comps',
    };
  }

  ppmValues.sort((a, b) => a - b);
  const filteredPpm = opts.useIqrFilter ? applyIqrFilter(ppmValues) : ppmValues;

  const p5 = percentileValue(filteredPpm, 5);
  const p10 = percentileValue(filteredPpm, 10);
  const p15 = percentileValue(filteredPpm, 15);
  const p25 = percentileValue(filteredPpm, 25);
  const p50 = percentileValue(filteredPpm, 50);
  const p75 = percentileValue(filteredPpm, 75);
  const p90 = percentileValue(filteredPpm, 90);
  const p95 = percentileValue(filteredPpm, 95);

  const rank = percentileRankOf(targetPPM, filteredPpm);
  const deltaToMedian = p50 > 0 ? Math.round((targetPPM - p50) / p50 * 100) : null;

  // Порог «низа рынка» = единый настраиваемый критерий «дешевле чем X% аналогов».
  // Используется и для бэйджа, и для фильтра «Только низ», чтобы не было расхождений.
  return {
    percentileRank: Math.round(rank * 10) / 10,
    isLowMarket: rank <= opts.lowMarketThreshold,
    deltaToMedian,
    percentiles: {
      p5: Math.round(p5),
      p10: Math.round(p10),
      p15: Math.round(p15),
      p25: Math.round(p25),
      p50: Math.round(p50),
      p75: Math.round(p75),
      p90: Math.round(p90),
      p95: Math.round(p95),
      count: filteredPpm.length,
    },
    pricePerMeter: targetPPM,
    comparablesCount: filteredPpm.length,
  };
}

// ─── Bulk-расчёт для таблицы ───

/**
 * Рассчитать позиции для всех объявлений сразу.
 * Возвращает Map<adId, MarketPosition>.
 *
 * Оптимизация: группируем по property_type заранее, чтобы внутренний цикл
 * был по своей группе, а не по всем объявлениям.
 */
export function calculateMarketPositionsBulk(
  ads: Ad[],
  allAds: Ad[],
  addresses: AdAddress[],
  options: Partial<MarketStatsOptions> = {},
  polygons?: [number, number][][] | null,
): Map<number, MarketPosition> {
  const opts = { ...DEFAULT_MARKET_OPTIONS, ...options };
  const result = new Map<number, MarketPosition>();

  if (ads.length === 0 || allAds.length === 0) return result;

  // Адресный Map
  const addrMap = new Map<number, AdAddress>();
  for (const a of addresses) if (a.id != null) addrMap.set(a.id, a);

  // Предрассчитанные координаты для всех allAds
  const coordsCache = new Map<number, { lat: number; lng: number } | null>();
  for (const ad of allAds) {
    if (ad.id == null) continue;
    coordsCache.set(ad.id, getAdCoords(ad, addrMap));
  }

  // Предрассчитанные материал стен, год постройки и этажность для всех allAds
  const materialCache = new Map<number, string>();
  const yearCache = new Map<number, number | null>();
  const floorsGroupCache = new Map<number, string | null>();
  if (opts.useWallMaterial || opts.useYearBuilt || opts.useFloorsTotal) {
    for (const ad of allAds) {
      if (ad.id == null) continue;
      if (opts.useWallMaterial) materialCache.set(ad.id, getAdWallMaterial(ad, addrMap));
      if (opts.useYearBuilt) yearCache.set(ad.id, getAdYearBuilt(ad, addrMap));
      if (opts.useFloorsTotal) floorsGroupCache.set(ad.id, floorsToGroup(getAdFloorsTotal(ad, addrMap)));
    }
  }

  // Группировка allAds по property_type (только активные с ppm и координатами)
  const byType = new Map<string, Ad[]>();
  for (const ad of allAds) {
    if (ad.id == null) continue;
    if (ad.status !== 'active') continue;
    if (ad.price_per_meter == null || ad.price_per_meter <= 0) continue;
    if (!coordsCache.get(ad.id)) continue;
    const pt = ad.property_type || '';
    if (!byType.has(pt)) byType.set(pt, []);
    byType.get(pt)!.push(ad);
  }

  const radiusMeters = opts.radiusKm * 1000;
  const usePolygon = opts.usePolygonInsteadOfRadius && polygons && polygons.length > 0;

  for (const target of ads) {
    if (target.id == null) continue;
    const targetPPM = target.price_per_meter;
    if (targetPPM == null || targetPPM <= 0) {
      result.set(target.id, {
        percentileRank: null,
        isLowMarket: false,
        deltaToMedian: null,
        percentiles: null,
        pricePerMeter: targetPPM ?? null,
        comparablesCount: 0,
        reason: 'no_price',
      });
      continue;
    }

    // Для targets из allAds берём из кэша; для псевдо-объявлений (объектов с
    // отрицательными id, которых нет в allAds) считаем координаты напрямую.
    const targetCoords = coordsCache.get(target.id) ?? getAdCoords(target, addrMap);
    if (!targetCoords) {
      result.set(target.id, {
        percentileRank: null,
        isLowMarket: false,
        deltaToMedian: null,
        percentiles: null,
        pricePerMeter: targetPPM,
        comparablesCount: 0,
        reason: 'no_coords',
      });
      continue;
    }

    const targetType = target.property_type || '';
    const candidates = byType.get(typeKey(targetType)) ?? byType.get(targetType) ?? [];
    if (candidates.length === 0) {
      // нет аналогов по типу
      result.set(target.id, {
        percentileRank: null,
        isLowMarket: false,
        deltaToMedian: null,
        percentiles: null,
        pricePerMeter: targetPPM,
        comparablesCount: 0,
        reason: 'too_few_comps',
      });
      continue;
    }

    const targetArea = target.area_total;
    const targetMaterial = opts.useWallMaterial ? getAdWallMaterial(target, addrMap) : '';
    const targetYear = opts.useYearBuilt ? getAdYearBuilt(target, addrMap) : null;
    const targetFloorsGroup = opts.useFloorsTotal ? floorsToGroup(getAdFloorsTotal(target, addrMap)) : null;
    const targetIsFirstFloor = target.floor === 1;
    const ppmValues: number[] = [];

    for (const cand of candidates) {
      if (cand.id === target.id) continue;

      // Площадь
      if (targetArea != null && cand.area_total != null && targetArea > 0) {
        const ratio = cand.area_total / targetArea;
        if (ratio < 1 - opts.areaTolerance || ratio > 1 + opts.areaTolerance) continue;
      }

      // Исключаем первые этажи, если target не на 1-м
      if (opts.excludeFirstFloor && !targetIsFirstFloor && cand.floor === 1) continue;

      // Материал стен
      if (opts.useWallMaterial && targetMaterial) {
        const candMaterial = materialCache.get(cand.id!) ?? '';
        if (candMaterial && candMaterial !== targetMaterial) continue;
      }

      // Год постройки
      if (opts.useYearBuilt && targetYear != null) {
        const candYear = yearCache.get(cand.id!) ?? null;
        if (candYear != null && Math.abs(candYear - targetYear) > opts.yearTolerance) continue;
      }

      // Этажность дома (по группам)
      if (opts.useFloorsTotal && targetFloorsGroup != null) {
        const candGroup = floorsGroupCache.get(cand.id!) ?? null;
        if (candGroup != null && candGroup !== targetFloorsGroup) continue;
      }

      const cc = coordsCache.get(cand.id!);
      if (!cc) continue;

      // Гео-фильтр: полигон или радиус
      if (usePolygon) {
        if (!pointInPolygons(cc.lat, cc.lng, polygons!)) continue;
      } else {
        const dist = haversineMeters(targetCoords.lat, targetCoords.lng, cc.lat, cc.lng);
        if (dist > radiusMeters) continue;
      }

      const ppm = cand.price_per_meter!;
      if (ppm > 0) ppmValues.push(ppm);
    }

    if (ppmValues.length < opts.minComparables) {
      result.set(target.id, {
        percentileRank: null,
        isLowMarket: false,
        deltaToMedian: null,
        percentiles: null,
        pricePerMeter: targetPPM,
        comparablesCount: ppmValues.length,
        reason: 'too_few_comps',
      });
      continue;
    }

    ppmValues.sort((a, b) => a - b);
    const filteredPpm = opts.useIqrFilter ? applyIqrFilter(ppmValues) : ppmValues;
    const rank = percentileRankOf(targetPPM, filteredPpm);
    const p50 = percentileValue(filteredPpm, 50);
    const deltaToMedian = p50 > 0 ? Math.round((targetPPM - p50) / p50 * 100) : null;

    // Порог «низа рынка» = единый настраиваемый критерий «дешевле чем X% аналогов».
    result.set(target.id, {
      percentileRank: Math.round(rank * 10) / 10,
      isLowMarket: rank <= opts.lowMarketThreshold,
      deltaToMedian,
      percentiles: {
        p5: Math.round(percentileValue(filteredPpm, 5)),
        p10: Math.round(percentileValue(filteredPpm, 10)),
        p15: Math.round(percentileValue(filteredPpm, 15)),
        p25: Math.round(percentileValue(filteredPpm, 25)),
        p50: Math.round(p50),
        p75: Math.round(percentileValue(filteredPpm, 75)),
        p90: Math.round(percentileValue(filteredPpm, 90)),
        p95: Math.round(percentileValue(filteredPpm, 95)),
        count: filteredPpm.length,
      },
      pricePerMeter: targetPPM,
      comparablesCount: filteredPpm.length,
    });
  }

  return result;
}

// Хелпер: нормализованный ключ типа (пока просто возвращает сам тип)
function typeKey(t: string): string {
  return t;
}
