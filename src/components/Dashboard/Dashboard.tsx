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
import { Deal } from '@/types';
import {
  REAL_ESTATE_TYPES,
  DOCUMENT_TYPES,
  getRealEstateTypeName,
  getWallMaterialName,
} from '@/constants/catalogs';
import { Heading } from '@/components/catalyst/heading';

interface DashboardProps {
  deals: Deal[];
  totalDeals: number;
}

const COLORS = ['#1a73e8', '#34a853', '#ea4335', '#fbbc04', '#9c27b0', '#00bcd4', '#ff5722', '#795548'];

/**
 * Простой SVG Pie Chart — не зависит от recharts, рендерится при любой ширине.
 */
const SimplePieChart: React.FC<{
  data: { name: string; value: number }[];
  width: number;
  height: number;
  maxLabelLen?: number;
}> = ({ data, width, height, maxLabelLen = 10 }) => {
  if (data.length === 0 || width === 0) return null;
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0) return null;

  const cx = width / 2;
  const cy = height / 2;
  const r = Math.max(10, Math.min(width, height) / 2 - 30);

  let cumAngle = -90;
  const slices: React.ReactNode[] = [];

  data.forEach((d, i) => {
    const pct = d.value / total;
    if (pct <= 0) return;

    const startAngle = cumAngle;
    const endAngle = cumAngle + pct * 360;
    cumAngle = endAngle;

    const startRad = (startAngle * Math.PI) / 180;
    const endRad = (endAngle * Math.PI) / 180;

    const x1 = cx + r * Math.cos(startRad);
    const y1 = cy + r * Math.sin(startRad);
    const x2 = cx + r * Math.cos(endRad);
    const y2 = cy + r * Math.sin(endRad);

    const largeArc = pct > 0.5 ? 1 : 0;
    const color = COLORS[i % COLORS.length];

    const midRad = ((startAngle + (endAngle - startAngle) / 2) * Math.PI) / 180;
    const labelR = r + 18;
    const lx = cx + labelR * Math.cos(midRad);
    const ly = cy + labelR * Math.sin(midRad);

    const labelName = d.name.length > maxLabelLen
      ? d.name.substring(0, maxLabelLen) + '...'
      : d.name;

    slices.push(
      <g key={i}>
        <path
          d={`M${cx},${cy} L${x1},${y1} A${r},${r} 0 ${largeArc},1 ${x2},${y2} Z`}
          fill={color}
          stroke="#fff"
          strokeWidth={1.5}
        />
        {pct >= 0.04 && (
          <text
            x={lx}
            y={ly}
            textAnchor="middle"
            dominantBaseline="middle"
            fill="var(--tw-text-opacity, #52525b)"
            fontSize={9}
            fontFamily="Inter,system-ui,sans-serif"
          >
            {labelName} ({Math.round(pct * 100)}%)
          </text>
        )}
      </g>
    );
  });

  return (
    <svg width={width} height={height} style={{ display: 'block' }}>
      {slices}
    </svg>
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

const Dashboard = React.memo(({ deals, totalDeals }: DashboardProps) => {
  const [isExpanded, setIsExpanded] = useState(false);

  // Аналитические данные
  const analytics = useMemo(() => {
    if (deals.length === 0) {
      return {
        byType: [],
        byDocType: [],
        byWallMaterial: [],
        byQuarter: [],
        priceRange: { min: 0, max: 0, avg: 0, median: 0 },
        areaRange: { min: 0, max: 0, avg: 0, median: 0, values: [] },
        topRegions: [],
        totalSum: 0,
        count: 0,
        totalCount: totalDeals,
      };
    }

    // Группировка по типу объекта
    const typeGroups: Record<string, number> = {};
    deals.forEach((deal) => {
      const name = getRealEstateTypeName(deal.realestate_type_code);
      typeGroups[name] = (typeGroups[name] || 0) + 1;
    });
    const byType = Object.entries(typeGroups)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

    // Группировка по типу документа
    const docTypeGroups: Record<string, number> = {};
    deals.forEach((deal) => {
      const name = DOCUMENT_TYPES[deal.doc_type] || deal.doc_type;
      docTypeGroups[name] = (docTypeGroups[name] || 0) + 1;
    });
    const byDocType = Object.entries(docTypeGroups)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

    // Группировка по материалу стен
    const wallMaterialGroups: Record<string, number> = {};
    deals.forEach((deal) => {
      if (deal.wall_material_code) {
        const name = getWallMaterialName(deal.wall_material_code);
        wallMaterialGroups[name] = (wallMaterialGroups[name] || 0) + 1;
      }
    });
    const byWallMaterial = Object.entries(wallMaterialGroups)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);

    // Группировка по кварталам с ценой
    const quarterGroups: Record<string, { count: number; sum: number; prices: number[]; pricePerMeters: number[] }> = {};
    deals.forEach((deal) => {
      if (!quarterGroups[deal.year_quarter]) {
        quarterGroups[deal.year_quarter] = { count: 0, sum: 0, prices: [], pricePerMeters: [] };
      }
      quarterGroups[deal.year_quarter].count += deal.number || 1;
      quarterGroups[deal.year_quarter].sum += deal.deal_price;
      quarterGroups[deal.year_quarter].prices.push(deal.deal_price);
      if (deal.area > 0) {
        quarterGroups[deal.year_quarter].pricePerMeters.push(deal.deal_price / deal.area);
      }
    });

    const byQuarter = Object.entries(quarterGroups)
      .map(([name, data]) => {
        const avgPrice = data.prices.length > 0
          ? Math.round(data.prices.reduce((a, b) => a + b, 0) / data.prices.length)
          : 0;
        const avgPricePerMeter = data.pricePerMeters.length > 0
          ? Math.round(data.pricePerMeters.reduce((a, b) => a + b, 0) / data.pricePerMeters.length)
          : 0;
        return {
          name: name.replace('-Q', ' Q'),
          sortKey: name,
          count: data.count,
          sum: data.sum,
          avgPrice,
          avgPricePerMeter,
        };
      })
      .sort((a, b) => a.sortKey.localeCompare(b.sortKey));

    // Ценовой диапазон
    const prices = deals.map((d) => d.deal_price).filter((p) => p > 0).sort((a, b) => a - b);
    const priceRange = {
      min: prices[0] || 0,
      max: prices[prices.length - 1] || 0,
      avg: prices.length > 0 ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length) : 0,
      median: prices.length > 0 ? prices[Math.floor(prices.length / 2)] : 0,
    };

    // Площадь
    const areas = deals.map((d) => d.area).filter((a) => a > 0);
    const sortedAreas = [...areas].sort((a, b) => a - b);
    const areaRange = {
      min: sortedAreas.length > 0 ? sortedAreas[0] : 0,
      max: sortedAreas.length > 0 ? sortedAreas[sortedAreas.length - 1] : 0,
      avg: sortedAreas.length > 0 ? Math.round(sortedAreas.reduce((a, b) => a + b, 0) / sortedAreas.length) : 0,
      median: sortedAreas.length > 0 ? sortedAreas[Math.floor(sortedAreas.length / 2)] : 0,
    };

    // Топ регионов
    const regionGroups: Record<string, number> = {};
    deals.forEach((deal) => {
      if (deal.region_code) {
        regionGroups[deal.region_code] = (regionGroups[deal.region_code] || 0) + 1;
      }
    });
    const topRegions = Object.entries(regionGroups)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);

    const totalSum = deals.reduce((acc, d) => acc + d.deal_price, 0);

    return {
      byType,
      byDocType,
      byWallMaterial,
      byQuarter,
      priceRange,
      areaRange,
      topRegions,
      totalSum,
      count: deals.length,
      totalCount: totalDeals,
    };
  }, [deals, totalDeals]);

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

  if (deals.length === 0) {
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

            {/* Круговые диаграммы — flex-ряд вместо вложенного grid */}
            <div className="col-span-full flex gap-4 max-md:flex-col">
              {/* Распределение по типам объектов */}
              <div className="flex-1 min-w-0 bg-gray-50 rounded-lg p-4 dark:bg-zinc-800">
                <h3 className="text-[13px] font-medium text-zinc-500 m-0 mb-3 uppercase tracking-wide dark:text-zinc-400">
                  По типу объекта
                </h3>
                <ChartBox height={220}>
                  {({ width, height }) => (
                    <SimplePieChart data={analytics.byType} width={width} height={height} maxLabelLen={10} />
                  )}
                </ChartBox>
              </div>

              {/* По типу документа */}
              <div className="flex-1 min-w-0 bg-gray-50 rounded-lg p-4 dark:bg-zinc-800">
                <h3 className="text-[13px] font-medium text-zinc-500 m-0 mb-3 uppercase tracking-wide dark:text-zinc-400">
                  По типу договора
                </h3>
                <ChartBox height={220}>
                  {({ width, height }) => (
                    <SimplePieChart data={analytics.byDocType} width={width} height={height} />
                  )}
                </ChartBox>
              </div>

              {/* По материалу стен */}
              <div className="flex-1 min-w-0 bg-gray-50 rounded-lg p-4 dark:bg-zinc-800">
                <h3 className="text-[13px] font-medium text-zinc-500 m-0 mb-3 uppercase tracking-wide dark:text-zinc-400">
                  По материалу стен
                </h3>
                <ChartBox height={220}>
                  {({ width, height }) => (
                    <SimplePieChart data={analytics.byWallMaterial} width={width} height={height} maxLabelLen={8} />
                  )}
                </ChartBox>
              </div>
            </div>

            {/* Топ регионов */}
            <div className="col-span-full bg-gray-50 rounded-lg p-4 dark:bg-zinc-800">
              <h3 className="text-[13px] font-medium text-zinc-500 m-0 mb-3 uppercase tracking-wide dark:text-zinc-400">
                Топ-10 регионов по количеству сделок
              </h3>
              <ChartBox height={280}>
                {({ width, height }) => (
                  <BarChart width={width} height={height} data={analytics.topRegions} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" tick={{ fontSize: 12 }} />
                    <YAxis dataKey="name" type="category" width={80} tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(value: number) => formatNumber(value)} />
                    <Bar dataKey="value" name="Сделок" fill="#1a73e8" />
                  </BarChart>
                )}
              </ChartBox>
            </div>
          </div>

        </div>
      )}
    </div>
  );
});

export default Dashboard;
