import type { AdObject, PriceHistoryItem } from '@/types/ad';

// ─── Типы ───

export interface MonthBucket {
  month: string;       // "2025-01"
  label: string;       // "Янв 25"
  monthStart: Date;
  monthEnd: Date;
}

export interface LiquidityPoint {
  month: string;
  label: string;
  newObjects: number;
  closedObjects: number;
  activeAtStart: number;
}

export interface PriceChangePoint {
  month: string;
  label: string;
  activeAvgPrice: number | null;
  activeAvgPerM2: number | null;
  archivedAvgPrice: number | null;
  archivedAvgPerM2: number | null;
  activeMedianPrice: number | null;
  activeMedianPerM2: number | null;
  archivedMedianPrice: number | null;
  archivedMedianPerM2: number | null;
}

export interface CorridorPoint {
  x: number;  // timestamp
  y: number;  // цена
  objectId: number;
  status: string;
  rooms: number | null;
  area: number | null;
  floor: number | null;
  address: string;
  dateLabel: string;
  confirmed?: boolean;
  dealPrice?: number;
}

export type CorridorMode = 'scatter' | 'history_active' | 'history_archived' | 'history_all';

// ─── Вспомогательные ───

const MONTH_RU = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'];

function toMonthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function formatMonthLabel(monthStr: string): string {
  const [y, m] = monthStr.split('-');
  return `${MONTH_RU[parseInt(m, 10) - 1]} ${y.slice(2)}`;
}

export function getMonthRange(objects: AdObject[]): { start: string; end: string } | null {
  let minMs = Infinity;
  let maxMs = -Infinity;
  for (const o of objects) {
    if (o.created) {
      const t = new Date(o.created).getTime();
      if (t < minMs) minMs = t;
      if (t > maxMs) maxMs = t;
    }
    if (o.updated) {
      const t = new Date(o.updated).getTime();
      if (t > maxMs) maxMs = t;
    }
  }
  if (minMs === Infinity) return null;
  const start = new Date(minMs);
  start.setDate(1); start.setHours(0, 0, 0, 0);
  const end = new Date(maxMs);
  end.setMonth(end.getMonth() + 1); end.setDate(1); end.setHours(0, 0, 0, 0);
  return { start: toMonthKey(start), end: toMonthKey(end) };
}

