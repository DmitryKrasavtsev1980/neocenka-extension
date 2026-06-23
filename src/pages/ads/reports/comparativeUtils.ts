/**
 * Чистые функции алгоритма сравнительного анализа.
 * Перенесено из neocenka-extension/pages/managers/ComparativeAnalysisManager.js
 *
 * Концепция: пользователь оценивает объекты из фильтра относительно
 * мысленного «абстрактного объекта оценки» по 6 статусам. Оценки сужают
 * коридор цен → итоговый «оптимальный диапазон» с оценкой достоверности.
 */
import type { AdObject } from '@/types/ad';
import {
  type ComparativePoint,
  type ConfidenceInfo,
  type Corridor,
  type Evaluation,
  EXCLUDED_EVALUATIONS,
} from '@/types/comparative';

/**
 * Простой хэш строки → короткая строка.
 * Используется для группировки сессий по набору объектов (фильтру).
 * Не криптографический — просто уникальный в пределах практического использования.
 */
export function hashString(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  // Беззнаковое 32-битное в hex
  return (h >>> 0).toString(16);
}

/**
 * Хэш набора объектов (отсортированные ID).
 * Одинаковым фильтрам (набору объектов) соответствует один и тот же хэш.
 */
export function computeFilterHash(objects: AdObject[]): string {
  const ids = objects
    .map(o => o.id)
    .filter((v): v is number => typeof v === 'number')
    .sort((a, b) => a - b);
  return hashString(ids.join(','));
}

/**
 * Расчёт границ коридора для объектов с заданным статусом (active / archived).
 *
 * Правила:
 * - better («Лучше»): опускает верхнюю границу → max = min(price | better)
 * - worse («Хуже»):   поднимает нижнюю границу → min = max(price | worse)
 * - equal: не влияет
 * - excluded (fake, not-competitor, not-sold): пропускаются
 */
export function calculateCorridorBounds(
  objects: AdObject[],
  evaluations: Record<number, Evaluation>,
  objectStatus: 'active' | 'archived',
): Corridor {
  let min: number | null = null;
  let max: number | null = null;

  for (const obj of objects) {
    if (!obj.id) continue;
    const objIsArchived = obj.status === 'archived';
    const statusMatches = objectStatus === 'archived' ? objIsArchived : !objIsArchived;
    if (!statusMatches) continue;

    const evaluation = evaluations[obj.id];
    if (!evaluation) continue;
    if ((EXCLUDED_EVALUATIONS as readonly string[]).includes(evaluation)) continue;

    const price = obj.current_price;
    if (!price || price <= 0) continue;

    if (evaluation === 'better') {
      if (max === null || price < max) max = price;
    } else if (evaluation === 'worse') {
      if (min === null || price > min) min = price;
    }
    // equal — не влияет
  }

  return { min, max };
}

/**
 * Оптимальный диапазон — пересечение коридоров active и archive.
 * Если хотя бы один коридор не определён — берём доступный.
 * Если коридоры не пересекаются (min > max) — возвращаем {null, null}.
 */
export function calculateOptimalRange(active: Corridor, archive: Corridor): Corridor {
  let min: number | null;
  let max: number | null;

  if (active.min !== null && archive.min !== null) {
    min = Math.max(active.min, archive.min);
  } else if (active.min !== null) {
    min = active.min;
  } else if (archive.min !== null) {
    min = archive.min;
  } else {
    min = null;
  }

  if (active.max !== null && archive.max !== null) {
    max = Math.min(active.max, archive.max);
  } else if (active.max !== null) {
    max = active.max;
  } else if (archive.max !== null) {
    max = archive.max;
  } else {
    max = null;
  }

  if (min !== null && max !== null && min > max) {
    // Коридоры не пересекаются
    return { min: null, max: null };
  }

  return { min, max };
}

/**
 * Вычисление эффективных оценок: пользовательские + автоматические теги.
 *
 * Правила авто-тегов (симметричные):
 *   overpriced  — «worse» дороже «better» в перекрывающийся период
 *                 (worsePrice > betterPrice && worseUpdated ∈ [betterCreated, betterUpdated])
 *   underpriced — «better» дешевле «worse» в перекрывающийся период
 *                 (betterPrice < worsePrice && betterUpdated ∈ [worseCreated, worseUpdated])
 *
 * ВАЖНО: пользовательские оценки ( MANUAL_EVALUATIONS) НЕ модифицируются.
 * Эффективная оценка берётся из пользовательской; авто-тег заменяет её только если
 * сработало правило. Если условие перестало выполняться — авто-тег исчезает,
 * пользовательская оценка возвращается автоматически.
 *
 * @returns { effective, reasons } — эффективные оценки и текстовые причины для UI
 */
