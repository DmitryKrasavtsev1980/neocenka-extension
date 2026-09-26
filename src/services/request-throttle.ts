/**
 * Троттлинг запросов к площадкам (CIAN / Avito).
 *
 * Площадки банят за регулярный поток запросов, поэтому здесь два инструмента:
 * - delayWithJitter() — пауза со случайным разбросом, чтобы не выглядеть метрономом;
 * - isBlockSignal() — распознавание ответа «отвались» (403/429/капча), чтобы
 *   реагировать паузой, а не продолжать долбить площадку.
 */

/** Пауза после сигнала блокировки, мс */
export const BLOCK_PAUSE_MS = 120_000;

/** Сколько блокировок подряд допускаем, прежде чем прервать прогон */
export const MAX_CONSECUTIVE_BLOCKS = 3;

/** Разброс задержки, ±30% от базовой */
const JITTER_RATIO = 0.3;

/** Нижняя граница задержки, мс — чтобы разброс не свёл её к нулю */
const MIN_DELAY_MS = 250;

/**
 * Задержка со случайным разбросом ±30%.
 * Фиксированный интервал — характерный признак бота, его и отсекают антифрод-системы.
 */
export function delayWithJitter(baseMs: number): Promise<void> {
  const jitter = baseMs * JITTER_RATIO;
  const ms = Math.max(MIN_DELAY_MS, baseMs + (Math.random() * 2 - 1) * jitter);
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Маркеры блокировки в тексте ошибки (сравнение в нижнем регистре) */
const BLOCK_MARKERS = [
  '403',
  '429',
  'капч',
  'captcha',
  'too many requests',
  'подтвердите, что вы не робот',
  'доступ ограничен',
];

/**
 * Похоже ли сообщение об ошибке на сигнал блокировки/капчи.
 * Строки, с которыми работаем: 'HTTP 403' / 'HTTP 429' из checkCianAdHtml и
 * 'Страница требует прохождения капчи' из парсеров.
 */
export function isBlockSignal(message: string): boolean {
  const lower = message.toLowerCase();
  return BLOCK_MARKERS.some((marker) => lower.includes(marker));
}