export function generateMonthBuckets(startMonth: string, endMonth: string): MonthBucket[] {
  const buckets: MonthBucket[] = [];
  let [y, m] = startMonth.split('-').map(Number);
  const [ey] = endMonth.split('-').map(Number);
  let em = Number(endMonth.split('-')[1]);
  // Включаем последний месяц
  em++;
  if (em > 12) { em -= 12; }

  while (y < ey || (y === ey && m < em)) {
    const month = `${y}-${String(m).padStart(2, '0')}`;
    const monthStart = new Date(y, m - 1, 1);
    const nextM = m + 1;
    const nextY = nextM > 12 ? y + 1 : y;
    const monthEnd = new Date(nextY, nextM > 12 ? 0 : nextM - 1, 1);
    buckets.push({ month, label: formatMonthLabel(month), monthStart, monthEnd });
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return buckets;
}

/**
 * Получить цену объекта на указанную дату из истории цен.
 * Приоритет: new_price > price > old_price
 */
export function getPriceAtDate(priceHistory: PriceHistoryItem[], targetDate: Date, fallbackPrice?: number | null): number | null {
  if (!priceHistory || priceHistory.length === 0) return fallbackPrice ?? null;
  const target = targetDate.getTime();
  const sorted = [...priceHistory]
    .filter(p => p.date)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  let result: number | null = null;
  for (const entry of sorted) {
    if (new Date(entry.date).getTime() <= target) {
      result = entry.new_price ?? entry.price ?? entry.old_price ?? result;
    } else {
      break;
    }
  }
  return result ?? fallbackPrice ?? null;
}

// ─── Ликвидность ───

export function computeLiquidityData(objects: AdObject[], months: MonthBucket[]): LiquidityPoint[] {
  return months.map(bucket => {
    const newObjs = objects.filter(o => {
      if (!o.created) return false;
      const d = new Date(o.created);
      return d >= bucket.monthStart && d < bucket.monthEnd;
    });
    const closedObjs = objects.filter(o => {
      if (o.status !== 'archived' || !o.updated) return false;
      const d = new Date(o.updated);
      return d >= bucket.monthStart && d < bucket.monthEnd;
    });
    const activeAtStart = objects.filter(o => {
      if (!o.created || new Date(o.created) >= bucket.monthStart) return false;
      if (o.status === 'archived' && o.updated && new Date(o.updated) < bucket.monthStart) return false;
      return true;
    });
    return {
      month: bucket.month,
      label: bucket.label,
      newObjects: newObjs.length,
      closedObjects: closedObjs.length,
      activeAtStart: activeAtStart.length,
    };
  });
}

// ─── Изменение средней цены ───

export function computePriceChangeData(objects: AdObject[], months: MonthBucket[]): PriceChangePoint[] {
  return months.map(bucket => {
    const midMonth = new Date((bucket.monthStart.getTime() + bucket.monthEnd.getTime()) / 2);

    const calcStats = (objs: AdObject[]) => {
      const prices = objs
        .map(o => ({ price: getPriceAtDate(o.price_history || [], midMonth, o.current_price), area: o.area_total }))
        .filter(p => p.price != null && p.price > 0);
      if (prices.length === 0) return { avgPrice: null, avgPerM2: null, medianPrice: null, medianPerM2: null };

      const priceValues = prices.map(p => p.price!).sort((a, b) => a - b);
      const avgPrice = Math.round(priceValues.reduce((s, p) => s + p, 0) / priceValues.length);
      const medianPrice = Math.round(priceValues[Math.floor(priceValues.length / 2)]);

      const withArea = prices.filter(p => p.area);
      let avgPerM2: number | null = null;
      let medianPerM2: number | null = null;
      if (withArea.length > 0) {
        const perM2Values = withArea.map(p => p.price! / p.area!).sort((a, b) => a - b);
        avgPerM2 = Math.round(perM2Values.reduce((s, p) => s + p, 0) / perM2Values.length);
        medianPerM2 = Math.round(perM2Values[Math.floor(perM2Values.length / 2)]);
      }

      return { avgPrice, avgPerM2, medianPrice, medianPerM2 };
    };

    // Объекты, активные на середину месяца (created <= midMonth && (active || updated >= midMonth))
    const activeAtMid = objects.filter(o => {
      if (!o.created || new Date(o.created) > midMonth) return false;
      if (o.status === 'archived' && o.updated && new Date(o.updated) < midMonth) return false;
      return true;
    });

    // Из них — текущие активные
    const activeObjs = activeAtMid.filter(o => o.status !== 'archived');

    // Из них — ныне архивные (были активны тогда, но потом ушли с рынка)
    const archivedObjs = activeAtMid.filter(o => o.status === 'archived');

    const activeStats = calcStats(activeObjs);
    const archivedStats = calcStats(archivedObjs);

    return {
      month: bucket.month,
      label: bucket.label,
      activeAvgPrice: activeStats.avgPrice,
      activeAvgPerM2: activeStats.avgPerM2,
      archivedAvgPrice: archivedStats.avgPrice,
      archivedAvgPerM2: archivedStats.avgPerM2,
      activeMedianPrice: activeStats.medianPrice,
      activeMedianPerM2: activeStats.medianPerM2,
      archivedMedianPrice: archivedStats.medianPrice,
      archivedMedianPerM2: archivedStats.medianPerM2,
    };
  });
}

// ─── Коридор рынка ───

function addrLabel(obj: AdObject, addresses?: { id: number; address: string }[]): string {
  if (!obj.address_id || !addresses) return '';
  const a = addresses.find(a => a.id === obj.address_id);
  return a?.address || '';
}

function objToCorridorPoint(obj: AdObject, x: number, addresses?: { id: number; address: string }[]): CorridorPoint {
  return {
    x,
    y: obj.current_price ?? 0,
    objectId: obj.id ?? 0,
    status: obj.status,
    rooms: obj.rooms,
    area: obj.area_total,
    floor: obj.floor,
    address: addrLabel(obj, addresses),
    dateLabel: new Date(x).toLocaleDateString('ru-RU'),
    confirmed: !!obj.sale_deal,
    dealPrice: obj.sale_deal?.deal_price,
  };
}

export function computeCorridorScatter(objects: AdObject[], addresses?: { id: number; address: string }[]): { active: CorridorPoint[]; archived: CorridorPoint[]; confirmed: CorridorPoint[] } {
  const now = Date.now();
  const active: CorridorPoint[] = [];
  const archived: CorridorPoint[] = [];
  const confirmed: CorridorPoint[] = [];
  for (const obj of objects) {
    if (!obj.current_price || obj.current_price <= 0) continue;
    const point = objToCorridorPoint(obj, obj.status === 'archived' && obj.updated ? new Date(obj.updated).getTime() : now, addresses);
    if (obj.sale_deal) {
      confirmed.push(point);
    } else if (obj.status === 'archived') {
      if (obj.updated) {
        archived.push(point);
      }
    } else {
      active.push(point);
    }
  }
  return { active, archived, confirmed };
}

export interface ObjectLine {
  objectId: number;
  status: string;
  points: { x: number; y: number }[];
  address: string;
  rooms: number | null;
  area: number | null;
  floor: number | null;
  confirmed?: boolean;
}

export function computeCorridorHistoryLines(
  objects: AdObject[],
  mode: 'active' | 'archived' | 'all',
  addresses?: { id: number; address: string }[],
): { lines: ObjectLine[]; scatterArchived: CorridorPoint[]; scatterConfirmed: CorridorPoint[] } {
  const lines: ObjectLine[] = [];
  const scatterArchived: CorridorPoint[] = [];
  const scatterConfirmed: CorridorPoint[] = [];
  const now = Date.now();

  for (const obj of objects) {
    if (!obj.current_price || obj.current_price <= 0) continue;

    const isActive = obj.status !== 'archived';
    const isArchived = obj.status === 'archived';

    if (mode === 'active') {
      // Активные — линии, архивные и продажи — точки
      if (isActive && obj.price_history && obj.price_history.length > 0) {
        lines.push(buildLine(obj, addresses));
      } else if (isArchived) {
        const point = objToCorridorPoint(obj, obj.updated ? new Date(obj.updated).getTime() : now, addresses);
        if (obj.sale_deal) {
          scatterConfirmed.push(point);
        } else {
          scatterArchived.push(point);
        }
      }
    } else if (mode === 'archived') {
      // Архивные — линии, активные — точки
      if (isArchived && obj.price_history && obj.price_history.length > 0) {
        lines.push(buildLine(obj, addresses));
      } else if (isActive) {
        scatterArchived.push(objToCorridorPoint(obj, now, addresses));
      }
    } else {
      // Все — линии
      if (obj.price_history && obj.price_history.length > 0) {
        lines.push(buildLine(obj, addresses));
      }
    }
  }

  return { lines, scatterArchived, scatterConfirmed };
}

export function buildLine(obj: AdObject, addresses?: { id: number; address: string }[]): ObjectLine {
  const history = obj.price_history || [];
  const points: { x: number; y: number }[] = [];

  for (const entry of history) {
    if (entry.date) {
      const price = entry.new_price ?? entry.price ?? entry.old_price;
      if (price != null && price > 0) {
        points.push({ x: new Date(entry.date).getTime(), y: price });
      }
    }
  }

  // Конечная точка
  const endDate = obj.status === 'archived' && obj.updated
    ? new Date(obj.updated).getTime()
    : Date.now();
  const lastPrice = obj.current_price ?? points[points.length - 1]?.y;
  if (lastPrice != null && points.length > 0) {
    const lastTs = points[points.length - 1].x;
    if (Math.abs(endDate - lastTs) > 86400000) {
      points.push({ x: endDate, y: lastPrice });
    }
  }

  points.sort((a, b) => a.x - b.x);
  // Убираем дубликаты подряд одинаковых цен
  const filtered = points.filter((p, i) =>
    i === 0 || i === points.length - 1 || p.y !== points[i - 1].y
  );

  return {
    objectId: obj.id ?? 0,
    status: obj.status,
    points: filtered,
    address: addrLabel(obj, addresses),
    rooms: obj.rooms,
    area: obj.area_total,
    floor: obj.floor,
    confirmed: !!obj.sale_deal,
  };
}

// ─── Форматирование ───

export function formatPriceShort(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} млн`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)} тыс`;
  return String(n);
}

export function formatPriceTooltip(n: number): string {
  return n.toLocaleString('ru-RU') + ' ₽';
}