export function computeEffectiveEvaluations(
  objects: AdObject[],
  userEvaluations: Record<number, Evaluation>,
): { effective: Record<number, Evaluation>; reasons: Record<number, string> } {
  const effective: Record<number, Evaluation> = { ...userEvaluations };
  const reasons: Record<number, string> = {};

  const findObj = (idStr: string): AdObject | undefined =>
    objects.find(o => o.id === Number(idStr));

  // Собираем объекты, оценённые пользователем как «Лучше» и «Хуже»
  const betterObjects: AdObject[] = [];
  const worseObjects: AdObject[] = [];
  for (const [idStr, evaluation] of Object.entries(userEvaluations)) {
    if (evaluation === 'better') {
      const obj = findObj(idStr);
      if (obj && obj.current_price && obj.current_price > 0) betterObjects.push(obj);
    } else if (evaluation === 'worse') {
      const obj = findObj(idStr);
      if (obj && obj.current_price && obj.current_price > 0) worseObjects.push(obj);
    }
  }

  if (betterObjects.length === 0 || worseObjects.length === 0) {
    return { effective, reasons };
  }

  // overpriced: каждая «Хуже» сравнивается со всеми «Лучше»
  for (const worseObj of worseObjects) {
    if (!worseObj.id || !worseObj.updated || !worseObj.current_price) continue;
    const worsePrice = worseObj.current_price;
    const worseUpdatedMs = new Date(worseObj.updated).getTime();
    for (const betterObj of betterObjects) {
      if (!betterObj.current_price || !betterObj.created || !betterObj.updated) continue;
      const betterPrice = betterObj.current_price;
      const betterCreatedMs = new Date(betterObj.created).getTime();
      const betterUpdatedMs = new Date(betterObj.updated).getTime();
      if (
        worsePrice > betterPrice &&
        worseUpdatedMs >= betterCreatedMs &&
        worseUpdatedMs <= betterUpdatedMs
      ) {
        effective[worseObj.id] = 'overpriced';
        reasons[worseObj.id] = `Цена ${fmtPrice(worsePrice)} выше аналога «Лучше» (${fmtPrice(betterPrice)})`;
        break;
      }
    }
  }

  // underpriced: каждая «Лучше» сравнивается со всеми «Хуже»
  for (const betterObj of betterObjects) {
    if (!betterObj.id || !betterObj.updated || !betterObj.current_price) continue;
    const betterPrice = betterObj.current_price;
    const betterUpdatedMs = new Date(betterObj.updated).getTime();
    for (const worseObj of worseObjects) {
      if (!worseObj.current_price || !worseObj.created || !worseObj.updated) continue;
      const worsePrice = worseObj.current_price;
      const worseCreatedMs = new Date(worseObj.created).getTime();
      const worseUpdatedMs = new Date(worseObj.updated).getTime();
      if (
        betterPrice < worsePrice &&
        betterUpdatedMs >= worseCreatedMs &&
        betterUpdatedMs <= worseUpdatedMs
      ) {
        effective[betterObj.id] = 'underpriced';
        reasons[betterObj.id] = `Цена ${fmtPrice(betterPrice)} ниже аналога «Хуже» (${fmtPrice(worsePrice)}) — возможна выгодная покупка`;
        break;
      }
    }
  }

  return { effective, reasons };
}

/** Короткий формат цены для причин авто-тегов */
function fmtPrice(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)} млн`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)} тыс`;
  return String(n);
}

/**
 * Расчёт уровня достоверности на основе количества валидных оценок.
 *
 * Шкала (из старого расширения):
 *   0     → 0%
 *   1–2   → 25% (низкая)
 *   3–5   → 60% (умеренная)
 *   6–8   → 80% (хорошая)
 *   9+    → 95% (высокая)
 */
