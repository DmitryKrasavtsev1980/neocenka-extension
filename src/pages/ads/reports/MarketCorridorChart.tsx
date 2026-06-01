import React, { useMemo, useState } from 'react';
import { ComposedChart, ScatterChart, Scatter, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import type { AdObject } from '@/types/ad';
import ChartBox from '@/components/shared/ChartBox';
import {
  computeCorridorScatter, computeCorridorHistoryLines,
  formatPriceTooltip, type CorridorMode, type CorridorPoint, type ObjectLine,
} from './chartUtils';

interface Props {
  objects: AdObject[];
  addresses: { id: number; address: string }[];
}

const MODE_LABELS: Record<CorridorMode, string> = {
  scatter: 'Коридор продаж',
  history_active: 'История активных',
  history_archived: 'История архивных',
  history_all: 'История изменения цен',
};

const COLORS = [
  '#3b82f6', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b',
  '#ec4899', '#6366f1', '#14b8a6', '#84cc16', '#f97316',
];

const MarketCorridorChart: React.FC<Props> = ({ objects, addresses }) => {
  const [mode, setMode] = useState<CorridorMode>('scatter');

  const scatterData = useMemo(() => {
    if (mode !== 'scatter') return null;
    return computeCorridorScatter(objects, addresses);
  }, [objects, addresses, mode]);

  const historyData = useMemo(() => {
    if (mode === 'scatter') return null;
    const historyMode = mode === 'history_active' ? 'active' : mode === 'history_archived' ? 'archived' : 'all';
    return computeCorridorHistoryLines(objects, historyMode, addresses);
  }, [objects, addresses, mode]);

  if (objects.length < 2) {
    return <p className="text-xs text-zinc-400 text-center py-8">Недостаточно данных для построения графика (минимум 2 объекта)</p>;
  }

  // Собираем все точки для определения диапазона осей
  const allYValues = useMemo(() => {
    const vals: number[] = [];
    for (const o of objects) {
      if (o.current_price && o.current_price > 0) vals.push(o.current_price);
    }
    return vals;
  }, [objects]);

  const yMin = allYValues.length > 0 ? Math.min(...allYValues) * 0.9 : 0;
  const yMax = allYValues.length > 0 ? Math.max(...allYValues) * 1.1 : 100;

  const formatY = (v: number) => {
    if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)} млн`;
    if (v >= 1_000) return `${(v / 1_000).toFixed(0)} тыс`;
    return String(v);
  };

  const formatX = (ts: number) => new Date(ts).toLocaleDateString('ru-RU', { month: 'short', year: '2-digit' });

  const ScatterTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.[0]) return null;
    const p: CorridorPoint = payload[0].payload;
    return (
      <div className="bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-600 rounded-lg p-2 text-xs shadow-lg">
        <p className="font-medium">{formatPriceTooltip(p.y)}</p>
        <p>{p.rooms ? `${p.rooms}-комн.` : ''} {p.area ? `${p.area} м²` : ''} {p.floor != null ? `эт. ${p.floor}` : ''}</p>
        <p className="text-zinc-500">
          {p.confirmed ? '✓ Продажа' : p.status === 'archived' ? 'Архив' : 'Активен'} · {p.dateLabel}
        </p>
        {p.address && <p className="text-zinc-400 truncate max-w-[200px]">{p.address}</p>}
      </div>
    );
  };

  const LineTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.[0]) return null;
    const d = payload[0].payload;
    return (
      <div className="bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-600 rounded-lg p-2 text-xs shadow-lg">
        <p className="font-medium">{formatPriceTooltip(d.y ?? d.price ?? 0)}</p>
        <p className="text-zinc-500">{new Date(d.x).toLocaleDateString('ru-RU')}</p>
      </div>
    );
  };

  return (
    <div>
      {/* Переключатель режимов */}
      <div className="flex flex-wrap gap-1 mb-3">
        {(Object.entries(MODE_LABELS) as [CorridorMode, string][]).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setMode(key)}
            className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${
              mode === key
                ? 'bg-blue-600 text-white'
                : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-600'
            }`}
          >{label}</button>
        ))}
      </div>

      {/* График */}
      {mode === 'scatter' && scatterData && (
        <ChartBox height={400}>
          {({ width }) => (
            <ScatterChart width={width} height={400} margin={{ top: 10, right: 20, bottom: 10, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="x" type="number" domain={['auto', 'auto']} tickFormatter={formatX} tick={{ fontSize: 11 }} name="Дата" />
              <YAxis dataKey="y" type="number" domain={[yMin, yMax]} tickFormatter={formatY} tick={{ fontSize: 11 }} name="Цена" />
              <Tooltip content={<ScatterTooltip />} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Scatter name="Активные" data={scatterData.active} fill="#3b82f6" r={5} />
              <Scatter name="Архивные" data={scatterData.archived} fill="#ef4444" r={4} />
              {scatterData.confirmed.length > 0 && (
                <Scatter name="Продажа" data={scatterData.confirmed} fill="#10b981" r={7} shape="diamond" />
              )}
            </ScatterChart>
          )}
        </ChartBox>
      )}

      {mode !== 'scatter' && historyData && (
        <ChartBox height={400}>
          {({ width }) => (
            <ComposedChart width={width} height={400} margin={{ top: 10, right: 20, bottom: 10, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="x" type="number" domain={['auto', 'auto']} tickFormatter={formatX} tick={{ fontSize: 11 }} />
              <YAxis domain={[yMin, yMax]} tickFormatter={formatY} tick={{ fontSize: 11 }} />
              <Tooltip content={<LineTooltip />} />
              {/* Линии объектов */}
              {historyData.lines.map((line, i) => {
                const color = line.confirmed ? '#10b981' : line.status === 'archived' ? '#ef4444' : COLORS[i % COLORS.length];
                return (
                  <Line
                    key={line.objectId}
                    data={line.points}
                    dataKey="y"
                    xAxisId={0}
                    type="stepAfter"
                    stroke={color}
                    strokeWidth={line.confirmed ? 3 : 1.5}
                    dot={false}
                    name={`${line.confirmed ? '✓ ' : ''}Объект ${line.objectId}`}
                    isAnimationActive={false}
                  />
                );
              })}
              {/* Scatter точки */}
              {historyData.scatterPoints.length > 0 && (
                <Scatter
                  name={mode === 'history_active' ? 'Архивные' : mode === 'history_archived' ? 'Активные' : ''}
                  data={historyData.scatterPoints}
                  fill={mode === 'history_active' ? '#ef4444' : '#3b82f6'}
                />
              )}
            </ComposedChart>
          )}
        </ChartBox>
      )}
    </div>
  );
};

export default MarketCorridorChart;
