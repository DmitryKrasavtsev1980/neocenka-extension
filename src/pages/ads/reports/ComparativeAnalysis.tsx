/**
 * Отчёт «Сравнительный анализ».
 *
 * Пользователь оценивает объекты из фильтра относительно мысленного
 * «абстрактного объекта оценки» по 6 ручным статусам (better/worse/equal/
 * fake/not-competitor/not-sold). Дополнительно вычисляются 2 автоматических
 * тега (overpriced/underpriced) — на лету, без сохранения.
 * Оценки сужают коридор цен → итоговый «оптимальный диапазон»
 * с оценкой достоверности.
 *
 * Поддержка множественных сессий: можно создавать новые сравнения и
 * возвращаться к старым по фильтру. Сохранение в chrome.storage.local.
 */
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  ScatterChart, Scatter, XAxis, YAxis, ZAxis, CartesianGrid, Tooltip,
  ReferenceLine, ReferenceArea, Legend,
} from 'recharts';
import type { AdObject } from '@/types/ad';
import ChartBox from '@/components/shared/ChartBox';
import {
  type Evaluation,
  type ComparativeSession,
  EVALUATION_LABELS,
} from '@/types/comparative';
import {
  buildScatterPoints,
  calculateConfidence,
  calculateCorridorBounds,
  calculateOptimalRange,
  calculateUncertaintyFactor,
  computeEffectiveEvaluations,
  computeFilterHash,
} from './comparativeUtils';
import {
  createSession, deleteSession, loadSessionsForFilter, updateSessionEvaluations,
} from './comparativeStorage';
import { formatPriceTooltip } from './chartUtils';

interface Props {
  objects: AdObject[];
  addresses: { id: number; address: string }[];
  onObjectClick?: (obj: AdObject) => void;
  /** Предзагруженная сессия (для share-viewer).
   *  Если передан — компонент НЕ обращается к storage, использует эту сессию. */
  preloadedSession?: {
    id: string;
    name: string;
    evaluations: Record<number, Evaluation>;
  };
  /** Режим только просмотра: скрывает кнопки оценок и управление сессиями. */
  readOnly?: boolean;
}

/* ─── Цвета групп точек ─── */
const GROUP_COLORS: Record<string, string> = {
  'active-better':        '#93c5fd',
  'active-equal':         '#3b82f6',
  'active-worse':         '#1e40af',
  'active-unevaluated':   '#60a5fa',
  'active-overpriced':    '#f97316',
  'active-underpriced':   '#06b6d4',
  'archive-better':       '#86efac',
  'archive-equal':        '#22c55e',
  'archive-worse':        '#15803d',
  'archive-unevaluated':  '#4ade80',
  'archive-overpriced':   '#ea580c',
  'archive-underpriced':  '#0891b2',
  excluded:               '#dc2626',
  selected:               '#ec4899',
};

const GROUP_LABELS: Record<string, string> = {
  'active-better':        'Активные (лучше)',
  'active-equal':         'Активные (равно)',
  'active-worse':         'Активные (хуже)',
  'active-unevaluated':   'Активные (не оценены)',
  'active-overpriced':    'Активные (переоценён)',
  'active-underpriced':   'Активные (недооценён)',
  'archive-better':       'Архивные (лучше)',
  'archive-equal':        'Архивные (равно)',
  'archive-worse':        'Архивные (хуже)',
  'archive-unevaluated':  'Архивные (не оценены)',
  'archive-overpriced':   'Архивные (переоценён)',
  'archive-underpriced':  'Архивные (недооценён)',
  excluded:               'Исключённые',
  selected:               'Выбранный объект',
};

