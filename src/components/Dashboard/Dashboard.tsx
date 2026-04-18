import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  LineChart,
  Line,
  Legend,
  ComposedChart,
} from 'recharts';
import { SearchAggregates } from '@/types';
import {
  REAL_ESTATE_TYPES,
  DOCUMENT_TYPES,
  getRealEstateTypeName,
  getWallMaterialName,
} from '@/constants/catalogs';
import { Heading } from '@/components/catalyst/heading';

interface DashboardProps {
  aggregates: SearchAggregates | null;
  totalDeals: number;
}

const COLORS = ['#1a73e8', '#34a853', '#ea4335', '#fbbc04', '#9c27b0', '#00bcd4', '#ff5722', '#795548'];

/**
 * Интерактивный SVG Pie Chart с viewBox (не зависит от измерения ширины).
 * Hover-эффект: сектор выдвигается, остальные затемняются, в центре — процент.
 * Под графиком — легенда с названиями.
 */
const InteractivePieChart: React.FC<{
  data: { name: string; value: number }[];
}> = ({ data }) => {
  const [hovered, setHovered] = useState<number | null>(null);

  if (data.length === 0) {
    return <div style={{ textAlign: 'center', color: '#a1a1aa', padding: '30px 0', fontSize: 13 }}>Нет данных</div>;
  }

  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0) return null;

  const vbW = 220, vbH = 170;
  const cx = vbW / 2, cy = vbH / 2;
  const r = 65;

  let cumAngle = -90;
  const sliceData = data.map((d, i) => {
    const pct = d.value / total;
    const startAngle = cumAngle;
    const endAngle = cumAngle + pct * 360;
    cumAngle = endAngle;

    const startRad = (startAngle * Math.PI) / 180;
    const endRad = (endAngle * Math.PI) / 180;
    const midRad = ((startAngle + endAngle) / 2) * Math.PI / 180;

    const x1 = cx + r * Math.cos(startRad);
    const y1 = cy + r * Math.sin(startRad);
    const x2 = cx + r * Math.cos(endRad);
    const y2 = cy + r * Math.sin(endRad);
    const largeArc = pct > 0.5 ? 1 : 0;

    return { pct, midRad, x1, y1, x2, y2, largeArc };
  });

  return (
    <div>
      <svg viewBox={`0 0 ${vbW} ${vbH}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
        {sliceData.map((s, i) => {
          const isActive = hovered === i;
          const offset = isActive ? 7 : 0;
          const dx = offset * Math.cos(s.midRad);
          const dy = offset * Math.sin(s.midRad);

          return (
            <path
              key={i}
              d={`M${cx + dx},${cy + dy} L${s.x1 + dx},${s.y1 + dy} A${r},${r} 0 ${s.largeArc},1 ${s.x2 + dx},${s.y2 + dy} Z`}
              fill={COLORS[i % COLORS.length]}
              stroke="#fff"
              strokeWidth={1.5}
              style={{
                transition: 'opacity 0.15s',
                cursor: 'pointer',
                opacity: hovered !== null && !isActive ? 0.45 : 1,
              }}
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
            />
          );
        })}
        {hovered !== null && (
          <>
            <text x={cx} y={cy - 4} textAnchor="middle" dominantBaseline="middle"
              fill="#18181b" fontSize="16" fontWeight="700" fontFamily="Inter,sans-serif">
              {Math.round(sliceData[hovered].pct * 100)}%
            </text>
            <text x={cx} y={cy + 12} textAnchor="middle" dominantBaseline="middle"
              fill="#71717a" fontSize="9" fontFamily="Inter,sans-serif">
              {data[hovered].value.toLocaleString('ru-RU')}
            </text>
          </>
        )}
      </svg>
      {/* Legend */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', marginTop: 4, justifyContent: 'center' }}>
        {data.map((d, i) => (
          <div
            key={i}
            style={{
              display: 'flex', alignItems: 'center', gap: 4,
              fontSize: 11, cursor: 'pointer',
              opacity: hovered !== null && hovered !== i ? 0.45 : 1,
              transition: 'opacity 0.15s',
            }}
            onMouseEnter={() => setHovered(i)}
            onMouseLeave={() => setHovered(null)}
          >
            <span style={{
              width: 8, height: 8, borderRadius: 2, flexShrink: 0,
              backgroundColor: COLORS[i % COLORS.length],
            }} />
            <span style={{
              color: hovered === i ? '#18181b' : '#52525b',
              fontWeight: hovered === i ? 600 : 400,
              fontFamily: 'Inter,sans-serif',
            }}>
              {d.name}
            </span>
            <span style={{ color: '#a1a1aa' }}>
              {Math.round(d.value / total * 100)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

/**
 * Контейнер для recharts — измеряет ширину родителя и передаёт
 * точные пиксельные размеры дочернему графику.
 */
const ChartBox: React.FC<{
  height: number;
  children: (size: { width: number; height: number }) => React.ReactNode;
}> = ({ height, children }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ width: number; height: number }>({ width: 0, height });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const measure = () => {
      const w = el.offsetWidth;
      if (w > 0) {
        setSize(prev => (prev.width === w && prev.height === height ? prev : { width: w, height }));
      }
    };

    const ro = new ResizeObserver(measure);
    ro.observe(el);

    // Первичные попытки измерения с задержками
    measure();
    requestAnimationFrame(measure);
    setTimeout(measure, 50);
    setTimeout(measure, 200);

    return () => {
      ro.disconnect();
    };
  }, [height]);

  return (
    <div ref={ref} style={{ width: '100%', height }}>
      {size.width > 0 ? children(size) : null}
    </div>
  );
};

const Dashboard = React.memo(({ aggregates, totalDeals }: DashboardProps) => {
  const [isExpanded, setIsExpanded] = useState(false);

  // Аналитические данные из предвычисленных агрегатов
  const analytics = useMemo(() => {
    if (!aggregates || aggregates.count === 0) {
      return {
        byType: [],
        byDocType: [],
        byWallMaterial: [],
        byQuarter: [],
        priceRange: { min: 0, max: 0, avg: 0, median: 0 },
        areaRange: { min: 0, max: 0, avg: 0, median: 0 },
        topRegions: [],
        totalSum: 0,
        count: 0,
        totalCount: totalDeals,
      };
    }

    // Группировка по типу объекта — резолвим имена из кодов
    const byType = Object.entries(aggregates.byType)
      .map(([code, value]) => ({ name: getRealEstateTypeName(code), value }))
      .sort((a, b) => b.value - a.value);

    // Группировка по типу документа
    const byDocType = Object.entries(aggregates.byDocType)
      .map(([code, value]) => ({ name: DOCUMENT_TYPES[code] || code, value }))
      .sort((a, b) => b.value - a.value);

    // Группировка по материалу стен
    const byWallMaterial = Object.entries(aggregates.byWallMaterial)
      .map(([code, value]) => ({ name: getWallMaterialName(code), value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);

    // Группировка по кварталам
    const byQuarter = Object.entries(aggregates.byQuarter)
      .map(([name, data]) => ({
        name: name.replace('-Q', ' Q'),
        sortKey: name,
        count: data.count,
        sum: data.totalPrice,
        avgPrice: data.count > 0 ? Math.round(data.totalPrice / data.count) : 0,
        avgPricePerMeter: data.totalArea > 0 ? Math.round(data.totalPrice / data.totalArea) : 0,
      }))
      .sort((a, b) => a.sortKey.localeCompare(b.sortKey));

    return {
      byType,
      byDocType,
      byWallMaterial,
      byQuarter,
      priceRange: aggregates.priceRange,
      areaRange: aggregates.areaRange,
      topRegions: aggregates.topRegions,
      totalSum: aggregates.totalSum,
      count: aggregates.count,
      totalCount: totalDeals,
    };
  }, [aggregates, totalDeals]);

  const formatNumber = (num: number): string => {
    if (num >= 1000000000) {
      return `${(num / 1000000000).toFixed(1)} млрд`;
    }
    if (num >= 1000000) {
      return `${(num / 1000000).toFixed(1)} млн`;
    }
    if (num >= 1000) {
      return `${(num / 1000).toFixed(0)} тыс`;
    }
    return num.toLocaleString('ru-RU');
  };

  const formatPrice = (price: number): string => {
    return `${formatNumber(price)} ₽`;
  };

  if (!aggregates || aggregates.count === 0) {
    return null;
  }

  const tooltipStyle = {
    backgroundColor: 'var(--tw-bg-opacity, #fff)',
    border: '1px solid #ccc',
    borderRadius: '4px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
  };

  return (
    <div className="rounded-xl bg-white shadow-sm mb-4 dark:bg-zinc-900 dark:shadow-zinc-950/50">
      {/* Header */}
      <div
        className="flex justify-between items-center px-5 py-4 cursor-pointer select-none transition-colors hover:bg-gray-50 dark:hover:bg-zinc-800"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <Heading level={2} className="!text-base !font-semibold !text-zinc-800 !m-0 dark:!text-white">
          Аналитика
        </Heading>
        <div className="flex items-center gap-2 text-[13px] text-zinc-500 dark:text-zinc-400">
          <span>{isExpanded ? 'Свернуть' : 'Развернуть'}</span>
          <span
            className={`text-xs transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
          >
            ▲
          </span>
        </div>
      </div>

      {/* Ключевые метрики - всегда видны */}
      <div className="flex gap-3 px-5 pb-4 overflow-x-auto">
        <div className="flex-1 min-w-[140px] bg-gradient-to-br from-gray-50 to-blue-50 rounded-lg px-4 py-3 text-center dark:from-zinc-800 dark:to-zinc-800">
          <div className="text-lg font-bold text-blue-600 whitespace-nowrap dark:text-blue-400">
            {formatNumber(analytics.totalCount)}
          </div>
          <div className="text-[11px] mt-1 text-zinc-500 uppercase tracking-wide dark:text-zinc-400">
            Сделок
          </div>
        </div>
        <div className="flex-1 min-w-[140px] bg-gradient-to-br from-gray-50 to-blue-50 rounded-lg px-4 py-3 text-center dark:from-zinc-800 dark:to-zinc-800">
          <div className="text-lg font-bold text-blue-600 whitespace-nowrap dark:text-blue-400">
            {formatPrice(analytics.totalSum)}
          </div>
          <div className="text-[11px] mt-1 text-zinc-500 uppercase tracking-wide dark:text-zinc-400">
            Общая сумма
          </div>
        </div>
        <div className="flex-1 min-w-[140px] bg-gradient-to-br from-gray-50 to-blue-50 rounded-lg px-4 py-3 text-center dark:from-zinc-800 dark:to-zinc-800">
          <div className="text-lg font-bold text-blue-600 whitespace-nowrap dark:text-blue-400">
            {formatPrice(analytics.priceRange.avg)}
          </div>
          <div className="text-[11px] mt-1 text-zinc-500 uppercase tracking-wide dark:text-zinc-400">
            Средняя цена
          </div>
        </div>
        <div className="flex-1 min-w-[140px] bg-gradient-to-br from-gray-50 to-blue-50 rounded-lg px-4 py-3 text-center dark:from-zinc-800 dark:to-zinc-800">
          <div className="text-lg font-bold text-blue-600 whitespace-nowrap dark:text-blue-400">
            {formatPrice(analytics.priceRange.median)}
          </div>
          <div className="text-[11px] mt-1 text-zinc-500 uppercase tracking-wide dark:text-zinc-400">
            Медианная цена
          </div>
        </div>
      </div>

      {isExpanded && (
        <div className="px-5 pb-5 border-t border-gray-200 pt-4 dark:border-zinc-700">
          {/* Range bars */}
          <div className="grid grid-cols-2 gap-6 mb-4 max-md:grid-cols-1">
            {/* Price range */}
            <div>
              <h4 className="text-xs font-medium text-zinc-500 m-0 mb-2 uppercase dark:text-zinc-400">
                Ценовой диапазон
              </h4>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-zinc-400 dark:text-zinc-500 shrink-0">{formatPrice(analytics.priceRange.min)}</span>
                <svg className="flex-1 h-5" preserveAspectRatio="none">
                  <rect x="0" y="8" width="100%" height="4" rx="2" fill="var(--tw-colors-zinc-200, #e4e4e7)" />
                  <rect x="0" y="8" width="100%" height="4" rx="2" fill="#3b82f6" opacity="0.2" />
                  {(() => {
                    const range = analytics.priceRange.max - analytics.priceRange.min || 1;
                    const avgX = ((analytics.priceRange.avg - analytics.priceRange.min) / range) * 100;
                    const medX = ((analytics.priceRange.median - analytics.priceRange.min) / range) * 100;
                    return (
                      <>
                        <line x1={`${avgX}%`} y1="2" x2={`${avgX}%`} y2="18" stroke="#3b82f6" strokeWidth="2" />
                        <circle cx={`${medX}%`} cy="10" r="4" fill="#8b5cf6" />
                      </>
                    );
                  })()}
                </svg>
                <span className="text-[10px] text-zinc-400 dark:text-zinc-500 shrink-0">{formatPrice(analytics.priceRange.max)}</span>
              </div>
              <div className="flex gap-4 mt-1 ml-[calc(theme(spacing.10))]">
                <span className="flex items-center gap-1 text-[9px] text-zinc-400">
                  <span className="inline-block w-2 h-0.5 bg-blue-500" /> Ср: {formatPrice(analytics.priceRange.avg)}
                </span>
                <span className="flex items-center gap-1 text-[9px] text-zinc-400">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-violet-500" /> Мед: {formatPrice(analytics.priceRange.median)}
                </span>
              </div>
            </div>
            {/* Area range */}
            <div>
              <h4 className="text-xs font-medium text-zinc-500 m-0 mb-2 uppercase dark:text-zinc-400">
                Площадь (м²)
              </h4>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-zinc-400 dark:text-zinc-500 shrink-0">{analytics.areaRange.min.toLocaleString('ru-RU')}</span>
                <svg className="flex-1 h-5" preserveAspectRatio="none">
                  <rect x="0" y="8" width="100%" height="4" rx="2" fill="var(--tw-colors-zinc-200, #e4e4e7)" />
                  <rect x="0" y="8" width="100%" height="4" rx="2" fill="#22c55e" opacity="0.2" />
                  {(() => {
                    const range = analytics.areaRange.max - analytics.areaRange.min || 1;
                    const avgX = ((analytics.areaRange.avg - analytics.areaRange.min) / range) * 100;
                    const medX = ((analytics.areaRange.median - analytics.areaRange.min) / range) * 100;
                    return (
                      <>
                        <line x1={`${avgX}%`} y1="2" x2={`${avgX}%`} y2="18" stroke="#22c55e" strokeWidth="2" />
                        <circle cx={`${medX}%`} cy="10" r="4" fill="#8b5cf6" />
                      </>
                    );
                  })()}
                </svg>
                <span className="text-[10px] text-zinc-400 dark:text-zinc-500 shrink-0">{analytics.areaRange.max.toLocaleString('ru-RU')}</span>
              </div>
              <div className="flex gap-4 mt-1">
                <span className="flex items-center gap-1 text-[9px] text-zinc-400">
                  <span className="inline-block w-2 h-0.5 bg-green-500" /> Ср: {analytics.areaRange.avg.toLocaleString('ru-RU')}
                </span>
                <span className="flex items-center gap-1 text-[9px] text-zinc-400">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-violet-500" /> Мед: {analytics.areaRange.median.toLocaleString('ru-RU')}
                </span>
              </div>
            </div>
          </div>

          {/* Графики */}
          <div className="grid grid-cols-2 gap-4 mb-4 max-md:grid-cols-1">
            {/* Динамика по кварталам - количество сделок */}
            <div className="col-span-full bg-gray-50 rounded-lg p-4 dark:bg-zinc-800">
              <h3 className="text-[13px] font-medium text-zinc-500 m-0 mb-3 uppercase tracking-wide dark:text-zinc-400">
                Динамика сделок по периодам
              </h3>
              <ChartBox height={250}>
                {({ width, height }) => (
                  <LineChart width={width} height={height} data={analytics.byQuarter}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip
                      contentStyle={tooltipStyle}
                      itemStyle={{ color: '#333' }}
                      labelStyle={{ color: '#333', fontWeight: 'bold' }}
                      formatter={(value: number) => formatNumber(value)}
                      labelFormatter={(label) => `Период: ${label}`}
                    />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="count"
                      name="Кол-во сделок"
                      stroke="#1a73e8"
                      strokeWidth={2}
                      dot={{ r: 4 }}
                    />
                  </LineChart>
                )}
              </ChartBox>
            </div>

            {/* Динамика средней цены по периодам */}
            <div className="col-span-full bg-gray-50 rounded-lg p-4 dark:bg-zinc-800">
              <h3 className="text-[13px] font-medium text-zinc-500 m-0 mb-3 uppercase tracking-wide dark:text-zinc-400">
                Динамика средней цены по периодам
              </h3>
              <ChartBox height={250}>
                {({ width, height }) => (
                  <ComposedChart width={width} height={height} data={analytics.byQuarter}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                    <YAxis yAxisId="left" tick={{ fontSize: 12 }} />
                    <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 12 }} />
                    <Tooltip
                      contentStyle={tooltipStyle}
                      itemStyle={{ color: '#333' }}
                      labelStyle={{ color: '#333', fontWeight: 'bold' }}
                      formatter={(value: number, name: string) => {
                        if (name === 'Средняя цена') return formatPrice(value);
                        if (name === 'Цена за м²') return `${formatNumber(value)} ₽/м²`;
                        return formatNumber(value);
                      }}
                      labelFormatter={(label) => `Период: ${label}`}
                    />
                    <Legend />
                    <Bar
                      yAxisId="right"
                      dataKey="count"
                      name="Кол-во сделок"
                      fill="#e8f0fe"
                      barSize={20}
                    />
                    <Line
                      yAxisId="left"
                      type="monotone"
                      dataKey="avgPrice"
                      name="Средняя цена"
                      stroke="#34a853"
                      strokeWidth={2}
                      dot={{ r: 4, fill: '#34a853' }}
                    />
                    <Line
                      yAxisId="left"
                      type="monotone"
                      dataKey="avgPricePerMeter"
                      name="Цена за м²"
                      stroke="#ea4335"
                      strokeWidth={2}
                      dot={{ r: 4, fill: '#ea4335' }}
                    />
                  </ComposedChart>
                )}
              </ChartBox>
            </div>

            {/* Круговые диаграммы */}
            <div className="col-span-full flex gap-4 max-md:flex-col">
              {/* Распределение по типам объектов */}
              <div className="flex-1 min-w-0 bg-gray-50 rounded-lg p-4 dark:bg-zinc-800">
                <h3 className="text-[13px] font-medium text-zinc-500 m-0 mb-3 uppercase tracking-wide dark:text-zinc-400">
                  По типу объекта
                </h3>
                <InteractivePieChart data={analytics.byType} />
              </div>

              {/* По типу документа */}
              <div className="flex-1 min-w-0 bg-gray-50 rounded-lg p-4 dark:bg-zinc-800">
                <h3 className="text-[13px] font-medium text-zinc-500 m-0 mb-3 uppercase tracking-wide dark:text-zinc-400">
                  По типу договора
                </h3>
                <InteractivePieChart data={analytics.byDocType} />
              </div>

              {/* По материалу стен */}
              <div className="flex-1 min-w-0 bg-gray-50 rounded-lg p-4 dark:bg-zinc-800">
                <h3 className="text-[13px] font-medium text-zinc-500 m-0 mb-3 uppercase tracking-wide dark:text-zinc-400">
                  По материалу стен
                </h3>
                <InteractivePieChart data={analytics.byWallMaterial} />
              </div>
            </div>

          </div>

        </div>
      )}
    </div>
  );
});

export default Dashboard;
