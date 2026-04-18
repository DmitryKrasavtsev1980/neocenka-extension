import React, { useState, useMemo } from 'react';
import { WALL_MATERIALS, getWallMaterialName } from '@/constants/catalogs';
import { Button } from '@/components/catalyst/button';
import { ChevronDownIcon } from '@heroicons/react/16/solid';

interface SegmentationPanelProps {
  dealsCount: number;
  areasByWallMaterial: Record<string, number[]>;
  onSetAreaRange?: (min: string, max: string) => void;
}

// Цвета для разных материалов стен
const SEGMENT_COLORS = [
  '#3b82f6', // blue
  '#ef4444', // red
  '#22c55e', // green
  '#f59e0b', // amber
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#f97316', // orange
  '#14b8a6', // teal
  '#6366f1', // indigo
  '#a855f7', // purple
  '#84cc16', // lime
];

interface DotProps {
  x: number; // 0-1 normalized position
  color: string;
  area: number;
}

const AreaDot: React.FC<DotProps> = ({ x, color, area }) => (
  <div
    className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 group"
    style={{ left: `${x * 100}%` }}
  >
    <div
      className="size-2 rounded-full opacity-70 hover:opacity-100 hover:size-3 transition-all cursor-pointer"
      style={{ backgroundColor: color }}
    />
    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block z-10">
      <div className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-white whitespace-nowrap">
        {area.toFixed(1)} м²
      </div>
    </div>
  </div>
);

interface StripChartProps {
  areas: number[];
  color: string;
  minArea: number;
  maxArea: number;
}

const StripChart: React.FC<StripChartProps> = ({ areas, color, minArea, maxArea }) => {
  const range = maxArea - minArea || 1;

  // Биннинг для лучшей визуализации при большом количестве точек
  const dots = useMemo(() => {
    if (areas.length <= 200) {
      return areas.map((a) => ({
        x: (a - minArea) / range,
        area: a,
      }));
    }
    // Для больших наборов — прореживание
    const sorted = [...areas].sort((a, b) => a - b);
    const step = Math.ceil(sorted.length / 200);
    const sampled: { x: number; area: number }[] = [];
    for (let i = 0; i < sorted.length; i += step) {
      sampled.push({ x: (sorted[i] - minArea) / range, area: sorted[i] });
    }
    return sampled;
  }, [areas, minArea, range]);

  return (
    <div className="relative h-6 w-full">
      {/* Линия оси */}
      <div className="absolute top-1/2 left-0 right-0 h-px bg-zinc-200 dark:bg-zinc-700" />
      {dots.map((d, i) => (
        <AreaDot key={i} x={d.x} color={color} area={d.area} />
      ))}
    </div>
  );
};

const SegmentationPanel = React.memo(({ dealsCount, areasByWallMaterial, onSetAreaRange }: SegmentationPanelProps) => {
  const [open, setOpen] = useState(false);
  const [analyzed, setAnalyzed] = useState(false);

  // Группировка площадей по материалу стен (предвычисленные данные)
  const segments = useMemo(() => {
    if (!analyzed || dealsCount === 0) return [];

    // Сортировка по количеству сделок (убывание)
    const entries = Object.entries(areasByWallMaterial)
      .filter(([, areas]) => areas.length > 0)
      .sort((a, b) => b[1].length - a[1].length);

    // Глобальные min/max для общей шкалы
    let globalMin = Infinity;
    let globalMax = -Infinity;
    for (const [, areas] of entries) {
      for (const a of areas) {
        if (a < globalMin) globalMin = a;
        if (a > globalMax) globalMax = a;
      }
    }

    return entries.map(([code, areas], idx) => {
      const sorted = [...areas].sort((a, b) => a - b);
      return {
        code,
        name: getWallMaterialName(code),
        count: areas.length,
        areas,
        min: sorted[0],
        max: sorted[sorted.length - 1],
        median: sorted[Math.floor(sorted.length / 2)],
        color: SEGMENT_COLORS[idx % SEGMENT_COLORS.length],
        globalMin,
        globalMax,
      };
    });
  }, [dealsCount, areasByWallMaterial, analyzed]);

  const globalMin = segments.length > 0 ? segments[0].globalMin : 0;
  const globalMax = segments.length > 0 ? segments[0].globalMax : 100;

  const handleStartAnalysis = () => {
    setAnalyzed(true);
  };

  if (!open) {
    return (
      <div className="overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-700">
        <button
          className="flex w-full items-center gap-2 bg-zinc-50 px-3.5 py-2.5 text-sm font-medium text-zinc-950 transition-colors hover:bg-zinc-100 dark:bg-zinc-800 dark:text-white dark:hover:bg-zinc-700 bg-transparent border-none cursor-pointer"
          onClick={() => setOpen(true)}
        >
          <span>Сегментирование</span>
          <ChevronDownIcon className="ml-auto size-4 transition-transform" />
        </button>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-700">
      <button
        className="flex w-full items-center gap-2 bg-zinc-50 px-3.5 py-2.5 text-sm font-medium text-zinc-950 transition-colors hover:bg-zinc-100 dark:bg-zinc-800 dark:text-white dark:hover:bg-zinc-700 bg-transparent border-none cursor-pointer"
        onClick={() => { setOpen(false); setAnalyzed(false); }}
      >
        <span>Сегментирование</span>
        <ChevronDownIcon className="ml-auto size-4 rotate-180 transition-transform" />
      </button>

      <div className="px-5 pb-5">
        {!analyzed ? (
          <div className="py-6 text-center">
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-3">
              Анализ распределения площадей по материалам стен в отфильтрованных сделках ({dealsCount} сделок)
            </p>
            <Button color="blue" onClick={handleStartAnalysis} disabled={dealsCount === 0}>
              Начать анализ
            </Button>
          </div>
        ) : (
          <>
            {/* Scale labels */}
            <div className="flex justify-between text-[10px] text-zinc-400 mb-2 mt-1">
              <span>{globalMin.toFixed(0)} м²</span>
              <span>Площадь</span>
              <span>{globalMax.toFixed(0)} м²</span>
            </div>

            {segments.length === 0 ? (
              <p className="py-4 text-center text-xs text-zinc-400">Нет данных для анализа</p>
            ) : (
              <div className="space-y-3">
                {segments.map((seg) => (
                  <div key={seg.code} className="group/row">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="size-3 rounded-sm shrink-0" style={{ backgroundColor: seg.color }} />
                      <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300 truncate">
                        {seg.name}
                      </span>
                      <span className="text-[10px] text-zinc-400 ml-auto shrink-0">
                        {seg.count} сделок • медиана {seg.median.toFixed(1)} м² • {seg.min.toFixed(0)}-{seg.max.toFixed(0)} м²
                      </span>
                    </div>
                    <StripChart
                      areas={seg.areas}
                      color={seg.color}
                      minArea={globalMin}
                      maxArea={globalMax}
                    />
                    {onSetAreaRange && (
                      <button
                        className="mt-1 text-[10px] text-blue-500 hover:text-blue-600 bg-transparent border-none cursor-pointer opacity-0 group-hover/row:opacity-100 transition-opacity"
                        onClick={() => onSetAreaRange(seg.min.toFixed(1), seg.max.toFixed(1))}
                      >
                        Фильтр: {seg.min.toFixed(0)}–{seg.max.toFixed(0)} м²
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
});

export default SegmentationPanel;