/* ─── Кнопки оценки ─── */
const EVAL_BUTTONS: { value: Evaluation; color: string; bg: string; }[] = [
  { value: 'better',         color: 'text-blue-700 dark:text-blue-300',     bg: 'bg-blue-100 dark:bg-blue-900/40 hover:bg-blue-200 dark:hover:bg-blue-800/60 border-blue-300 dark:border-blue-700' },
  { value: 'equal',          color: 'text-zinc-700 dark:text-zinc-300',     bg: 'bg-zinc-100 dark:bg-zinc-700/40 hover:bg-zinc-200 dark:hover:bg-zinc-600/60 border-zinc-300 dark:border-zinc-600' },
  { value: 'worse',          color: 'text-amber-700 dark:text-amber-300',   bg: 'bg-amber-100 dark:bg-amber-900/40 hover:bg-amber-200 dark:hover:bg-amber-800/60 border-amber-300 dark:border-amber-700' },
  { value: 'fake',           color: 'text-red-700 dark:text-red-300',       bg: 'bg-red-50 dark:bg-red-900/30 hover:bg-red-100 dark:hover:bg-red-800/50 border-red-200 dark:border-red-700' },
  { value: 'not-competitor', color: 'text-zinc-600 dark:text-zinc-400',     bg: 'bg-zinc-50 dark:bg-zinc-800/40 hover:bg-zinc-100 dark:hover:bg-zinc-700/60 border-zinc-200 dark:border-zinc-700' },
  { value: 'not-sold',       color: 'text-purple-700 dark:text-purple-300', bg: 'bg-purple-50 dark:bg-purple-900/30 hover:bg-purple-100 dark:hover:bg-purple-800/50 border-purple-200 dark:border-purple-700' },
];

const ACTIVE_EVAL: { [k in Evaluation]: string } = {
  better:         'bg-blue-600 text-white border-blue-600',
  equal:          'bg-zinc-700 text-white border-zinc-700',
  worse:          'bg-amber-600 text-white border-amber-600',
  fake:           'bg-red-600 text-white border-red-600',
  'not-competitor': 'bg-zinc-500 text-white border-zinc-500',
  'not-sold':     'bg-purple-600 text-white border-purple-600',
};

/* ─── Кастомная точка scatter ─── */
const CustomPoint: React.FC<any> = (props) => {
  const { cx, cy, payload } = props;
  if (cx == null || cy == null || !payload) return null;
  const color = GROUP_COLORS[payload.group] || '#3b82f6';
  const r = payload.group === 'selected' ? 7 : 5;
  return (
    <g>
      <circle cx={cx} cy={cy} r={r} fill={color} stroke="#fff" strokeWidth={1.5} style={{ pointerEvents: 'none' }} />
      <circle cx={cx} cy={cy} r={16} fill="transparent" style={{ cursor: 'pointer', pointerEvents: 'all' }} />
    </g>
  );
};

/* ─── Тултип scatter ─── */
const ScatterTooltip: React.FC<any> = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-lg p-2.5 text-[11px]">
      <div className="font-medium text-zinc-800 dark:text-white mb-1">{p.address || 'Без адреса'}</div>
      <div className="text-zinc-600 dark:text-zinc-300 space-y-0.5">
        <div>Цена: <span className="font-medium text-zinc-800 dark:text-white">{formatPriceTooltip(p.price)}</span></div>
        {p.area != null && <div>Площадь: <span className="font-medium">{p.area} м²</span></div>}
        {p.floor != null && <div>Этаж: <span className="font-medium">{p.floor}</span></div>}
        <div>Статус: <span className="font-medium">{p.status === 'archived' ? 'архив' : 'активный'}</span></div>
        <div className="text-zinc-400">{p.dateLabel}</div>
      </div>
    </div>
  );
};

/* ─── helpers ─── */
function formatPriceShort(n: number | null | undefined): string {
  if (n == null) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)} млн`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)} тыс`;
  return String(n);
}

function corridorText(c: { min: number | null; max: number | null }): string {
  if (c.min == null && c.max == null) return '—';
  if (c.min == null) return `до ${formatPriceShort(c.max)}`;
  if (c.max == null) return `от ${formatPriceShort(c.min)}`;
  return `${formatPriceShort(c.min)} — ${formatPriceShort(c.max)}`;
}

/* ─── Стиль карточки по статусу оценки ─── */
interface CardStyle { wrapper: string; bar: string; badge: string; }

