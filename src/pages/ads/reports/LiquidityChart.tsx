import React, { useMemo, useState } from 'react';
import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import type { AdObject } from '@/types/ad';
import ChartBox from '@/components/shared/ChartBox';
import { getMonthRange, generateMonthBuckets, computeLiquidityData } from './chartUtils';

interface Props {
  objects: AdObject[];
}

const LiquidityChart: React.FC<Props> = ({ objects }) => {
  const [showInfo, setShowInfo] = useState(false);

  const data = useMemo(() => {
    const range = getMonthRange(objects);
    if (!range) return [];
    const months = generateMonthBuckets(range.start, range.end);
    return computeLiquidityData(objects, months);
  }, [objects]);

  if (data.length === 0) {
    return <p className="text-xs text-zinc-400 text-center py-8">Недостаточно данных для построения графика</p>;
  }

  return (
    <div>
      {/* Управление */}
      <div className="flex items-center gap-3 mb-3">
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
          <p><span className="text-green-600 font-medium">Зелёные столбцы</span> — новые объекты, появившиеся на рынке в этом месяце (дата создания).</p>
          <p><span className="text-red-500 font-medium">Красные столбцы</span> — объекты, ушедшие с рынка в этом месяце (статус сменился на «архив»).</p>
          <p><span className="text-blue-500 font-medium">Синяя линия</span> — количество активных объектов на <strong>начало</strong> месяца.</p>
          <p><strong>Аналитические сигналы:</strong></p>
          <ul className="list-disc ml-4 space-y-1">
            <li>Линия растёт — предложение на рынке увеличивается (приток новых объектов).</li>
            <li>Линия падает — объекты активно уходят с рынка.</li>
            <li>Зелёные столбцы выше красных — рынок пополняется быстрее, чем тает.</li>
            <li>Красные столбцы преобладают — ликвидность падает, объекты не задерживаются.</li>
          </ul>
        </div>
      )}

      {/* График */}
      <ChartBox height={300}>
        {({ width }) => (
          <ComposedChart width={width} height={300} data={data} margin={{ top: 10, right: 20, bottom: 5, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip
              formatter={(value: number, name: string) => [value, name]}
              contentStyle={{ fontSize: 12 }}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="newObjects" name="Новые" fill="#22c55e" barSize={20} />
            <Bar dataKey="closedObjects" name="Закрытые" fill="#ef4444" barSize={20} />
            <Line type="monotone" dataKey="activeAtStart" name="Активные на начало" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} />
          </ComposedChart>
        )}
      </ChartBox>
    </div>
  );
};

export default LiquidityChart;