export function calculateConfidence(evaluations: Record<number, Evaluation>): ConfidenceInfo {
  const entries = Object.values(evaluations);
  const totalEvaluations = entries.length;
  const excluded = entries.filter(e => (EXCLUDED_EVALUATIONS as readonly string[]).includes(e)).length;
  const validEvaluations = totalEvaluations - excluded;

  let level: number;
  let message: string;
  let recommendation: string;

  if (validEvaluations === 0) {
    level = 0;
    message = 'Коридор не определён';
    recommendation = 'Начните оценивать объекты';
  } else if (validEvaluations <= 2) {
    level = 25;
    message = `Низкая достоверность (${validEvaluations} ${pluralize(validEvaluations, 'оценка', 'оценки', 'оценок')})`;
    recommendation = `Добавьте ещё ${5 - validEvaluations} ${pluralize(5 - validEvaluations, 'оценку', 'оценки', 'оценок')}`;
  } else if (validEvaluations <= 5) {
    level = 60;
    message = `Умеренная достоверность (${validEvaluations} ${pluralize(validEvaluations, 'оценка', 'оценки', 'оценок')})`;
    recommendation = `Добавьте ещё ${8 - validEvaluations} ${pluralize(8 - validEvaluations, 'оценку', 'оценки', 'оценок')}`;
  } else if (validEvaluations <= 8) {
    level = 80;
    message = `Хорошая достоверность (${validEvaluations} ${pluralize(validEvaluations, 'оценка', 'оценки', 'оценок')})`;
    recommendation = 'Коридор достаточно надёжен';
  } else {
    level = 95;
    message = `Высокая достоверность (${validEvaluations} ${pluralize(validEvaluations, 'оценка', 'оценки', 'оценок')})`;
    recommendation = 'Коридор очень надёжен';
  }

  return { level, message, recommendation, validEvaluations, totalEvaluations, excluded };
}

/**
 * Коэффициент неопределённости: насколько «раздувать» зоны вокруг коридоров.
 * Базовая неопределённость 5% (при 100% достоверности),
 * максимальная 30% (при 0% достоверности).
 *
 *   confidence 0%   → 0.30
 *   confidence 50%  → 0.175
 *   confidence 100% → 0.05
 */
export function calculateUncertaintyFactor(confidenceLevel: number): number {
  const baseUncertainty = 0.05;
  const maxUncertainty = 0.30;
  const range = maxUncertainty - baseUncertainty;
  const normalized = confidenceLevel / 100;
  return maxUncertainty - range * normalized;
}

/**
 * Группировка объектов в точки scatter-графика по 10 группам:
 *   active-{better,equal,worse,unevaluated}, archive-{...}, excluded, selected
 */
export function buildScatterPoints(
  objects: AdObject[],
  evaluations: Record<number, Evaluation>,
  addresses: { id: number; address: string }[],
  selectedObjectId: number | null,
): ComparativePoint[] {
  const now = Date.now();
  const addrMap = new Map(addresses.map(a => [a.id, a.address]));
  const points: ComparativePoint[] = [];

  for (const obj of objects) {
    if (!obj.id) continue;
    if (!obj.current_price || obj.current_price <= 0) continue;

    const isArchived = obj.status === 'archived';
    const statusPrefix = isArchived ? 'archive' : 'active';
    // Активные — сегодня (правый край графика), архивные — дата закрытия (updated).
    // Логика та же, что в chartUtils.computeCorridorScatter — визуальное разделение.
    const ts = isArchived && obj.updated ? new Date(obj.updated).getTime() : now;
    const evaluation = evaluations[obj.id];
    // На графике исключаются только ручные статусы (fake, not-competitor, not-sold).
    // overpriced/underpriced показываются отдельными цветными группами.
    const isExcluded =
      evaluation === 'fake' ||
      evaluation === 'not-competitor' ||
      evaluation === 'not-sold';

    let group: string;
    if (isExcluded) {
      group = 'excluded';
    } else if (obj.id === selectedObjectId) {
      group = 'selected';
    } else if (!evaluation) {
      group = `${statusPrefix}-unevaluated`;
    } else {
      group = `${statusPrefix}-${evaluation}`;
    }

    points.push({
      x: ts,
      y: obj.current_price,
      objectId: obj.id,
      group,
      address: (obj.address_id != null ? addrMap.get(obj.address_id) : undefined) || '',
      price: obj.current_price,
      area: obj.area_total,
      floor: obj.floor,
      rooms: obj.rooms,
      status: obj.status,
      dateLabel: new Date(ts).toLocaleDateString('ru-RU'),
    });
  }

  return points;
}

/** Русская плюрализация для слов «оценка/оценки/оценок». */
function pluralize(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
}
