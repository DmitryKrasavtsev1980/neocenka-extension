import React, { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import { ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import type { AdObject } from '@/types/ad';
import ChartBox from '@/components/shared/ChartBox';
import {
  computeCorridorScatter, computeCorridorHistoryLines, buildLine,
  formatPriceTooltip, type CorridorPoint,
} from './chartUtils';

/* ─── Кастомные SVG-точки ─── */

const BlueDot = ({ cx, cy, onClick, onMouseEnter, onMouseLeave }: any) => {
  if (cx == null || cy == null) return null;
  return (
    <g>
      <circle cx={cx} cy={cy} r={5} fill="#3b82f6" stroke="#fff" strokeWidth={1.5}
        style={{ pointerEvents: 'none' }}
      />
      <circle cx={cx} cy={cy} r={20} fill="transparent" stroke="none"
        style={{ cursor: 'pointer', pointerEvents: 'all' }}
        onClick={onClick} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}
      />
    </g>
  );
};

const OrangeDot = ({ cx, cy, onClick, onMouseEnter, onMouseLeave }: any) => {
  if (cx == null || cy == null) return null;
  return (
    <g>
      <circle cx={cx} cy={cy} r={4} fill="#f97316" stroke="#fff" strokeWidth={1}
        style={{ pointerEvents: 'none' }}
      />
      <circle cx={cx} cy={cy} r={20} fill="transparent" stroke="none"
        style={{ cursor: 'pointer', pointerEvents: 'all' }}
        onClick={onClick} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}
      />
    </g>
  );
};

const DiamondDot = ({ cx, cy, onClick, onMouseEnter, onMouseLeave }: any) => {
  if (cx == null || cy == null) return null;
  const size = 7;
  return (
    <g>
      <polygon
        points={`${cx},${cy - size} ${cx + size},${cy} ${cx},${cy + size} ${cx - size},${cy}`}
        fill="#10b981" stroke="#fff" strokeWidth={1}
        style={{ pointerEvents: 'none' }}
      />
      <circle cx={cx} cy={cy} r={20} fill="transparent" stroke="none"
        style={{ cursor: 'pointer', pointerEvents: 'all' }}
        onClick={onClick} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}
      />
    </g>
  );
};

/* ─── Фильтрация данных по домену для зума ─── */

function clipToDomain<T extends { x: number }>(points: T[], domain: [number, number]): T[] {
  if (points.length <= 1) return points;
  const [lo, hi] = domain;

  let start = points.length;
  for (let i = 0; i < points.length; i++) {
    if (points[i].x >= lo) { start = i; break; }
  }

  let end = -1;
  for (let i = points.length - 1; i >= 0; i--) {
    if (points[i].x <= hi) { end = i; break; }
  }

  if (start > end) return [];
  return points.slice(Math.max(0, start - 1), Math.min(points.length, end + 2));
}

/* ─── Компонент ─── */

interface Props {
  objects: AdObject[];
  addresses: { id: number; address: string }[];
  onObjectClick?: (obj: AdObject) => void;
  height?: number;
}

const COLORS = [
  '#3b82f6', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b',
  '#ec4899', '#6366f1', '#14b8a6', '#84cc16', '#f97316',
];

const CHART_MARGIN = { top: 10, right: 20, bottom: 10, left: 0 };

