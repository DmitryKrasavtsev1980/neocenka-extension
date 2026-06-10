import React, { useState, useRef, useCallback } from 'react';
import type { AdObject } from '@/types/ad';
import LiquidityChart from './LiquidityChart';
import PriceChangeChart from './PriceChangeChart';
import MarketCorridorChart from './MarketCorridorChart';

interface Props {
  objects: AdObject[];
  addresses: { id: number; address: string }[];
  onObjectClick?: (obj: AdObject) => void;
}

type ReportType = 'liquidity' | 'priceChange' | 'marketCorridor';

const REPORT_CONFIG: { id: ReportType; label: string }[] = [
  { id: 'liquidity', label: 'Ликвидность сегмента' },
  { id: 'priceChange', label: 'Изменение средней цены' },
  { id: 'marketCorridor', label: 'Коридор рынка' },
];

const AdsReportsPanel: React.FC<Props> = ({ objects, addresses, onObjectClick }) => {
  const [activeReports, setActiveReports] = useState<Set<ReportType>>(new Set());
  const [expandedPanels, setExpandedPanels] = useState<Set<ReportType>>(new Set());
  const [corridorHeight, setCorridorHeight] = useState(() => {
    const saved = localStorage.getItem('corridorChartHeight');
    return saved ? parseInt(saved, 10) : 0;
  });
  const dragging = useRef(false);
  const dragStartY = useRef(0);
  const dragStartH = useRef(0);

  const toggleReport = (id: ReportType) => {
    setActiveReports(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
        setExpandedPanels(ep => { const s = new Set(ep); s.add(id); return s; });
      }
      return next;
    });
  };

  const toggleExpand = (id: ReportType) => {
    setExpandedPanels(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    dragStartY.current = e.clientY;
    dragStartH.current = corridorHeight > 0 ? corridorHeight : 400;

    const onMouseMove = (ev: MouseEvent) => {
      if (!dragging.current) return;
      const delta = ev.clientY - dragStartY.current;
      const newH = Math.max(300, dragStartH.current + delta);
      setCorridorHeight(newH);
    };

    const onMouseUp = () => {
      dragging.current = false;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      // Сохраняем в localStorage при отпускании
      setCorridorHeight(prev => {
        localStorage.setItem('corridorChartHeight', String(prev));
        return prev;
      });
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, [corridorHeight]);

  if (objects.length < 2) {
    return (
      <div className="rounded-xl bg-white shadow-sm dark:bg-zinc-900 mb-4 p-5 border border-blue-200 dark:border-blue-800">
        <p className="text-xs text-zinc-400 text-center">Недостаточно данных для отчётов (нужно минимум 2 объекта в фильтре)</p>
      </div>
    );
  }

  const chartH = corridorHeight > 0 ? corridorHeight : 400;

  return (
    <div className="space-y-3 mb-4">
      {/* Переключатели отчётов */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Отчёты:</span>
        {REPORT_CONFIG.map(r => (
          <button
            key={r.id}
            onClick={() => toggleReport(r.id)}
            className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${
              activeReports.has(r.id)
                ? 'bg-blue-600 text-white'
                : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-600'
            }`}
          >{r.label}</button>
        ))}
        <span className="text-[10px] text-zinc-400 ml-2">{objects.length} объектов в фильтре</span>
      </div>

      {/* Панели отчётов */}
      {activeReports.has('liquidity') && (
        <div className="rounded-xl bg-white shadow-sm dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700">
          <div
            className="flex justify-between items-center px-5 py-3 cursor-pointer select-none"
            onClick={() => toggleExpand('liquidity')}
          >
            <h3 className="text-sm font-semibold text-zinc-800 dark:text-white">Ликвидность сегмента</h3>
            <svg className={`w-4 h-4 text-zinc-400 transition-transform ${expandedPanels.has('liquidity') ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
          </div>
          {expandedPanels.has('liquidity') && (
            <div className="px-5 pb-5 border-t border-zinc-100 dark:border-zinc-700">
              <LiquidityChart objects={objects} />
            </div>
          )}
        </div>
      )}

      {activeReports.has('priceChange') && (
        <div className="rounded-xl bg-white shadow-sm dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700">
          <div
            className="flex justify-between items-center px-5 py-3 cursor-pointer select-none"
            onClick={() => toggleExpand('priceChange')}
          >
            <h3 className="text-sm font-semibold text-zinc-800 dark:text-white">Изменение средней цены</h3>
            <svg className={`w-4 h-4 text-zinc-400 transition-transform ${expandedPanels.has('priceChange') ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
          </div>
          {expandedPanels.has('priceChange') && (
            <div className="px-5 pb-5 border-t border-zinc-100 dark:border-zinc-700">
              <PriceChangeChart objects={objects} />
            </div>
          )}
        </div>
      )}

      {activeReports.has('marketCorridor') && (
        <div className="rounded-xl bg-white shadow-sm dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700">
          <div
            className="flex justify-between items-center px-5 py-3 cursor-pointer select-none"
            onClick={() => toggleExpand('marketCorridor')}
          >
            <h3 className="text-sm font-semibold text-zinc-800 dark:text-white">Коридор рынка недвижимости</h3>
            <svg className={`w-4 h-4 text-zinc-400 transition-transform ${expandedPanels.has('marketCorridor') ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
          </div>
          {expandedPanels.has('marketCorridor') && (
            <div className="px-5 pb-5 border-t border-zinc-100 dark:border-zinc-700">
              <MarketCorridorChart objects={objects} addresses={addresses} onObjectClick={onObjectClick} height={chartH} />
              {/* Ручка изменения высоты */}
              <div
                onMouseDown={handleResizeMouseDown}
                className="flex items-center justify-center h-5 mt-1 cursor-row-resize group"
                title="Потяните для изменения высоты графика"
              >
                <div className="w-10 h-1 rounded-full bg-zinc-300 group-hover:bg-blue-400 dark:bg-zinc-600 dark:group-hover:bg-blue-500 transition-colors" />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AdsReportsPanel;
