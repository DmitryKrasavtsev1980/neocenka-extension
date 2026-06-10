import React, { useMemo, useState } from 'react';
import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import type { AdObject } from '@/types/ad';
import ChartBox from '@/components/shared/ChartBox';
import { getMonthRange, generateMonthBuckets, computePriceChangeData, formatPriceTooltip } from './chartUtils';

interface Props {
  objects: AdObject[];
}

type MetricMode = 'avg' | 'median';

const PriceChangeChart: React.FC<Props> = ({ objects }) => {
  const [mode, setMode] = useState<MetricMode>('avg');
  const [showInfo, setShowInfo] = useState(false);

  const data = useMemo(() => {
    const range = getMonthRange(objects);
    if (!range) return [];
    const months = generateMonthBuckets(range.start, range.end);
    return computePriceChangeData(objects, months);
  }, [objects]);

  if (data.length === 0) {
    return <p className="text-xs text-zinc-400 text-center py-8">Недостаточно данных для построения графика</p>;
  }

  const formatYPrice = (v: number) => {
    if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)} млн`;
    if (v >= 1_000) return `${(v / 1_000).toFixed(0)} тыс`;
    return String(v);
  };

  const formatYM2 = (v: number) => `${(v / 1000).toFixed(0)} тыс/м²`;

  const pfx = mode === 'avg' ? 'Avg' : 'Median';
  const activePriceKey = `active${pfx}Price` as const;
  const activePerM2Key = `active${pfx}PerM2` as const;
  const archivedPriceKey = `archived${pfx}Price` as const;
  const archivedPerM2Key = `archived${pfx}PerM2` as const;

  const metricLabel = mode === 'avg' ? 'Ср.' : 'Мед.';

  return (
    <div>
      {/* Управление */}
      <div className="flex items-center gap-3 mb-3">
        <div className="flex rounded-md overflow-hidden border border-zinc-300 dark:border-zinc-600">
          <button
            onClick={() => setMode('avg')}
            className={`px-3 py-1 text-[11px] font-medium transition-colors ${
              mode === 'avg' ? 'bg-blue-600 text-white' : 'bg-white text-zinc-600 hover:bg-zinc-50 dark:bg-zinc-800 dark:text-zinc-300'
            }`}
          >Среднее</button>
          <button
            onClick={() => setMode('median')}
            className={`px-3 py-1 text-[11px] font-medium transition-colors ${
              mode === 'median' ? 'bg-blue-600 text-white' : 'bg-white text-zinc-600 hover:bg-zinc-50 dark:bg-zinc-800 dark:text-zinc-300'
            }`}
          >Медиана</button>
        </div>
        <button
          onClick={() => setShowInfo(!showInfo)}
          className={`px-2 py-1 rounded text-[11px] font-medium transition-colors ${
            showInfo
              ? 'bg-zinc-700 text-white'
              : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-700 dark:text-zinc-300'
          }`}
        >Инфо</button>
      </div>

      {/* Подсказка */}
      {showInfo && (
        <div className="text-[11px] text-zinc-600 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-800/50 rounded-lg p-4 mb-4 space-y-2 leading-relaxed">
          <p><strong>Как читать график:</strong></p>
          <p><span className="text-green-600 font-medium">Зелёные столбцы</span> — {metricLabel} цена за м² по <strong>активным</strong> объектам (ещё на продаже). Правая ось Y.</p>
          <p><span className="text-orange-500 font-medium">Оранжевые столбцы</span> — {metricLabel} цена за м² по объектам, которые <strong>были активны в этом месяце, но сейчас ушли с рынка</strong>. Правая ось Y.</p>
          <p><span className="text-blue-500 font-medium">Синяя линия</span> — {metricLabel} цена объекта (полная стоимость) по активным. Левая ось Y.</p>
          <p><span className="text-pink-500 font-medium">Розовая пунктирная линия</span> — {metricLabel} цена объекта по ушедшим с рынка. Левая ось Y.</p>
          <p><strong>Аналитические сигналы:</strong></p>
          <ul className="list-disc ml-4 space-y-1">
            <li>Если ушедшие дешевле активных — объекты уходят после снижения цены (ликвидность падает).</li>
            <li>Если ушедшие дороже активных — дорогие объекты не продаются и снимаются.</li>
            <li>Среднее выше медианы — на рынке есть дорогие выбросы (элитные квартиры).</li>
            <li>Медиана стабильнее среднего и лучше отражает «типичный» объект.</li>
          </ul>
          <p>Цены берутся на середину каждого месяца из истории изменения цен. Если истории нет — используется текущая цена.</p>
        </div>
      )}

      {/* График */}
      <ChartBox height={300}>
        {({ width }) => (
          <ComposedChart width={width} height={300} data={data} margin={{ top: 10, right: 60, bottom: 5, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} />
            <YAxis yAxisId="left" tick={{ fontSize: 11 }} tickFormatter={formatYPrice} />
            <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} tickFormatter={formatYM2} />
            <Tooltip
              formatter={(value: number | null, name: string) => {
                if (value == null) return ['—', name];
                return [formatPriceTooltip(value), name];
              }}
              contentStyle={{ fontSize: 12 }}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar yAxisId="right" dataKey={activePerM2Key} name={`${metricLabel} цена/м² (акт.)`} fill="#22c55e" opacity={0.5} barSize={16} />
            <Bar yAxisId="right" dataKey={archivedPerM2Key} name={`${metricLabel} цена/м² (арх.)`} fill="#ff9800" opacity={0.5} barSize={16} />
            <Line yAxisId="left" type="monotone" dataKey={activePriceKey} name={`${metricLabel} цена (акт.)`} stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} connectNulls />
            <Line yAxisId="left" type="monotone" dataKey={archivedPriceKey} name={`${metricLabel} цена (арх.)`} stroke="#e91e63" strokeWidth={2} strokeDasharray="5 5" dot={{ r: 3 }} connectNulls />
          </ComposedChart>
        )}
      </ChartBox>
    </div>
  );
};

export default PriceChangeChart;