function getCardStyle(eval_: Evaluation | undefined, isSelected: boolean): CardStyle {
  // Выбранная карточка — розовая рамка поверх любого цвета оценки
  if (isSelected) {
    return {
      wrapper: 'border-pink-400 bg-pink-50 dark:bg-pink-900/20 dark:border-pink-600',
      bar: 'bg-pink-500',
      badge: 'bg-pink-600',
    };
  }
  switch (eval_) {
    case 'better':
      return { wrapper: 'border-blue-300 bg-blue-50 dark:bg-blue-900/20 dark:border-blue-700', bar: 'bg-blue-500', badge: 'bg-blue-600' };
    case 'equal':
      return { wrapper: 'border-zinc-300 bg-zinc-50 dark:bg-zinc-700/40 dark:border-zinc-500', bar: 'bg-zinc-500', badge: 'bg-zinc-600' };
    case 'worse':
      return { wrapper: 'border-amber-300 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-600', bar: 'bg-amber-500', badge: 'bg-amber-600' };
    case 'fake':
      return { wrapper: 'border-red-300 bg-red-50 dark:bg-red-900/20 dark:border-red-700 opacity-60', bar: 'bg-red-500', badge: 'bg-red-600' };
    case 'not-competitor':
      return { wrapper: 'border-zinc-300 bg-zinc-50 dark:bg-zinc-800/40 dark:border-zinc-600 opacity-60', bar: 'bg-zinc-400', badge: 'bg-zinc-500' };
    case 'not-sold':
      return { wrapper: 'border-purple-300 bg-purple-50 dark:bg-purple-900/20 dark:border-purple-700 opacity-60', bar: 'bg-purple-500', badge: 'bg-purple-600' };
    case 'overpriced':
      // Авто-тег: переоценён — оранжевый, пунктирная рамка (визуально отличается от ручных)
      return { wrapper: 'border-orange-400 bg-orange-50 dark:bg-orange-900/20 dark:border-orange-600 opacity-80 border-dashed', bar: 'bg-orange-500', badge: 'bg-orange-600' };
    case 'underpriced':
      // Авто-тег: недооценён — бирюзовый, пунктирная рамка
      return { wrapper: 'border-cyan-400 bg-cyan-50 dark:bg-cyan-900/20 dark:border-cyan-600 opacity-80 border-dashed', bar: 'bg-cyan-500', badge: 'bg-cyan-600' };
    default:
      return { wrapper: 'border-zinc-200 bg-white dark:bg-zinc-900 dark:border-zinc-700', bar: 'bg-zinc-300 dark:bg-zinc-700', badge: '' };
  }
}

