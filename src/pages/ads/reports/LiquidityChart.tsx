import React, { useMemo } from 'react';
import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import type { AdObject } from '@/types/ad';
import ChartBox from '@/components/shared/ChartBox';
import { getMonthRange, generateMonthBuckets, computeLiquidityData, formatPriceShort } from './chartUtils';

interface Props {
  objects: AdObject[];
}

const LiquidityChart: React.FC<Props> = ({ objects }) => {
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
  );
};

export default LiquidityChart;
