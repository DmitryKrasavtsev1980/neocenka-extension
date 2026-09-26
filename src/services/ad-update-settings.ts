/**
 * Настройки обновления объявлений (панель «Обработка объявлений»).
 *
 * Задержки между запросами к площадкам вынесены в настройки: при большом пакете
 * короткие интервалы приводят к бану, поэтому темп задаёт пользователь.
 * Значения хранятся в chrome.storage.local и переживают перезагрузку страницы.
 */

/** Настройки обновления объявлений */
export interface AdUpdateSettings {
  /** Архивные объявления не старше N дней — остальные не трогаем */
  archiveDays: number;
  /** Задержка между быстрыми проверками CIAN, мс */
  cianCheckDelayMs: number;
  /** Задержка между полными парсингами CIAN, мс */
  cianParseDelayMs: number;
  /** Задержка между быстрыми проверками Avito, мс */
  avitoCheckDelayMs: number;
  /** Задержка между полными парсингами Avito, мс */
  avitoParseDelayMs: number;
}

export const DEFAULT_AD_UPDATE_SETTINGS: AdUpdateSettings = {
  archiveDays: 7,
  cianCheckDelayMs: 5_000,
  cianParseDelayMs: 8_000,
  avitoCheckDelayMs: 6_000,
  avitoParseDelayMs: 10_000,
};

const STORAGE_KEY = 'ret_ads_update_settings_v1';

/**
 * Границы значений: [min, max], в единицах самого поля
 * (archiveDays — дни, *DelayMs — миллисекунды).
 */
export const AD_UPDATE_SETTINGS_LIMITS = {
  archiveDays: [1, 90],
  cianCheckDelayMs: [1_000, 300_000],
  cianParseDelayMs: [1_000, 300_000],
  avitoCheckDelayMs: [1_000, 300_000],
  avitoParseDelayMs: [1_000, 300_000],
} as const satisfies Record<keyof AdUpdateSettings, readonly [number, number]>;

/** Границы задержек в секундах — для атрибутов min/max инпутов */
export const DELAY_LIMITS_SEC = [1, 300] as const;

/** Ограничить значение границами поля */
function clamp(value: unknown, limits: readonly [number, number], fallback: number): number {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(limits[1], Math.max(limits[0], num));
}

/**
 * Целое значение из number-инпута, ограниченное границами поля.
 * Пустой или битый ввод откатываем к fallback — инпут не должен «съедать» символ.
 */
export function intSettingValue<K extends keyof AdUpdateSettings>(
  key: K,
  value: string,
  fallback: number,
): number {
  const [min, max] = AD_UPDATE_SETTINGS_LIMITS[key];
  const num = Math.round(Number(value));
  if (!Number.isFinite(num) || value.trim() === '') return fallback;
  return Math.min(max, Math.max(min, num));
}

/** Секунды из инпута → миллисекунды для хранения */
export function delayMsFromSecondsInput(value: string, fallbackMs: number): number {
  const sec = Math.round(Number(value));
  if (!Number.isFinite(sec) || value.trim() === '') return fallbackMs;
  const [minSec, maxSec] = DELAY_LIMITS_SEC;
  return Math.min(maxSec, Math.max(minSec, sec)) * 1000;
}

/**
 * Загрузить настройки, заменив отсутствующие или битые поля дефолтами.
 * Мерж с дефолтами обязателен: новые поля не должны ломать старые сохранённые значения.
 */
export async function loadAdUpdateSettings(): Promise<AdUpdateSettings> {
  const stored = (await readStorage(STORAGE_KEY)) as Partial<AdUpdateSettings> | undefined;

  return {
    archiveDays: clamp(stored?.archiveDays, AD_UPDATE_SETTINGS_LIMITS.archiveDays, DEFAULT_AD_UPDATE_SETTINGS.archiveDays),
    cianCheckDelayMs: clamp(stored?.cianCheckDelayMs, AD_UPDATE_SETTINGS_LIMITS.cianCheckDelayMs, DEFAULT_AD_UPDATE_SETTINGS.cianCheckDelayMs),
    cianParseDelayMs: clamp(stored?.cianParseDelayMs, AD_UPDATE_SETTINGS_LIMITS.cianParseDelayMs, DEFAULT_AD_UPDATE_SETTINGS.cianParseDelayMs),
    avitoCheckDelayMs: clamp(stored?.avitoCheckDelayMs, AD_UPDATE_SETTINGS_LIMITS.avitoCheckDelayMs, DEFAULT_AD_UPDATE_SETTINGS.avitoCheckDelayMs),
    avitoParseDelayMs: clamp(stored?.avitoParseDelayMs, AD_UPDATE_SETTINGS_LIMITS.avitoParseDelayMs, DEFAULT_AD_UPDATE_SETTINGS.avitoParseDelayMs),
  };
}

/**
 * Сохранить изменённые поля поверх текущих настроек.
 * Читаем-сравниваем-пишем, чтобы правка одного инпута не затирала остальные.
 * Записи сериализуются: быстрые правки в разных инпутах не должны терять друг друга.
 */
let writeChain: Promise<void> = Promise.resolve();

export function saveAdUpdateSettings(patch: Partial<AdUpdateSettings>): Promise<void> {
  writeChain = writeChain.then(async () => {
    const current = await loadAdUpdateSettings();
    await writeStorage(STORAGE_KEY, { ...current, ...patch });
  });
  return writeChain;
}

/** Чтение из chrome.storage.local с откатом на пустоту вне расширения */
async function readStorage(key: string): Promise<unknown> {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) return undefined;
  return new Promise((resolve) => {
    chrome.storage.local.get(key, (result) => {
      resolve((result as Record<string, unknown>)[key]);
    });
  });
}

/** Запись в chrome.storage.local; вне расширения — тихий no-op */
async function writeStorage(key: string, value: unknown): Promise<void> {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) return;
  chrome.storage.local.set({ [key]: value });
}
