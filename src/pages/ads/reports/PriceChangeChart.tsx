import React, { useMemo } from 'react';
import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import type { AdObject } from '@/types/ad';
import ChartBox from '@/components/shared/ChartBox';
import { getMonthRange, generateMonthBuckets, computePriceChangeData, formatPriceTooltip } from './chartUtils';

interface Props {
  objects: AdObject[];
}

const PriceChangeChart: React.FC<Props> = ({ objects }) => {
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

  return (
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
              if (name.includes('/м²')) return [formatPriceTooltip(value), name];
              return [formatPriceTooltip(value), name];
            }}
            contentStyle={{ fontSize: 12 }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar yAxisId="right" dataKey="activeAvgPerM2" name="Ср. цена/м² (акт.)" fill="#22c55e" opacity={0.5} barSize={16} />
          <Line yAxisId="left" type="monotone" dataKey="activeAvgPrice" name="Ср. цена (акт.)" stroke="#22c55e" strokeWidth={2} dot={{ r: 3 }} connectNulls />
          <Line yAxisId="left" type="monotone" dataKey="archivedAvgPrice" name="Ср. цена (арх.)" stroke="#ef4444" strokeWidth={2} strokeDasharray="5 5" dot={{ r: 3 }} connectNulls />
          <Line yAxisId="right" type="monotone" dataKey="archivedAvgPerM2" name="Ср. цена/м² (арх.)" stroke="#ef4444" strokeWidth={1.5} strokeDasharray="3 3" dot={false} connectNulls />
        </ComposedChart>
      )}
    </ChartBox>
  );
};

export default PriceChangeChart;
