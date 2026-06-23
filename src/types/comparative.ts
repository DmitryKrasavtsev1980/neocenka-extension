/**
 * Типы для отчёта «Сравнительный анализ»
 * Алгоритм перенесён из neocenka-extension/pages/managers/ComparativeAnalysisManager.js
 */

/**
 * Статус оценки объекта относительно мысленного «абстрактного объекта оценки».
 *
 * Пользовательские (ручные) оценки:
 *   - better / worse / equal — влияют на коридор
 *   - fake / not-competitor / not-sold — исключаются из коридора
 *
 * Автоматические метки (вычисляются на лету, НЕ сохраняются в storage):
 *   - overpriced  — «worse» стоит дороже «better» в перекрывающийся период
 *   - underpriced — «better» стоит дешевле «worse» в перекрывающийся период
 */
export type Evaluation =
  | 'better' | 'worse' | 'equal'
  | 'fake' | 'not-competitor' | 'not-sold'
  | 'overpriced' | 'underpriced';

/** Пользовательские оценки — только они сохраняются в storage */
export const MANUAL_EVALUATIONS: readonly Evaluation[] = [
  'better', 'worse', 'equal', 'fake', 'not-competitor', 'not-sold',
];

/** Автоматические оценки — вычисляются на лету */
export const AUTO_EVALUATIONS: readonly Evaluation[] = ['overpriced', 'underpriced'];

/** Статусы, при которых объект исключается из расчёта коридора */
export const EXCLUDED_EVALUATIONS: readonly Evaluation[] = [
  'fake', 'not-competitor', 'not-sold', 'overpriced', 'underpriced',
];

/** Метки статусов для UI */
export const EVALUATION_LABELS: Record<Evaluation, string> = {
  better: 'Лучше',
  worse: 'Хуже',
  equal: 'Равно',
  fake: 'Фейк',
  'not-competitor': 'Не конкурент',
  'not-sold': 'Не продан',
  overpriced: 'Переоценён',
  underpriced: 'Недооценён',
};

/** Коридор цен по статусу объектов (active / archived) */
export interface Corridor {
  min: number | null;
  max: number | null;
}

/** Информация о статистической достоверности */
export interface ConfidenceInfo {
  level: number; // 0..100
  message: string;
  recommendation: string;
  validEvaluations: number;
  totalEvaluations: number;
  excluded: number;
}

/** Сохранённая сессия сравнительного анализа */
export interface ComparativeSession {
  id: string;
  name: string;
  /** Хэш набора объектов (для группировки сессий по фильтру) */
  filterHash: string;
  createdAt: string;
  /** Оценки объектов: objectId → Evaluation */
  evaluations: Record<number, Evaluation>;
}

/** Точка на графике рассеяния */
export interface ComparativePoint {
  x: number; // timestamp
  y: number; // цена
  objectId: number;
  group: string; // 'active-better' | 'archive-worse' | ...
  address: string;
  price: number;
  area: number | null;
  floor: number | null;
  rooms: number | null;
  status: string;
  dateLabel: string;
}