const MarketCorridorChart: React.FC<Props> = ({ objects, addresses, onObjectClick, height = 400 }) => {
  const [showHistory, setShowHistory] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [hoveredPointId, setHoveredPointId] = useState<number | null>(null);

  // ─── Зум ───
  const [xDomain, setXDomain] = useState<[number, number] | null>(null);
  const chartAreaRef = useRef<HTMLDivElement>(null);
  const scrollbarRef = useRef<HTMLDivElement>(null);
  const isPanning = useRef(false);
  const panStartX = useRef(0);
  const panStartDomain = useRef<[number, number]>([0, 0]);

  // Refs для доступа в нативных обработчиках
  const xDomainRef = useRef(xDomain);
  xDomainRef.current = xDomain;

  // ─── Данные ───

  const objectMap = useMemo(() => {
    const m = new Map<number, AdObject>();
    for (const o of objects) { if (o.id != null) m.set(o.id, o); }
    return m;
  }, [objects]);

  const scatterData = useMemo(() => computeCorridorScatter(objects, addresses), [objects, addresses]);
  const historyData = useMemo(() => computeCorridorHistoryLines(objects, 'active', addresses), [objects, addresses]);

  const hoveredLine = useMemo(() => {
    if (hoveredPointId == null) return null;
    const obj = objectMap.get(hoveredPointId);
    if (!obj || !obj.price_history || obj.price_history.length === 0) return null;
    return buildLine(obj, addresses);
  }, [hoveredPointId, objectMap, addresses]);

  const allYValues = useMemo(() => {
    const vals: number[] = [];
    for (const o of objects) {
      if (o.current_price && o.current_price > 0) vals.push(o.current_price);
    }
    return vals;
  }, [objects]);

  // Полный домен X по всем данным
  const fullDomain = useMemo(() => {
    let min = Infinity, max = -Infinity;
    const check = (x: number) => { if (x < min) min = x; if (x > max) max = x; };
    for (const pt of scatterData.active) check(pt.x);
    for (const pt of scatterData.archived) check(pt.x);
    for (const pt of scatterData.confirmed) check(pt.x);
    for (const pt of historyData.scatterArchived) check(pt.x);
    for (const pt of historyData.scatterConfirmed) check(pt.x);
    for (const line of historyData.lines) for (const p of line.points) check(p.x);
    if (!isFinite(min)) return [Date.now() - 86400000 * 30, Date.now()] as [number, number];
    const pad = (max - min) * 0.03 || 86400000;
    return [min - pad, max + pad] as [number, number];
  }, [scatterData, historyData]);

  const fullDomainRef = useRef(fullDomain);
  fullDomainRef.current = fullDomain;

  // Сброс зума при смене режима
  useEffect(() => setXDomain(null), [showHistory]);

  const effectiveDomain: [number, number] = xDomain || fullDomain;
  const isZoomed = xDomain != null && (xDomain[0] !== fullDomain[0] || xDomain[1] !== fullDomain[1]);

  if (objects.length < 2) {
    return <p className="text-xs text-zinc-400 text-center py-8">Недостаточно данных для построения графика (минимум 2 объекта)</p>;
  }

  const yMin = allYValues.length > 0 ? Math.min(...allYValues) * 0.9 : 0;
  const yMax = allYValues.length > 0 ? Math.max(...allYValues) * 1.1 : 100;

  const formatY = (v: number) => {
    if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)} млн`;
    if (v >= 1_000) return `${(v / 1_000).toFixed(0)} тыс`;
    return String(v);
  };

  const formatX = (ts: number) => new Date(ts).toLocaleDateString('ru-RU', { month: 'short', year: '2-digit' });

  const handleClick = (objectId: number) => {
    if (!onObjectClick) return;
    const obj = objectMap.get(objectId);
    if (obj) onObjectClick(obj);
  };

  // ─── Зум колёсиком (document-level capture, чтобы обойти Recharts SVG) ───

  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      const el = chartAreaRef.current;
      if (!el) return;

      // Если курсор над модалкой или другим overlay — не зумим
      const target = e.target as HTMLElement;
      if (target.closest('.ad-object-detail-modal, [role="dialog"], .fixed.inset-0')) return;

      // Проверяем, что курсор в зоне графика
      const elRect = el.getBoundingClientRect();
      if (e.clientX < elRect.left || e.clientX > elRect.right ||
          e.clientY < elRect.top || e.clientY > elRect.bottom) return;

      e.preventDefault();

      // Ищем основной SVG графика (самый широкий, а не первый попавшийся)
      const svgs = el.querySelectorAll('svg');
      let svg: SVGSVGElement | null = null;
      let maxW = 0;
      for (const s of svgs) {
        const w = s.getBoundingClientRect().width;
        if (w > maxW) { maxW = w; svg = s as SVGSVGElement; }
      }
      if (!svg) return;

      const rect = svg.getBoundingClientRect();
      const plotLeft = rect.left + CHART_MARGIN.left;
      const plotW = rect.width - CHART_MARGIN.left - CHART_MARGIN.right;
      if (plotW <= 0) return;

      const ratio = Math.max(0, Math.min(1, (e.clientX - plotLeft) / plotW));
      const domain = xDomainRef.current || fullDomainRef.current;
      const mouseDataX = domain[0] + ratio * (domain[1] - domain[0]);

      const factor = e.deltaY > 0 ? 1.25 : 1 / 1.25;
      const newRange = (domain[1] - domain[0]) * factor;

      let newMin = mouseDataX - ratio * newRange;
      let newMax = mouseDataX + (1 - ratio) * newRange;

      const fd = fullDomainRef.current;
      if (newMin < fd[0]) { newMax += fd[0] - newMin; newMin = fd[0]; }
      if (newMax > fd[1]) { newMin -= newMax - fd[1]; newMax = fd[1]; }
      newMin = Math.max(fd[0], newMin);
      newMax = Math.min(fd[1], newMax);

      if (newMax - newMin < (fd[1] - fd[0]) * 0.02) return;

      setXDomain([newMin, newMax]);
    };

    document.addEventListener('wheel', onWheel, { passive: false, capture: true });
    return () => document.removeEventListener('wheel', onWheel, { capture: true });
  }, []);

  // ─── Панорамирование (перетаскивание графика) ───

  const handlePanStart = useCallback((e: React.MouseEvent) => {
    // Только если зумирован
    if (!xDomainRef.current) return;
    isPanning.current = true;
    panStartX.current = e.clientX;
    panStartDomain.current = xDomainRef.current;

    const onMove = (ev: MouseEvent) => {
      if (!isPanning.current) return;
      const svg = chartAreaRef.current?.querySelector('svg');
      if (!svg) return;
      const plotW = svg.getBoundingClientRect().width - CHART_MARGIN.left - CHART_MARGIN.right;
      if (plotW <= 0) return;

      const pixelDelta = ev.clientX - panStartX.current;
      const dataDelta = -(pixelDelta / plotW) * (panStartDomain.current[1] - panStartDomain.current[0]);

      let newMin = panStartDomain.current[0] + dataDelta;
      let newMax = panStartDomain.current[1] + dataDelta;

      const fd = fullDomainRef.current;
      if (newMin < fd[0]) { newMax += fd[0] - newMin; newMin = fd[0]; }
      if (newMax > fd[1]) { newMin -= newMax - fd[1]; newMax = fd[1]; }

      setXDomain([Math.max(fd[0], newMin), Math.min(fd[1], newMax)]);
    };

    const onUp = () => {
      isPanning.current = false;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, []);

  // ─── Скроллбар: перетаскивание бегунка ───

  const handleScrollbarDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const track = scrollbarRef.current;
    if (!track) return;

    const trackRect = track.getBoundingClientRect();
    const clickRatio = (e.clientX - trackRect.left) / trackRect.width;
    const fd = fullDomainRef.current;
    const fullRange = fd[1] - fd[0];
    const domain = xDomainRef.current || fd;
    const domainRange = domain[1] - domain[0];
    const thumbLeft = (domain[0] - fd[0]) / fullRange;
    const thumbRight = thumbLeft + domainRange / fullRange;

    // Если клик на бегунке — перетаскиваем, иначе — прыгаем
    let startDomain = domain;
    if (clickRatio < thumbLeft || clickRatio > thumbRight) {
      const centerData = fd[0] + clickRatio * fullRange;
      let newMin = centerData - domainRange / 2;
      let newMax = centerData + domainRange / 2;
      if (newMin < fd[0]) { newMax += fd[0] - newMin; newMin = fd[0]; }
      if (newMax > fd[1]) { newMin -= newMax - fd[1]; newMax = fd[1]; }
      startDomain = [newMin, newMax];
      setXDomain(startDomain);
    }

    panStartX.current = e.clientX;
    panStartDomain.current = startDomain;
    isPanning.current = true;

    const onMove = (ev: MouseEvent) => {
      if (!isPanning.current) return;
      const tr = scrollbarRef.current?.getBoundingClientRect();
      if (!tr) return;
      const pixelDelta = ev.clientX - panStartX.current;
      const dataDelta = (pixelDelta / tr.width) * fullRange;

      let newMin = panStartDomain.current[0] + dataDelta;
      let newMax = panStartDomain.current[1] + dataDelta;
      if (newMin < fd[0]) { newMax += fd[0] - newMin; newMin = fd[0]; }
      if (newMax > fd[1]) { newMin -= newMax - fd[1]; newMax = fd[1]; }
      setXDomain([Math.max(fd[0], newMin), Math.min(fd[1], newMax)]);
    };

    const onUp = () => {
      isPanning.current = false;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, []);

  // ─── Tooltip ───

  const ScatterTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.[0]) return null;
    const p: CorridorPoint = payload[0].payload;
    const statusLabel = p.confirmed
      ? 'Подтверждённая продажа'
      : p.status === 'archived'
        ? 'Архив (без подтверждения)'
        : 'Активен';
    return (
      <div className="bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-600 rounded-lg p-2 text-xs shadow-lg">
        <p className="font-medium">
          {formatPriceTooltip(p.y)}
          {p.confirmed && p.dealPrice != null && (
            <> <span className="text-green-600 font-normal">/ Продажа: {formatPriceTooltip(p.dealPrice)}</span></>
          )}
        </p>
        <p>{p.rooms ? `${p.rooms}-комн.` : ''} {p.area ? `${p.area} м²` : ''} {p.floor != null ? `эт. ${p.floor}` : ''}</p>
        <p className="text-zinc-500">{statusLabel} · {p.dateLabel}</p>
        {p.address && <p className="text-zinc-400 truncate max-w-[200px]">{p.address}</p>}
      </div>
    );
  };

  const hoveredLineData = hoveredLine ? clipToDomain(hoveredLine.points.map(p => ({
    x: p.x, y: p.y,
    objectId: hoveredLine.objectId, status: hoveredLine.status,
    rooms: hoveredLine.rooms, area: hoveredLine.area, floor: hoveredLine.floor,
    address: hoveredLine.address,
    dateLabel: new Date(p.x).toLocaleDateString('ru-RU'),
    confirmed: hoveredLine.confirmed,
    dealPrice: undefined as number | undefined,
  })), effectiveDomain) : null;
  const hoveredColor = hoveredLine?.confirmed ? '#10b981' : '#f97316';

  // ─── Скроллбар: вычисление позиции бегунка ───
  const fullRange = fullDomain[1] - fullDomain[0];
  const thumbLeft = ((effectiveDomain[0] - fullDomain[0]) / fullRange) * 100;
  const thumbWidth = ((effectiveDomain[1] - effectiveDomain[0]) / fullRange) * 100;

  return (
    <div>
      {/* Управление */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <button
          onClick={() => setShowHistory(false)}
          className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${
            !showHistory
              ? 'bg-blue-600 text-white'
              : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-600'
          }`}
        >Коридор продаж</button>
        <button
          onClick={() => setShowHistory(true)}
          className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${
            showHistory
              ? 'bg-blue-600 text-white'
              : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-600'
          }`}
        >История активных</button>
        <button
          onClick={() => setShowInfo(!showInfo)}
          className={`px-2 py-1 rounded text-[11px] font-medium transition-colors ${
            showInfo
              ? 'bg-zinc-700 text-white'
              : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-700 dark:text-zinc-300'
          }`}
        >Инфо</button>
        {isZoomed && (
          <button
            onClick={() => setXDomain(null)}
            className="px-2 py-1 rounded text-[11px] font-medium bg-zinc-200 text-zinc-700 hover:bg-zinc-300 dark:bg-zinc-600 dark:text-zinc-200"
          >Сброс масштаба</button>
        )}
      </div>

      {/* Подсказка */}
      {showInfo && (
        <div className="text-[11px] text-zinc-600 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-800/50 rounded-lg p-4 mb-4 space-y-2 leading-relaxed">
          <p><strong>Как читать график:</strong></p>
          <p><span className="text-blue-500 font-medium">Синие точки</span> — активные объекты (ещё на продаже).</p>
          <p><span className="text-orange-500 font-medium">Оранжевые точки</span> — архивные объекты без подтверждённой сделки.</p>
          <p><span className="text-green-600 font-medium">Зелёные ромбы</span> — объекты с подтверждённой сделкой продажи.</p>
          <p><strong>Масштабирование:</strong></p>
          <ul className="list-disc ml-4 space-y-1">
            <li>Колёсико мыши — приближение/отдаление (центр — под курсором).</li>
            <li>Перетаскивание графика — панорамирование при приближении.</li>
            <li>Полоса прокрутки внизу — быстрый переход к нужному участку.</li>
          </ul>
          <p>Наведите на точку, чтобы увидеть историю изменения цены. Нажмите, чтобы открыть карточку объекта.</p>
        </div>
      )}

      {/* График */}
      <div ref={chartAreaRef} onMouseDown={handlePanStart} style={{ cursor: isZoomed ? 'grab' : 'default' }}>
        <ChartBox height={height}>
          {({ width }) => {
            const activeLines = showHistory ? historyData.lines : [];

            const legendPayload = [
              { value: 'Активные', type: 'circle' as const, id: 'l-active', color: '#3b82f6' },
              ...(scatterData.archived.length > 0 || historyData.scatterArchived.length > 0 ? [{
                value: 'Архивные', type: 'circle' as const, id: 'l-archived', color: '#f97316',
              }] : []),
              ...(scatterData.confirmed.length > 0 || historyData.scatterConfirmed.length > 0 ? [{
                value: 'Продажа', type: 'diamond' as const, id: 'l-confirmed', color: '#10b981',
              }] : []),
            ];

            return (
              <ComposedChart
                key={`chart-${Math.round(effectiveDomain[0])}-${Math.round(effectiveDomain[1])}`}
                width={width} height={height} margin={CHART_MARGIN}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="x" type="number" domain={effectiveDomain} allowDataOverflow tickFormatter={formatX} tick={{ fontSize: 11 }} />
                <YAxis domain={[yMin, yMax]} tickFormatter={formatY} tick={{ fontSize: 11 }} />
                <Tooltip content={<ScatterTooltip />} cursor={false} />
                {!showHistory && <Legend payload={legendPayload} wrapperStyle={{ fontSize: 12 }} />}

                {/* Линии активных объектов (режим История) */}
                {activeLines.map((line, i) => {
                  const color = COLORS[i % COLORS.length];
                  const lineData = clipToDomain(line.points.map(p => ({
                    x: p.x, y: p.y,
                    objectId: line.objectId, status: line.status,
                    rooms: line.rooms, area: line.area, floor: line.floor,
                    address: line.address,
                    dateLabel: new Date(p.x).toLocaleDateString('ru-RU'),
                    confirmed: line.confirmed,
                    dealPrice: undefined as number | undefined,
                  })), effectiveDomain);
                  if (lineData.length === 0) return null;
                  return (
                    <Line
                      key={line.objectId}
                      data={lineData}
                      dataKey="y"
                      type="stepAfter"
                      stroke={color}
                      strokeWidth={2}
                      strokeOpacity={0.8}
                      dot={(dp: any) => {
                        const { cx, cy, index } = dp;
                        if (cx == null || cy == null) return null;
                        return (
                          <g key={`ld-${line.objectId}-${index}`}>
                            <circle cx={cx} cy={cy} r={3.5} fill={color} stroke="#fff" strokeWidth={1.5}
                              style={{ pointerEvents: 'none' }}
                            />
                            <circle cx={cx} cy={cy} r={20} fill="transparent" stroke="none"
                              style={{ cursor: 'pointer', pointerEvents: 'all' }}
                              onMouseDown={(e: any) => e.stopPropagation()}
                              onClick={() => handleClick(line.objectId)}
                              onMouseEnter={() => setHoveredPointId(line.objectId)}
                              onMouseLeave={() => setHoveredPointId(null)}
                            />
                          </g>
                        );
                      }}
                      activeDot={(ap: any) => {
                        const { cx, cy } = ap;
                        if (cx == null || cy == null) return null;
                        return (
                          <circle cx={cx} cy={cy} r={6} fill={color} stroke="#fff" strokeWidth={2}
                            style={{ cursor: 'pointer', filter: 'drop-shadow(0 0 3px rgba(0,0,0,0.3))' }}
                            onMouseDown={() => handleClick(line.objectId)}
                          />
                        );
                      }}
                      name={`Объект ${line.objectId}`}
                      isAnimationActive={false}
                    />
                  );
                })}

                {/* Наведённая пунктирная линия */}
                {hoveredLineData && (
                  <Line
                    data={hoveredLineData}
                    dataKey="y"
                    type="stepAfter"
                    stroke={hoveredColor}
                    strokeWidth={2.5}
                    strokeDasharray="6 3"
                    strokeOpacity={0.9}
                    dot={{ r: 3, fill: hoveredColor, stroke: '#fff', strokeWidth: 1 }}
                    activeDot={{ r: 5, fill: hoveredColor, stroke: '#fff', strokeWidth: 2 }}
                    name="__hovered__"
                    isAnimationActive={false}
                    legendType="none"
                  />
                )}

                {/* Активные точки */}
                {(showHistory ? [] : scatterData.active).map((pt, i) => (
                  <Line key={`a-${pt.objectId}-${i}`} data={[pt]} dataKey="y" type="monotone"
                    stroke="transparent" strokeWidth={0}
                    dot={<BlueDot
                      onClick={() => handleClick(pt.objectId)}
                      onMouseEnter={() => setHoveredPointId(pt.objectId)}
                      onMouseLeave={() => setHoveredPointId(null)}
                    />}
                    activeDot={false} name="__active__" isAnimationActive={false} legendType="none" />
                ))}

                {/* Архивные точки */}
                {(showHistory ? historyData.scatterArchived : scatterData.archived).map((pt, i) => (
                  <Line key={`ar-${pt.objectId}-${i}`} data={[pt]} dataKey="y" type="monotone"
                    stroke="transparent" strokeWidth={0}
                    dot={<OrangeDot
                      onClick={() => handleClick(pt.objectId)}
                      onMouseEnter={() => setHoveredPointId(pt.objectId)}
                      onMouseLeave={() => setHoveredPointId(null)}
                    />}
                    activeDot={false} name="__archived__" isAnimationActive={false} legendType="none" />
                ))}

                {/* Подтверждённые продажи */}
                {(showHistory ? historyData.scatterConfirmed : scatterData.confirmed).map((pt, i) => (
                  <Line key={`c-${pt.objectId}-${i}`} data={[pt]} dataKey="y" type="monotone"
                    stroke="transparent" strokeWidth={0}
                    dot={<DiamondDot
                      onClick={() => handleClick(pt.objectId)}
                      onMouseEnter={() => setHoveredPointId(pt.objectId)}
                      onMouseLeave={() => setHoveredPointId(null)}
                    />}
                    activeDot={false} name="__confirmed__" isAnimationActive={false} legendType="none" />
                ))}
              </ComposedChart>
            );
          }}
        </ChartBox>
      </div>

      {/* Полоса прокрутки */}
      <div className="px-0 mt-1">
        <div
          ref={scrollbarRef}
          className="relative h-2 bg-zinc-200 dark:bg-zinc-700 rounded cursor-pointer select-none"
          onMouseDown={handleScrollbarDown}
        >
          <div
            className="absolute top-0 h-full bg-blue-400 dark:bg-blue-500 rounded opacity-70 hover:opacity-100 transition-opacity"
            style={{ left: `${thumbLeft}%`, width: `${Math.max(thumbWidth, 2)}%` }}
          />
        </div>
        <div className="flex justify-between text-[9px] text-zinc-400 mt-0.5">
          <span>{new Date(effectiveDomain[0]).toLocaleDateString('ru-RU', { month: 'short', year: '2-digit' })}</span>
          <span>{new Date(effectiveDomain[1]).toLocaleDateString('ru-RU', { month: 'short', year: '2-digit' })}</span>
        </div>
      </div>
    </div>
  );
};

export default MarketCorridorChart;
