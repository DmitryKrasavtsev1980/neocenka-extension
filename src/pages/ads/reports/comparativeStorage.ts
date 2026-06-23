/**
 * CRUD для сессий сравнительного анализа.
 * Хранение: chrome.storage.local (с fallback на localStorage для тестов).
 *
 * Ключ: 'comparative_sessions' — JSON-массив ComparativeSession.
 */
import type { ComparativeSession, Evaluation } from '@/types/comparative';

const STORAGE_KEY = 'comparative_sessions';

/** Обёртка над chrome.storage.local.get → Promise */
function storageGet(key: string): Promise<any> {
  return new Promise(resolve => {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.get(key, (result: any) => resolve(result?.[key]));
      } else {
        const v = localStorage.getItem(key);
        resolve(v ? JSON.parse(v) : undefined);
      }
    } catch {
      const v = localStorage.getItem(key);
      resolve(v ? JSON.parse(v) : undefined);
    }
  });
}

/** Обёртка над chrome.storage.local.set → Promise */
function storageSet(key: string, value: any): Promise<void> {
  return new Promise(resolve => {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({ [key]: value }, () => resolve());
      } else {
        localStorage.setItem(key, JSON.stringify(value));
        resolve();
      }
    } catch {
      try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch { /* noop */ }
      resolve();
    }
  });
}

/** Загрузить все сессии из хранилища */
export async function loadAllSessions(): Promise<ComparativeSession[]> {
  const raw = await storageGet(STORAGE_KEY);
  if (!raw) return [];
  if (Array.isArray(raw)) return raw as ComparativeSession[];
  // На случай если сохранили как объект
  return [];
}

/** Сохранить все сессии */
async function saveAllSessions(sessions: ComparativeSession[]): Promise<void> {
  await storageSet(STORAGE_KEY, sessions);
}

/** Загрузить сессии для конкретного фильтра (по filterHash), отсортированные по createdAt desc */
export async function loadSessionsForFilter(filterHash: string): Promise<ComparativeSession[]> {
  const all = await loadAllSessions();
  return all
    .filter(s => s.filterHash === filterHash)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

/** Сгенерировать уникальный ID сессии */
function generateSessionId(): string {
  return `cs_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Создать новую сессию и сохранить её */
export async function createSession(name: string, filterHash: string): Promise<ComparativeSession> {
  const session: ComparativeSession = {
    id: generateSessionId(),
    name: name.trim() || `Сравнение ${new Date().toLocaleDateString('ru-RU')}`,
    filterHash,
    createdAt: new Date().toISOString(),
    evaluations: {},
  };
  const all = await loadAllSessions();
  all.push(session);
  await saveAllSessions(all);
  return session;
}

/** Обновить оценки в сессии (иммутабельно) */
export async function updateSessionEvaluations(
  sessionId: string,
  evaluations: Record<number, Evaluation>,
): Promise<void> {
  const all = await loadAllSessions();
  const idx = all.findIndex(s => s.id === sessionId);
  if (idx === -1) return;
  all[idx] = { ...all[idx], evaluations };
  await saveAllSessions(all);
}

/** Переименовать сессию */
export async function renameSession(sessionId: string, name: string): Promise<void> {
  const all = await loadAllSessions();
  const idx = all.findIndex(s => s.id === sessionId);
  if (idx === -1) return;
  all[idx] = { ...all[idx], name: name.trim() || all[idx].name };
  await saveAllSessions(all);
}

/** Удалить сессию */
export async function deleteSession(sessionId: string): Promise<void> {
  const all = await loadAllSessions();
  const filtered = all.filter(s => s.id !== sessionId);
  await saveAllSessions(filtered);
}