/* ─── Главный компонент ─── */
const ComparativeAnalysis: React.FC<Props> = ({ objects, addresses, onObjectClick, preloadedSession, readOnly }) => {
  const isPreloaded = !!preloadedSession;

  const [sessions, setSessions] = useState<ComparativeSession[]>(
    preloadedSession ? [preloadedSession as ComparativeSession] : [],
  );
  const [activeSessionId, setActiveSessionId] = useState<string | null>(preloadedSession?.id || null);
  const [evaluations, setEvaluations] = useState<Record<number, Evaluation>>(preloadedSession?.evaluations || {});
  const [selectedObjectId, setSelectedObjectId] = useState<number | null>(null);
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'archived'>('all');
  const [showInfo, setShowInfo] = useState(false);
  const [isLoading, setIsLoading] = useState(!isPreloaded);

  // Хэш текущего фильтра (для группировки сессий)
  const filterHash = useMemo(() => computeFilterHash(objects), [objects]);

  // Загрузка сессий при смене фильтра.
  // В preloaded-режиме — НЕ обращаемся к storage.
  useEffect(() => {
    if (isPreloaded) {
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    loadSessionsForFilter(filterHash)
      .then(loaded => {
        if (cancelled) return;
        setSessions(loaded);
        // Активируем последнюю сессию (она первая — sorted desc)
        if (loaded.length > 0) {
          setActiveSessionId(loaded[0].id);
          setEvaluations(loaded[0].evaluations || {});
        } else {
          setActiveSessionId(null);
          setEvaluations({});
        }
      })
      .finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, [filterHash, isPreloaded]);

  // Объекты для отображения (по фильтру статуса)
  const visibleObjects = useMemo(() => {
    if (filterStatus === 'all') return objects;
    return objects.filter(o => filterStatus === 'archived' ? o.status === 'archived' : o.status !== 'archived');
  }, [objects, filterStatus]);

  // Эффективные оценки: пользовательские + автоматические теги (overpriced/underpriced).
  // ВАЖНО: только пользовательские сохраняются в storage (state `evaluations`).
  // Эффективные — вычисляются на лету для расчёта коридоров и UI.
  const { effective: effectiveEvaluations, reasons } = useMemo(
    () => computeEffectiveEvaluations(objects, evaluations),
    [objects, evaluations],
  );

  // Коридоры и достоверность — по эффективным оценкам
  const activeCorridor = useMemo(() => calculateCorridorBounds(objects, effectiveEvaluations, 'active'), [objects, effectiveEvaluations]);
  const archiveCorridor = useMemo(() => calculateCorridorBounds(objects, effectiveEvaluations, 'archived'), [objects, effectiveEvaluations]);
  const optimalCorridor = useMemo(() => calculateOptimalRange(activeCorridor, archiveCorridor), [activeCorridor, archiveCorridor]);
  const confidence = useMemo(() => calculateConfidence(effectiveEvaluations), [effectiveEvaluations]);

  // Точки графика — по эффективным оценкам
  const scatterPoints = useMemo(
    () => buildScatterPoints(objects, effectiveEvaluations, addresses, selectedObjectId),
    [objects, effectiveEvaluations, addresses, selectedObjectId],
  );

  // Группировка точек по сериям для ScatterChart
  const seriesByGroup = useMemo(() => {
    const map = new Map<string, typeof scatterPoints>();
    for (const p of scatterPoints) {
      if (!map.has(p.group)) map.set(p.group, []);
      map.get(p.group)!.push(p);
    }
    return map;
  }, [scatterPoints]);

  /* ─── Действия ─── */

  const handleCreateSession = useCallback(async () => {
    const name = window.prompt('Название сравнения:', `Сравнение ${sessions.length + 1}`);
    if (name === null) return; // Отмена
    const session = await createSession(name, filterHash);
    setSessions(prev => [session, ...prev]);
    setActiveSessionId(session.id);
    setEvaluations({});
  }, [filterHash, sessions.length]);

  const handleSelectSession = useCallback((sessionId: string) => {
    const s = sessions.find(x => x.id === sessionId);
    if (!s) return;
    setActiveSessionId(sessionId);
    setEvaluations(s.evaluations || {});
  }, [sessions]);

  const handleDeleteSession = useCallback(async () => {
    if (!activeSessionId) return;
    if (!window.confirm('Удалить текущее сравнение? Оценки будут потеряны.')) return;
    await deleteSession(activeSessionId);
    setSessions(prev => prev.filter(s => s.id !== activeSessionId));
    const remaining = sessions.filter(s => s.id !== activeSessionId);
    if (remaining.length > 0) {
      setActiveSessionId(remaining[0].id);
      setEvaluations(remaining[0].evaluations || {});
    } else {
      setActiveSessionId(null);
      setEvaluations({});
    }
  }, [activeSessionId, sessions]);

  const handleEvaluate = useCallback(async (objectId: number, evaluation: Evaluation) => {
    // Защита: в read-only / preloaded-режиме оценки менять нельзя
    if (readOnly || isPreloaded) return;
    if (!activeSessionId) return;
    // toggle: повторный клик по той же оценке снимает её
    // Сохраняем ТОЛЬКО пользовательские оценки.
    // Автоматические теги (overpriced/underpriced) вычисляются на лету
    // в computeEffectiveEvaluations и НЕ сохраняются.
    setEvaluations(prev => {
      const next = { ...prev };
      if (next[objectId] === evaluation) {
        delete next[objectId];
      } else {
        next[objectId] = evaluation;
      }
      updateSessionEvaluations(activeSessionId, next);
      return next;
    });
  }, [activeSessionId, readOnly, isPreloaded]);

  const handleObjectCardClick = useCallback((obj: AdObject) => {
    if (!obj.id) return;
    setSelectedObjectId(obj.id);
    onObjectClick?.(obj);
  }, [onObjectClick]);

  const handleScatterClick = useCallback((data: any) => {
    const objId = data?.objectId;
    if (!objId) return;
    const obj = objects.find(o => o.id === objId);
    if (obj) handleObjectCardClick(obj);
  }, [objects, handleObjectCardClick]);

  /* ─── Сортировка объектов списка ─── */
  // Сортировка только по дате обновления desc.
  // ВАЖНО: порядок НЕ зависит от оценок, чтобы карточка оставалась на месте
  // после выбора оценки — пользователь не теряет контекст.
  const sortedVisible = useMemo(() => {
    return [...visibleObjects].sort((a, b) => {
      const ta = a.updated ? new Date(a.updated).getTime() : 0;
      const tb = b.updated ? new Date(b.updated).getTime() : 0;
      return tb - ta;
    });
  }, [visibleObjects]);

  /* ─── render ─── */

  if (objects.length < 2) {
    return (
      <p className="text-xs text-zinc-400 text-center py-8">
        Недостаточно данных для сравнительного анализа (нужно минимум 2 объекта в фильтре)
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {/* Шапка: управление сессиями + инфо */}
      <div className="flex flex-wrap items-center gap-2">
        {!readOnly && !isPreloaded ? (
          <>
            <select
              value={activeSessionId ?? ''}
              onChange={(e) => handleSelectSession(e.target.value)}
              disabled={sessions.length === 0}
              className="px-2.5 py-1 rounded text-[11px] border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200 max-w-[260px]"
            >
              {sessions.length === 0 && <option value="">Нет сохранённых сравнений</option>}
              {sessions.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            <button
              onClick={handleCreateSession}
              className="px-2.5 py-1 rounded text-[11px] font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors"
              title="Создать новое сравнение"
            >+ Новое</button>
            <button
              onClick={handleDeleteSession}
              disabled={!activeSessionId}
              className="px-2.5 py-1 rounded text-[11px] font-medium bg-zinc-100 text-zinc-600 hover:bg-red-100 hover:text-red-700 dark:bg-zinc-700 dark:text-zinc-300 dark:hover:bg-red-900/40 dark:hover:text-red-300 transition-colors disabled:opacity-40 disabled:cursor-not-allowed border border-zinc-300 dark:border-zinc-600"
              title="Удалить текущее сравнение"
            >Удалить</button>
          </>
        ) : (
          /* В read-only / preloaded-режиме — статичное имя сессии */
          (preloadedSession?.name || (activeSessionId && sessions.find(s => s.id === activeSessionId)?.name)) && (
            <span className="px-2.5 py-1 rounded text-[11px] font-medium bg-zinc-100 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-200 border border-zinc-300 dark:border-zinc-600 max-w-[260px] truncate">
              {preloadedSession?.name || sessions.find(s => s.id === activeSessionId)?.name}
            </span>
          )
        )}
        <button
          onClick={() => setShowInfo(v => !v)}
          className="px-2.5 py-1 rounded text-[11px] font-medium bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-600 transition-colors border border-zinc-300 dark:border-zinc-600"
        >{showInfo ? 'Скрыть инфо' : 'Как это работает?'}</button>
        <span className="text-[10px] text-zinc-400 ml-auto">
          {confidence.totalEvaluations} из {objects.length} оценено
        </span>
      </div>

      {/* Инфо-блок */}
      {showInfo && (
        <div className="text-[11px] text-zinc-600 dark:text-zinc-300 bg-zinc-50 dark:bg-zinc-800/50 rounded-lg p-4 space-y-2 leading-relaxed border border-zinc-200 dark:border-zinc-700">
          <p><strong>Концепция:</strong> вы мысленно представляете «абстрактный объект оценки» и сравниваете с ним объекты из фильтра. Оценки сужают коридор цен до оптимального диапазона.</p>
          <p><strong>Ручные статусы (назначаете вы):</strong></p>
          <ul className="list-disc pl-5 space-y-0.5">
            <li><strong>Лучше</strong> — конкурент лучше эталона, опускает верхнюю границу коридора</li>
            <li><strong>Хуже</strong> — конкурент хуже эталона, поднимает нижнюю границу коридора</li>
            <li><strong>Равно</strong> — сопоставим с эталоном, не влияет на коридор</li>
            <li><strong>Фейк</strong>, <strong>Не конкурент</strong>, <strong>Не продан</strong> — исключаются из расчёта коридора</li>
          </ul>
          <p><strong>Автоматические метки (вычисляются на лету):</strong></p>
          <ul className="list-disc pl-5 space-y-0.5">
            <li><strong>Переоценён</strong> — объект «Хуже» стоит дороже объекта «Лучше» в перекрывающийся период. Исключается из коридора.</li>
            <li><strong>Недооценён</strong> — объект «Лучше» стоит дешевле объекта «Хуже» в перекрывающийся период. Исключается из коридора.</li>
          </ul>
          <p className="text-zinc-500 dark:text-zinc-400">Авто-метки показываются пунктирной рамкой (оранжевой / бирюзовой) и исчезают автоматически, если условие перестаёт выполняться.</p>
          <p><strong>Достоверность:</strong> 0 оценок → 0%; 1–2 → 25%; 3–5 → 60%; 6–8 → 80%; 9+ → 95%. Чем больше оценок, тем уже зоны неопределённости вокруг коридоров.</p>
          <p><strong>Оптимальный диапазон</strong> — пересечение коридоров активных и архивных объектов.</p>
        </div>
      )}

      {!activeSessionId && !isLoading && !isPreloaded ? (
        <div className="rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 p-4 text-center">
          <p className="text-xs text-blue-700 dark:text-blue-300">
            Создайте новое сравнение, чтобы начать оценивать объекты.
            <br />Кнопка «+ Новое» в шапке.
          </p>
        </div>
      ) : (
        <div className="flex flex-col lg:flex-row gap-3">
          {/* Левая колонка: список объектов */}
          <div className="lg:w-[360px] lg:flex-shrink-0 space-y-2">
            {/* Переключатель статуса */}
            <div className="flex items-center gap-1 text-[11px]">
              {(['all', 'active', 'archived'] as const).map(s => (
                <button
                  key={s}
                  onClick={() => setFilterStatus(s)}
                  className={`px-2.5 py-1 rounded font-medium transition-colors ${
                    filterStatus === s
                      ? 'bg-blue-600 text-white'
                      : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-600'
                  }`}
                >{s === 'all' ? 'Все' : s === 'active' ? 'Активные' : 'Архивные'}</button>
              ))}
              <span className="text-[10px] text-zinc-400 ml-auto">{sortedVisible.length}</span>
            </div>

            {/* Список объектов */}
            <div className="max-h-[560px] overflow-y-auto space-y-1.5 pr-1">
              {sortedVisible.map(obj => {
                if (!obj.id) return null;
                const userEval = evaluations[obj.id];
                const effectiveEval = effectiveEvaluations[obj.id];
                const isSelected = obj.id === selectedObjectId;
                // Стиль и бейдж — по эффективной оценке (показывает авто-тег)
                const style = getCardStyle(effectiveEval, isSelected);
                // Причина авто-тега для тултипа
                const autoReason = reasons[obj.id];
                const addr = obj.address_id != null ? addresses.find(a => a.id === obj.address_id)?.address : undefined;
                return (
                  <div
                    key={obj.id}
                    className={`relative rounded-lg border pl-3 pr-2 py-2 transition-colors ${style.wrapper}`}
                  >
                    {/* Цветовая полоска слева — индикатор оценки */}
                    <div className={`absolute left-0 top-0 bottom-0 w-1.5 rounded-l-lg ${style.bar}`} />

                    <div
                      className="cursor-pointer"
                      onClick={() => handleObjectCardClick(obj)}
                    >
                      <div className="flex justify-between items-start gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="text-[12px] font-medium text-zinc-800 dark:text-white truncate flex items-center gap-1.5">
                            <span className="truncate">{addr || 'Без адреса'}</span>
                            {effectiveEval && (
                              <span
                                title={autoReason || EVALUATION_LABELS[effectiveEval]}
                                className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold text-white uppercase ${style.badge} ${autoReason ? 'cursor-help' : ''}`}
                              >
                                {EVALUATION_LABELS[effectiveEval]}
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                            {obj.rooms != null && `${obj.rooms}к · `}
                            {obj.area_total != null ? `${obj.area_total} м²` : 'площадь —'}
                            {obj.floor != null && ` · этаж ${obj.floor}`}
                            {obj.status === 'archived' && ' · архив'}
                          </div>
                          {/* Причина авто-тега отдельной строкой под шапкой */}
                          {autoReason && (
                            <div className="text-[9px] text-orange-600 dark:text-orange-400 mt-0.5 italic leading-tight">
                              {autoReason}
                            </div>
                          )}
                        </div>
                        <div className="text-right flex-shrink-0">
                          <div className="text-[12px] font-semibold text-zinc-800 dark:text-white whitespace-nowrap">
                            {obj.current_price ? formatPriceShort(obj.current_price) : '—'}
                          </div>
                          {obj.price_per_meter != null && (
                            <div className="text-[10px] text-zinc-400 whitespace-nowrap">
                              {Math.round(obj.price_per_meter).toLocaleString('ru-RU')} ₽/м²
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Кнопки оценки — активная по пользовательской оценке.
                        В read-only режиме скрываются. */}
                    {!readOnly && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {EVAL_BUTTONS.map(btn => {
                          const isActive = userEval === btn.value;
                          return (
                            <button
                              key={btn.value}
                              onClick={(e) => { e.stopPropagation(); handleEvaluate(obj.id!, btn.value); }}
                              title={EVALUATION_LABELS[btn.value]}
                              className={`px-1.5 py-0.5 rounded text-[10px] font-medium border transition-colors ${
                                isActive
                                  ? ACTIVE_EVAL[btn.value]
                                  : `${btn.bg} ${btn.color}`
                              }`}
                            >{EVALUATION_LABELS[btn.value]}</button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Правая колонка: коридоры + график */}
          <div className="flex-1 min-w-0 space-y-3">
            {/* Коридоры */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div className="rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 p-2.5">
                <div className="text-[10px] text-blue-600 dark:text-blue-300 uppercase font-medium">Активные</div>
                <div className="text-[14px] font-semibold text-zinc-800 dark:text-white mt-0.5">{corridorText(activeCorridor)}</div>
              </div>
              <div className="rounded-lg border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20 p-2.5">
                <div className="text-[10px] text-green-600 dark:text-green-300 uppercase font-medium">Архивные</div>
                <div className="text-[14px] font-semibold text-zinc-800 dark:text-white mt-0.5">{corridorText(archiveCorridor)}</div>
              </div>
              <div className="rounded-lg border border-emerald-300 dark:border-emerald-700 bg-emerald-100 dark:bg-emerald-900/30 p-2.5 ring-2 ring-emerald-400/30">
                <div className="text-[10px] text-emerald-700 dark:text-emerald-300 uppercase font-bold">Оптимальный</div>
                <div className="text-[14px] font-bold text-zinc-800 dark:text-white mt-0.5">{corridorText(optimalCorridor)}</div>
              </div>
            </div>

            {/* Достоверность */}
            <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-2.5">
              <div className="flex justify-between items-center mb-1.5">
                <span className="text-[11px] font-medium text-zinc-700 dark:text-zinc-200">Достоверность</span>
                <span className={`text-[11px] font-bold ${
                  confidence.level >= 80 ? 'text-green-600 dark:text-green-400'
                  : confidence.level >= 60 ? 'text-amber-600 dark:text-amber-400'
                  : confidence.level >= 25 ? 'text-orange-600 dark:text-orange-400'
                  : 'text-red-600 dark:text-red-400'
                }`}>{confidence.level}%</span>
              </div>
              <div className="h-2 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden mb-1.5">
                <div
                  className={`h-full transition-all ${
                    confidence.level >= 80 ? 'bg-green-500'
                    : confidence.level >= 60 ? 'bg-amber-500'
                    : confidence.level >= 25 ? 'bg-orange-500'
                    : 'bg-red-500'
                  }`}
                  style={{ width: `${confidence.level}%` }}
                />
              </div>
              <div className="text-[10px] text-zinc-500 dark:text-zinc-400">
                {confidence.message}. {confidence.recommendation}.
              </div>
            </div>

            {/* График */}
            <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-2.5">
              <ChartBox height={420}>
                {({ width }) => {
                  // Зоны неопределённости (только при confidence < 80)
                  const uncertainty = calculateUncertaintyFactor(confidence.level);
                  const showZones = confidence.level < 80 && optimalCorridor.min != null && optimalCorridor.max != null;
                  const range = showZones && optimalCorridor.max != null && optimalCorridor.min != null
                    ? (optimalCorridor.max - optimalCorridor.min) * uncertainty
                    : 0;

                  return (
                    <ScatterChart width={width} height={420} margin={{ top: 10, right: 20, bottom: 5, left: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis
                        type="number"
                        dataKey="x"
                        domain={['dataMin', 'dataMax']}
                        tickFormatter={(v) => new Date(v).toLocaleDateString('ru-RU', { month: 'short', year: '2-digit' })}
                        tick={{ fontSize: 10 }}
                      />
                      <YAxis
                        type="number"
                        dataKey="y"
                        tickFormatter={(v) => formatPriceShort(v)}
                        tick={{ fontSize: 10 }}
                        width={60}
                      />
                      <ZAxis type="number" dataKey="y" range={[60, 60]} />
                      <Tooltip content={<ScatterTooltip />} cursor={{ strokeDasharray: '3 3' }} />

                      {/* Зона оптимального диапазона */}
                      {optimalCorridor.min != null && optimalCorridor.max != null && (
                        <ReferenceArea
                          y1={optimalCorridor.min}
                          y2={optimalCorridor.max}
                          fill="#10b981"
                          fillOpacity={confidence.level >= 80 ? 0.18 : 0.10}
                        />
                      )}

                      {/* Зоны неопределённости вокруг оптимального */}
                      {showZones && optimalCorridor.min != null && (
                        <ReferenceArea
                          y1={optimalCorridor.min - range}
                          y2={optimalCorridor.min}
                          fill="#6b7280"
                          fillOpacity={0.08}
                        />
                      )}
                      {showZones && optimalCorridor.max != null && (
                        <ReferenceArea
                          y1={optimalCorridor.max}
                          y2={optimalCorridor.max + range}
                          fill="#6b7280"
                          fillOpacity={0.08}
                        />
                      )}

                      {/* Линии коридоров */}
                      {activeCorridor.min != null && (
                        <ReferenceLine y={activeCorridor.min} stroke="#3b82f6" strokeWidth={2}
                          label={{ value: 'активные min', fontSize: 9, fill: '#3b82f6', position: 'insideLeft' }} />
                      )}
                      {activeCorridor.max != null && (
                        <ReferenceLine y={activeCorridor.max} stroke="#3b82f6" strokeWidth={2}
                          label={{ value: 'активные max', fontSize: 9, fill: '#3b82f6', position: 'insideLeft' }} />
                      )}
                      {archiveCorridor.min != null && (
                        <ReferenceLine y={archiveCorridor.min} stroke="#22c55e" strokeWidth={2}
                          label={{ value: 'архив min', fontSize: 9, fill: '#22c55e', position: 'insideRight' }} />
                      )}
                      {archiveCorridor.max != null && (
                        <ReferenceLine y={archiveCorridor.max} stroke="#22c55e" strokeWidth={2}
                          label={{ value: 'архив max', fontSize: 9, fill: '#22c55e', position: 'insideRight' }} />
                      )}

                      {Array.from(seriesByGroup.keys()).map(group => (
                        <Scatter
                          key={group}
                          name={GROUP_LABELS[group] || group}
                          data={seriesByGroup.get(group)!}
                          fill={GROUP_COLORS[group] || '#3b82f6'}
                          shape={<CustomPoint />}
                          onClick={(data: any) => handleScatterClick(data)}
                        />
                      ))}

                      <Legend wrapperStyle={{ fontSize: 10 }} />
                    </ScatterChart>
                  );
                }}
              </ChartBox>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ComparativeAnalysis;
