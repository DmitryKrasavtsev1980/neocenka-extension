/**
 * Виджет «Позиция на рынке»
 *
 * Показывает горизонтальный бар с маркерами p10/p25/p50/p75/p90
 * и стрелкой, указывающей позицию текущего объявления.
 *
 * Шкала строится от p5 до p95 (чтобы выбросы не сжимали визуализацию),
 * но если цена объявления выходит за эти границы — маркер всё равно виден.
 *
 * Если данных недостаточно — показывает причину.
 */

import React from 'react';
import type { MarketPosition } from '@/services/market-stats-service';

interface MarketPositionWidgetProps {
  position: MarketPosition;
  /** Компактный режим для маленьких карточек */
  compact?: boolean;
}

const fmtRub = (v: number): string => v.toLocaleString('ru-RU');
const fmtK = (v: number): string => {
  if (v >= 1000) return `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}к`;
  return String(v);
};

const MarketPositionWidget: React.FC<MarketPositionWidgetProps> = ({ position, compact = false }) => {
  const { percentiles, percentileRank, deltaToMedian, comparablesCount, reason, isLowMarket } = position;

  // Нет данных
  if (!percentiles || percentileRank == null) {
    const reasonText = reason === 'no_coords'
      ? 'Нет координат — невозможно найти аналоги'
      : reason === 'no_price'
        ? 'Нет цены за м²'
        : reason === 'no_area'
          ? 'Не указана площадь'
          : `Мало аналогов (${comparablesCount}). Нужно минимум 5 для расчёта.`;
    return (
      <div className={`rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/60 ${compact ? 'p-2' : 'p-3'}`}>
        <div className="flex items-center gap-2">
          <svg className="size-4 text-zinc-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 3l-8 8h6v9h4v-9h6l-8-8z" transform="rotate(180 12 12)" />
          </svg>
          <div>
            <div className="text-[11px] font-medium text-zinc-700 dark:text-zinc-300">Позиция на рынке</div>
            <div className="text-[10px] text-zinc-500 dark:text-zinc-400">{reasonText}</div>
          </div>
        </div>
      </div>
    );
  }

  // Шкала: от p5 до p95.
  const minScale = percentiles.p5;
  const maxScale = percentiles.p95;
  const range = maxScale - minScale || 1;

  // Позиция на шкале [0..100]
  const pct = (val: number) => Math.max(0, Math.min(100, ((val - minScale) / range) * 100));
  const markerPos = pct(position.pricePerMeter ?? percentiles.p50);

  // Цветовая маркировка кружка
  const colorClass = isLowMarket
    ? 'bg-emerald-500'
    : percentileRank <= 25
      ? 'bg-green-500'
      : percentileRank <= 50
        ? 'bg-lime-500'
        : percentileRank <= 75
          ? 'bg-amber-500'
          : 'bg-rose-500';

  const statusLabel = isLowMarket
    ? 'Низ рынка'
    : percentileRank <= 25
      ? 'Дёшево'
      : percentileRank <= 50
        ? 'Ниже медианы'
        : percentileRank <= 75
          ? 'Выше медианы'
          : 'Дорого';

  const statusBadgeColor = isLowMarket
    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
    : percentileRank <= 25
      ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
      : percentileRank <= 50
        ? 'bg-lime-100 text-lime-700 dark:bg-lime-900/30 dark:text-lime-300'
        : percentileRank <= 75
          ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
          : 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300';

  // Тики перцентилей: p10/p25/p50/p75/p90 — рендерятся НАД линией
  const tickAt = (val: number, label: string, isMedian = false) => ({
    left: pct(val),
    label,
    val,
    isMedian,
  });
  const ticks = [
    tickAt(percentiles.p10, 'p10'),
    tickAt(percentiles.p25, 'p25'),
    tickAt(percentiles.p50, 'p50', true),
    tickAt(percentiles.p75, 'p75'),
    tickAt(percentiles.p90, 'p90'),
  ];

  // Корректировка позиции лейбла цены объявления, чтобы не вылезал за края
  const priceLabelPos = Math.max(12, Math.min(88, markerPos));

  // Цвет текста для цены объявления (под линией)
  const markerPriceColor = deltaToMedian != null && deltaToMedian < 0
    ? 'text-emerald-600 dark:text-emerald-400'
    : deltaToMedian != null && deltaToMedian > 0
      ? 'text-rose-600 dark:text-rose-400'
      : 'text-zinc-600 dark:text-zinc-300';

  return (
    <div className={`rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800/60 ${compact ? 'p-2' : 'p-3'} space-y-2`}>
      {/* Заголовок + статус */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-medium text-zinc-700 dark:text-zinc-300">Позиция на рынке</span>
          <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold ${statusBadgeColor}`}>
            {statusLabel}
          </span>
        </div>
        <span className="text-[10px] text-zinc-500 dark:text-zinc-400 tabular-nums">
          p{Math.round(percentileRank)}
        </span>
      </div>

      {/*
        Шкала: высота ~64px.
        Структура (сверху вниз):
          [12px] — лейблы перцентилей (p10/p25/p50/p75/p90) + значение медианы
          [3px]  — засечки перцентилей (тики, идут вниз к линии)
          [8px]  — градиент-бар (сама шкала)
          [3px]  — выравнивание маркера
          [12px] — значение цены объявления (стрелка вверх)
          [12px] — границы шкалы p5/p95 (min/max)
      */}
      <div className="relative h-16">
        {/* НАД линией: лейблы перцентилей */}
        {ticks.map(t => (
          <div
            key={t.label}
            className="absolute -translate-x-1/2 flex flex-col items-center"
            style={{ left: `${t.left}%`, top: 0 }}
          >
            <div className={`text-[9px] whitespace-nowrap ${t.isMedian ? 'font-semibold text-zinc-500 dark:text-zinc-400' : 'text-zinc-400 dark:text-zinc-500'}`}>
              {t.label}
            </div>
          </div>
        ))}

        {/* Засечки перцентилей (вертикальные чёрточки над линией) */}
        {ticks.map(t => (
          <div
            key={`tick-${t.label}`}
            className="absolute -translate-x-1/2 w-px h-1.5 bg-zinc-400 dark:bg-zinc-500"
            style={{ left: `${t.left}%`, top: '14px' }}
          />
        ))}

        {/* Градиент-бар (шкала p5 → p95) */}
        <div
          className="absolute left-0 right-0 h-2 bg-gradient-to-r from-emerald-200 via-lime-200 to-rose-200 dark:from-emerald-900/60 dark:via-lime-900/60 dark:to-rose-900/60 rounded-full"
          style={{ top: '18px' }}
        />

        {/* Маркер этого объявления (кружок на линии) */}
        <div
          className="absolute -translate-x-1/2 -translate-y-1/2 z-10"
          style={{ left: `${markerPos}%`, top: '22px' }}
        >
          <div className={`w-3.5 h-3.5 rounded-full ${colorClass} ring-2 ring-white dark:ring-zinc-800 shadow-md`} />
        </div>

        {/* ПОД линией: стрелка вверх + цена объявления */}
        <div
          className="absolute -translate-x-1/2 flex flex-col items-center"
          style={{ left: `${priceLabelPos}%`, top: '30px' }}
        >
          <svg className="size-2.5 text-zinc-500 dark:text-zinc-400" viewBox="0 0 12 12" fill="currentColor" aria-hidden>
            <path d="M6 0L12 7H0z" />
          </svg>
          <div className={`text-[10px] font-bold tabular-nums whitespace-nowrap ${markerPriceColor}`}>
            {fmtRub(position.pricePerMeter ?? 0)} ₽
          </div>
        </div>

        {/* Границы шкалы p5/p95 и медиана — самый низ */}
        <div className="absolute left-0 right-0 flex items-center justify-between" style={{ top: '52px' }}>
          <span className="text-[9px] text-zinc-400 dark:text-zinc-500 tabular-nums">
            min: {fmtRub(minScale)} ₽
          </span>
          <span className="text-[9px] text-zinc-400 dark:text-zinc-500 tabular-nums">
            медиана: {fmtRub(percentiles.p50)} ₽
          </span>
          <span className="text-[9px] text-zinc-400 dark:text-zinc-500 tabular-nums">
            max: {fmtRub(maxScale)} ₽
          </span>
        </div>
      </div>

      {/* Детали */}
      <div className="flex items-center justify-between text-[10px] gap-2">
        <span className="text-zinc-500 dark:text-zinc-400">
          {deltaToMedian != null && (
            <span className={deltaToMedian < 0 ? 'text-emerald-600 dark:text-emerald-400 font-medium' : deltaToMedian > 0 ? 'text-rose-600 dark:text-rose-400 font-medium' : ''}>
              {deltaToMedian > 0 ? '+' : ''}{deltaToMedian}% к медиане
            </span>
          )}
        </span>
        <span className="text-zinc-400 dark:text-zinc-500 whitespace-nowrap">
          {comparablesCount} аналогов
        </span>
      </div>
    </div>
  );
};

export default MarketPositionWidget;
