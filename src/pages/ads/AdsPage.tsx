/**
 * Страница «Поиск объявлений»
 * Единая таблица с объявлениями и объектами (по аналогии с neocenka-extension)
 */

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { adsRepository } from '@/db/repositories/ads.repository';
import { db } from '@/db/database';
import { cadastralRepository } from '@/db';
import type { Ad, AdObject, AdAddress, AdStats, ReferenceItem, PriceHistoryItem, CadastralQuarter } from '@/types';
import { batchUpdateCianAds, type BatchProgress } from '@/services/cian-batch-update-service';
import { batchUpdateAvitoAds, type AvitoBatchProgress } from '@/services/avito-batch-update-service';
import { useImportTasks, type ImportTask } from '@/contexts/ImportTaskContext';
import { getModules, sendDedupFeedbackBatch } from '@/services/api-service';
import AdsReportsPanel from './reports/AdsReportsPanel';
import { REGION_CENTERS } from '@/constants/regions';
import {
  SOURCE_IDS,
  type ListingCategoryRaw,
} from '@/services/listing-transform';
import {
  getAvailableCategories,
} from '@/services/data-request-service';
import { recalculateObjectFromAds, mergePriceHistory } from '@/services/ad-object-utils';
import { calculateMarketPositionsBulk, DEFAULT_MARKET_OPTIONS, type MarketPosition, type MarketStatsOptions } from '@/services/market-stats-service';
import MarketPositionWidget from '@/components/MarketPositionWidget';
import SearchByPolygon from '@/components/SearchByPolygon/SearchByPolygon';
import { Button } from '@/components/catalyst/button';
import { Badge } from '@/components/catalyst/badge';
import AdDetailModal from './AdDetailModal';
import AdObjectDetailModal from './AdObjectDetailModal';
import AdAddressModal from './AdAddressModal';
import AddressCombobox from './AddressCombobox';
import AdsSavedFiltersPanel from './AdsSavedFiltersPanel';
import AdAddressAssignModal from './AdAddressAssignModal';
import { adsAddressService } from '@/services/ads-address-service';
import {
  FunnelIcon,
  ArrowDownTrayIcon,
  ChevronDownIcon,
  XMarkIcon,
  ArrowPathIcon,
  MapPinIcon,
  TrashIcon,
  ChartBarIcon,
} from '@heroicons/react/16/solid';

// ─── Компонент: Strip plot распределения площадей по категориям ───

const CATEGORY_COLORS: Record<string, string> = {
  studio: '#8b5cf6', // violet
  '1k':     '#3b82f6', // blue
  '2k':     '#10b981', // emerald
  '3k':     '#f59e0b', // amber
  '4k+':    '#ef4444', // red
  unknown:  '#6b7280', // gray
};

function AreaStripPlot({ byCategory, min, max, count, filterMin, filterMax }: {
  byCategory: Map<string, { area: number }[]>;
  min: number;
  max: number;
  count: number;
  filterMin: number | null;
  filterMax: number | null;
}) {
  const [hoveredDot, setHoveredDot] = useState<{ area: number; cat: string; idx: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const range = max - min || 1;
  const ROW_H = 18; // высота строки одной категории
  const PAD_L = 38, PAD_R = 6, PAD_T = 2, PAD_B = 14;

  // Сортируем категории в фиксированном порядке
  const catOrder = ['studio', '1k', '2k', '3k', '4k+', 'unknown'];
  const categories = [...byCategory.keys()].sort((a, b) => {
    const ai = catOrder.indexOf(a), bi = catOrder.indexOf(b);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

  const H = PAD_T + categories.length * ROW_H + PAD_B;
  const W = 500;
  const chartW = W - PAD_L - PAD_R;
  const x = (v: number) => PAD_L + ((v - min) / range) * chartW;
  const fmt = (v: number) => v % 1 === 0 ? String(v) : v.toFixed(1);

  // Для каждой категории: семплируем до 150 точек, создаём jitter
  const dotsByCategory = useMemo(() => {
    const result = new Map<string, { area: number; cx: number; cy: number }[]>();
    for (const cat of categories) {
      const items = byCategory.get(cat) || [];
      const sorted = [...items].sort((a, b) => a.area - b.area);
      const sampled = sorted.length > 150
        ? sorted.filter((_, i) => i % Math.ceil(sorted.length / 150) === 0)
        : sorted;
      const rowY = PAD_T + categories.indexOf(cat) * ROW_H + ROW_H / 2;
      const jitterH = ROW_H - 6;
      const dots = sampled.map((item, i) => ({
        area: item.area,
        cx: x(item.area),
        cy: rowY - jitterH / 2 + ((Math.sin(i * 127.1 + cat.charCodeAt(0)) * 43758.5453) % 1 + 1) % 1 * jitterH,
      }));
      result.set(cat, dots);
    }
    return result;
  }, [byCategory, min, max, categories.length]);

  return (
    <div className="mb-3 p-2 rounded-md bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700">
      <div className="flex items-center justify-between mb-1.5 px-0.5">
        <span className="text-[11px] font-medium text-zinc-600 dark:text-zinc-300">Распределение площадей</span>
        <span className="text-[10px] text-zinc-400">{count.toLocaleString('ru-RU')} объявлений</span>
      </div>
      <div ref={containerRef} className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full block" preserveAspectRatio="xMidYMid meet">
          {/* Ось */}
          <line x1={PAD_L} y1={H - PAD_B} x2={W - PAD_R} y2={H - PAD_B} className="stroke-zinc-300 dark:stroke-zinc-600" strokeWidth={0.5} />
          <text x={PAD_L} y={H - 2} className="fill-zinc-500 dark:fill-zinc-400" fontSize={9} textAnchor="start">{fmt(min)} м²</text>
          <text x={W - PAD_R} y={H - 2} className="fill-zinc-500 dark:fill-zinc-400" fontSize={9} textAnchor="end">{fmt(max)} м²</text>
          {/* Промежуточные подписи */}
          {(() => {
            const step = range <= 20 ? 5 : range <= 50 ? 10 : range <= 100 ? 20 : range <= 500 ? 50 : 100;
            const first = Math.ceil(min / step) * step;
            const labels: { val: number; xPos: number }[] = [];
            for (let v = first; v < max; v += step) {
              if (v > min + step * 0.5 && v < max - step * 0.5) {
                labels.push({ val: v, xPos: x(v) });
              }
            }
            return labels.map((l, i) => (
              <text key={i} x={l.xPos} y={H - 2} className="fill-zinc-500 dark:fill-zinc-400" fontSize={7} textAnchor="middle">{fmt(l.val)}</text>
            ));
          })()}
          {/* Подсветка фильтра */}
          {(filterMin != null || filterMax != null) && (
            <rect
              x={x(filterMin ?? min)} y={PAD_T}
              width={x(filterMax ?? max) - x(filterMin ?? min)}
              height={H - PAD_T - PAD_B}
              className="fill-blue-500/10"
              rx={2}
            />
          )}
          {/* Горизонтальные разделители + лейблы категорий */}
          {categories.map((cat, ci) => {
            const rowY = PAD_T + ci * ROW_H;
            const color = CATEGORY_COLORS[cat] || '#6b7280';
            const label = PROPERTY_TYPE_LABELS[cat] || cat;
            return (
              <g key={cat}>
                {ci > 0 && <line x1={PAD_L} y1={rowY} x2={W - PAD_R} y2={rowY} className="stroke-zinc-200 dark:stroke-zinc-700" strokeWidth={0.5} />}
                <text x={PAD_L - 4} y={rowY + ROW_H / 2 + 3} fontSize={9} textAnchor="end" fill={color} fontWeight={600}>{label}</text>
              </g>
            );
          })}
          {/* Точки */}
          {categories.map((cat) => {
            const dots = dotsByCategory.get(cat) || [];
            const color = CATEGORY_COLORS[cat] || '#6b7280';
            return dots.map((dot, i) => {
              const isOut = (filterMin != null && dot.area < filterMin) || (filterMax != null && dot.area > filterMax);
              return (
                <circle
                  key={`${cat}-${i}`}
                  cx={dot.cx}
                  cy={dot.cy}
                  r={2}
                  fill={color}
                  opacity={isOut ? 0.2 : 0.65}
                  onMouseEnter={() => setHoveredDot({ area: dot.area, cat, idx: i })}
                  onMouseLeave={() => setHoveredDot(null)}
                  style={{ cursor: 'crosshair' }}
                />
              );
            });
          })}
        </svg>
        {/* Тултип */}
        {hoveredDot !== null && (() => {
          const dots = dotsByCategory.get(hoveredDot.cat) || [];
          const dot = dots[hoveredDot.idx];
          if (!dot) return null;
          const svgEl = containerRef.current?.querySelector('svg');
          if (!svgEl) return null;
          const svgRect = svgEl.getBoundingClientRect();
          const tipLeft = (dot.cx / W) * svgRect.width;
          const catLabel = PROPERTY_TYPE_LABELS[hoveredDot.cat] || hoveredDot.cat;
          return (
            <div
              className="absolute pointer-events-none z-10 px-2 py-1 rounded bg-zinc-800 dark:bg-zinc-200 text-white dark:text-zinc-900 text-[10px] whitespace-nowrap shadow-lg"
              style={{
                left: tipLeft,
                top: (dot.cy / H) * svgRect.height - 6,
                transform: 'translate(-50%, -100%)',
              }}
            >
              {catLabel}: <b>{fmt(hoveredDot.area)} м²</b>
            </div>
          );
        })()}
      </div>
    </div>
  );
}

// ─── Константы ───

const PROPERTY_TYPE_LABELS: Record<string, string> = {
  studio: 'Студия', '1k': '1-к', '2k': '2-к', '3k': '3-к', '4k+': '4+к',
};
const PROPERTY_TYPE_FULL: Record<string, string> = {
  studio: 'Студия', '1k': '1-комн.', '2k': '2-комн.', '3k': '3-комн.', '4k+': '4+ комн.',
};
const SOURCE_LABELS: Record<string, string> = {
  avito: 'avito.ru', cian: 'cian.ru', domclick: 'domclick.ru', yandex: 'realty.yandex.ru', youla: 'youla.io', sob: 'sob.ru', bazarpnz: 'bazarpnz.ru', move: 'move.ru', gipernn: 'gipernn.ru', orsk: 'orsk.ru', doskaYkt: 'doska.ykt.ru', unknown: '?',
};
// Нормализация source: "avito.ru" → "avito", "cian.ru" → "cian"
const normalizeSource = (s: string | null | undefined): string => {
  if (!s) return '';
  if (SOURCE_LABELS[s]) return s;
  const keys = Object.keys(SOURCE_LABELS);
  for (const k of keys) {
    if (s.startsWith(k + '.') || s === SOURCE_LABELS[k]) return k;
  }
  return s;
};
const SOURCE_COLORS: Record<string, string> = {
  avito: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  cian: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  domclick: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  yandex: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  youla: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  unknown: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-300',
};
const SECTION_LABELS: Record<number, string> = {
  1: 'Жилая', 4: 'Коммерческая', 5: 'Загородная', 9: 'Гараж', 11: 'Готовый бизнес',
};
const SELLER_TYPE_LABELS: Record<string, string> = { owner: 'Собственник', agent: 'Агент', developer: 'Застройщик' };
/** sellerType: 0=собственник, 1=агент, 3=застройщик */
const SELLER_TYPE_API_MAP: Record<string, number> = { owner: 1, agent: 2, developer: 3 };
const CONFIDENCE_LABELS: Record<string, string> = {
  high: '(Подтвержден)', medium: '(Средняя)', low: '(Низкая)', very_low: '(Очень низкая)', manual: '(Ручной)',
};
const PAGE_SIZES = [10, 25, 50, 100];

function toDateString(d: Date): string { return d.toISOString().slice(0, 10); }

/** Пресеты быстрых периодов для поля «Дата от» в панели обработки. */
const IMPORT_DATE_PRESETS = [
  { days: 3, label: '3 дня' },
  { days: 7, label: '7 дней' },
  { days: 30, label: '30 дней' },
  { days: 90, label: '90 дней' },
  { days: 180, label: '180 дней' },
  { days: 365, label: '365 дней' },
] as const;

function dateNDaysAgoStr(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return toDateString(d);
}

/** Проверка принадлежности точки полигону (ray casting). Полигон: [lat, lng][] */
function pointInPolygon(lat: number, lng: number, polygon: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const latI = polygon[i][0], lngI = polygon[i][1];
    const latJ = polygon[j][0], lngJ = polygon[j][1];
    if (((latI > lat) !== (latJ > lat)) &&
        (lng < (lngJ - lngI) * (lat - latI) / (latJ - latI) + lngI)) {
      inside = !inside;
    }
  }
  return inside;
}

function daysAgo(dateStr: string | null): number | null {
  if (!dateStr) return null;
  try { return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000); }
  catch { return null; }
}

/** Тип строки таблицы */
type TableRow =
  | { kind: 'ad'; data: Ad }
  | { kind: 'object'; data: AdObject }
  | { kind: 'expanded_ad'; data: Ad; parentObjectId: number };

interface AdsPageProps { onNavigate?: (page: string) => void; }

/** Компонент пагинации с номерами страниц и выбором размера */
const PaginationBar: React.FC<{
  page: number; totalPages: number; pageSize: number; totalItems: number;
  position?: 'top' | 'bottom';
  onPageChange: (p: number) => void;
  onPageSizeChange: (s: number) => void;
}> = ({ page, totalPages, pageSize, totalItems, position = 'top', onPageChange, onPageSizeChange }) => {
  // Формируем массив номеров страниц для отображения
  const getPageNumbers = (): (number | '...')[] => {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
    const pages: (number | '...')[] = [1];
    if (page > 3) pages.push('...');
    const start = Math.max(2, page - 1);
    const end = Math.min(totalPages - 1, page + 1);
    for (let i = start; i <= end; i++) pages.push(i);
    if (page < totalPages - 2) pages.push('...');
    pages.push(totalPages);
    return pages;
  };

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, totalItems);

  return (
    <div className={`flex items-center justify-between px-4 py-2 ${position === 'top' ? 'border-b' : 'border-t'} border-zinc-200 dark:border-zinc-700`}>
      <div className="flex items-center gap-2">
        <span className="text-[11px] text-zinc-500 dark:text-zinc-400">{from}–{to} из {totalItems}</span>
        <select
          value={pageSize}
          onChange={e => onPageSizeChange(Number(e.target.value))}
          className="rounded border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-700 px-1 py-0.5 text-[11px] text-zinc-700 dark:text-zinc-300"
        >
          {PAGE_SIZES.map(s => <option key={s} value={s}>{s} на стр.</option>)}
        </select>
      </div>
      {totalPages > 1 && (
      <div className="flex items-center gap-0.5">
        <button
          onClick={() => onPageChange(1)} disabled={page <= 1}
          className="px-1.5 py-1 rounded text-[11px] border border-zinc-300 dark:border-zinc-600 disabled:opacity-30 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300"
          title="Первая"
        >{'«'}</button>
        <button
          onClick={() => onPageChange(page - 1)} disabled={page <= 1}
          className="px-1.5 py-1 rounded text-[11px] border border-zinc-300 dark:border-zinc-600 disabled:opacity-30 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300"
        >{'‹'}</button>
        {getPageNumbers().map((p, i) =>
          p === '...' ? (
            <span key={`dots-${i}`} className="px-1 text-[11px] text-zinc-400">...</span>
          ) : (
            <button
              key={p}
              onClick={() => onPageChange(p)}
              className={`px-2 py-1 rounded text-[11px] border ${
                p === page
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'border-zinc-300 dark:border-zinc-600 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800'
              }`}
            >{p}</button>
          )
        )}
        <button
          onClick={() => onPageChange(page + 1)} disabled={page >= totalPages}
          className="px-1.5 py-1 rounded text-[11px] border border-zinc-300 dark:border-zinc-600 disabled:opacity-30 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300"
        >{'›'}</button>
        <button
          onClick={() => onPageChange(totalPages)} disabled={page >= totalPages}
          className="px-1.5 py-1 rounded text-[11px] border border-zinc-300 dark:border-zinc-600 disabled:opacity-30 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300"
          title="Последняя"
        >{'»'}</button>
      </div>
      )}
    </div>
  );
};

const AdsPage: React.FC<AdsPageProps> = () => {
  const { startAdsImport, startCianBatchUpdate, startAvitoBatchUpdate, startDeduplication, startDealMatching, tasks: importTasks } = useImportTasks();
  const importTasksRef = useRef(importTasks);
  importTasksRef.current = importTasks;
  const adsImportRunning = importTasks.some(t => t.type === 'ads-import' && t.status === 'running');
  // ─── Данные ───
  const [allAds, setAllAds] = useState<Ad[]>([]);
  const [allObjects, setAllObjects] = useState<AdObject[]>([]);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<AdStats | null>(null);
  const [totalAds, setTotalAds] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  // Локальный фильтр статуса в таблице (не сохраняется в общий фильтр)
  const [localStatusFilter, setLocalStatusFilter] = useState<'all' | 'active' | 'archived'>('all');

  // ─── Выбор ───
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [selectedTypes, setSelectedTypes] = useState<Map<number, 'ad' | 'object'>>(new Map());

  // ─── Раскрытие объектов ───
  const [expandedObjects, setExpandedObjects] = useState<Set<number>>(new Set());
  const [objectAds, setObjectAds] = useState<Map<number, Ad[]>>(new Map());

  // ─── Основной фильтр (сегментный) ───
  const [showFilters, setShowFilters] = useState(false);
  const [filterSources, setFilterSources] = useState<string[]>([]);
  const [filterPropertyTypes, setFilterPropertyTypes] = useState<string[]>([]);
  const [filterCategoryIds, setFilterCategoryIds] = useState<number[]>([]);
  const [filterPriceMin, setFilterPriceMin] = useState('');
  const [filterPriceMax, setFilterPriceMax] = useState('');
  const [filterAreaMin, setFilterAreaMin] = useState('');
  const [filterAreaMax, setFilterAreaMax] = useState('');
  const [showAreaChart, setShowAreaChart] = useState(false);
  const [filterFloorMin, setFilterFloorMin] = useState('');
  const [filterFloorMax, setFilterFloorMax] = useState('');
  const [filterYearMin, setFilterYearMin] = useState('');
  const [filterYearMax, setFilterYearMax] = useState('');
  const [filterSellerTypes, setFilterSellerTypes] = useState<string[]>([]);
  const [filterStatus, setFilterStatus] = useState<'active' | 'archived' | ''>('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // ─── Фильтры обработки ───
  const [showProcessingFilter, setShowProcessingFilter] = useState(false);
  // ─── Подсветка «низа рынка» (p15) ───
  const [showLowMarket, setShowLowMarket] = useState(false);
  const [lowMarketOnly, setLowMarketOnly] = useState(false);
  const [showLowMarketSettings, setShowLowMarketSettings] = useState(false);
  const [lowMarketOptions, setLowMarketOptions] = useState<MarketStatsOptions>(DEFAULT_MARKET_OPTIONS);
  const [lowMarketComputing, setLowMarketComputing] = useState(false);
  const [filterProcessingStatus, setFilterProcessingStatus] = useState('');
  const [filterAddressId, setFilterAddressId] = useState<number | ''>('');
  const [filterContactType, setFilterContactType] = useState('');
  const [filterProcessingCategoryId, setFilterProcessingCategoryId] = useState<number | ''>('');
  const [filterProcessingFloor, setFilterProcessingFloor] = useState('');
  const [addresses, setAddresses] = useState<AdAddress[]>([]);
  const [refWallMaterials, setRefWallMaterials] = useState<ReferenceItem[]>([]);
  const [refHouseSeries, setRefHouseSeries] = useState<ReferenceItem[]>([]);
  const [refHouseClasses, setRefHouseClasses] = useState<ReferenceItem[]>([]);
  const [refCeilingMaterials, setRefCeilingMaterials] = useState<ReferenceItem[]>([]);
  const [refHouseProblems, setRefHouseProblems] = useState<ReferenceItem[]>([]);

  // ─── Фильтры по параметрам адресов ───
  const [filterHouseSeriesIds, setFilterHouseSeriesIds] = useState<string[]>([]);
  const [filterWallMaterialIds, setFilterWallMaterialIds] = useState<string[]>([]);
  const [filterFloorsMin, setFilterFloorsMin] = useState('');
  const [filterFloorsMax, setFilterFloorsMax] = useState('');
  const [sortColumn, setSortColumn] = useState<'price' | 'created' | 'updated' | 'status' | null>('updated');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [excludedAddressIds, setExcludedAddressIds] = useState<Set<number>>(() => {
    try {
      const saved = localStorage.getItem('ret_ads_excluded_address_ids');
      if (!saved) return new Set();
      const arr = JSON.parse(saved);
      return new Set(Array.isArray(arr) ? arr : []);
    } catch { return new Set(); }
  });

  // ─── Сохранённые фильтры ───
  const [showSavedPanel, setShowSavedPanel] = useState(false);
  const [activeFilterId, setActiveFilterId] = useState<string | null>(null);
  const [activeFilterName, setActiveFilterName] = useState<string | null>(null);
  const [activeFilterStateJson, setActiveFilterStateJson] = useState<string | null>(null);

  // ─── Загрузка данных ───
  const [showImportPanel, setShowImportPanel] = useState(false);
  const categoriesLoadedRef = useRef(false);
  const [categories, setCategories] = useState<ListingCategoryRaw[]>([]);
  const [importSourceIds, setImportSourceIds] = useState<number[]>([]);
  const [importCategoryIds, setImportCategoryIds] = useState<number[]>([]);
  const [importSellerTypeIds, setImportSellerTypeIds] = useState<number[]>([]);
  const [importIsNew, setImportIsNew] = useState<number>(0); // 0=вторичка, 1=новостройка
  const [enabledSources, setEnabledSources] = useState<{ id: number; key: string }[]>([]);
  const [importDateFrom, setImportDateFrom] = useState(() => dateNDaysAgoStr(365));
  const [importDateTo, setImportDateTo] = useState(() => { const d = new Date(); d.setDate(d.getDate() + 1); return toDateString(d); });
  const [importError, setImportError] = useState('');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  // ─── Чекбоксы задач ───
  const [runImport, setRunImport] = useState(false);
  const [runAddress, setRunAddress] = useState(false);
  const [runUpdate, setRunUpdate] = useState(false);
  const [runDedup, setRunDedup] = useState(false);
  const [runDealMatch, setRunDealMatch] = useState(false);
  const cianTask = importTasks.find(t => t.type === 'cian-update' && (t.status === 'running' || t.status === 'done' || t.status === 'error'));
  const avitoTask = importTasks.find(t => t.type === 'avito-update' && (t.status === 'running' || t.status === 'done' || t.status === 'error'));
  const dedupTask = importTasks.find(t => t.type === 'deduplicate' && (t.status === 'running' || t.status === 'done' || t.status === 'error'));
  const dealMatchTask = importTasks.find(t => t.type === 'deal-matching' && (t.status === 'running' || t.status === 'done' || t.status === 'error'));
  const [archiveDays, setArchiveDays] = useState(7);
  const [showReports, setShowReports] = useState(false);
  const [dealsModuleActive, setDealsModuleActive] = useState(false);
  const [cadastralQuarters, setCadastralQuarters] = useState<CadastralQuarter[]>([]);

  // ─── Matching адресов ───
  const [matchRunning, setMatchRunning] = useState(false);
  const [matchProgress, setMatchProgress] = useState<{ done: number; total: number } | null>(null);

  // ─── Удаление ───
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleteRunning, setDeleteRunning] = useState(false);
  const [deleteSelectedConfirm, setDeleteSelectedConfirm] = useState(false);
  const [unlinkSelectedConfirm, setUnlinkSelectedConfirm] = useState(false);

  // ─── Модалки ───
  const [detailAd, setDetailAd] = useState<Ad | null>(null);
  // Ref для проверки — не закрыл ли пользователь модалку во время async-операций
  const detailAdRef = useRef<Ad | null>(null);
  detailAdRef.current = detailAd;
  const [detailObject, setDetailObject] = useState<AdObject | null>(null);
  const [detailAddress, setDetailAddress] = useState<AdAddress | null>(null);
  const [assignAd, setAssignAd] = useState<Ad | null>(null);
  const [createAddressForAd, setCreateAddressForAd] = useState<Ad | null>(null);

  /** Открыть модалку объекта — гарантирует загрузку его объявлений */
  const openObjectDetail = useCallback((o: AdObject) => {
    const objId = o.id!;
    if (!objectAds.has(objId)) {
      const ads = allAds
        .filter(a => a.object_id === objId)
        .sort((a, b) => {
          const ta = new Date(a.updated || a.created || 0).getTime();
          const tb = new Date(b.updated || b.created || 0).getTime();
          return tb - ta;
        });
      setObjectAds(prev => new Map(prev).set(objId, ads));
    }
    setDetailObject(o);
  }, [objectAds, allAds]);
  const [addressModalMode, setAddressModalMode] = useState<'edit' | 'create'>('edit');

  // ─── Карта ───
  const [showMapFilter, setShowMapFilter] = useState(false);
  const [flyToTarget, setFlyToTarget] = useState<{ lat: number; lon: number; zoom: number } | null>(null);
  const [subscriptionRegionCodes, setSubscriptionRegionCodes] = useState<string[]>([]);
  const [polygonsCoords, setPolygonsCoords] = useState<[number, number][][] | null>(() => {
    try {
      const saved = localStorage.getItem('ret_ads_polygon_coords');
      if (!saved) return null;
      const parsed = JSON.parse(saved);
      if (parsed && Array.isArray(parsed) && parsed.length > 0 && Array.isArray(parsed[0]) && !Array.isArray(parsed[0][0])) return [parsed];
      return parsed;
    } catch { return null; }
  });
  const [filterAddressIds, setFilterAddressIds] = useState<Set<number>>(() => {
    try {
      const saved = localStorage.getItem('ret_ads_filter_address_ids');
      if (!saved) return new Set();
      const arr = JSON.parse(saved);
      return new Set(Array.isArray(arr) ? arr : []);
    } catch { return new Set(); }
  });

  // JSON текущего полигона — для сравнения в handlePolygonsChange.
  // Если SearchByPolygon возвращает тот же полигон что уже установлен —
  // это восстановление из initialPolygons, а не действие пользователя.
  const polygonsCoordsJsonRef = useRef<string>('null');
  // Синхронизируем ref с state
  polygonsCoordsJsonRef.current = polygonsCoords ? JSON.stringify(polygonsCoords) : 'null';

  // ─── Загрузка данных ───
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [ads, objects] = await Promise.all([
        adsRepository.search({}, 1, 100000),
        db.table<AdObject>('ad_objects').toArray(),
      ]);
      setAllAds(ads.ads);
      // Нормализуем статус: 'archive' → 'archived' (старые записи)
      const normalized = objects.map(o => o.status === 'archive' ? { ...o, status: 'archived' } : o);
      setAllObjects(normalized);
      setTotalAds(ads.total);
    } finally { setLoading(false); }
  }, []);

  const loadStats = useCallback(async () => {
    const [s, count] = await Promise.all([adsRepository.getStats(), adsRepository.count()]);
    setStats(s); setTotalAds(count);
  }, []);

  // Поддерживаем кеш объявлений раскрытых объектов в актуальном состоянии
  // при изменении allAds (после loadData/сохранения), не перезапуская саму загрузку.
  useEffect(() => {
    if (expandedObjects.size === 0) return;
    const sortAds = (arr: Ad[]) =>
      arr.slice().sort((a, b) => {
        const ta = new Date(a.updated || a.created || 0).getTime();
        const tb = new Date(b.updated || b.created || 0).getTime();
        return tb - ta;
      });
    setObjectAds(prev => {
      const next = new Map(prev);
      let changed = false;
      for (const objId of expandedObjects) {
        const ads = sortAds(allAds.filter(a => a.object_id === objId));
        const cur = next.get(objId);
        if (!cur || cur.length !== ads.length || cur.some((a, i) => a.id !== ads[i].id)) {
          next.set(objId, ads);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [allAds, expandedObjects]);

  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => { loadStats(); }, [loadStats]);
  useEffect(() => { ensureListingData(); }, []);
  useEffect(() => {
    getModules().then(data => {
      const active = data.modules.some(m => m.code === 'dealsrosreestr' && m.access?.status === 'active');
      setDealsModuleActive(active);
      // Регионы подписки на модуль ads
      const adsModule = data.modules.find(m => m.code === 'ads' && m.access?.status === 'active');
      if (adsModule?.access?.regions) {
        setSubscriptionRegionCodes(adsModule.access.regions);
      }
    }).catch(() => {});
  }, []);

  // Загрузка кадастровых кварталов (только при активном модуле dealsrosreestr)
  useEffect(() => {
    if (!dealsModuleActive) return;
    cadastralRepository.getAllWithGeojson().then(q => setCadastralQuarters(q)).catch(() => {});
  }, [dealsModuleActive]);

  // Отслеживание завершения импорта — обновление таблицы + toast
  const lastSeenImportStatus = useRef<Record<string, string>>({});
  useEffect(() => {
    const task = importTasks.find(t => t.type === 'ads-import');
    if (!task) return;

    const prev = lastSeenImportStatus.current[task.id];
    lastSeenImportStatus.current[task.id] = task.status;

    // Статус сменился с running → done/error
    if (prev === 'running' && task.status === 'done') {
      loadData();
      loadStats();
      setToast({ message: task.detail || 'Импорт завершён', type: 'success' });
    } else if (prev === 'running' && task.status === 'error') {
      setToast({ message: task.detail || 'Ошибка импорта', type: 'error' });
    }
  }, [importTasks, loadData, loadStats]);

  // Автоскрытие toast
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(timer);
  }, [toast]);

  // Обновление данных после завершения дедупликации
  const lastSeenDedupStatus = useRef<Record<string, string>>({});
  useEffect(() => {
    const task = importTasks.find(t => t.type === 'deduplicate');
    if (!task) return;
    const prev = lastSeenDedupStatus.current[task.id];
    lastSeenDedupStatus.current[task.id] = task.status;
    if (prev === 'running' && (task.status === 'done' || task.status === 'error')) {
      loadData();
      loadStats();
      if (task.status === 'done') {
        setToast({ message: task.detail || 'Дедупликация завершена', type: 'success' });
      }
    }
  }, [importTasks, loadData, loadStats]);

  // Обновление данных после завершения актуализации CIAN
  const lastSeenCianUpdateStatus = useRef<Record<string, string>>({});
  useEffect(() => {
    const task = importTasks.find(t => t.type === 'cian-update');
    if (!task) return;
    const prev = lastSeenCianUpdateStatus.current[task.id];
    lastSeenCianUpdateStatus.current[task.id] = task.status;
    if (prev === 'running' && (task.status === 'done' || task.status === 'error')) {
      loadData();
      loadStats();
      if (task.status === 'done') {
        setToast({ message: task.detail || 'CIAN: актуализация завершена', type: 'success' });
      }
    }
  }, [importTasks, loadData, loadStats]);

  // Обновление данных после завершения актуализации Avito
  const lastSeenAvitoUpdateStatus = useRef<Record<string, string>>({});
  useEffect(() => {
    const task = importTasks.find(t => t.type === 'avito-update');
    if (!task) return;
    const prev = lastSeenAvitoUpdateStatus.current[task.id];
    lastSeenAvitoUpdateStatus.current[task.id] = task.status;
    if (prev === 'running' && (task.status === 'done' || task.status === 'error')) {
      loadData();
      loadStats();
      if (task.status === 'done') {
        setToast({ message: task.detail || 'Avito: актуализация завершена', type: 'success' });
      }
    }
  }, [importTasks, loadData, loadStats]);

  // Обновление данных после завершения поиска сделок
  const lastSeenDealMatchingStatus = useRef<Record<string, string>>({});
  useEffect(() => {
    const task = importTasks.find(t => t.type === 'deal-matching');
    if (!task) return;
    const prev = lastSeenDealMatchingStatus.current[task.id];
    lastSeenDealMatchingStatus.current[task.id] = task.status;
    if (prev === 'running' && (task.status === 'done' || task.status === 'error')) {
      loadData();
      loadStats();
      if (task.status === 'done') {
        setToast({ message: task.detail || 'Поиск сделок завершён', type: 'success' });
      }
    }
  }, [importTasks, loadData, loadStats]);

  // Загрузка адресов и справочников для карты (+ дефолтные данные если пусто)
  useEffect(() => {
    db.table<AdAddress>('ad_addresses').toArray().then(addrs => {
      addrs.sort((a, b) => (a.address || '').localeCompare(b.address || '', 'ru'));
      setAddresses(addrs);
    });

    // Справочники: загрузить, если пустые — заполнить дефолтными значениями
    const loadRef = async (table: string, defaults: ReferenceItem[]) => {
      const t = db.table<ReferenceItem>(table);
      let items = await t.toArray();
      if (items.length === 0 && defaults.length > 0) {
        await t.bulkAdd(defaults);
        items = await t.toArray();
      }
      return items;
    };

    const DEFAULT_WALL_MATERIALS: ReferenceItem[] = [
      { id: undefined as any, server_id: 'brick', name: 'Кирпичный', color: '#ef4444', created_at: '', updated_at: '' },
      { id: undefined as any, server_id: 'panel', name: 'Панельный', color: '#3b82f6', created_at: '', updated_at: '' },
      { id: undefined as any, server_id: 'monolith', name: 'Монолитный', color: '#f59e0b', created_at: '', updated_at: '' },
      { id: undefined as any, server_id: 'block', name: 'Блочный', color: '#8b5cf6', created_at: '', updated_at: '' },
      { id: undefined as any, server_id: 'wood', name: 'Деревянный', color: '#92400e', created_at: '', updated_at: '' },
    ];
    const DEFAULT_HOUSE_SERIES: ReferenceItem[] = [
      { id: undefined as any, server_id: 'khrushchevka', name: 'Хрущёвка', created_at: '', updated_at: '' },
      { id: undefined as any, server_id: 'stalinka', name: 'Сталинка', created_at: '', updated_at: '' },
      { id: undefined as any, server_id: 'brezhnevka', name: 'Брежневка', created_at: '', updated_at: '' },
      { id: undefined as any, server_id: 'modern', name: 'Современная', created_at: '', updated_at: '' },
      { id: undefined as any, server_id: 'improved', name: 'Улучшенная планировка', created_at: '', updated_at: '' },
      { id: undefined as any, server_id: 'individual', name: 'Индивидуальный проект', created_at: '', updated_at: '' },
    ];
    const DEFAULT_HOUSE_CLASSES: ReferenceItem[] = [
      { id: undefined as any, server_id: 'economy', name: 'Эконом', created_at: '', updated_at: '' },
      { id: undefined as any, server_id: 'comfort', name: 'Комфорт', created_at: '', updated_at: '' },
      { id: undefined as any, server_id: 'comfort_plus', name: 'Комфорт+', created_at: '', updated_at: '' },
      { id: undefined as any, server_id: 'business', name: 'Бизнес', created_at: '', updated_at: '' },
      { id: undefined as any, server_id: 'elite', name: 'Элитное', created_at: '', updated_at: '' },
    ];
    const DEFAULT_CEILING_MATERIALS: ReferenceItem[] = [
      { id: undefined as any, server_id: 'reinforced_concrete', name: 'Железобетонное', created_at: '', updated_at: '' },
      { id: undefined as any, server_id: 'wooden', name: 'Деревянное', created_at: '', updated_at: '' },
      { id: undefined as any, server_id: 'metal', name: 'Металлическое', created_at: '', updated_at: '' },
    ];
    const DEFAULT_HOUSE_PROBLEMS: ReferenceItem[] = [
      { id: undefined as any, server_id: 'emergency', name: 'Аварийный', color: '#ef4444', created_at: '', updated_at: '' },
      { id: undefined as any, server_id: 'struts', name: 'На стяжках', color: '#f59e0b', created_at: '', updated_at: '' },
      { id: undefined as any, server_id: 'renovation', name: 'Под реновацию', color: '#8b5cf6', created_at: '', updated_at: '' },
      { id: undefined as any, server_id: 'bad_entrance', name: 'Плохое состояние подъездов', color: '#f97316', created_at: '', updated_at: '' },
    ];

    loadRef('ad_wall_materials', DEFAULT_WALL_MATERIALS).then(setRefWallMaterials);
    loadRef('ad_house_series', DEFAULT_HOUSE_SERIES).then(setRefHouseSeries);
    loadRef('ad_house_classes', DEFAULT_HOUSE_CLASSES).then(setRefHouseClasses);
    loadRef('ad_ceiling_materials', DEFAULT_CEILING_MATERIALS).then(setRefCeilingMaterials);
    loadRef('ad_house_problems', DEFAULT_HOUSE_PROBLEMS).then(setRefHouseProblems);
  }, []);

  // Статистика объектов/объявлений по адресам (для маркеров на карте)
  // Объявления без адреса с координатами — для слоя на карте
  const adsWithoutAddress = useMemo(() => {
    return allAds
      .filter(a => !a.address_id && a.coordinates?.lat != null && a.coordinates?.lng != null)
      .map(a => ({
        id: a.id,
        title: a.title || a.name || '',
        address: a.address || '',
        source: a.source || '',
        price: a.price ?? null,
        coordinates: { lat: a.coordinates.lat, lng: a.coordinates.lng },
      }));
  }, [allAds]);

  const addressStatsMap = useMemo(() => {
    const statsMap: Record<number, { objects: number; listings: number }> = {};
    for (const obj of allObjects) {
      if (obj.address_id) {
        if (!statsMap[obj.address_id]) statsMap[obj.address_id] = { objects: 0, listings: 0 };
        statsMap[obj.address_id].objects++;
      }
    }
    for (const ad of allAds) {
      if (ad.address_id) {
        if (!statsMap[ad.address_id]) statsMap[ad.address_id] = { objects: 0, listings: 0 };
        statsMap[ad.address_id].listings++;
      }
    }
    return statsMap;
  }, [allAds, allObjects]);

  // Загрузка данных + регион подписки
  useEffect(() => {
    (async () => {
      // Восстановление последнего состояния фильтров
      try {
        const lastFilter = localStorage.getItem('ret_ads_last_filter');
        if (lastFilter) {
          const parsed = JSON.parse(lastFilter);
          applyFilterState(parsed);
        }
      } catch {}
      // Данные загружаются через сервер Неоценка, прямой API ключ не нужен
    })();
  }, []);

  // ─── Сохранение фильтров ───
  const getFilterState = useCallback(() => ({
    sources: filterSources, propertyTypes: filterPropertyTypes, categoryIds: filterCategoryIds,
    priceMin: filterPriceMin, priceMax: filterPriceMax,
    areaMin: filterAreaMin, areaMax: filterAreaMax,
    floorMin: filterFloorMin, floorMax: filterFloorMax,
    yearMin: filterYearMin, yearMax: filterYearMax,
    sellerTypes: filterSellerTypes, status: filterStatus,
    dateFrom: filterDateFrom, dateTo: filterDateTo,
    searchQuery,
    processingStatus: filterProcessingStatus, addressId: filterAddressId, contactType: filterContactType,
    processingCategoryId: filterProcessingCategoryId, processingFloor: filterProcessingFloor,
    filterAddressIds: [...filterAddressIds],
    excludedAddressIds: [...excludedAddressIds],
    polygonsCoords,
    houseSeriesIds: filterHouseSeriesIds,
    wallMaterialIds: filterWallMaterialIds,
    floorsMin: filterFloorsMin, floorsMax: filterFloorsMax,
  }), [filterSources, filterPropertyTypes, filterCategoryIds, filterPriceMin, filterPriceMax, filterAreaMin, filterAreaMax,
    filterFloorMin, filterFloorMax, filterYearMin, filterYearMax, filterSellerTypes, filterStatus,
    filterDateFrom, filterDateTo, searchQuery, filterProcessingStatus, filterAddressId, filterContactType,
    filterProcessingCategoryId, filterProcessingFloor, filterAddressIds, excludedAddressIds, polygonsCoords,
    filterHouseSeriesIds, filterWallMaterialIds, filterFloorsMin, filterFloorsMax]);

  const applyFilterState = useCallback((state: Record<string, unknown>) => {
    setFilterSources((state.sources as string[]) || []);
    setFilterPropertyTypes((state.propertyTypes as string[]) || []);
    setFilterCategoryIds((state.categoryIds as number[]) || []);
    setFilterPriceMin((state.priceMin as string) || '');
    setFilterPriceMax((state.priceMax as string) || '');
    setFilterAreaMin((state.areaMin as string) || '');
    setFilterAreaMax((state.areaMax as string) || '');
    setFilterFloorMin((state.floorMin as string) || '');
    setFilterFloorMax((state.floorMax as string) || '');
    setFilterYearMin((state.yearMin as string) || '');
    setFilterYearMax((state.yearMax as string) || '');
    setFilterSellerTypes((state.sellerTypes as string[]) || []);
    setFilterStatus((state.status as 'active' | 'archived' | '') || '');
    setFilterDateFrom((state.dateFrom as string) || '');
    setFilterDateTo((state.dateTo as string) || '');
    setSearchQuery((state.searchQuery as string) || '');
    setFilterProcessingStatus((state.processingStatus as string) || '');
    setFilterAddressId((state.addressId as number | '') ?? '');
    setFilterContactType((state.contactType as string) || '');
    setFilterProcessingCategoryId((state.processingCategoryId as number | '') ?? '');
    setFilterProcessingFloor((state.processingFloor as string) || '');
    // Восстановление адресного фильтра
    const savedAddrIds = state.filterAddressIds as number[] | undefined;
    if (savedAddrIds && Array.isArray(savedAddrIds)) {
      const ids = new Set(savedAddrIds);
      setFilterAddressIds(ids);
      localStorage.setItem('ret_ads_filter_address_ids', JSON.stringify([...ids]));
    } else {
      setFilterAddressIds(new Set());
      localStorage.removeItem('ret_ads_filter_address_ids');
    }
    const savedPolygons = state.polygonsCoords as [number, number][][] | null | undefined;
    if (savedPolygons && savedPolygons.length > 0) {
      setPolygonsCoords(savedPolygons);
      localStorage.setItem('ret_ads_polygon_coords', JSON.stringify(savedPolygons));
    } else {
      setPolygonsCoords(null);
      localStorage.removeItem('ret_ads_polygon_coords');
    }
    // Восстановление исключённых адресов
    const savedExcluded = state.excludedAddressIds as number[] | undefined;
    if (savedExcluded && Array.isArray(savedExcluded)) {
      const ids = new Set(savedExcluded);
      setExcludedAddressIds(ids);
      localStorage.setItem('ret_ads_excluded_address_ids', JSON.stringify([...ids]));
    } else {
      setExcludedAddressIds(new Set());
      localStorage.removeItem('ret_ads_excluded_address_ids');
    }
    // Восстановление фильтров по серии, материалу стен и этажности дома
    setFilterHouseSeriesIds((state.houseSeriesIds as string[]) || []);
    setFilterWallMaterialIds((state.wallMaterialIds as string[]) || []);
    setFilterFloorsMin((state.floorsMin as string) || '');
    setFilterFloorsMax((state.floorsMax as string) || '');
  }, []);

  // Автосохранение фильтров при любом изменении (пропускаем первый рендер)
  const filterSaveReady = useRef(false);
  useEffect(() => {
    if (!filterSaveReady.current) {
      filterSaveReady.current = true;
      return;
    }
    try {
      const state = getFilterState();
      localStorage.setItem('ret_ads_last_filter', JSON.stringify(state));
    } catch {}
  }, [getFilterState]);

  // Ref для отложенной установки activeFilterStateJson после рендера
  const pendingFilterSnapshot = useRef<string | null>(null);

  // После рендера — снимаем snapshot реального состояния фильтра
  useEffect(() => {
    if (pendingFilterSnapshot.current !== null) {
      // Задержка чтобы SearchByPolygon успел обработать новый initialPolygons
      // и вызвать handlePolygonsChange, который может изменить polygonsCoords
      const timer = setTimeout(() => {
        setActiveFilterStateJson(JSON.stringify(getFilterState()));
        pendingFilterSnapshot.current = null;
      }, 600);
      return () => clearTimeout(timer);
    }
  });

  const handleApplySavedFilter = (state: Record<string, unknown>, filterId?: string, filterName?: string, _groupName?: string) => {
    applyFilterState(state);
    setActiveFilterId(filterId ?? null);
    setActiveFilterName(filterName ?? null);
    // Откладываем snapshot до следующего рендера, когда все setState'ы применятся
    pendingFilterSnapshot.current = filterId ? 'pending' : null;
    setActiveFilterStateJson(null); // временно null, чтобы не мигало
  };

  // Поля фильтра обработки — не участвуют в отслеживании изменений сохранённого фильтра
  const PROCESSING_FILTER_KEYS = ['processingStatus', 'addressId', 'contactType', 'processingCategoryId', 'processingFloor'];

  // Убираем из состояния поля фильтра обработки для сравнения
  const stripProcessingFields = (state: Record<string, unknown>) => {
    const copy = { ...state };
    for (const key of PROCESSING_FILTER_KEYS) delete copy[key];
    return copy;
  };

  // Проверяем, изменился ли активный фильтр (без учёта полей фильтра обработки)
  const filterChanged = useMemo(() => {
    if (!activeFilterId || !activeFilterStateJson) return false;
    const current = getFilterState();
    const currentStripped = stripProcessingFields(current);
    const savedStripped = stripProcessingFields(JSON.parse(activeFilterStateJson));
    return JSON.stringify(currentStripped) !== JSON.stringify(savedStripped);
  }, [activeFilterId, activeFilterStateJson, getFilterState]);

  const handleSaveToActiveFilter = () => {
    if (!activeFilterId) return;
    const currentState = getFilterState();
    const STORAGE_KEY = 'ret_ads_saved_filters_v2';
    chrome.storage.local.get(STORAGE_KEY, (result: any) => {
      const raw = result?.[STORAGE_KEY];
      if (!raw) return;
      try {
        const filters = JSON.parse(raw);
        const updated = filters.map((f: any) =>
          f.id === activeFilterId ? { ...f, state: currentState } : f
        );
        chrome.storage.local.set({ [STORAGE_KEY]: JSON.stringify(updated) });
        const target = updated.find((f: any) => f.id === activeFilterId);
        if (target?.serverId) {
          import('@/services/api-service').then(api => {
            api.updateSavedFilter(target.serverId, {
              filter_data: currentState as unknown as Record<string, unknown>,
            }).catch(() => {});
          });
        }
      } catch {}
    });
    setActiveFilterStateJson(JSON.stringify(currentState));
  };

  const handleCancelFilterChanges = () => {
    if (!activeFilterStateJson) return;
    // Сохраняем текущие значения полей фильтра обработки (они не сбрасываются)
    const currentProcessingStatus = filterProcessingStatus;
    const currentAddressId = filterAddressId;
    const currentContactType = filterContactType;
    const currentProcessingCategoryId = filterProcessingCategoryId;
    const currentProcessingFloor = filterProcessingFloor;
    const savedState = JSON.parse(activeFilterStateJson);
    applyFilterState(savedState);
    // Восстанавливаем поля фильтра обработки, т.к. они не являются частью сохранённого фильтра
    setFilterProcessingStatus(currentProcessingStatus);
    setFilterAddressId(currentAddressId);
    setFilterContactType(currentContactType);
    setFilterProcessingCategoryId(currentProcessingCategoryId);
    setFilterProcessingFloor(currentProcessingFloor);
  };

  // ─── Доступные серии домов (только из релевантных адресов) ───
  const availableHouseSeries = useMemo(() => {
    if (filterAddressIds.size === 0) return [];
    const relevantAddresses = addresses.filter(a => a.id != null && filterAddressIds.has(a.id));
    const usedIds = new Set(
      relevantAddresses.map(a => a.house_series_id).filter(Boolean) as string[]
    );
    return refHouseSeries.filter(s => s.server_id && usedIds.has(s.server_id));
  }, [refHouseSeries, addresses, filterAddressIds]);

  // ─── Доступные материалы стен (только из релевантных адресов) ───
  const availableWallMaterials = useMemo(() => {
    if (filterAddressIds.size === 0) return [];
    const relevantAddresses = addresses.filter(a => a.id != null && filterAddressIds.has(a.id));
    const usedIds = new Set(
      relevantAddresses.map(a => a.wall_material_id).filter(Boolean) as string[]
    );
    return refWallMaterials.filter(s => s.server_id && usedIds.has(s.server_id));
  }, [refWallMaterials, addresses, filterAddressIds]);

  // ─── Адреса, подходящие под все адресные фильтры (полигон + серия + материал + этажность, без excluded) ───
  const highlightedAddressIds = useMemo(() => {
    const hasAddrFilters = filterHouseSeriesIds.length > 0 || filterWallMaterialIds.length > 0 || !!filterFloorsMin || !!filterFloorsMax;
    // Без доп.фильтров — все активные (не excluded) адреса пула
    const activePool = filterAddressIds.size > 0
      ? [...filterAddressIds].filter(id => !excludedAddressIds.has(id))
      : [];
    const activeSet = new Set(activePool);
    if (!hasAddrFilters) return activeSet;

    const result = new Set<number>();
    const pool = addresses.filter(a => a.id != null && activeSet.has(a.id));
    for (const addr of pool) {
      if (filterHouseSeriesIds.length > 0 && (!addr.house_series_id || !filterHouseSeriesIds.includes(addr.house_series_id))) continue;
      if (filterWallMaterialIds.length > 0 && (!addr.wall_material_id || !filterWallMaterialIds.includes(addr.wall_material_id))) continue;
      if (filterFloorsMin && (!addr.floors_count || addr.floors_count < Number(filterFloorsMin))) continue;
      if (filterFloorsMax && (!addr.floors_count || addr.floors_count > Number(filterFloorsMax))) continue;
      if (addr.id != null) result.add(addr.id);
    }
    return result;
  }, [filterAddressIds, excludedAddressIds, addresses, filterHouseSeriesIds, filterWallMaterialIds, filterFloorsMin, filterFloorsMax]);

  // ─── Пересчёт адресов в полигоне при загрузке/изменении адресов ───
  // handlePolygonsChange может вызваться до загрузки адресов, и filterAddressIds останется пустым.
  // Этот эффект пересчитывает адреса при появлении данных.
  useEffect(() => {
    if (!polygonsCoords || polygonsCoords.length === 0 || addresses.length === 0) return;
    const ids = new Set<number>();
    for (const addr of addresses) {
      const lat = addr.coordinates.lat;
      const lng = addr.coordinates.lng;
      if (lat != null && lng != null && isFinite(lat) && isFinite(lng) && polygonsCoords.some(poly => pointInPolygon(lat, lng, poly))) {
        if (addr.id != null) ids.add(addr.id);
      }
    }
    // Обновляем только если набор изменился
    const current = filterAddressIds;
    if (current.size !== ids.size || [...ids].some(id => !current.has(id))) {
      setFilterAddressIds(ids);
      localStorage.setItem('ret_ads_filter_address_ids', JSON.stringify([...ids]));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addresses, polygonsCoords]);

  // ─── Фильтрация ───
  // Базовый фильтр: основной фильтр + полигон + серия/материал/этажность.
  // НЕ включает «Фильтр обработки» — используется для счётчиков панели «Обработка объявлений».
  const baseFilteredAds = useMemo(() => {
    let result = allAds;

    // Основной фильтр
    if (filterStatus) result = result.filter(a => a.status === filterStatus);
    if (filterSources.length > 0) result = result.filter(a => filterSources.includes(normalizeSource(a.source)));
    if (filterPropertyTypes.length > 0) result = result.filter(a => filterPropertyTypes.includes(a.property_type));
    if (filterCategoryIds.length > 0) result = result.filter(a => a.category_id != null && filterCategoryIds.includes(a.category_id));
    if (filterPriceMin) result = result.filter(a => a.price != null && a.price >= Number(filterPriceMin));
    if (filterPriceMax) result = result.filter(a => a.price != null && a.price <= Number(filterPriceMax));
    if (filterAreaMin) result = result.filter(a => a.area_total != null && a.area_total >= Number(filterAreaMin));
    if (filterAreaMax) result = result.filter(a => a.area_total != null && a.area_total <= Number(filterAreaMax));
    if (filterFloorMin) result = result.filter(a => a.floor != null && a.floor >= Number(filterFloorMin));
    if (filterFloorMax) result = result.filter(a => a.floor != null && a.floor <= Number(filterFloorMax));
    if (filterYearMin) result = result.filter(a => { const y = a.year_built ?? a.house_details?.build_year; return y != null && y >= Number(filterYearMin); });
    if (filterYearMax) result = result.filter(a => { const y = a.year_built ?? a.house_details?.build_year; return y != null && y <= Number(filterYearMax); });
    if (filterSellerTypes.length > 0) result = result.filter(a => filterSellerTypes.includes(a.seller_info?.type || a.seller_type));
    if (filterDateFrom) result = result.filter(a => a.created && new Date(a.created) >= new Date(filterDateFrom));
    if (filterDateTo) result = result.filter(a => a.created && new Date(a.created) <= new Date(filterDateTo + 'T23:59:59'));
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(a => (a.address || '').toLowerCase().includes(q) || (a.title || '').toLowerCase().includes(q));
    }

    // Фильтр по полигону: через адрес (если есть) или по координатам самого объявления
    if (polygonsCoords && polygonsCoords.length > 0) {
      result = result.filter(a => {
        if (a.address_id != null) {
          // Для объявлений с адресом — проверяем через фильтр адресов полигона
          return filterAddressIds.has(a.address_id) && !excludedAddressIds.has(a.address_id);
        }
        // Для объявлений без адреса — проверяем собственные координаты
        const lat = a.coordinates?.lat;
        const lng = a.coordinates?.lng;
        if (lat == null || lng == null || !isFinite(lat) || !isFinite(lng)) return false;
        return polygonsCoords.some(poly => pointInPolygon(lat, lng, poly));
      });
    }

    // Фильтр по серии дома, материалу стен и этажности (через адрес)
    if (filterHouseSeriesIds.length > 0 || filterWallMaterialIds.length > 0 || filterFloorsMin || filterFloorsMax) {
      const addrMap = new Map<number, AdAddress>();
      for (const addr of addresses) { if (addr.id != null) addrMap.set(addr.id, addr); }
      result = result.filter(a => {
        if (!a.address_id) return false;
        const addr = addrMap.get(a.address_id);
        if (!addr) return false;
        if (filterHouseSeriesIds.length > 0 && (!addr.house_series_id || !filterHouseSeriesIds.includes(addr.house_series_id))) return false;
        if (filterWallMaterialIds.length > 0 && (!addr.wall_material_id || !filterWallMaterialIds.includes(addr.wall_material_id))) return false;
        if (filterFloorsMin && (!addr.floors_count || addr.floors_count < Number(filterFloorsMin))) return false;
        if (filterFloorsMax && (!addr.floors_count || addr.floors_count > Number(filterFloorsMax))) return false;
        return true;
      });
    }

    return result;
  }, [allAds, filterStatus, filterSources, filterPropertyTypes, filterCategoryIds, filterPriceMin, filterPriceMax,
    filterAreaMin, filterAreaMax, filterFloorMin, filterFloorMax, filterYearMin, filterYearMax,
    filterSellerTypes, filterDateFrom, filterDateTo, searchQuery,
    filterAddressIds, excludedAddressIds, addresses, filterHouseSeriesIds, filterWallMaterialIds, filterFloorsMin, filterFloorsMax, polygonsCoords]);

  // filteredAds = baseFilteredAds + «Фильтр обработки» (только для таблицы ручной обработки)
  const filteredAds = useMemo(() => {
    let result = baseFilteredAds;

    // Фильтр обработки: «Определить адрес» — показывает address_needed + low/very_low confidence
    if (filterProcessingStatus === 'address_needed') {
      result = result.filter(a =>
        a.processing_status === 'address_needed' ||
        (a.address_id && (a.address_match_confidence === 'low' || a.address_match_confidence === 'very_low'))
      );
    } else if (filterProcessingStatus === 'duplicate_check_needed') {
      result = result.filter(a => a.processing_status === 'duplicate_check_needed' && !a.object_id);
    } else if (filterProcessingStatus) {
      result = result.filter(a => a.processing_status === filterProcessingStatus);
    }
    if (filterAddressId) result = result.filter(a => a.address_id === filterAddressId);
    if (filterContactType) result = result.filter(a => (a.seller_info?.type || a.seller_type) === filterContactType);
    if (filterProcessingCategoryId) result = result.filter(a => a.category_id === filterProcessingCategoryId);
    if (filterProcessingFloor) result = result.filter(a => a.floor != null && a.floor === Number(filterProcessingFloor));

    return result;
  }, [baseFilteredAds, filterProcessingStatus, filterAddressId, filterContactType, filterProcessingCategoryId, filterProcessingFloor]);

  // Данные для графика распределения площадей объявлений
  const areaChartData = useMemo(() => {
    // Группируем по property_type
    const byCategory = new Map<string, { area: number }[]>();
    let globalMin = Infinity, globalMax = -Infinity;
    let total = 0;
    for (const a of filteredAds) {
      if (a.area_total == null || a.area_total <= 0) continue;
      const pt = a.property_type || 'unknown';
      if (!byCategory.has(pt)) byCategory.set(pt, []);
      byCategory.get(pt)!.push({ area: a.area_total });
      if (a.area_total < globalMin) globalMin = a.area_total;
      if (a.area_total > globalMax) globalMax = a.area_total;
      total++;
    }
    if (total === 0) return null;
    return {
      byCategory,
      min: globalMin,
      max: globalMax,
      count: total,
      filterMin: filterAreaMin ? Number(filterAreaMin) : null,
      filterMax: filterAreaMax ? Number(filterAreaMax) : null,
    };
  }, [filteredAds, filterAreaMin, filterAreaMax]);

  // Базовый фильтр объектов: основной фильтр + полигон + серия/материал + фильтр по ads.
  // НЕ включает «Фильтр обработки» — используется для счётчиков и запусков в панели «Обработка объявлений».
  const baseFilteredObjects = useMemo(() => {
    let result = allObjects;
    if (filterStatus) result = result.filter(o => o.status === filterStatus);
    if (filterPropertyTypes.length > 0) result = result.filter(o => o.property_type && filterPropertyTypes.includes(o.property_type));
    if (filterPriceMin) result = result.filter(o => o.current_price != null && o.current_price >= Number(filterPriceMin));
    if (filterPriceMax) result = result.filter(o => o.current_price != null && o.current_price <= Number(filterPriceMax));
    if (filterAreaMin) result = result.filter(o => o.area_total != null && o.area_total >= Number(filterAreaMin));
    if (filterAreaMax) result = result.filter(o => o.area_total != null && o.area_total <= Number(filterAreaMax));
    if (filterFloorMin) result = result.filter(o => o.floor != null && o.floor >= Number(filterFloorMin));
    if (filterFloorMax) result = result.filter(o => o.floor != null && o.floor <= Number(filterFloorMax));
    if (filterAddressIds.size > 0) result = result.filter(o => o.address_id != null && filterAddressIds.has(o.address_id) && !excludedAddressIds.has(o.address_id));
    if (filterHouseSeriesIds.length > 0 || filterWallMaterialIds.length > 0 || filterFloorsMin || filterFloorsMax) {
      const addrMap = new Map<number, AdAddress>();
      for (const addr of addresses) { if (addr.id != null) addrMap.set(addr.id, addr); }
      result = result.filter(o => {
        if (!o.address_id) return false;
        const addr = addrMap.get(o.address_id);
        if (!addr) return false;
        if (filterHouseSeriesIds.length > 0 && (!addr.house_series_id || !filterHouseSeriesIds.includes(addr.house_series_id))) return false;
        if (filterWallMaterialIds.length > 0 && (!addr.wall_material_id || !filterWallMaterialIds.includes(addr.wall_material_id))) return false;
        if (filterFloorsMin && (!addr.floors_count || addr.floors_count < Number(filterFloorsMin))) return false;
        if (filterFloorsMax && (!addr.floors_count || addr.floors_count > Number(filterFloorsMax))) return false;
        return true;
      });
    }

    // Фильтрация по объявлениям объекта (без filterContactType/filterProcessingCategoryId — это «Фильтр обработки»)
    const needsAdFilter = filterSources.length > 0
      || filterCategoryIds.length > 0
      || filterYearMin || filterYearMax
      || filterSellerTypes.length > 0
      || filterDateFrom || filterDateTo
      || searchQuery;

    if (needsAdFilter) {
      // Мапа: objectId → его ads
      const objAdsMap = new Map<number, Ad[]>();
      for (const ad of allAds) {
        if (ad.object_id) {
          let arr = objAdsMap.get(ad.object_id);
          if (!arr) { arr = []; objAdsMap.set(ad.object_id, arr); }
          arr.push(ad);
        }
      }
      result = result.filter(obj => {
        if (!obj.id) return false;
        const objAds = objAdsMap.get(obj.id);
        if (!objAds || objAds.length === 0) return false;
        // Объект проходит, если хотя бы одно его объявление проходит фильтр
        return objAds.some(ad => {
          if (filterSources.length > 0 && !filterSources.includes(normalizeSource(ad.source))) return false;
          if (filterCategoryIds.length > 0 && (ad.category_id == null || !filterCategoryIds.includes(ad.category_id))) return false;
          if (filterYearMin) { const y = ad.year_built ?? ad.house_details?.build_year; if (y == null || y < Number(filterYearMin)) return false; }
          if (filterYearMax) { const y = ad.year_built ?? ad.house_details?.build_year; if (y == null || y > Number(filterYearMax)) return false; }
          if (filterSellerTypes.length > 0 && !filterSellerTypes.includes(ad.seller_info?.type || ad.seller_type)) return false;
          if (filterDateFrom && (!ad.created || new Date(ad.created) < new Date(filterDateFrom))) return false;
          if (filterDateTo && (!ad.created || new Date(ad.created) > new Date(filterDateTo + 'T23:59:59'))) return false;
          if (searchQuery) {
            const q = searchQuery.toLowerCase();
            if (!(ad.address || '').toLowerCase().includes(q) && !(ad.title || '').toLowerCase().includes(q)) return false;
          }
          return true;
        });
      });
    }

    return result;
  }, [allObjects, allAds, filterStatus, filterPropertyTypes, filterPriceMin, filterPriceMax,
    filterAreaMin, filterAreaMax, filterFloorMin, filterFloorMax,
    filterAddressIds, excludedAddressIds, addresses,
    filterHouseSeriesIds, filterWallMaterialIds, filterFloorsMin, filterFloorsMax,
    filterSources, filterCategoryIds, filterYearMin, filterYearMax,
    filterSellerTypes, filterDateFrom, filterDateTo, searchQuery]);

  // filteredObjects = baseFilteredObjects + «Фильтр обработки» (для таблицы ручной обработки)
  const filteredObjects = useMemo(() => {
    // При фильтре статуса обработки показываем только отдельные объявления, без объектов
    if (filterProcessingStatus === 'address_needed' || filterProcessingStatus === 'duplicate_check_needed') return [];
    let result = baseFilteredObjects;
    if (filterAddressId) result = result.filter(o => o.address_id === filterAddressId);
    if (filterProcessingFloor) result = result.filter(o => o.floor != null && o.floor === Number(filterProcessingFloor));

    // Дополнительная фильтрация через ads: filterContactType, filterProcessingCategoryId
    if (filterContactType || filterProcessingCategoryId) {
      const objAdsMap = new Map<number, Ad[]>();
      for (const ad of allAds) {
        if (ad.object_id) {
          let arr = objAdsMap.get(ad.object_id);
          if (!arr) { arr = []; objAdsMap.set(ad.object_id, arr); }
          arr.push(ad);
        }
      }
      result = result.filter(obj => {
        if (!obj.id) return false;
        const objAds = objAdsMap.get(obj.id);
        if (!objAds || objAds.length === 0) return false;
        return objAds.some(ad => {
          if (filterContactType && (ad.seller_info?.type || ad.seller_type) !== filterContactType) return false;
          if (filterProcessingCategoryId && ad.category_id !== filterProcessingCategoryId) return false;
          return true;
        });
      });
    }

    return result;
  }, [baseFilteredObjects, allAds, filterProcessingStatus, filterAddressId, filterProcessingFloor, filterContactType, filterProcessingCategoryId]);

  // ─── Расчёт позиций на рынке («низ рынка», p15) ───
  const [lowMarketMap, setLowMarketMap] = useState<Map<number, MarketPosition>>(new Map());
  const [lowMarketObjectMap, setLowMarketObjectMap] = useState<Map<number, MarketPosition>>(new Map());
  useEffect(() => {
    // Защита: если инвест-фильтр включён, но полигон отсутствует — выключаем,
    // иначе bulk-расчёт пойдёт по всей базе через fallback на радиус и повесит страницу.
    // Срабатывает в т.ч. при рассинхроне состояния из localStorage.
    if (showLowMarket && (!polygonsCoords || polygonsCoords.length === 0)) {
      setShowLowMarket(false);
      setLowMarketOnly(false);
      setShowLowMarketSettings(false);
      setLowMarketMap(new Map());
      setLowMarketObjectMap(new Map());
      setLowMarketComputing(false);
      return;
    }
    if (!showLowMarket) {
      setLowMarketMap(new Map());
      setLowMarketObjectMap(new Map());
      setLowMarketComputing(false);
      return;
    }
    setLowMarketComputing(true);
    // Откладываем на следующий tick, чтобы UI показал «считаем...»
    const timer = setTimeout(() => {
      const result = calculateMarketPositionsBulk(baseFilteredAds, allAds, addresses, lowMarketOptions, polygonsCoords);
      setLowMarketMap(result);

      // Также считаем позиции для объектов: строим псевдо-объявление из характеристик объекта
      // Координаты берём из привязанного адреса или первого объявления объекта
      const addrMap = new Map<number, AdAddress>();
      for (const a of addresses) if (a.id != null) addrMap.set(a.id, a);

      // Предрассчитываем координаты из объявлений объектов (fallback для объектов без адреса).
      // Используем baseFilteredAds вместо objectAds, чтобы не зависеть от раскрытия объектов.
      const objCoordsFromAds = new Map<number, { lat: number; lng: number }>();
      for (const a of baseFilteredAds) {
        if (a.object_id == null) continue;
        if (objCoordsFromAds.has(a.object_id)) continue;
        const la = a.coordinates?.lat;
        const ln = a.coordinates?.lng;
        if (la != null && ln != null) objCoordsFromAds.set(a.object_id, { lat: la, lng: ln });
      }

      const objectPseudoAds: Ad[] = baseFilteredObjects
        .filter(o => o.id != null && o.price_per_meter != null && o.price_per_meter > 0)
        .map(o => {
          // Ищем координаты и характеристики дома в адресе объекта или в его объявлениях
          const objAddr = o.address_id != null ? addrMap.get(o.address_id) : null;
          let coords: { lat: number | null; lng: number | null } = { lat: null, lng: null };
          if (objAddr?.coordinates?.lat != null && objAddr?.coordinates?.lng != null) {
            coords = { lat: objAddr.coordinates.lat, lng: objAddr.coordinates.lng };
          }
          if (coords.lat == null) {
            const c = objCoordsFromAds.get(o.id!);
            if (c) coords = c;
          }
          const objHouseType = objAddr?.house_type ?? '';
          const objBuildYear = objAddr?.build_year ?? null;
          return {
            id: -(o.id!), // отрицательный id чтобы не пересекался с реальными объявлениями
            external_id: `obj-${o.id}`,
            source: 'object',
            url: '',
            segment_id: null,
            object_id: o.id!,
            dedup_score: null,
            title: '', name: '', description: '', address: '',
            coordinates: coords,
            property_type: o.property_type || '',
            area_total: o.area_total,
            area_living: o.area_living,
            area_kitchen: o.area_kitchen,
            floor: o.floor,
            floors_total: o.floors_total,
            rooms: o.rooms,
            house_type: objHouseType,
            condition: '',
            year_built: objBuildYear,
            has_balcony: null,
            bathroom_type: '',
            ceiling_height: null,
            price: o.current_price,
            price_per_meter: o.price_per_meter,
            price_history: o.price_history,
            photos: [],
            photos_count: 0,
            seller_name: '',
            seller_type: '',
            phone: '',
            seller_info: { name: null, type: null, is_agent: false, phone: null, phone_protected: null },
            status: 'active',
            processing_status: 'processed',
            address_id: o.address_id,
            address_match_confidence: null,
            address_match_method: null,
            address_match_score: null,
            address_distance: null,
            region_id: null,
            city_id: null,
            metro_id: null,
            operation_type: null,
            section_id: null,
            category_id: null,
            original_source_id: null,
            is_new_building: null,
            is_apartments: null,
            house_details: { build_year: objBuildYear, cargo_lifts: null, passenger_lifts: null, material: objHouseType || null },
            renovation_type: null,
            bathroom_details: null,
            balcony_details: null,
            views_count: null,
            is_premium: false,
            parsing_errors: [],
            created_at: o.created_at,
            updated_at: o.updated_at,
            created: o.created,
            updated: o.updated,
            parsed_at: null,
            source_metadata: { original_source: null, source_method: null, original_id: null, source_internal_id: null, import_date: '', last_sync_date: null, sync_errors: [] },
          };
        });

      const objectResult = calculateMarketPositionsBulk(objectPseudoAds, allAds, addresses, lowMarketOptions, polygonsCoords);
      // Перенумеруем ключи обратно в положительные id объектов
      const remapped = new Map<number, MarketPosition>();
      for (const [negId, pos] of objectResult) {
        remapped.set(-negId, pos);
      }
      setLowMarketObjectMap(remapped);
      setLowMarketComputing(false);
    }, 50);
    return () => clearTimeout(timer);
  }, [showLowMarket, baseFilteredAds, allAds, baseFilteredObjects, addresses, lowMarketOptions, polygonsCoords]);

  // Множество id объявлений «низа рынка» для быстрой проверки в renderRow
  const lowMarketAdIds = useMemo(() => {
    const set = new Set<number>();
    for (const [id, pos] of lowMarketMap) if (pos.isLowMarket) set.add(id);
    return set;
  }, [lowMarketMap]);

  // Множество id объектов «низа рынка»
  const lowMarketObjectIds = useMemo(() => {
    const set = new Set<number>();
    for (const [id, pos] of lowMarketObjectMap) if (pos.isLowMarket) set.add(id);
    return set;
  }, [lowMarketObjectMap]);

  // Количество подсвеченных (для тултипа на кнопке)
  const lowMarketCount = lowMarketAdIds.size + lowMarketObjectIds.size;

  // ─── Строки таблицы ───
  const tableRows = useMemo(() => {
    const rows: TableRow[] = [];

    // Нормализация статуса: 'archive' → 'archived' (расхождение в ad-object-utils.ts vs batch-update-services)
    const normalize = (s: string | null | undefined): string =>
      s === 'archive' ? 'archived' : (s ?? '');

    // Локальный фильтр статуса для строк (Ad и AdObject)
    const statusMatches = (s: string | null | undefined): boolean =>
      localStatusFilter === 'all' || normalize(s) === localStatusFilter;

    const objectAdIds = new Set(allAds.filter(a => a.object_id).map(a => a.id));

    if (showLowMarket && lowMarketOnly) {
      // Режим «Только низ»: показываем только объекты и объявления с бейджем.
      // Берём объявления из allAds напрямую, т.к. objectAds может быть ещё не загружен.
      const adsByObject = new Map<number, Ad[]>();
      for (const a of allAds) {
        if (a.object_id == null) continue;
        if (!adsByObject.has(a.object_id)) adsByObject.set(a.object_id, []);
        adsByObject.get(a.object_id)!.push(a);
      }

      for (const obj of filteredObjects) {
        if (!statusMatches(obj.status)) continue;
        if (!lowMarketObjectIds.has(obj.id!)) continue;
        const objAds = adsByObject.get(obj.id!) || [];
        rows.push({ kind: 'object', data: obj });
        if (expandedObjects.has(obj.id!)) {
          for (const ad of objAds) {
            if (!statusMatches(ad.status)) continue;
            rows.push({ kind: 'expanded_ad', data: ad, parentObjectId: obj.id! });
          }
        }
      }
      // Standalone low-market ads (без объекта)
      for (const ad of filteredAds) {
        if (!statusMatches(ad.status)) continue;
        if (objectAdIds.has(ad.id)) continue;
        if (lowMarketAdIds.has(ad.id!)) {
          rows.push({ kind: 'ad', data: ad });
        }
      }
    } else {
      // Обычный режим
      for (const obj of filteredObjects) {
        if (!statusMatches(obj.status)) continue;
        const objAds = objectAds.get(obj.id!) || [];
        rows.push({ kind: 'object', data: obj });
        if (expandedObjects.has(obj.id!)) {
          for (const ad of objAds) {
            if (!statusMatches(ad.status)) continue;
            rows.push({ kind: 'expanded_ad', data: ad, parentObjectId: obj.id! });
          }
        }
      }
      for (const ad of filteredAds) {
        if (!statusMatches(ad.status)) continue;
        if (!objectAdIds.has(ad.id)) {
          rows.push({ kind: 'ad', data: ad });
        }
      }
    }

    // Сортировка — объекты сортируются как единое целое со своими expanded_ad
    if (sortColumn) {
      const mul = sortDir === 'asc' ? 1 : -1;
      const getVal = (row: TableRow): number => {
        const d = row.data as any;
        if (sortColumn === 'status') {
          if (showLowMarket) {
            // Сортировка по отклонению от медианы: neg delta → bigger discount
            const id = d.id;
            const pos = row.kind === 'object'
              ? lowMarketObjectMap.get(id)
              : lowMarketMap.get(id);
            // Негативный delta (скидка) → положительное значение → desc = скидка сначала
            return pos?.deltaToMedian != null ? -(pos.deltaToMedian) : -Infinity;
          }
          // Без инвест-фильтра: active=0, archived=1
          return d.status === 'active' ? 0 : 1;
        }
        if (sortColumn === 'price') {
          return d.price ?? d.current_price ?? -Infinity;
        }
        if (sortColumn === 'created') {
          return d.created ? new Date(d.created).getTime() : 0;
        }
        if (sortColumn === 'updated') {
          return d.updated ? new Date(d.updated).getTime() : 0;
        }
        return 0;
      };

      // Группируем строки в блоки: объект + его expanded_ad, отдельно ad
      const blocks: TableRow[][] = [];
      let i = 0;
      while (i < rows.length) {
        if (rows[i].kind === 'object') {
          const block: TableRow[] = [rows[i]];
          i++;
          // Забираем все следующие expanded_ad за этим объектом
          while (i < rows.length && rows[i].kind === 'expanded_ad') {
            block.push(rows[i]);
            i++;
          }
          blocks.push(block);
        } else {
          blocks.push([rows[i]]);
          i++;
        }
      }

      // Сортируем блоки по значению первой строки (объект или ad)
      blocks.sort((a, b) => (getVal(a[0]) - getVal(b[0])) * mul);

      // Разворачиваем обратно
      rows.length = 0;
      for (const block of blocks) {
        rows.push(...block);
      }
    }

    return rows;
  }, [filteredObjects, filteredAds, expandedObjects, objectAds, allAds, sortColumn, sortDir, filterProcessingStatus, localStatusFilter, showLowMarket, lowMarketOnly, lowMarketAdIds, lowMarketObjectIds, lowMarketMap, lowMarketObjectMap]);

  // Пагинация по «родительским» строкам (объекты + самостоятельные объявления).
  // Раскрытые строки объявлений (expanded_ad) не учитываются в лимите страницы.
  const topLevelRows = useMemo(() => tableRows.filter(r => r.kind !== 'expanded_ad'), [tableRows]);
  const totalPages = Math.max(1, Math.ceil(topLevelRows.length / pageSize));
  const pagedRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    const end = start + pageSize;
    const result: TableRow[] = [];
    let topIndex = 0;
    let collecting = false;
    for (const row of tableRows) {
      if (row.kind === 'expanded_ad') {
        if (collecting) result.push(row);
        continue;
      }
      topIndex++;
      if (topIndex > start && topIndex <= end) {
        result.push(row);
        collecting = true;
      } else {
        collecting = false;
      }
    }
    return result;
  }, [tableRows, page, pageSize]);

  // ─── Активные фильтры ───
  const activeFilterTags = useMemo(() => {
    const tags: { key: string; label: string }[] = [];
    if (filterStatus) tags.push({ key: 'status', label: `Статус: ${filterStatus === 'active' ? 'Активные' : 'Архивные'}` });
    if (filterSources.length > 0) tags.push({ key: 'sources', label: `Источник: ${filterSources.map(s => SOURCE_LABELS[s] || s).join(', ')}` });
    if (filterPropertyTypes.length > 0) tags.push({ key: 'ptypes', label: `Тип: ${filterPropertyTypes.map(t => PROPERTY_TYPE_FULL[t] || t).join(', ')}` });
    if (filterCategoryIds.length > 0) tags.push({ key: 'cats', label: `Категория: ${filterCategoryIds.length} выбрано` });
    if (filterPriceMin || filterPriceMax) tags.push({ key: 'price', label: `Цена: ${filterPriceMin ? Number(filterPriceMin).toLocaleString('ru-RU') : '—'} – ${filterPriceMax ? Number(filterPriceMax).toLocaleString('ru-RU') : '—'}` });
    if (filterAreaMin || filterAreaMax) tags.push({ key: 'area', label: `Площадь: ${filterAreaMin || '—'} – ${filterAreaMax || '—'} м²` });
    if (filterFloorMin || filterFloorMax) tags.push({ key: 'floor', label: `Этаж: ${filterFloorMin || '—'} – ${filterFloorMax || '—'}` });
    if (filterYearMin || filterYearMax) tags.push({ key: 'year', label: `Год: ${filterYearMin || '—'} – ${filterYearMax || '—'}` });
    if (filterSellerTypes.length > 0) tags.push({ key: 'seller', label: `Продавец: ${filterSellerTypes.map(s => SELLER_TYPE_LABELS[s] || s).join(', ')}` });
    if (filterDateFrom || filterDateTo) tags.push({ key: 'dates', label: `Даты: ${filterDateFrom || '—'} – ${filterDateTo || '—'}` });
    if (filterProcessingStatus) {
      const procLabel: Record<string, string> = {
        address_needed: 'Адрес не определён',
        duplicate_check_needed: 'Обработать на дубли',
      };
      tags.push({ key: 'proc', label: `Обработка: ${procLabel[filterProcessingStatus] || filterProcessingStatus}` });
    }
    if (filterAddressId) {
      const addr = addresses.find(a => a.id === filterAddressId);
      if (addr) tags.push({ key: 'addr', label: `Адрес: ${addr.address}` });
    }
    if (filterContactType) tags.push({ key: 'contact', label: `Контакт: ${SELLER_TYPE_LABELS[filterContactType] || filterContactType}` });
    if (filterProcessingCategoryId) {
      const cat = categories.find(c => c.id === filterProcessingCategoryId);
      if (cat) tags.push({ key: 'pcat', label: `Кат. обработки: ${cat.title}` });
    }
    if (filterProcessingFloor) tags.push({ key: 'pfloor', label: `Этаж обработки: ${filterProcessingFloor}` });
    if (searchQuery) tags.push({ key: 'query', label: `Поиск: ${searchQuery}` });
    if (filterAddressIds.size > 0) {
      const active = filterAddressIds.size - excludedAddressIds.size;
      tags.push({ key: 'polygonAddresses', label: excludedAddressIds.size > 0 ? `Полигон: ${active} из ${filterAddressIds.size} адресов` : `Полигон: ${filterAddressIds.size} адрес(ов)` });
    }
    if (filterHouseSeriesIds.length > 0) {
      const names = filterHouseSeriesIds.map(id => availableHouseSeries.find(r => r.server_id === id)?.name || id);
      tags.push({ key: 'houseSeries', label: `Серия: ${names.join(', ')}` });
    }
    if (filterWallMaterialIds.length > 0) {
      const names = filterWallMaterialIds.map(id => availableWallMaterials.find(r => r.server_id === id)?.name || id);
      tags.push({ key: 'wallMaterial', label: `Материал стен: ${names.join(', ')}` });
    }
    if (filterFloorsMin || filterFloorsMax) tags.push({ key: 'addrFloors', label: `Этажность дома: ${filterFloorsMin || '—'} – ${filterFloorsMax || '—'}` });
    return tags;
  }, [filterStatus, filterSources, filterPropertyTypes, filterCategoryIds, filterPriceMin, filterPriceMax, filterAreaMin, filterAreaMax,
    filterFloorMin, filterFloorMax, filterYearMin, filterYearMax, filterSellerTypes, filterDateFrom, filterDateTo,
    filterProcessingStatus, filterAddressId, filterContactType, filterProcessingCategoryId, filterProcessingFloor,
    searchQuery, addresses, categories, filterAddressIds, filterHouseSeriesIds, filterWallMaterialIds, filterFloorsMin, filterFloorsMax, availableHouseSeries, availableWallMaterials]);

  const removeFilterTag = (key: string) => {
    if (key === 'status') setFilterStatus('');
    if (key === 'sources') setFilterSources([]);
    if (key === 'ptypes') setFilterPropertyTypes([]);
    if (key === 'cats') setFilterCategoryIds([]);
    if (key === 'price') { setFilterPriceMin(''); setFilterPriceMax(''); }
    if (key === 'area') { setFilterAreaMin(''); setFilterAreaMax(''); }
    if (key === 'floor') { setFilterFloorMin(''); setFilterFloorMax(''); }
    if (key === 'year') { setFilterYearMin(''); setFilterYearMax(''); }
    if (key === 'seller') setFilterSellerTypes([]);
    if (key === 'dates') { setFilterDateFrom(''); setFilterDateTo(''); }
    if (key === 'proc') setFilterProcessingStatus('');
    if (key === 'addr') setFilterAddressId('');
    if (key === 'contact') setFilterContactType('');
    if (key === 'pcat') setFilterProcessingCategoryId('');
    if (key === 'pfloor') setFilterProcessingFloor('');
    if (key === 'query') setSearchQuery('');
    if (key === 'polygonAddresses') { setFilterAddressIds(new Set()); localStorage.removeItem('ret_ads_filter_address_ids'); }
    if (key === 'houseSeries') setFilterHouseSeriesIds([]);
    if (key === 'wallMaterial') setFilterWallMaterialIds([]);
    if (key === 'addrFloors') { setFilterFloorsMin(''); setFilterFloorsMax(''); }
  };

  const clearAllFilters = () => {
    setFilterStatus(''); setFilterSources([]); setFilterPropertyTypes([]); setFilterCategoryIds([]);
    setFilterPriceMin(''); setFilterPriceMax(''); setFilterAreaMin(''); setFilterAreaMax('');
    setFilterFloorMin(''); setFilterFloorMax(''); setFilterYearMin(''); setFilterYearMax('');
    setFilterSellerTypes([]); setFilterDateFrom(''); setFilterDateTo('');
    setFilterProcessingStatus(''); setFilterAddressId(''); setFilterContactType('');
    setFilterProcessingCategoryId(''); setFilterProcessingFloor('');
    setSearchQuery(''); setActiveFilterId(null); setActiveFilterName(null);
    setFilterAddressIds(new Set()); localStorage.removeItem('ret_ads_filter_address_ids');
    setExcludedAddressIds(new Set()); localStorage.removeItem('ret_ads_excluded_address_ids');
    setFilterHouseSeriesIds([]); setFilterWallMaterialIds([]); setFilterFloorsMin(''); setFilterFloorsMax('');
  };

  // ─── Обработчики ───
  const toggleExpand = async (objectId: number) => {
    const next = new Set(expandedObjects);
    if (next.has(objectId)) {
      next.delete(objectId);
    } else {
      next.add(objectId);
      if (!objectAds.has(objectId)) {
        const ads = allAds
          .filter(a => a.object_id === objectId)
          .sort((a, b) => {
            const ta = new Date(a.updated || a.created || 0).getTime();
            const tb = new Date(b.updated || b.created || 0).getTime();
            return tb - ta;
          });
        setObjectAds(prev => new Map(prev).set(objectId, ads));
      }
    }
    setExpandedObjects(next);
  };

  const toggleSelect = (id: number, type: 'ad' | 'object') => {
    const nextIds = new Set(selectedIds);
    const nextTypes = new Map(selectedTypes);
    if (nextIds.has(id)) { nextIds.delete(id); nextTypes.delete(id); }
    else { nextIds.add(id); nextTypes.set(id, type); }
    setSelectedIds(nextIds); setSelectedTypes(nextTypes);
  };

  const toggleSelectAll = () => {
    if (selectedIds.size > 0) { setSelectedIds(new Set()); setSelectedTypes(new Map()); return; }
    const nextIds = new Set<number>(); const nextTypes = new Map<number, 'ad' | 'object'>();
    for (const row of pagedRows) {
      const id = row.kind === 'object' ? row.data.id! : row.data.id!;
      const type = row.kind === 'object' ? 'object' : 'ad';
      if (id != null) { nextIds.add(id); nextTypes.set(id, type); }
    }
    setSelectedIds(nextIds); setSelectedTypes(nextTypes);
  };

  // Быстрый фильтр по строке
  /** Заполнить фильтры обработки данными из строки (как в neocenka-extension) */
  const quickFilter = (row: TableRow) => {
    // Показать панель фильтра обработки, если скрыта
    if (!showProcessingFilter) setShowProcessingFilter(true);
    // Сбрасываем статус обработки и страницу
    setFilterProcessingStatus('');
    setPage(1);

    if (row.kind === 'object') {
      const o = row.data;
      if (o.address_id) setFilterAddressId(o.address_id);
      if (o.floor != null) setFilterProcessingFloor(String(o.floor));
      // Категория берётся из первого ad объекта (у самого объекта поля category_id нет)
      const objAd = allAds.find(a => a.object_id === o.id && a.category_id != null);
      if (objAd?.category_id) setFilterProcessingCategoryId(objAd.category_id);
    } else {
      const a = row.data;
      if (a.address_id) setFilterAddressId(a.address_id);
      if (a.category_id) setFilterProcessingCategoryId(a.category_id);
      if (a.floor != null) setFilterProcessingFloor(String(a.floor));
    }
  };

  // ─── Загрузка данных (категории + источники из настроек) ───
  const ensureListingData = async () => {
    if (categoriesLoadedRef.current) return;
    try {
      // Загрузить настройки пользователя из chrome.storage
      let selectedCatIds: number[] = [];
      let selectedSrcIds: number[] = [];
      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        const stored = await new Promise<Record<string, number[]>>((resolve) => {
          chrome.storage.local.get(
            ['listing_selected_categories', 'listing_selected_sources'],
            (r) => resolve(r as Record<string, number[]>)
          );
        });
        selectedCatIds = stored.listing_selected_categories || [];
        selectedSrcIds = stored.listing_selected_sources || [];
      }

      // Загрузить и отфильтровать категории — только выбранные пользователем
      let allCats: ListingCategoryRaw[];
      const saved = await db.table('listing_categories').toArray();
      if (saved.length > 0) {
        allCats = saved.map((c: any) => ({ id: c.source_id, title: c.name, typeId: c.type_id ?? 0, sectionId: c.section_id ?? 0 }));
      } else {
        // Пробуем загрузить с сервера
        try {
          const serverCats = await getAvailableCategories();
          allCats = serverCats.map(c => ({ id: c.source_id, title: c.title, typeId: c.type_id ?? 0, sectionId: c.section_id ?? 0 }));
        } catch {
          allCats = [];
        }
      }
      // Фильтруем арендные секции (6,7,8,10) — работаем только с продажей
      const saleOnlyCats = allCats.filter(c => ![6, 7, 8, 10].includes(c.sectionId));
      const filteredCats = selectedCatIds.length > 0
        ? saleOnlyCats.filter(c => selectedCatIds.includes(c.id))
        : saleOnlyCats;
      setCategories(filteredCats);
      categoriesLoadedRef.current = true;

      // В панели загрузки — все показанные категории выбраны по умолчанию
      setImportCategoryIds(filteredCats.map(c => c.id));

      // Источники — только выбранные пользователем
      const allSourceEntries = Object.entries(SOURCE_IDS) as [string, number][];
      if (selectedSrcIds.length > 0) {
        const enabled = allSourceEntries.filter(([, id]) => selectedSrcIds.includes(id)).map(([key, id]) => ({ id, key }));
        setEnabledSources(enabled);
        setImportSourceIds(enabled.map(s => s.id));
      } else {
        setEnabledSources(allSourceEntries.map(([key, id]) => ({ id, key })));
      }
    } catch {}
  };

  // ─── Загрузка данных ───
  const handleOpenImport = async () => {
    setShowImportPanel(!showImportPanel);
    if (!showImportPanel) {
      await ensureListingData();
    }
  };

  const handleImport = () => {
    if (!polygonsCoords || polygonsCoords.length === 0) { setImportError('Нарисуйте полигон на карте'); return; }
    setImportError('');
    startAdsImport({
      polygons: polygonsCoords,
      sourceIds: importSourceIds.length > 0 ? importSourceIds : undefined,
      categoryIds: importCategoryIds.length > 0 ? importCategoryIds : undefined,
      sellerTypes: importSellerTypeIds.length > 0 ? importSellerTypeIds : undefined,
      dateFrom: importDateFrom || undefined,
      dateTo: importDateTo || undefined,
      isNew: importIsNew,
    });
  };

  const handleMatchAddresses = async () => {
    setMatchRunning(true);
    setMatchProgress(null);
    try {
      const result = await adsAddressService.matchAdsToAddresses(
        (processed, total) => {
          setMatchProgress({ done: processed, total });
        },
        polygonsCoords ?? undefined,
        baseFilteredAds,
      );
      await loadData();
      await loadStats();
      const addrs = await db.table<AdAddress>('ad_addresses').toArray();
      addrs.sort((a, b) => (a.address || '').localeCompare(b.address || '', 'ru'));
      setAddresses(addrs);
      setToast({ message: `Адреса определены: ${result.matched} совпадений, ${result.unmatched} без адреса`, type: 'success' });
    } catch {
      setToast({ message: 'Ошибка при определении адресов', type: 'error' });
    } finally {
      setMatchRunning(false);
      setMatchProgress(null);
    }
  };

  const adsInPolygonCount = useMemo(() => {
    if (!polygonsCoords || polygonsCoords.length === 0) return 0;
    return allAds.filter(ad => {
      const lat = ad.coordinates.lat;
      const lng = ad.coordinates.lng;
      if (lat == null || lng == null || !isFinite(lat) || !isFinite(lng)) return false;
      return polygonsCoords.some(poly => pointInPolygon(lat, lng, poly));
    }).length;
  }, [allAds, polygonsCoords]);

  const adsWithCoordsCount = useMemo(() => {
    return allAds.filter(ad => ad.coordinates.lat != null && ad.coordinates.lng != null && isFinite(ad.coordinates.lat) && isFinite(ad.coordinates.lng)).length;
  }, [allAds]);

  const handleDeleteInPolygon = async () => {
    if (!polygonsCoords || polygonsCoords.length === 0) return;
    setDeleteRunning(true);
    try {
      const idsToDelete = allAds
        .filter(ad => {
          const lat = ad.coordinates.lat;
          const lng = ad.coordinates.lng;
          if (lat == null || lng == null || !isFinite(lat) || !isFinite(lng)) return false;
          return polygonsCoords.some(poly => pointInPolygon(lat, lng, poly));
        })
        .map(ad => ad.id!)
        .filter((id): id is number => id != null);
      await db.ads.bulkDelete(idsToDelete);
      await loadData();
      await loadStats();
      setDeleteConfirm(false);
      setToast({ message: `Удалено ${idsToDelete.length} объявлений`, type: 'success' });
    } catch {
      setToast({ message: 'Ошибка при удалении', type: 'error' });
    } finally {
      setDeleteRunning(false);
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedIds.size === 0) return;
    setDeleteRunning(true);
    try {
      const adIds: number[] = [];
      const objectIds: number[] = [];
      selectedIds.forEach(id => {
        const type = selectedTypes.get(id);
        if (type === 'object') objectIds.push(id);
        else adIds.push(id);
      });

      // Удаляем объявления
      if (adIds.length > 0) await db.ads.bulkDelete(adIds);

      // Удаляем объекты (и их объявления)
      if (objectIds.length > 0) {
        for (const objId of objectIds) {
          await db.ads.where('object_id').equals(objId).delete();
        }
        await db.ad_objects.bulkDelete(objectIds);
      }

      setSelectedIds(new Set());
      setSelectedTypes(new Map());
      await loadData();
      await loadStats();
      setDeleteSelectedConfirm(false);
      setToast({ message: `Удалено: ${adIds.length} объявлений, ${objectIds.length} объектов`, type: 'success' });
    } catch {
      setToast({ message: 'Ошибка при удалении', type: 'error' });
    } finally {
      setDeleteRunning(false);
    }
  };

  // ─── Объединение / разбиение объектов ───

  // mergePriceHistory и recalculateObjectFromAds импортированы из @/services/ad-object-utils

  /** Пересчёт и сохранение объекта при изменении одного объявления */
  const recalculateAndSaveObject = useCallback(async (objectId: number) => {
    const objectAds = await db.ads.where('object_id').equals(objectId).toArray();
    if (objectAds.length === 0) return;

    const existing = await db.table<AdObject>('ad_objects').get(objectId);
    const updates = recalculateObjectFromAds(objectAds);
    await db.table('ad_objects').update(objectId, {
      ...updates,
      sale_deal: existing?.sale_deal ?? null,
      updated_at: new Date().toISOString(),
    });
  }, []);

  /** Объединить выбранные объявления/объекты в один объект */
  const handleMergeSelected = async () => {
    if (selectedIds.size === 0) return;

    const adIds: number[] = [];
    const objectIds: number[] = [];
    selectedIds.forEach(id => {
      const type = selectedTypes.get(id);
      if (type === 'object') objectIds.push(id);
      else adIds.push(id);
    });

    // Собираем все объявления
    const allMergeAds: Ad[] = [];

    // Обычные объявления
    for (const adId of adIds) {
      const ad = allAds.find(a => a.id === adId);
      if (ad) allMergeAds.push(ad);
    }

    // Объявления из выбранных объектов
    for (const objId of objectIds) {
      const objAds = await db.ads.where('object_id').equals(objId).toArray();
      allMergeAds.push(...objAds);
    }

    if (allMergeAds.length === 0) return;

    // Проверка address_id — предупреждение если разные
    const addressIds = [...new Set(allMergeAds.map(a => a.address_id).filter(Boolean))];
    if (addressIds.length > 1) {
      setToast({ message: 'Нельзя объединить: объявления привязаны к разным адресам', type: 'error' });
      return;
    }

    try {
      // Создаём новый объект
      const newObj = recalculateObjectFromAds(allMergeAds);
      const newObjectId = await db.table('ad_objects').add({
        ...newObj,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      // Привязываем все объявления к новому объекту
      const allAdIds = allMergeAds.map(a => a.id).filter((id): id is number => id != null);
      for (const adId of allAdIds) {
        const ad = allMergeAds.find(a => a.id === adId);
        const updates: Record<string, unknown> = { object_id: newObjectId as number };
        // Если дубли обработаны — переводим в processed
        if (ad && ad.processing_status === 'duplicate_check_needed') {
          updates.processing_status = 'processed';
        }
        await db.ads.update(adId, updates);
      }

      // Удаляем старые объекты
      if (objectIds.length > 0) {
        await db.table('ad_objects').bulkDelete(objectIds);
      }

      // Отправляем feedback на сервер (silent — не блокирует UI)
      const feedbackContext = addressIds.length === 1 ? { address_id: addressIds[0] } : undefined;
      sendDedupFeedbackBatch('merge', allMergeAds, feedbackContext).catch(() => {});

      // Сброс выбора, обновление UI
      setSelectedIds(new Set());
      setSelectedTypes(new Map());
      await loadData();
      await loadStats();
      setToast({ message: `Объединено ${allMergeAds.length} объявлений в объект`, type: 'success' });
    } catch {
      setToast({ message: 'Ошибка при объединении', type: 'error' });
    }
  };

  /** Разбить выбранные объекты — отвязать все объявления и удалить объекты */
  const handleSplitSelected = async () => {
    const objectIds: number[] = [];
    selectedIds.forEach(id => {
      if (selectedTypes.get(id) === 'object') objectIds.push(id);
    });

    if (objectIds.length === 0) {
      setToast({ message: 'Выберите хотя бы один объект для разбиения', type: 'error' });
      return;
    }

    try {
      // Собираем объявления до разбиения (для feedback)
      const adsBeforeSplit: Map<number, Ad[]> = new Map();
      for (const objId of objectIds) {
        const objAds = await db.ads.where('object_id').equals(objId).toArray();
        adsBeforeSplit.set(objId, objAds);
      }

      for (const objId of objectIds) {
        // Отвязываем все объявления
        const objAds = adsBeforeSplit.get(objId) ?? [];
        for (const ad of objAds) {
          if (ad.id != null) {
            await db.ads.update(ad.id, { object_id: null });
          }
        }
      }

      // Удаляем объекты
      await db.table('ad_objects').bulkDelete(objectIds);

      // Отправляем feedback на сервер (silent — не блокирует UI)
      for (const objId of objectIds) {
        const objAds = adsBeforeSplit.get(objId);
        // TODO: раскомментировать после завершения тестирования
        // if (objAds && objAds.length > 1) {
        //   const feedbackContext = objAds[0]?.address_id ? { address_id: objAds[0].address_id } : undefined;
        //   sendDedupFeedbackBatch('split', objAds, feedbackContext).catch(() => {});
        // }
      }

      setSelectedIds(new Set());
      setSelectedTypes(new Map());
      await loadData();
      await loadStats();
      setToast({ message: `Разбито ${objectIds.length} объектов`, type: 'success' });
    } catch {
      setToast({ message: 'Ошибка при разбиении', type: 'error' });
    }
  };

  // ─── Привязка адресов ───
  const handleLinkAd = async (adId: number, addressId: number) => {
    await adsAddressService.linkAdToAddress(adId, addressId);
    await loadData();
    await loadStats();
    setAssignAd(null);
    setToast({ message: 'Адрес привязан', type: 'success' });
  };

  const handleUnlinkAd = async (adId: number) => {
    await adsAddressService.unlinkAdFromAddress(adId);
    await loadData();
    await loadStats();
    setAssignAd(null);
    setToast({ message: 'Привязка отменена', type: 'success' });
  };

  // Собираем id объявлений для выбранных строк: отдельно выбранные объявления +
  // все объявления из выбранных объектов.
  const collectSelectedAdIds = (): number[] => {
    const ids = new Set<number>();
    for (const id of selectedIds) {
      const type = selectedTypes.get(id);
      if (type === 'ad') {
        ids.add(id);
      } else if (type === 'object') {
        for (const a of allAds) {
          if (a.object_id === id && a.id != null) ids.add(a.id);
        }
      }
    }
    return [...ids].filter(id => {
      const ad = allAds.find(a => a.id === id);
      return ad?.address_id != null;
    });
  };

  const handleUnlinkSelected = async () => {
    const adIds = collectSelectedAdIds();
    if (adIds.length === 0) return;
    for (const id of adIds) {
      await adsAddressService.unlinkAdFromAddress(id);
    }
    await loadData();
    await loadStats();
    setUnlinkSelectedConfirm(false);
    setToast({ message: `Отвязано адресов: ${adIds.length}`, type: 'success' });
  };

  const handleConfirmAd = async (adId: number) => {
    await adsAddressService.confirmAdAddress(adId);
    await loadData();
    await loadStats();
    setAssignAd(null);
    setToast({ message: 'Адрес подтверждён', type: 'success' });
  };

  const handleOpenCreateAddress = (ad: Ad) => {
    setAssignAd(null);
    setCreateAddressForAd(ad);
    setAddressModalMode('create');
    setDetailAddress({
      id: undefined,
      server_id: null,
      house_id: null,
      address: ad.address || '',
      coordinates: { ...ad.coordinates },
      type: 'house',
      region: null,
      cadno: null,
      house_type: null,
      serie: null,
      house_series_id: null,
      house_class_id: null,
      ceiling_material_id: null,
      wall_material_id: null,
      house_problem_id: null,
      floors_count: null,
      build_year: null,
      entrances_count: null,
      living_spaces_count: null,
      area_total: null,
      area_live: null,
      ceiling_height: null,
      gas_supply: null,
      individual_heating: null,
      has_playground: false,
      has_sports_area: false,
      comment: '',
      source: 'user',
      synced_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  };

  // Создание нового адреса напрямую с карты (без привязки к объявлению)
  const handleCreateAddressFromMap = (lat: number, lng: number) => {
    setAssignAd(null);
    setCreateAddressForAd(null);
    setAddressModalMode('create');
    setDetailAddress({
      id: undefined,
      server_id: null,
      house_id: null,
      address: '',
      coordinates: { lat, lng },
      type: 'house',
      region: null,
      cadno: null,
      house_type: null,
      serie: null,
      house_series_id: null,
      house_class_id: null,
      ceiling_material_id: null,
      wall_material_id: null,
      house_problem_id: null,
      floors_count: null,
      build_year: null,
      entrances_count: null,
      living_spaces_count: null,
      area_total: null,
      area_live: null,
      ceiling_height: null,
      gas_supply: null,
      individual_heating: null,
      has_playground: false,
      has_sports_area: false,
      comment: '',
      source: 'user',
      synced_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  };

  const handleAddressSaved = async (savedAddr: AdAddress) => {
    // Если создавали новый адрес для объявления — привязываем его
    if (addressModalMode === 'create' && createAddressForAd && savedAddr.id) {
      await adsAddressService.linkAdToAddress(createAddressForAd.id!, savedAddr.id);
      setCreateAddressForAd(null);
      await loadData();
      await loadStats();
      setToast({ message: 'Новый адрес создан и привязан', type: 'success' });
    }
    // Универсально: добавить/обновить адрес в state
    setAddresses(prev => prev.some(a => a.id === savedAddr.id)
      ? prev.map(a => a.id === savedAddr.id ? savedAddr : a)
      : [savedAddr, ...prev]);

    // После добавления — полёт к новому адресу (триггерит moveend и перерисовку маркеров)
    if (addressModalMode === 'create' && savedAddr.coordinates?.lat != null && savedAddr.coordinates?.lng != null) {
      setFlyToTarget({
        lat: savedAddr.coordinates.lat,
        lon: savedAddr.coordinates.lng,
        zoom: 17,
      });
    }
  };

  /** Собрать CIAN-объявления из текущего фильтра и запустить batch-обновление */
  const handleBatchUpdate = () => {
    const archiveCutoff = new Date(Date.now() - archiveDays * 24 * 60 * 60 * 1000);
    const isActualizable = (ad: Ad) =>
      ad.status === 'active' || (ad.updated && new Date(ad.updated) >= archiveCutoff);
    const cianAdsSet = new Set<number>();
    const cianAds: Ad[] = [];
    // baseFilteredAds НЕ зависит от «Фильтра обработки» — обновление идёт по всей выборке
    const baseObjectIds = new Set<number>();
    for (const ad of baseFilteredAds) { if (ad.object_id) baseObjectIds.add(ad.object_id); }
    const addIfCian = (ad: Ad) => {
      if (ad.url?.includes('cian.ru') && ad.id && !cianAdsSet.has(ad.id) && isActualizable(ad)) {
        cianAdsSet.add(ad.id);
        cianAds.push(ad);
      }
    };
    for (const ad of baseFilteredAds) addIfCian(ad);
    for (const ad of allAds) {
      if (ad.object_id && baseObjectIds.has(ad.object_id)) addIfCian(ad);
    }
    if (cianAds.length === 0) {
      setToast({ message: 'Нет CIAN объявлений для обновления', type: 'info' });
      return;
    }
    if (!startCianBatchUpdate(cianAds, archiveDays)) {
      setToast({ message: 'CIAN: актуализация уже запущена', type: 'info' });
    }
  };

  /** Собрать Avito-объявления из текущего фильтра и запустить batch-обновление */
  const handleAvitoBatchUpdate = () => {
    const archiveCutoff = new Date(Date.now() - archiveDays * 24 * 60 * 60 * 1000);
    const isActualizable = (ad: Ad) =>
      ad.status === 'active' || (ad.updated && new Date(ad.updated) >= archiveCutoff);
    const avitoAdsSet = new Set<number>();
    const avitoAds: Ad[] = [];
    // baseFilteredAds НЕ зависит от «Фильтра обработки» — обновление идёт по всей выборке
    const baseObjectIds = new Set<number>();
    for (const ad of baseFilteredAds) { if (ad.object_id) baseObjectIds.add(ad.object_id); }
    const addIfAvito = (ad: Ad) => {
      if (ad.url?.includes('avito.ru') && ad.id && !avitoAdsSet.has(ad.id) && isActualizable(ad)) {
        avitoAdsSet.add(ad.id);
        avitoAds.push(ad);
      }
    };
    for (const ad of baseFilteredAds) addIfAvito(ad);
    for (const ad of allAds) {
      if (ad.object_id && baseObjectIds.has(ad.object_id)) addIfAvito(ad);
    }
    if (avitoAds.length === 0) {
      setToast({ message: 'Нет Avito объявлений для обновления', type: 'info' });
      return;
    }
    if (!startAvitoBatchUpdate(avitoAds, archiveDays)) {
      setToast({ message: 'Avito: актуализация уже запущена', type: 'info' });
    }
  };

  /** Запустить batch-обновление только для выделенных объявлений.
   *  Берём прямые выбранные объявления + все объявления из выбранных объектов,
   *  фильтруем по критерию «требует обновления» и запускаем batch по источникам. */
  const handleActualizeSelected = () => {
    const archiveCutoff = new Date(Date.now() - archiveDays * 24 * 60 * 60 * 1000);
    const isActualizable = (ad: Ad) =>
      ad.status === 'active' || (ad.updated && new Date(ad.updated) >= archiveCutoff);

    // Собираем id выбранных объявлений (включая все объявления выбранных объектов)
    const targetIds = new Set<number>();
    for (const id of selectedIds) {
      const type = selectedTypes.get(id);
      if (type === 'ad') {
        targetIds.add(id);
      } else if (type === 'object') {
        for (const a of allAds) {
          if (a.object_id === id && a.id != null) targetIds.add(a.id);
        }
      }
    }

    const cianAds: Ad[] = [];
    const avitoAds: Ad[] = [];
    let skippedOther = 0;
    let skippedStale = 0;
    for (const ad of allAds) {
      if (ad.id == null || !targetIds.has(ad.id)) continue;
      if (!isActualizable(ad)) { skippedStale++; continue; }
      if (ad.url?.includes('cian.ru')) cianAds.push(ad);
      else if (ad.url?.includes('avito.ru')) avitoAds.push(ad);
      else skippedOther++;
    }

    const total = cianAds.length + avitoAds.length;
    if (total === 0) {
      const reason = skippedStale > 0
        ? `Все выбранные актуальны (не старее ${archiveDays} дн.)`
        : 'Среди выбранных нет объявлений CIAN/Avito';
      setToast({ message: `Нечего обновлять. ${reason}`, type: 'info' });
      return;
    }

    let started = 0;
    if (cianAds.length > 0) {
      if (startCianBatchUpdate(cianAds, archiveDays)) started++;
      else setToast({ message: 'CIAN: актуализация уже запущена', type: 'info' });
    }
    if (avitoAds.length > 0) {
      if (startAvitoBatchUpdate(avitoAds, archiveDays)) started++;
      else setToast({ message: 'Avito: актуализация уже запущена', type: 'info' });
    }
    if (started > 0) {
      setToast({ message: `Запущено обновление: ${cianAds.length} CIAN, ${avitoAds.length} Avito`, type: 'success' });
    }
  };

  const handleRunAll = async () => {
    // 1. Загрузка объявлений
    if (runImport) {
      handleImport();
      // Ждём завершения ads-import задачи
      await new Promise<void>(resolve => {
        const check = () => {
          const task = importTasksRef.current.find(t => t.type === 'ads-import' && t.status === 'running');
          if (!task) resolve();
          else setTimeout(check, 500);
        };
        setTimeout(check, 500);
      });
    }

    // 2. Определение адресов
    if (runAddress) {
      await handleMatchAddresses();
    }

    // 3. Обновление CIAN + Avito параллельно
    if (runUpdate) {
      handleBatchUpdate();
      handleAvitoBatchUpdate();
      await new Promise<void>(resolve => {
        const check = () => {
          const running = importTasksRef.current.some(t =>
            (t.type === 'cian-update' || t.type === 'avito-update') && t.status === 'running'
          );
          if (!running) resolve();
          else setTimeout(check, 500);
        };
        setTimeout(check, 500);
      });
    }

    // 4. Поиск дубликатов
    if (runDedup) {
      handleDeduplicate();
      await new Promise<void>(resolve => {
        const check = () => {
          const running = importTasksRef.current.some(t =>
            t.type === 'deduplicate' && t.status === 'running'
          );
          if (!running) resolve();
          else setTimeout(check, 500);
        };
        setTimeout(check, 500);
      });
    }

    // 5. Поиск сделок
    if (runDealMatch && dealsModuleActive) {
      startDealMatching(baseFilteredObjects);
      await new Promise<void>(resolve => {
        const check = () => {
          const running = importTasksRef.current.some(t =>
            t.type === 'deal-matching' && t.status === 'running'
          );
          if (!running) resolve();
          else setTimeout(check, 500);
        };
        setTimeout(check, 500);
      });
    }
  };

  /** Запуск поиска дубликатов */
  const handleDeduplicate = () => {
    if (!startDeduplication(baseFilteredAds)) {
      setToast({ message: 'Поиск дубликатов уже запущен', type: 'info' });
    }
  };

  /** Экспорт объектов с объявлениями в JSON для анализа дублей */
  const handleExportDedup = async () => {
    const objectIdSet = new Set(baseFilteredObjects.map(o => o.id).filter((id): id is number => id != null));

    // Собираем ads по object_id из всех ads
    const objAdsMap = new Map<number, Ad[]>();
    for (const ad of allAds) {
      if (ad.object_id && objectIdSet.has(ad.object_id)) {
        let arr = objAdsMap.get(ad.object_id);
        if (!arr) { arr = []; objAdsMap.set(ad.object_id, arr); }
        arr.push(ad);
      }
    }

    const exportData = baseFilteredObjects.map(obj => ({
      object_id: obj.id,
      address_id: obj.address_id,
      property_type: obj.property_type,
      area_total: obj.area_total,
      current_price: obj.current_price,
      listings_count: obj.listings_count,
      ads: (objAdsMap.get(obj.id!) || []).map(ad => ({
        id: ad.id,
        source: ad.source,
        url: ad.url,
        property_type: ad.property_type,
        rooms: ad.rooms,
        floor: ad.floor,
        floors_total: ad.floors_total,
        area_total: ad.area_total,
        area_living: ad.area_living,
        area_kitchen: ad.area_kitchen,
        price: ad.price,
        phone: ad.phone || ad.seller_info?.phone || null,
        seller_name: ad.seller_name || ad.seller_info?.name || null,
        seller_type: ad.seller_type || ad.seller_info?.type || null,
        address: ad.address,
        description: ad.description,
        status: ad.status,
        created: ad.created,
        updated: ad.updated,
      })),
    }));

    const json = JSON.stringify(exportData, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dedup-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setToast({ message: `Экспортировано ${exportData.length} объектов`, type: 'success' });
  };

  const toggleNumFilter = (arr: number[], item: number, setter: (v: number[]) => void) => {
    setter(arr.includes(item) ? arr.filter(x => x !== item) : [...arr, item]);
  };

  const handlePolygonsChange = useCallback((polygons: [number, number][][] | null) => {
    const incomingJson = polygons ? JSON.stringify(polygons) : 'null';
    const currentJson = polygonsCoordsJsonRef.current;
    const polygonChanged = incomingJson !== currentJson;

    // Обновляем полигон в state и localStorage
    setPolygonsCoords(polygons);
    polygonsCoordsJsonRef.current = incomingJson;
    if (polygons) localStorage.setItem('ret_ads_polygon_coords', JSON.stringify(polygons));
    else localStorage.removeItem('ret_ads_polygon_coords');

    // Сбросить исключённые адреса только если полигон реально изменился (пользователь нарисовал новый)
    if (polygonChanged) {
      setExcludedAddressIds(new Set());
      localStorage.removeItem('ret_ads_excluded_address_ids');
    }

    // Полигон сброшен — обязательно выключаем инвест-фильтр, иначе
    // bulk-расчёт пойдёт по всей базе (через fallback на радиус) и повесит страницу.
    if (!polygons || polygons.length === 0) {
      setShowLowMarket(false);
      setLowMarketOnly(false);
      setShowLowMarketSettings(false);
    }

    // Всегда пересчитываем адреса внутри полигона по текущей базе адресов
    if (polygons && polygons.length > 0 && addresses.length > 0) {
      const ids = new Set<number>();
      for (const addr of addresses) {
        const lat = addr.coordinates.lat;
        const lng = addr.coordinates.lng;
        if (lat != null && lng != null && isFinite(lat) && isFinite(lng) && polygons.some(poly => pointInPolygon(lat, lng, poly))) {
          if (addr.id != null) ids.add(addr.id);
        }
      }
      setFilterAddressIds(ids);
      localStorage.setItem('ret_ads_filter_address_ids', JSON.stringify([...ids]));
    } else if (!polygons) {
      // Полигон удалён — сбросить адреса
      setFilterAddressIds(new Set());
      localStorage.removeItem('ret_ads_filter_address_ids');
    }
    // Если полигон есть, но адреса ещё не загружены — не трогаем filterAddressIds
  }, [addresses]);

  const handleSelectAllInPolygon = useCallback(() => {
    setExcludedAddressIds(new Set());
    localStorage.removeItem('ret_ads_excluded_address_ids');
  }, []);

  const handleAddressToggle = useCallback((address: AdAddress) => {
    setExcludedAddressIds(prev => {
      const next = new Set(prev);
      if (address.id != null) {
        if (next.has(address.id)) next.delete(address.id);
        else next.add(address.id);
      }
      localStorage.setItem('ret_ads_excluded_address_ids', JSON.stringify([...next]));
      return next;
    });
  }, []);

  const handleFlyToRegion = (regionCode: string) => {
    const info = REGION_CENTERS[regionCode];
    if (!info) return;
    setFlyToTarget(null);
    requestAnimationFrame(() => {
      setFlyToTarget({ lat: info.lat, lon: info.lon, zoom: info.zoom });
    });
  };

  // ─── Форматтеры ───
  const toggleSort = (col: 'price' | 'created' | 'updated' | 'status') => {
    if (sortColumn === col) {
      if (sortDir === 'desc') setSortDir('asc');
      else { setSortColumn(null); setSortDir('desc'); }
    } else {
      setSortColumn(col);
      setSortDir('desc');
    }
  };
  const sortIcon = (col: 'price' | 'created' | 'updated' | 'status') => {
    if (sortColumn !== col) return ' ↕';
    return sortDir === 'desc' ? ' ↓' : ' ↑';
  };
  const fmtPrice = (price: number | null): string => {
    if (price == null) return '—';
    return price.toLocaleString('ru-RU');
  };
  const fmtDate = (date: string | null): string => {
    if (!date) return '—';
    try { return new Date(date).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' }); }
    catch { return date; }
  };

  // ─── Рендер строки ───
  const renderRow = (row: TableRow, idx: number) => {
    if (row.kind === 'object') {
      const o = row.data;
      const id = o.id!;
      const isSelected = selectedIds.has(id);
      const isExpanded = expandedObjects.has(id);
      const createdDays = daysAgo(o.created);
      const updatedDays = daysAgo(o.updated);
      const objAddress = o.address_id ? addresses.find(x => x.id === o.address_id)?.address : null;
      const exposureDays = o.created && o.updated
        ? Math.floor((new Date(o.updated).getTime() - new Date(o.created).getTime()) / 86400000)
        : createdDays;
      const lowMarketObjPos = lowMarketObjectMap.get(id) ?? null;
      const isLowMarketObj = lowMarketObjPos != null && lowMarketObjPos.isLowMarket;
      return (
        <tr key={`obj-${id}`} className={`${isLowMarketObj ? 'bg-emerald-50 dark:bg-emerald-900/15' : ''} cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors ${isSelected ? 'bg-orange-50 dark:bg-orange-900/10' : ''}`}
          onClick={() => openObjectDetail(o)}>
          <td className="px-2 py-1.5"><input type="checkbox" checked={isSelected} onChange={() => toggleSelect(id, 'object')} onClick={e => e.stopPropagation()} className="h-3 w-3 rounded border-zinc-300 text-blue-600" /></td>
          <td className="px-1 py-1.5"><button onClick={e => { e.stopPropagation(); quickFilter(row); }} className="text-zinc-400 hover:text-blue-600" title="Быстрый фильтр"><FunnelIcon className="size-3.5" /></button></td>
          <td className="px-2 py-1.5 text-xs">
            <div className="flex items-center gap-1 flex-nowrap">
              <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium shrink-0 ${o.status === 'active' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-700 dark:text-zinc-400'}`}>{o.status === 'active' ? 'Активен' : 'Архив'}</span>
              {isLowMarketObj && lowMarketObjPos && (
                <span
                  className="inline-flex items-center px-1 py-0.5 rounded text-[9px] font-bold bg-emerald-600 text-white shrink-0"
                  title={`p${Math.round(lowMarketObjPos.percentileRank ?? 0)} · ${lowMarketObjPos.deltaToMedian != null ? (lowMarketObjPos.deltaToMedian > 0 ? '+' : '') + lowMarketObjPos.deltaToMedian + '%' : ''} к медиане · ${lowMarketObjPos.comparablesCount} аналогов`}
                >
                  {lowMarketObjPos.deltaToMedian != null ? `${lowMarketObjPos.deltaToMedian > 0 ? '+' : ''}${lowMarketObjPos.deltaToMedian}%` : 'Низ'}
                </span>
              )}
              {o.sale_deal && <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 shrink-0">Продажа</span>}
              <button onClick={e => { e.stopPropagation(); toggleExpand(id); }} className="inline-flex items-center gap-0.5 text-[10px] text-zinc-600 dark:text-zinc-400 hover:text-blue-600 whitespace-nowrap">
                <svg className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
                {o.listings_count} ({o.active_listings_count} акт.)
              </button>
            </div>
          </td>
          <td className="px-2 py-1.5 text-[11px] text-zinc-600 dark:text-zinc-400 whitespace-nowrap">
            <div>{fmtDate(o.created)}</div>
            {exposureDays != null && <div className="text-[9px] text-zinc-400">эксп. {exposureDays} дн.</div>}
          </td>
          <td className="px-2 py-1.5 text-[11px] text-zinc-600 dark:text-zinc-400 whitespace-nowrap">
            <div>{fmtDate(o.updated)}</div>
            {updatedDays != null && <div className={`text-[9px] ${updatedDays > 7 ? 'text-red-500' : 'text-green-600'}`}>{updatedDays} дн. назад</div>}
          </td>
          <td className="px-2 py-1.5 text-[11px] text-zinc-700 dark:text-zinc-300 whitespace-nowrap">
            {o.property_type ? PROPERTY_TYPE_FULL[o.property_type] || o.property_type : '—'}
            {o.property_type && ' кв.'}
            {o.area_total != null ? `, ${o.area_total}${o.area_living ? '/' + o.area_living : ''}${o.area_kitchen ? '/' + o.area_kitchen : ''}м²` : ''}
            {o.floor != null ? `, ${o.floor}/${o.floors_total ?? '?'} эт.` : ''}
          </td>
          <td className="px-2 py-1.5 text-[11px] max-w-[320px]">
            <span className="text-blue-600 dark:text-blue-400 truncate block">{objAddress || 'Адрес не определен'}</span>
          </td>
          <td className="px-2 py-1.5 text-[11px] text-right whitespace-nowrap">
            <div className="text-green-600 dark:text-green-400 font-medium">{fmtPrice(o.current_price)}</div>
            {o.price_per_meter != null && <div className="text-zinc-500 dark:text-zinc-500">{o.price_per_meter.toLocaleString('ru-RU')} ₽/м²</div>}
          </td>
          <td className="px-2 py-1.5 text-[11px] text-zinc-600 dark:text-zinc-400">
            <span className={o.owner_status === 'есть от собственника' ? 'text-green-600' : o.owner_status === 'было от собственника' ? 'text-yellow-600' : 'text-zinc-400'}>{o.owner_status || '—'}</span>
          </td>
        </tr>
      );
    }

    const a = row.data;
    const id = a.id!;
    const isSelected = selectedIds.has(id);
    const isChild = row.kind === 'expanded_ad';
    const createdDays = daysAgo(a.created);
    const updatedDays = daysAgo(a.updated);
    const addrFromDb = a.address_id ? addresses.find(x => x.id === a.address_id)?.address : null;
    const lowMarketPos = lowMarketMap.get(id) ?? null;
    const isLowMarket = lowMarketPos != null && lowMarketPos.isLowMarket;

    return (
      <tr key={`ad-${id}${isChild ? '-child' : ''}`}
        className={`${isLowMarket ? 'bg-emerald-50 dark:bg-emerald-900/15' : isChild ? 'bg-orange-50/40 dark:bg-orange-900/5' : ''} cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors ${isSelected ? 'bg-orange-50 dark:bg-orange-900/10' : ''}`}
        onClick={() => setDetailAd(a)}>
        {isChild && (
          <td className="px-2 py-1.5" colSpan={2}>
            <div className="border-l-2 border-orange-300 dark:border-orange-700 pl-3 ml-1">&nbsp;</div>
          </td>
        )}
        {!isChild && (
          <>
            <td className="px-2 py-1.5"><input type="checkbox" checked={isSelected} onChange={() => toggleSelect(id, 'ad')} onClick={e => e.stopPropagation()} className="h-3 w-3 rounded border-zinc-300 text-blue-600" /></td>
            <td className="px-1 py-1.5"><button onClick={e => { e.stopPropagation(); quickFilter(row); }} className="text-zinc-400 hover:text-blue-600" title="Быстрый фильтр"><FunnelIcon className="size-3.5" /></button></td>
          </>
        )}
        <td className="px-2 py-1.5 text-xs space-y-0.5">
          <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${a.status === 'active' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-700 dark:text-zinc-400'}`}>{a.status === 'active' ? 'Активен' : 'Архив'}</span>
          {isLowMarket && lowMarketPos && (
            <span
              className="inline-flex items-center px-1 py-0.5 rounded text-[9px] font-bold bg-emerald-600 text-white"
              title={`p${Math.round(lowMarketPos.percentileRank ?? 0)} · ${lowMarketPos.deltaToMedian != null ? (lowMarketPos.deltaToMedian > 0 ? '+' : '') + lowMarketPos.deltaToMedian + '%' : ''} к медиане · ${lowMarketPos.comparablesCount} аналогов`}
            >
              {lowMarketPos.deltaToMedian != null ? `${lowMarketPos.deltaToMedian > 0 ? '+' : ''}${lowMarketPos.deltaToMedian}%` : 'Низ'}
            </span>
          )}
          {!a.object_id && (
            <span className="inline-flex items-center px-1 py-0.5 rounded text-[9px] font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">Обработать на дубли</span>
          )}
          {a.dedup_score != null && a.object_id && (() => {
            const s = a.dedup_score;
            const pct = Math.round(s * 100);
            const cls = s >= 0.85
              ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
              : s >= 0.4
                ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400'
                : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
            return <span className={`inline-flex items-center px-1 py-0.5 rounded text-[9px] font-bold ${cls}`}>{pct}%</span>;
          })()}
        </td>
        <td className="px-2 py-1.5 text-[11px] text-zinc-600 dark:text-zinc-400 whitespace-nowrap">
          <div>{fmtDate(a.created)}</div>
          {createdDays != null && <div className="text-[9px] text-zinc-400">эксп. {createdDays} дн.</div>}
        </td>
        <td className="px-2 py-1.5 text-[11px] text-zinc-600 dark:text-zinc-400 whitespace-nowrap">
          <div>{fmtDate(a.updated)}</div>
          {updatedDays != null && <div className={`text-[9px] ${updatedDays > 7 ? 'text-red-500' : 'text-green-600'}`}>{updatedDays} дн. назад</div>}
        </td>
        <td className="px-2 py-1.5 text-[11px] text-zinc-700 dark:text-zinc-300 whitespace-nowrap">
          {a.property_type ? PROPERTY_TYPE_LABELS[a.property_type] || a.property_type : ''}{a.area_total != null ? `, ${a.area_total}${a.area_living ? '/' + a.area_living : ''}${a.area_kitchen ? '/' + a.area_kitchen : ''}м²` : ''}{a.floor != null ? `, ${a.floor}/${a.floors_total ?? '?'} эт.` : ''}
        </td>
        <td className="px-2 py-1.5 text-[11px] max-w-[320px]">
          {/* Исходный адрес объявления */}
          <div
            className={`truncate-left ${a.address ? 'text-blue-600 dark:text-blue-400' : 'text-red-600 dark:text-red-400'}`}
            title={a.address || 'Адрес не указан'}
          >{a.address || 'Адрес не указан'}</div>
          {/* Адрес из БД (результат матчинга) */}
          <div
            className={`truncate-left text-[10px] ${addrFromDb ? 'text-zinc-500 dark:text-zinc-400' : 'text-red-500 dark:text-red-400'}`}
            title={addrFromDb ? (a.address_match_confidence === 'low' || a.address_match_confidence === 'very_low' ? `${addrFromDb} (${CONFIDENCE_LABELS[a.address_match_confidence] || ''})` : addrFromDb) : 'Адрес не определен'}
          >
            {addrFromDb ? (
              <span>
                {addrFromDb}
                {a.address_match_confidence && (a.address_match_confidence === 'low' || a.address_match_confidence === 'very_low') && (
                  <span className="text-red-400"> ({CONFIDENCE_LABELS[a.address_match_confidence]})</span>
                )}
                {a.address_match_confidence === 'manual' && (
                  <span className="text-green-500"> (Подтвержден)</span>
                )}
              </span>
            ) : 'Адрес не определен'}
          </div>
        </td>
        <td className="px-2 py-1.5 text-[11px] text-right whitespace-nowrap">
          <div className="text-green-600 dark:text-green-400 font-medium">{fmtPrice(a.price)}</div>
          {a.price_per_meter != null && <div className="text-zinc-500 dark:text-zinc-500">{a.price_per_meter.toLocaleString('ru-RU')} ₽/м²</div>}
        </td>
        <td className="px-2 py-1.5 text-[11px] text-zinc-600 dark:text-zinc-400">
          {a.url && <a href={a.url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="text-blue-600 hover:underline text-[10px] block">{SOURCE_LABELS[normalizeSource(a.source)] || a.source_metadata?.original_source || a.source}</a>}
          <div className="text-[10px]">{SELLER_TYPE_LABELS[a.seller_info?.type || a.seller_type] || a.seller_type || ''}</div>
          {a.seller_info?.name && <div className="text-[10px] text-zinc-400 truncate max-w-[100px]">{a.seller_info.name}</div>}
        </td>
      </tr>
    );
  };

  // ─── JSX ───
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1400px] px-4 py-4 sm:px-6">

        {/* Toast уведомление */}
        {toast && (
          <div className={`fixed top-4 right-4 z-50 max-w-sm rounded-lg border px-4 py-3 shadow-lg transition-all ${
            toast.type === 'success' ? 'bg-green-50 border-green-200 dark:bg-green-950 dark:border-green-800' :
            toast.type === 'error' ? 'bg-red-50 border-red-200 dark:bg-red-950 dark:border-red-800' :
            'bg-blue-50 border-blue-200 dark:bg-blue-950 dark:border-blue-800'
          }`}>
            <div className="flex items-start gap-2">
              {toast.type === 'success' && (
                <svg className="h-4 w-4 mt-0.5 text-green-600 dark:text-green-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
              )}
              {toast.type === 'error' && (
                <svg className="h-4 w-4 mt-0.5 text-red-600 dark:text-red-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              )}
              <span className={`text-sm font-medium ${
                toast.type === 'success' ? 'text-green-800 dark:text-green-200' :
                toast.type === 'error' ? 'text-red-800 dark:text-red-200' :
                'text-blue-800 dark:text-blue-200'
              }`}>{toast.message}</span>
              <button onClick={() => setToast(null)} className="ml-2 shrink-0 opacity-50 hover:opacity-100">
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
          </div>
        )}

        {/* Header */}
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-semibold text-zinc-900 dark:text-white">
              Поиск объявлений
            </h1>
          </div>
          {activeFilterName && (
            <span className="flex items-center gap-1 rounded-lg bg-blue-50 px-2.5 py-1 text-[11px] font-medium text-blue-600 dark:bg-blue-900/20 dark:text-blue-400">
              <svg className="size-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" /></svg>
              <span className="truncate max-w-[200px]">{activeFilterName}</span>
              {filterChanged ? (
                <>
                  <button onClick={handleSaveToActiveFilter} className="ml-1 inline-flex items-center gap-0.5 rounded bg-blue-600 px-1.5 py-0.5 text-[10px] text-white hover:bg-blue-700 border-none cursor-pointer">
                    <ArrowPathIcon className="size-2.5" />Сохранить
                  </button>
                  <button onClick={handleCancelFilterChanges} className="inline-flex items-center gap-0.5 rounded bg-zinc-200 px-1.5 py-0.5 text-[10px] text-zinc-600 hover:bg-zinc-300 border-none cursor-pointer dark:bg-zinc-700 dark:text-zinc-300">
                    <XMarkIcon className="size-2.5" />Отменить
                  </button>
                </>
              ) : null}
              <button onClick={() => { setActiveFilterId(null); setActiveFilterName(null); setActiveFilterStateJson(null); }} className="text-blue-400 hover:text-blue-600 ml-0.5">&times;</button>
            </span>
          )}
          <div className="flex items-center gap-2">
            {/* Сохранённые фильтры */}
            <Button color={showSavedPanel ? 'dark' : 'white'} onClick={() => setShowSavedPanel(true)}>
              <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" /></svg>
              Сохранённые
            </Button>
            <Button onClick={handleOpenImport} color={showImportPanel ? 'dark' : 'white'}><ArrowDownTrayIcon className="size-4" />Обработка объявлений</Button>
            <Button onClick={() => setShowReports(!showReports)} color={showReports ? 'dark' : 'white'}><ChartBarIcon className="size-4" />Отчёты</Button>
            <Button onClick={() => { setShowFilters(!showFilters); if (!showFilters) ensureListingData(); }} color={showFilters ? 'dark' : 'white'}><FunnelIcon className="size-4" />Фильтр</Button>
          </div>
        </div>

        {/* Import panel */}
        {showImportPanel && (
          <div className="rounded-xl bg-white p-5 shadow-sm dark:bg-zinc-900 mb-4 space-y-5 border border-blue-200 dark:border-blue-800">
            {/* Раздел 1: Загрузка объявлений */}
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-zinc-700 dark:text-zinc-300 flex items-center gap-2"><ArrowDownTrayIcon className="size-4" /> Обработка объявлений</h3>
              {!polygonsCoords && <p className="text-xs text-amber-600 dark:text-amber-400">Нарисуйте полигон на карте в фильтрах.</p>}
              <div>
                <label className="block text-[11px] font-medium text-zinc-500 dark:text-zinc-400 mb-1 uppercase">Источник</label>
                <div className="flex flex-wrap gap-1.5">
                  {enabledSources.map(({ id, key }) => (
                    <button key={key} onClick={() => toggleNumFilter(importSourceIds, id, setImportSourceIds)} className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${importSourceIds.includes(id) ? 'bg-blue-600 text-white' : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700'}`}>{SOURCE_LABELS[key] || key}</button>
                  ))}
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-[11px] font-medium text-zinc-500 dark:text-zinc-400 uppercase">Категория</label>
                  <span className="text-[10px] text-zinc-400">{importCategoryIds.length} из {categories.length}</span>
                </div>
                {categories.length === 0 ? (
                  <span className="text-xs text-zinc-400">Загрузка категорий...</span>
                ) : (
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    {(() => {
                      const sectionMap = new Map<number, ListingCategoryRaw[]>();
                      for (const c of categories) {
                        if (!sectionMap.has(c.sectionId)) sectionMap.set(c.sectionId, []);
                        sectionMap.get(c.sectionId)!.push(c);
                      }
                      return Array.from(sectionMap.entries()).map(([sectionId, cats]) => {
                        const allSelected = cats.every(c => importCategoryIds.includes(c.id));
                        return (
                          <div key={sectionId}>
                            <button
                              onClick={() => {
                                const catIds = cats.map(c => c.id);
                                if (allSelected) {
                                  setImportCategoryIds(prev => prev.filter(id => !catIds.includes(id)));
                                } else {
                                  setImportCategoryIds(prev => [...new Set([...prev, ...catIds])]);
                                }
                              }}
                              className="flex items-center gap-1.5 text-[10px] font-medium text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 mb-1"
                            >
                              <span className={`inline-flex h-3 w-3 items-center justify-center rounded border text-[8px] ${allSelected ? 'bg-blue-600 border-blue-600 text-white' : 'border-zinc-300 dark:border-zinc-600'}`}>
                                {allSelected && '✓'}
                              </span>
                              {SECTION_LABELS[sectionId] || `Раздел ${sectionId}`}
                            </button>
                            <div className="flex flex-wrap gap-1 pl-4">
                              {cats.map(c => (
                                <button key={c.id} onClick={() => toggleNumFilter(importCategoryIds, c.id, setImportCategoryIds)} className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${importCategoryIds.includes(c.id) ? 'bg-blue-600 text-white' : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700'}`}>{c.title}</button>
                              ))}
                            </div>
                          </div>
                        );
                      });
                    })()}
                  </div>
                )}
              </div>
              <div>
                <label className="block text-[11px] font-medium text-zinc-500 dark:text-zinc-400 mb-1 uppercase">Продавец</label>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries({ owner: 'Собственник', agent: 'Агент', developer: 'Застройщик' }).map(([key, label]) => {
                    const apiId = SELLER_TYPE_API_MAP[key];
                    return <button key={key} onClick={() => toggleNumFilter(importSellerTypeIds, apiId, setImportSellerTypeIds)} className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${importSellerTypeIds.includes(apiId) ? 'bg-blue-600 text-white' : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700'}`}>{label}</button>;
                  })}
                </div>
                {importSellerTypeIds.length === 0 && <span className="text-[10px] text-zinc-400">Все типы (если не выбрано)</span>}
              </div>
              <div>
                <label className="block text-[11px] font-medium text-zinc-500 dark:text-zinc-400 mb-1 uppercase">Тип недвижимости</label>
                <div className="flex flex-wrap gap-1.5">
                  <button onClick={() => setImportIsNew(0)} className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${importIsNew === 0 ? 'bg-blue-600 text-white' : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700'}`}>Вторичка</button>
                  <button onClick={() => setImportIsNew(1)} className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${importIsNew === 1 ? 'bg-blue-600 text-white' : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700'}`}>Новостройка</button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-zinc-500 dark:text-zinc-400 mb-1">Дата от</label>
                  <input type="date" value={importDateFrom} onChange={e => setImportDateFrom(e.target.value)} className="w-full rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-700 px-2 py-1.5 text-sm text-zinc-900 dark:text-white" />
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {IMPORT_DATE_PRESETS.map(p => (
                      <button
                        key={p.days}
                        onClick={() => setImportDateFrom(dateNDaysAgoStr(p.days))}
                        className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                          importDateFrom === dateNDaysAgoStr(p.days)
                            ? 'bg-blue-600 text-white'
                            : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700'
                        }`}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div><label className="block text-[11px] font-medium text-zinc-500 dark:text-zinc-400 mb-1">Дата до</label><input type="date" value={importDateTo} onChange={e => setImportDateTo(e.target.value)} className="w-full rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-700 px-2 py-1.5 text-sm text-zinc-900 dark:text-white" /></div>
              </div>
              <button onClick={handleImport} disabled={adsImportRunning || !polygonsCoords} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2">
                {adsImportRunning && <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" /></svg>}
                {adsImportRunning ? 'Загрузка...' : 'Загрузить'}
              </button>
              {(() => {
                const t = importTasks.find(t => t.type === 'ads-import');
                if (!t) return null;
                return (
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      {t.status === 'running' && (
                        <span className="text-xs text-blue-600 dark:text-blue-400">{t.detail}</span>
                      )}
                      {t.status === 'done' && (
                        <span className="text-xs text-green-600 dark:text-green-400 font-medium">{t.detail}</span>
                      )}
                      {t.status === 'error' && (
                        <span className="text-xs text-red-600 dark:text-red-400 font-medium">{t.detail}</span>
                      )}
                    </div>
                    {t.status === 'running' && (
                      <div className="h-1.5 w-full max-w-xs rounded-full bg-zinc-200 dark:bg-zinc-700 overflow-hidden">
                        <div className="h-full rounded-full bg-blue-600 transition-all duration-300" style={{ width: `${t.progress}%` }} />
                      </div>
                    )}
                  </div>
                );
              })()}
              {importError && <p className="text-sm text-red-600 dark:text-red-400">{importError}</p>}
            </div>

            <hr className="border-zinc-200 dark:border-zinc-700" />

            {/* Раздел 2: Определение адресов */}
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-zinc-700 dark:text-zinc-300 flex items-center gap-2"><MapPinIcon className="size-4" /> Определение адресов</h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">Автоматическое определение адресов для объявлений без привязки к адресной базе.</p>
              <p className="text-xs text-zinc-400">Без адреса: {baseFilteredAds.filter(a => !a.address_id).length} / Низкая точность: {baseFilteredAds.filter(a => a.address_id && (a.address_match_confidence === 'low' || a.address_match_confidence === 'very_low')).length}</p>
              <button onClick={handleMatchAddresses} disabled={matchRunning} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2">
                {matchRunning && <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" /></svg>}
                {matchRunning ? 'Определение...' : 'Определить адреса'}
              </button>
              {matchProgress && matchProgress.total > 0 && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
                    <span>Обработано: {matchProgress.done} / {matchProgress.total}</span>
                    <span>{Math.round((matchProgress.done / matchProgress.total) * 100)}%</span>
                  </div>
                  <div className="h-1.5 w-full max-w-xs rounded-full bg-zinc-200 dark:bg-zinc-700 overflow-hidden">
                    <div className="h-full rounded-full bg-blue-600 transition-all duration-300" style={{ width: `${(matchProgress.done / matchProgress.total) * 100}%` }} />
                  </div>
                </div>
              )}
            </div>

            <hr className="border-zinc-200 dark:border-zinc-700" />

            {/* Раздел 3: Обновление объявлений */}
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-zinc-700 dark:text-zinc-300 flex items-center gap-2"><ArrowPathIcon className="size-4" /> Обновление объявлений</h3>

              {/* CIAN прогресс */}
              {cianTask && (() => {
                const eta = cianTask.startTime && cianTask.current && cianTask.total && cianTask.current > 0
                  ? (() => { const rem = ((Date.now() - cianTask.startTime) / cianTask.current) * (cianTask.total - cianTask.current); const s = Math.ceil(rem / 1000); return s < 60 ? `≈ ${s} сек` : `≈ ${Math.floor(s / 60)} мин ${s % 60 > 0 ? `${s % 60} сек` : ''}`; })()
                  : null;
                return (
                  <div className="space-y-1 p-2.5 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-medium text-blue-700 dark:text-blue-300">
                        CIAN: {cianTask.phase === 'check' ? 'Проверка...' : cianTask.phase === 'parse' ? 'Парсинг...' : 'Завершено'}
                      </span>
                      <span className="text-[11px] text-blue-600 dark:text-blue-400 tabular-nums">
                        {cianTask.current}/{cianTask.total} {eta && `(${eta})`}
                      </span>
                    </div>
                    <div className="w-full bg-blue-200 dark:bg-blue-900 rounded-full h-1.5">
                      <div className="bg-blue-600 h-1.5 rounded-full transition-all duration-300" style={{ width: `${cianTask.progress}%` }} />
                    </div>
                    {cianTask.detail && <p className="text-[10px] text-blue-600 dark:text-blue-400">{cianTask.detail}</p>}
                  </div>
                );
              })()}

              {/* Avito прогресс */}
              {avitoTask && (() => {
                const eta = avitoTask.startTime && avitoTask.current && avitoTask.total && avitoTask.current > 0
                  ? (() => { const rem = ((Date.now() - avitoTask.startTime) / avitoTask.current) * (avitoTask.total - avitoTask.current); const s = Math.ceil(rem / 1000); return s < 60 ? `≈ ${s} сек` : `≈ ${Math.floor(s / 60)} мин ${s % 60 > 0 ? `${s % 60} сек` : ''}`; })()
                  : null;
                return (
                  <div className="space-y-1 p-2.5 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-medium text-green-700 dark:text-green-300">
                        Avito: {avitoTask.phase === 'check' ? 'Проверка...' : avitoTask.phase === 'parse' ? 'Парсинг...' : 'Завершено'}
                      </span>
                      <span className="text-[11px] text-green-600 dark:text-green-400 tabular-nums">
                        {avitoTask.current}/{avitoTask.total} {eta && `(${eta})`}
                      </span>
                    </div>
                    <div className="w-full bg-green-200 dark:bg-green-900 rounded-full h-1.5">
                      <div className="bg-green-600 h-1.5 rounded-full transition-all duration-300" style={{ width: `${avitoTask.progress}%` }} />
                    </div>
                    {avitoTask.detail && <p className="text-[10px] text-green-600 dark:text-green-400">{avitoTask.detail}</p>}
                  </div>
                );
              })()}

              {/* Кнопки и настройки — всегда видны */}
              {!cianTask?.status?.startsWith('running') && !avitoTask?.status?.startsWith('running') && (
                <>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    {(() => {
                      // Группировка baseFilteredAds по источникам (без учёта «Фильтра обработки»)
                      const bySource = new Map<string, { active: number; archived: number }>();
                      for (const a of baseFilteredAds) {
                        const src = normalizeSource(a.source) || 'unknown';
                        const entry = bySource.get(src) || { active: 0, archived: 0 };
                        if (a.status === 'active') entry.active++; else entry.archived++;
                        bySource.set(src, entry);
                      }
                      const parts: string[] = [];
                      for (const src of Object.keys(SOURCE_LABELS)) {
                        const e = bySource.get(src);
                        if (e) parts.push(`${SOURCE_LABELS[src]}: ${e.active + e.archived} (акт: ${e.active}, арх: ${e.archived})`);
                      }
                      return <>Всего: {baseFilteredAds.length}{parts.length > 0 ? ' · ' : ''}{parts.join(' · ')}</>;
                    })()}
                  </p>
                  <p className="text-xs text-zinc-400">Быстрая проверка цены и статуса, полный парсинг только для изменившихся.</p>
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-zinc-500 dark:text-zinc-400 whitespace-nowrap">Архивные не старше</label>
                    <input
                      type="number"
                      min={1}
                      max={90}
                      value={archiveDays}
                      onChange={e => setArchiveDays(Math.max(1, Number(e.target.value) || 7))}
                      className="w-14 rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-700 px-1.5 py-1 text-xs text-zinc-900 dark:text-white text-center"
                    />
                    <span className="text-xs text-zinc-500 dark:text-zinc-400">дней</span>
                  </div>
                </>
              )}
              <div className="flex gap-2">
                <button
                  onClick={() => { handleBatchUpdate(); handleAvitoBatchUpdate(); }}
                  disabled={(!!cianTask && cianTask.status === 'running') || (!!avitoTask && avitoTask.status === 'running')}
                  className="rounded-md bg-violet-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
                >
                  <ArrowPathIcon className="size-3.5" />
                  Актуализировать всё
                </button>
                <button
                  onClick={handleBatchUpdate}
                  disabled={!!cianTask && cianTask.status === 'running'}
                  className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
                >
                  <ArrowPathIcon className="size-3.5" />
                  CIAN
                </button>
                <button
                  onClick={handleAvitoBatchUpdate}
                  disabled={!!avitoTask && avitoTask.status === 'running'}
                  className="rounded-md bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
                >
                  <ArrowPathIcon className="size-3.5" />
                  Avito
                </button>
              </div>
            </div>

            <hr className="border-zinc-200 dark:border-zinc-700" />

            {/* Раздел: Поиск дубликатов */}
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-zinc-700 dark:text-zinc-300 flex items-center gap-2">
                <svg className="size-4" viewBox="0 0 16 16" fill="currentColor"><path d="M8 1a2 2 0 110 4 2 2 0 010-4zm0 5a2 2 0 110 4 2 2 0 010-4zm0 5a2 2 0 110 4 2 2 0 010-4z" /></svg>
                Поиск дубликатов
              </h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Автоматическая группировка объявлений одного объекта.
              </p>
              <p className="text-xs text-zinc-400">
                Без объекта: {baseFilteredAds.filter(a => !a.object_id && a.address_id).length}
              </p>

              {/* Прогресс */}
              {dedupTask && (() => {
                const eta = dedupTask.startTime && dedupTask.current && dedupTask.total && dedupTask.current > 0
                  ? (() => { const rem = ((Date.now() - dedupTask.startTime) / dedupTask.current) * (dedupTask.total - dedupTask.current); const s = Math.ceil(rem / 1000); return s < 60 ? `≈ ${s} сек` : `≈ ${Math.floor(s / 60)} мин`; })()
                  : null;
                return (
                  <div className="space-y-1 p-2.5 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-800">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-medium text-purple-700 dark:text-purple-300">
                        {dedupTask.status === 'running' ? 'Поиск...' : dedupTask.status === 'done' ? 'Завершено' : 'Ошибка'}
                      </span>
                      <span className="text-[11px] text-purple-600 dark:text-purple-400 tabular-nums">
                        {dedupTask.current}/{dedupTask.total} {eta && `(${eta})`}
                      </span>
                    </div>
                    <div className="w-full bg-purple-200 dark:bg-purple-900 rounded-full h-1.5">
                      <div className="bg-purple-600 h-1.5 rounded-full transition-all duration-300" style={{ width: `${dedupTask.progress}%` }} />
                    </div>
                    {dedupTask.detail && <p className="text-[10px] text-purple-600 dark:text-purple-400">{dedupTask.detail}</p>}
                  </div>
                );
              })()}

              <div className="flex items-center gap-2">
                <button
                  onClick={handleDeduplicate}
                  disabled={!!dedupTask && dedupTask.status === 'running'}
                  className="rounded-md bg-purple-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
                >
                  <svg className="size-3.5" viewBox="0 0 16 16" fill="currentColor"><path d="M8 1a2 2 0 110 4 2 2 0 010-4zm0 5a2 2 0 110 4 2 2 0 010-4zm0 5a2 2 0 110 4 2 2 0 010-4z" /></svg>
                  Найти дубликаты
                </button>
                <button
                  onClick={handleExportDedup}
                  disabled={baseFilteredObjects.length === 0}
                  className="rounded-md bg-zinc-100 dark:bg-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
                >
                  <svg className="size-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                  Экспорт JSON
                </button>
              </div>
            </div>

            <hr className="border-zinc-200 dark:border-zinc-700" />

            {/* Раздел: Поиск сделок */}
            {dealsModuleActive && (
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-zinc-700 dark:text-zinc-300 flex items-center gap-2">
                <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                Поиск сделок
              </h3>
              <p className="text-xs text-zinc-400">
                Без сделки: {baseFilteredObjects.filter(o => !o.sale_deal).length} из {baseFilteredObjects.length} объектов
              </p>

              {dealMatchTask && (() => {
                const eta = dealMatchTask.startTime && dealMatchTask.current && dealMatchTask.total && dealMatchTask.current > 0
                  ? (() => { const rem = ((Date.now() - dealMatchTask.startTime) / dealMatchTask.current) * (dealMatchTask.total - dealMatchTask.current); const s = Math.ceil(rem / 1000); return s < 60 ? `≈ ${s} сек` : `≈ ${Math.floor(s / 60)} мин`; })()
                  : null;
                return (
                  <div className="space-y-1 p-2.5 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg border border-emerald-200 dark:border-emerald-800">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
                        {dealMatchTask.status === 'running' ? 'Поиск сделок...' : dealMatchTask.status === 'done' ? 'Завершено' : 'Ошибка'}
                      </span>
                      <span className="text-[11px] text-emerald-600 dark:text-emerald-400 tabular-nums">
                        {dealMatchTask.current}/{dealMatchTask.total} {eta && `(${eta})`}
                      </span>
                    </div>
                    <div className="w-full bg-emerald-200 dark:bg-emerald-900 rounded-full h-1.5">
                      <div className="bg-emerald-600 h-1.5 rounded-full transition-all duration-300" style={{ width: `${dealMatchTask.progress}%` }} />
                    </div>
                    {dealMatchTask.detail && <p className="text-[10px] text-emerald-600 dark:text-emerald-400">{dealMatchTask.detail}</p>}
                  </div>
                );
              })()}

              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    if (!startDealMatching(baseFilteredObjects)) {
                      setToast({ message: 'Поиск сделок уже запущен', type: 'info' });
                    }
                  }}
                  disabled={!!dealMatchTask && dealMatchTask.status === 'running'}
                  className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
                >
                  <svg className="size-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                  Найти сделки
                </button>
              </div>
            </div>
            )}

            <hr className="border-zinc-200 dark:border-zinc-700" />

            {/* Раздел 4: Удаление объявлений */}
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-zinc-700 dark:text-zinc-300 flex items-center gap-2"><TrashIcon className="size-4" /> Удаление объявлений</h3>
              <p className="text-xs text-zinc-400">Всего: {allAds.length}, с координатами: {adsWithCoordsCount}</p>
              {!polygonsCoords && <p className="text-xs text-amber-600 dark:text-amber-400">Нарисуйте полигон на карте для удаления объявлений в области.</p>}
              {polygonsCoords && (
                <>
                  <p className="text-xs text-zinc-400">Объявлений в полигоне: {adsInPolygonCount}</p>
                  {!deleteConfirm ? (
                    <button onClick={() => setDeleteConfirm(true)} disabled={adsInPolygonCount === 0} className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2">
                      <TrashIcon className="size-4" /> Удалить в полигоне
                    </button>
                  ) : (
                    <div className="flex items-center gap-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-3">
                      <p className="text-xs text-red-700 dark:text-red-300 font-medium">Удалить {adsInPolygonCount} объявлений в полигоне?</p>
                      <button onClick={handleDeleteInPolygon} disabled={deleteRunning} className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50 flex items-center gap-1.5">
                        {deleteRunning && <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" /></svg>}
                        Да, удалить
                      </button>
                      <button onClick={() => setDeleteConfirm(false)} className="rounded-md bg-zinc-200 dark:bg-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-300 dark:hover:bg-zinc-600">
                        Отмена
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>

            <hr className="border-zinc-200 dark:border-zinc-700" />

            {/* Чекбоксы последовательного запуска */}
            <div className="space-y-2">
              <h3 className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase">Последовательный запуск</h3>
              <div className="flex flex-wrap items-center gap-4">
                <label className="flex items-center gap-1.5 text-xs text-zinc-700 dark:text-zinc-300"><input type="checkbox" checked={runImport} onChange={e => setRunImport(e.target.checked)} className="rounded border-zinc-300 text-blue-600 h-3 w-3" />Загрузить объявления</label>
                <label className="flex items-center gap-1.5 text-xs text-zinc-700 dark:text-zinc-300"><input type="checkbox" checked={runAddress} onChange={e => setRunAddress(e.target.checked)} className="rounded border-zinc-300 text-blue-600 h-3 w-3" />Определить адреса</label>
                <label className="flex items-center gap-1.5 text-xs text-zinc-700 dark:text-zinc-300"><input type="checkbox" checked={runUpdate} onChange={e => setRunUpdate(e.target.checked)} className="rounded border-zinc-300 text-blue-600 h-3 w-3" />Обновить объявления</label>
                <label className="flex items-center gap-1.5 text-xs text-zinc-700 dark:text-zinc-300"><input type="checkbox" checked={runDedup} onChange={e => setRunDedup(e.target.checked)} className="rounded border-zinc-300 text-blue-600 h-3 w-3" />Найти дубликаты</label>
                {dealsModuleActive && <label className="flex items-center gap-1.5 text-xs text-zinc-700 dark:text-zinc-300"><input type="checkbox" checked={runDealMatch} onChange={e => setRunDealMatch(e.target.checked)} className="rounded border-zinc-300 text-emerald-600 h-3 w-3" />Найти сделки</label>}
                <button onClick={handleRunAll} disabled={!runImport && !runAddress && !runUpdate && !runDedup && !runDealMatch} className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed">Запустить выбранные</button>
              </div>
            </div>
          </div>
        )}

        {/* Reports panel — между заголовком и тегами фильтров */}
        {showReports && (
          <AdsReportsPanel
            objects={filteredObjects}
            addresses={addresses.map(a => ({ id: a.id!, address: a.address }))}
            onObjectClick={openObjectDetail}
          />
        )}

        {/* Compact filter summary — всегда видима */}
        {activeFilterTags.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 mb-4">
            <span className="text-[10px] text-zinc-500">Фильтры:</span>
            {activeFilterTags.map(t => (
              <span key={t.key} className="inline-flex items-center gap-1 rounded-full bg-blue-100 dark:bg-blue-900/30 px-2 py-0.5 text-[10px] font-medium text-blue-700 dark:text-blue-300">
                {t.label}
                <button onClick={() => removeFilterTag(t.key)} className="text-blue-500 hover:text-blue-700"><XMarkIcon className="size-3" /></button>
              </span>
            ))}
          </div>
        )}

        {/* Фильтр — между тегами и картой */}
        {showFilters && (
          <div className="rounded-xl bg-white dark:bg-zinc-900 p-5 shadow-sm border border-blue-200 dark:border-blue-800 mb-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Фильтр</h4>
              <button onClick={clearAllFilters} className="inline-flex items-center gap-1 px-2 py-1 text-[11px] text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"><XMarkIcon className="size-3" />Очистить все</button>
            </div>

            {/* Источник */}
            <div className="mb-3">
              <label className="block text-[11px] font-medium text-zinc-500 dark:text-zinc-400 mb-1 uppercase">Источник</label>
              <div className="flex flex-wrap gap-1.5">
                {enabledSources.map(({ key }) => (
                  <button key={key} onClick={() => setFilterSources(prev => prev.includes(key) ? prev.filter(s => s !== key) : [...prev, key])}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${filterSources.includes(key) ? 'bg-blue-600 text-white' : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700'}`}>{SOURCE_LABELS[key] || key}</button>
                ))}
              </div>
            </div>

            {/* Категория */}
            <div className="mb-3">
              <div className="flex items-center justify-between mb-1">
                <label className="block text-[11px] font-medium text-zinc-500 dark:text-zinc-400 uppercase">Категория</label>
                <span className="text-[10px] text-zinc-400">{filterCategoryIds.length} из {categories.length}</span>
              </div>
              {categories.length === 0 ? (
                <span className="text-xs text-zinc-400">Загрузка категорий...</span>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {(() => {
                    const sectionMap = new Map<number, ListingCategoryRaw[]>();
                    for (const c of categories) {
                      if (!sectionMap.has(c.sectionId)) sectionMap.set(c.sectionId, []);
                      sectionMap.get(c.sectionId)!.push(c);
                    }
                    return Array.from(sectionMap.entries()).map(([sectionId, cats]) => {
                      const allSelected = cats.every(c => filterCategoryIds.includes(c.id));
                      return (
                        <div key={sectionId}>
                          <button
                            onClick={() => {
                              const catIds = cats.map(c => c.id);
                              if (allSelected) {
                                setFilterCategoryIds(prev => prev.filter(id => !catIds.includes(id)));
                              } else {
                                setFilterCategoryIds(prev => [...new Set([...prev, ...catIds])]);
                              }
                            }}
                            className="flex items-center gap-1.5 text-[10px] font-medium text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 mb-1"
                          >
                            <span className={`inline-flex h-3 w-3 items-center justify-center rounded border text-[8px] ${allSelected ? 'bg-blue-600 border-blue-600 text-white' : 'border-zinc-300 dark:border-zinc-600'}`}>
                              {allSelected && '✓'}
                            </span>
                            {SECTION_LABELS[sectionId] || `Раздел ${sectionId}`}
                          </button>
                          <div className="flex flex-wrap gap-1 pl-4">
                            {cats.map(c => (
                              <button key={c.id} onClick={() => setFilterCategoryIds(prev => prev.includes(c.id) ? prev.filter(id => id !== c.id) : [...prev, c.id])}
                                className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${filterCategoryIds.includes(c.id) ? 'bg-blue-600 text-white' : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700'}`}>{c.title}</button>
                            ))}
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>
              )}
            </div>

            {/* Диапазоны: цена, площадь, этаж, год */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
              <div>
                <label className="block text-[11px] font-medium text-zinc-500 dark:text-zinc-400 mb-1">Цена от</label>
                <input type="number" placeholder="0" value={filterPriceMin} onChange={e => setFilterPriceMin(e.target.value)} className="w-full rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-700 px-2 py-1.5 text-sm text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-zinc-500 dark:text-zinc-400 mb-1">Цена до</label>
                <input type="number" placeholder="∞" value={filterPriceMax} onChange={e => setFilterPriceMax(e.target.value)} className="w-full rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-700 px-2 py-1.5 text-sm text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="flex items-center justify-between text-[11px] font-medium text-zinc-500 dark:text-zinc-400 mb-1">
                  <span>Площадь от (м²)</span>
                  {areaChartData && (
                    <button type="button" onClick={() => setShowAreaChart(v => !v)} className={`p-0.5 rounded transition-colors ${showAreaChart ? 'text-blue-500' : 'text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300'}`} title="Распределение площадей">
                      <svg className="size-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                    </button>
                  )}
                </label>
                <input type="number" placeholder="0" value={filterAreaMin} onChange={e => setFilterAreaMin(e.target.value)} className="w-full rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-700 px-2 py-1.5 text-sm text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-zinc-500 dark:text-zinc-400 mb-1">Площадь до (м²)</label>
                <input type="number" placeholder="∞" value={filterAreaMax} onChange={e => setFilterAreaMax(e.target.value)} className="w-full rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-700 px-2 py-1.5 text-sm text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-zinc-500 dark:text-zinc-400 mb-1">Этаж от</label>
                <input type="number" min={1} max={100} placeholder="1" value={filterFloorMin} onChange={e => setFilterFloorMin(e.target.value)} className="w-full rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-700 px-2 py-1.5 text-sm text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-zinc-500 dark:text-zinc-400 mb-1">Этаж до</label>
                <input type="number" min={1} max={100} placeholder="∞" value={filterFloorMax} onChange={e => setFilterFloorMax(e.target.value)} className="w-full rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-700 px-2 py-1.5 text-sm text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-zinc-500 dark:text-zinc-400 mb-1">Год постройки от</label>
                <input type="number" min={1900} max={2030} placeholder="1900" value={filterYearMin} onChange={e => setFilterYearMin(e.target.value)} className="w-full rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-700 px-2 py-1.5 text-sm text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-zinc-500 dark:text-zinc-400 mb-1">Год постройки до</label>
                <input type="number" min={1900} max={2030} placeholder="2030" value={filterYearMax} onChange={e => setFilterYearMax(e.target.value)} className="w-full rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-700 px-2 py-1.5 text-sm text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>

            {/* График распределения площадей */}
            {showAreaChart && areaChartData && (
              <AreaStripPlot
                byCategory={areaChartData.byCategory}
                min={areaChartData.min}
                max={areaChartData.max}
                count={areaChartData.count}
                filterMin={areaChartData.filterMin}
                filterMax={areaChartData.filterMax}
              />
            )}

            {/* Параметры дома */}
            {availableHouseSeries.length > 0 && (
              <div className="mb-3">
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-[11px] font-medium text-zinc-500 dark:text-zinc-400 uppercase">Серия дома</label>
                  <span className="text-[10px] text-zinc-400">{filterHouseSeriesIds.length} из {availableHouseSeries.length}{filterAddressIds.size > 0 ? ' (в полигоне)' : ''}</span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {availableHouseSeries.map(s => (
                    <button key={s.server_id} onClick={() => setFilterHouseSeriesIds(prev => prev.includes(s.server_id!) ? prev.filter(x => x !== s.server_id) : [...prev, s.server_id!])}
                      className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${filterHouseSeriesIds.includes(s.server_id!) ? 'bg-blue-600 text-white' : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700'}`}>{s.name}</button>
                  ))}
                </div>
              </div>
            )}
            {availableWallMaterials.length > 0 && (
              <div className="mb-3">
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-[11px] font-medium text-zinc-500 dark:text-zinc-400 uppercase">Материал стен</label>
                  <span className="text-[10px] text-zinc-400">{filterWallMaterialIds.length} из {availableWallMaterials.length}{filterAddressIds.size > 0 ? ' (в полигоне)' : ''}</span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {availableWallMaterials.map(s => (
                    <button key={s.server_id} onClick={() => setFilterWallMaterialIds(prev => prev.includes(s.server_id!) ? prev.filter(x => x !== s.server_id) : [...prev, s.server_id!])}
                      className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${filterWallMaterialIds.includes(s.server_id!) ? 'bg-blue-600 text-white' : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700'}`}>{s.name}</button>
                  ))}
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="block text-[11px] font-medium text-zinc-500 dark:text-zinc-400 mb-1">Этажность дома от</label>
                <input type="number" min={1} max={100} placeholder="1" value={filterFloorsMin} onChange={e => setFilterFloorsMin(e.target.value)} className="w-full rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-700 px-2 py-1.5 text-sm text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-zinc-500 dark:text-zinc-400 mb-1">Этажность дома до</label>
                <input type="number" min={1} max={100} placeholder="∞" value={filterFloorsMax} onChange={e => setFilterFloorsMax(e.target.value)} className="w-full rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-700 px-2 py-1.5 text-sm text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>

            {/* Продавец */}
            <div className="mb-3">
              <label className="block text-[11px] font-medium text-zinc-500 dark:text-zinc-400 mb-1 uppercase">Продавец</label>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(SELLER_TYPE_LABELS).map(([key, label]) => (
                  <button key={key} onClick={() => setFilterSellerTypes(prev => prev.includes(key) ? prev.filter(s => s !== key) : [...prev, key])}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${filterSellerTypes.includes(key) ? 'bg-blue-600 text-white' : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700'}`}>{label}</button>
                ))}
              </div>
            </div>

            {/* Статус + Даты */}
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="block text-[11px] font-medium text-zinc-500 dark:text-zinc-400 mb-1">Статус</label>
                <div className="flex gap-1">
                  <button onClick={() => setFilterStatus('')} className={`px-2 py-1 rounded text-[10px] font-medium transition-colors ${!filterStatus ? 'bg-blue-600 text-white' : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300'}`}>Все</button>
                  <button onClick={() => setFilterStatus('active')} className={`px-2 py-1 rounded text-[10px] font-medium transition-colors ${filterStatus === 'active' ? 'bg-green-600 text-white' : 'bg-zinc-100 text-green-700 hover:bg-green-100 dark:bg-zinc-800 dark:text-green-400'}`}>Активные</button>
                  <button onClick={() => setFilterStatus('archived')} className={`px-2 py-1 rounded text-[10px] font-medium transition-colors ${filterStatus === 'archived' ? 'bg-zinc-600 text-white' : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300'}`}>Архивные</button>
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-medium text-zinc-500 dark:text-zinc-400 mb-1">Дата создания от</label>
                <input type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)} className="rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-700 px-2 py-1.5 text-sm text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-zinc-500 dark:text-zinc-400 mb-1">Дата создания до</label>
                <input type="date" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)} className="rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-700 px-2 py-1.5 text-sm text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
          </div>
        )}

        {/* Карта — всегда видима, сворачиваемая */}
        <div className="overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-700 mb-4">
          <button className="flex w-full items-center gap-2 bg-zinc-50 px-3.5 py-2.5 text-sm font-medium text-zinc-950 transition-colors hover:bg-zinc-100 dark:bg-zinc-800 dark:text-white dark:hover:bg-zinc-700" onClick={() => setShowMapFilter(!showMapFilter)}>
            <MapPinIcon className="size-4" />
            <span>Поиск на карте</span>
            {polygonsCoords && <Badge color="blue" className="ml-2">{polygonsCoords.length} полигон(ов)</Badge>}
            <ChevronDownIcon className={`ml-auto size-4 transition-transform ${showMapFilter ? 'rotate-180' : ''}`} />
          </button>
          {showMapFilter && subscriptionRegionCodes.length > 0 && (() => {
            const regionList = subscriptionRegionCodes
              .map(code => ({ code, ...REGION_CENTERS[code] }))
              .filter(r => r.name);
            if (regionList.length === 0) return null;
            return (
              <div className="flex flex-wrap gap-1.5 border-b border-zinc-200 dark:border-zinc-700 px-3.5 py-2 bg-zinc-50 dark:bg-zinc-800">
                <span className="flex items-center text-xs text-zinc-400 dark:text-zinc-500">Перейти:</span>
                {regionList.map(region => (
                  <button
                    key={region.code}
                    onClick={() => handleFlyToRegion(region.code)}
                    className="cursor-pointer rounded-md bg-zinc-100 px-2 py-1 text-xs font-medium text-zinc-700 transition-colors hover:bg-blue-100 hover:text-blue-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-blue-900/30 dark:hover:text-blue-400"
                  >
                    {region.name}
                  </button>
                ))}
              </div>
            );
          })()}
          {showMapFilter && (
            <SearchByPolygon quarters={dealsModuleActive ? cadastralQuarters : []} quarterStats={{}} onQuartersSelected={(_c, p) => handlePolygonsChange(p ?? null)} initialPolygons={polygonsCoords} flyTo={flyToTarget} addresses={addresses} addressStats={addressStatsMap} referenceData={{ wallMaterials: refWallMaterials, houseSeries: refHouseSeries, houseClasses: refHouseClasses, ceilingMaterials: refCeilingMaterials }} onAddressClick={(addr) => { setAddressModalMode('edit'); setDetailAddress(addr); }} selectedAddressIds={filterAddressIds} highlightedAddressIds={highlightedAddressIds} excludedAddressIds={excludedAddressIds} onAddressToggle={handleAddressToggle} onSelectAllInPolygon={handleSelectAllInPolygon} polygonsCoords={polygonsCoords} adsWithoutAddress={adsWithoutAddress} onAdWithoutAddressClick={(adId) => { const ad = allAds.find(a => a.id === adId); if (ad) setDetailAd(ad); }} onAddressCreate={handleCreateAddressFromMap} />
          )}
        </div>

        {/* Фильтр обработки — над таблицей */}
        {showProcessingFilter && (
          <div className="rounded-xl bg-zinc-50 dark:bg-zinc-800/50 p-4 border border-zinc-200 dark:border-zinc-700 mb-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-xs font-medium text-zinc-600 dark:text-zinc-400 uppercase">Фильтр обработки</h4>
              <button onClick={() => { setFilterProcessingStatus(''); setFilterAddressId(''); setFilterContactType(''); setFilterProcessingCategoryId(''); setFilterProcessingFloor(''); }} className="text-[10px] text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300">Очистить</button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <div>
                <label className="block text-[10px] font-medium text-zinc-500 dark:text-zinc-400 mb-1">Статус обработки</label>
                <select value={filterProcessingStatus} onChange={e => setFilterProcessingStatus(e.target.value)} className="w-full rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-700 px-2 py-1.5 text-xs text-zinc-900 dark:text-white">
                  <option value="">Все статусы</option>
                  <option value="address_needed">Адрес не определён</option>
                  <option value="duplicate_check_needed">Обработать на дубли</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-medium text-zinc-500 dark:text-zinc-400 mb-1">Адрес</label>
                <AddressCombobox
                  addresses={addresses.filter(a => a.id != null).map(a => ({ id: a.id!, address: a.address }))}
                  value={filterAddressId}
                  onChange={id => { setFilterAddressId(id); setPage(1); }}
                  placeholder="Все адреса"
                />
              </div>
              <div>
                <label className="block text-[10px] font-medium text-zinc-500 dark:text-zinc-400 mb-1">Категория</label>
                <select value={filterProcessingCategoryId} onChange={e => setFilterProcessingCategoryId(Number(e.target.value) || '')} className="w-full rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-700 px-2 py-1.5 text-xs text-zinc-900 dark:text-white">
                  <option value="">Все категории</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-medium text-zinc-500 dark:text-zinc-400 mb-1">Этаж</label>
                <input type="number" min={1} max={100} placeholder="Этаж" value={filterProcessingFloor} onChange={e => setFilterProcessingFloor(e.target.value)} className="w-full rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-700 px-2 py-1.5 text-xs text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-[10px] font-medium text-zinc-500 dark:text-zinc-400 mb-1">Контакт</label>
                <select value={filterContactType} onChange={e => setFilterContactType(e.target.value)} className="w-full rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-700 px-2 py-1.5 text-xs text-zinc-900 dark:text-white">
                  <option value="">Все контакты</option>
                  {Object.entries(SELLER_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
            </div>
          </div>
        )}

        {/* Action buttons + table */}
        <div className="rounded-xl bg-white shadow-sm dark:bg-zinc-900 overflow-hidden">
          {/* Toolbar: слева — действия с выбранными, справа — фильтры и тогглы панелей */}
          <div className="relative flex items-center gap-2 border-b border-zinc-200 dark:border-zinc-700 px-4 py-2 flex-wrap">
            {/* Полоса загрузки по нижнему бордюру — пока идёт расчёт позиции на рынке */}
            {lowMarketComputing && (
              <div className="absolute bottom-[-1px] left-0 right-0 h-[2px] overflow-hidden pointer-events-none">
                <div className="low-market-loading-bar h-full w-1/4 bg-gradient-to-r from-transparent via-emerald-500 to-transparent" />
              </div>
            )}
            {/* ── Левая часть: действия ── */}
            <input type="checkbox" checked={pagedRows.length > 0 && selectedIds.size > 0} onChange={toggleSelectAll} className="h-3 w-3 rounded border-zinc-300 text-blue-600" title="Выбрать все на странице" />
            <button disabled={selectedIds.size === 0} onClick={handleMergeSelected} className="px-2 py-1 rounded text-[11px] font-medium bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 hover:bg-orange-200 disabled:opacity-30 disabled:cursor-not-allowed">Объединить</button>
            <button disabled={selectedIds.size === 0 || ![...selectedTypes.values()].some(t => t === 'object')} onClick={handleSplitSelected} className="px-2 py-1 rounded text-[11px] font-medium bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400 hover:bg-sky-200 disabled:opacity-30 disabled:cursor-not-allowed">Разбить</button>
            {(() => {
              const unlinkCount = collectSelectedAdIds().length;
              if (!unlinkSelectedConfirm) {
                return (
                  <button
                    disabled={unlinkCount === 0}
                    onClick={() => setUnlinkSelectedConfirm(true)}
                    className="px-2 py-1 rounded text-[11px] font-medium bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/40 disabled:opacity-30 disabled:cursor-not-allowed"
                    title="Отвязать адрес у выбранных объявлений (и у объявлений выбранных объектов)"
                  >
                    Отвязать адрес{unlinkCount > 0 ? ` (${unlinkCount})` : ''}
                  </button>
                );
              }
              return (
                <div className="flex items-center gap-1">
                  <span className="text-[10px] text-amber-700 dark:text-amber-400">Отвязать {unlinkCount}?</span>
                  <button onClick={handleUnlinkSelected} className="px-2 py-1 rounded text-[10px] font-medium bg-amber-600 text-white hover:bg-amber-700">Да</button>
                  <button onClick={() => setUnlinkSelectedConfirm(false)} className="px-2 py-1 rounded text-[10px] font-medium bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-700 dark:text-zinc-300">Нет</button>
                </div>
              );
            })()}
            <button
              disabled={selectedIds.size === 0 || importTasks.some(t => (t.type === 'cian-update' || t.type === 'avito-update') && t.status === 'running')}
              onClick={handleActualizeSelected}
              className="px-2 py-1 rounded text-[11px] font-medium bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/40 disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1"
              title="Запустить обновление (CIAN/Avito) для выбранных объявлений и объявлений выбранных объектов"
            >
              {importTasks.some(t => (t.type === 'cian-update' || t.type === 'avito-update') && t.status === 'running') ? (
                <svg className="size-3 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
              ) : (
                <svg className="size-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
              )}
              {importTasks.some(t => (t.type === 'cian-update' || t.type === 'avito-update') && t.status === 'running') ? 'Обновляется…' : 'Обновить'}
            </button>
            {!deleteSelectedConfirm ? (
              <button disabled={selectedIds.size === 0} onClick={() => setDeleteSelectedConfirm(true)} className="px-2 py-1 rounded text-[11px] font-medium bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400 hover:bg-red-100 disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1"><TrashIcon className="size-3" />Удалить</button>
            ) : (
              <div className="flex items-center gap-1">
                <span className="text-[10px] text-red-600 dark:text-red-400">Удалить {selectedIds.size}?</span>
                <button onClick={handleDeleteSelected} disabled={deleteRunning} className="px-2 py-1 rounded text-[10px] font-medium bg-red-600 text-white hover:bg-red-700 disabled:opacity-50">Да</button>
                <button onClick={() => setDeleteSelectedConfirm(false)} className="px-2 py-1 rounded text-[10px] font-medium bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-700 dark:text-zinc-300">Нет</button>
              </div>
            )}
            {selectedIds.size > 0 && <span className="text-[10px] text-blue-600 dark:text-blue-400 ml-1">{selectedIds.size} выбрано</span>}

            {/* ── Центральный разделитель ── */}
            <div className="flex-1" />

            {/* ── Правая часть: фильтры таблицы ── */}
            <div className="flex items-center gap-1.5 pl-2 ml-1 border-l border-zinc-200 dark:border-zinc-700">
              <span className="text-[10px] text-zinc-400 dark:text-zinc-500 mr-0.5 hidden sm:inline">Статус:</span>
              <div className="flex items-center gap-0.5">
                {(['all', 'active', 'archived'] as const).map(s => (
                  <button
                    key={s}
                    onClick={() => { setLocalStatusFilter(s); setPage(1); }}
                    className={`px-2 py-1 rounded text-[10px] font-medium border ${
                      localStatusFilter === s
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'border-zinc-300 dark:border-zinc-600 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800'
                    }`}
                  >
                    {s === 'all' ? 'Все' : s === 'active' ? 'Активные' : 'Архив'}
                  </button>
                ))}
              </div>
            </div>

            {showLowMarket && (
              <div className="flex items-center gap-1 pl-2 ml-1 border-l border-zinc-200 dark:border-zinc-700">
                <button
                  onClick={() => { setLowMarketOnly(v => !v); setPage(1); }}
                  className={`px-2 py-1 rounded text-[10px] font-medium border ${
                    lowMarketOnly
                      ? 'bg-emerald-700 text-white border-emerald-700 hover:bg-emerald-800'
                      : 'border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 hover:bg-emerald-100 dark:hover:bg-emerald-900/40'
                  }`}
                  title="Показывать только объявления и объекты ниже порога рынка"
                >
                  Только низ
                </button>
                <button
                  onClick={() => setShowLowMarketSettings(v => !v)}
                  className={`px-1.5 py-1 rounded text-[10px] border ${
                    showLowMarketSettings
                      ? 'bg-zinc-200 dark:bg-zinc-700 border-zinc-300 dark:border-zinc-600 text-zinc-700 dark:text-zinc-200'
                      : 'border-zinc-300 dark:border-zinc-600 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800'
                  }`}
                  title="Настройки анализа рынка"
                >
                  <svg className="size-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                </button>
              </div>
            )}

            <div className="flex items-center gap-2 pl-2 ml-1 border-l border-zinc-200 dark:border-zinc-700">
              <label
                className={`flex items-center gap-1 text-[11px] cursor-pointer ${polygonsCoords && polygonsCoords.length > 0 ? 'text-zinc-500 dark:text-zinc-400' : 'text-zinc-300 dark:text-zinc-600 cursor-not-allowed'}`}
                title={polygonsCoords && polygonsCoords.length > 0 ? 'Включить инвест-фильтр' : 'Сначала нарисуйте полигон на карте'}
              >
                <input
                  type="checkbox"
                  checked={showLowMarket}
                  disabled={!polygonsCoords || polygonsCoords.length === 0}
                  onChange={e => {
                    const v = e.target.checked;
                    if (v && (!polygonsCoords || polygonsCoords.length === 0)) return;
                    setShowLowMarket(v);
                    if (!v) { setLowMarketOnly(false); setShowLowMarketSettings(false); }
                  }}
                  className="h-3 w-3 rounded border-zinc-300 text-emerald-600"
                />
                Инвест-фильтр
              </label>
              <label className="flex items-center gap-1 text-[11px] text-zinc-500 dark:text-zinc-400 cursor-pointer">
                <input type="checkbox" checked={showProcessingFilter} onChange={e => setShowProcessingFilter(e.target.checked)} className="h-3 w-3 rounded border-zinc-300 text-blue-600" />
                Фильтр обработки
              </label>
            </div>

            <span className="text-xs text-zinc-500 dark:text-zinc-400 whitespace-nowrap min-w-[70px] text-right pl-2 ml-1 border-l border-zinc-200 dark:border-zinc-700">
              {loading ? '…' : `Всего: ${topLevelRows.length}`}
            </span>
          </div>

          {/* Панель настроек анализа рынка */}
          {showLowMarket && showLowMarketSettings && (
            <div className="border-b border-zinc-200 dark:border-zinc-700 bg-emerald-50/40 dark:bg-emerald-900/10 px-4 py-3">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block text-[10px] font-medium text-zinc-600 dark:text-zinc-400 mb-1">Гео-фильтр</label>
                  <select
                    value={lowMarketOptions.usePolygonInsteadOfRadius ? 'polygon' : 'radius'}
                    onChange={e => setLowMarketOptions(o => ({ ...o, usePolygonInsteadOfRadius: e.target.value === 'polygon' }))}
                    className="w-full rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-700 px-2 py-1 text-[11px] text-zinc-900 dark:text-white"
                  >
                    <option value="radius">Радиус {lowMarketOptions.radiusKm} км</option>
                    <option value="polygon">Полигон карты{!polygonsCoords ? ' (нет)' : ''}</option>
                  </select>
                </div>
                <div className={lowMarketOptions.usePolygonInsteadOfRadius ? 'opacity-40 pointer-events-none' : ''}>
                  <label className="block text-[10px] font-medium text-zinc-600 dark:text-zinc-400 mb-1">Радиус, км</label>
                  <select
                    value={lowMarketOptions.radiusKm}
                    onChange={e => setLowMarketOptions(o => ({ ...o, radiusKm: Number(e.target.value) }))}
                    className="w-full rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-700 px-2 py-1 text-[11px] text-zinc-900 dark:text-white"
                  >
                    {[0.5, 1, 1.5, 2, 3, 5].map(r => <option key={r} value={r}>{r} км</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-medium text-zinc-600 dark:text-zinc-400 mb-1">Порог: дешевле, чем</label>
                  <select
                    value={lowMarketOptions.lowMarketThreshold}
                    onChange={e => setLowMarketOptions(o => ({ ...o, lowMarketThreshold: Number(e.target.value) }))}
                    className="w-full rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-700 px-2 py-1 text-[11px] text-zinc-900 dark:text-white"
                  >
                    {[5, 10, 15, 20, 25, 30].map(p => <option key={p} value={p}>{p}% аналогов</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-medium text-zinc-600 dark:text-zinc-400 mb-1">Допуск площади</label>
                  <select
                    value={lowMarketOptions.areaTolerance}
                    onChange={e => setLowMarketOptions(o => ({ ...o, areaTolerance: Number(e.target.value) }))}
                    className="w-full rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-700 px-2 py-1 text-[11px] text-zinc-900 dark:text-white"
                  >
                    {[0.05, 0.1, 0.15, 0.2, 0.25, 0.3].map(t => <option key={t} value={t}>{Math.round(t * 100)}%</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-2">
                <div>
                  <label className="block text-[10px] font-medium text-zinc-600 dark:text-zinc-400 mb-1">Минимум аналогов</label>
                  <select
                    value={lowMarketOptions.minComparables}
                    onChange={e => setLowMarketOptions(o => ({ ...o, minComparables: Number(e.target.value) }))}
                    className="w-full rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-700 px-2 py-1 text-[11px] text-zinc-900 dark:text-white"
                  >
                    {[3, 5, 8, 10, 15].map(n => <option key={n} value={n}>{n} объявлений</option>)}
                  </select>
                </div>
                <div className="flex items-center gap-3 flex-wrap">
                  <label className="flex items-center gap-1 text-[11px] text-zinc-700 dark:text-zinc-300 cursor-pointer">
                    <input type="checkbox" checked={lowMarketOptions.useWallMaterial} onChange={e => setLowMarketOptions(o => ({ ...o, useWallMaterial: e.target.checked }))} className="h-3 w-3 rounded border-zinc-300 text-emerald-600" />
                    Материал стен
                  </label>
                  <label className="flex items-center gap-1 text-[11px] text-zinc-700 dark:text-zinc-300 cursor-pointer">
                    <input type="checkbox" checked={lowMarketOptions.useYearBuilt} onChange={e => setLowMarketOptions(o => ({ ...o, useYearBuilt: e.target.checked }))} className="h-3 w-3 rounded border-zinc-300 text-emerald-600" />
                    Год постройки
                  </label>
                  <label className="flex items-center gap-1 text-[11px] text-zinc-700 dark:text-zinc-300 cursor-pointer" title="Сегментация по этажности: 1-4, 5, 6-9, 10-16, 17+ этажей">
                    <input type="checkbox" checked={lowMarketOptions.useFloorsTotal} onChange={e => setLowMarketOptions(o => ({ ...o, useFloorsTotal: e.target.checked }))} className="h-3 w-3 rounded border-zinc-300 text-emerald-600" />
                    Этажность
                  </label>
                  <label className="flex items-center gap-1 text-[11px] text-zinc-700 dark:text-zinc-300 cursor-pointer" title="У первых этажей структурный дисконт ~10% — они искажают медиану вниз. Для target на 1-м этаже фильтр отключается автоматически.">
                    <input type="checkbox" checked={lowMarketOptions.excludeFirstFloor} onChange={e => setLowMarketOptions(o => ({ ...o, excludeFirstFloor: e.target.checked }))} className="h-3 w-3 rounded border-zinc-300 text-emerald-600" />
                    Искл. 1 этаж
                  </label>
                  <label className="flex items-center gap-1 text-[11px] text-zinc-700 dark:text-zinc-300 cursor-pointer" title="Удалять выбросы (битые цены) через межквартильный размах перед расчётом перцентилей">
                    <input type="checkbox" checked={lowMarketOptions.useIqrFilter} onChange={e => setLowMarketOptions(o => ({ ...o, useIqrFilter: e.target.checked }))} className="h-3 w-3 rounded border-zinc-300 text-emerald-600" />
                    IQR-фильтр
                  </label>
                </div>
                {lowMarketOptions.useYearBuilt && (
                  <div>
                    <label className="block text-[10px] font-medium text-zinc-600 dark:text-zinc-400 mb-1">Допуск года, лет</label>
                    <select
                      value={lowMarketOptions.yearTolerance}
                      onChange={e => setLowMarketOptions(o => ({ ...o, yearTolerance: Number(e.target.value) }))}
                      className="w-full rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-700 px-2 py-1 text-[11px] text-zinc-900 dark:text-white"
                    >
                      {[3, 5, 10, 15, 20, 25].map(y => <option key={y} value={y}>±{y} лет</option>)}
                    </select>
                  </div>
                )}
              </div>
              {lowMarketOptions.usePolygonInsteadOfRadius && !polygonsCoords && (
                <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-2">⚠ Полигон не выделен на карте — будет использован радиус {lowMarketOptions.radiusKm} км.</p>
              )}
            </div>
          )}

          {/* Pagination top */}
          <PaginationBar
              page={page} totalPages={totalPages} pageSize={pageSize}
              totalItems={topLevelRows.length}
              onPageChange={setPage}
              onPageSizeChange={s => { setPageSize(s); setPage(1); }}
            />

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 dark:bg-zinc-800 border-b border-zinc-200 dark:border-zinc-700">
                <tr className="text-left text-[10px] font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                  <th className="px-2 py-2 w-6"></th>
                  <th className="px-1 py-2 w-6"></th>
                  <th className="px-2 py-2 w-32 cursor-pointer select-none whitespace-nowrap hover:text-zinc-700 dark:hover:text-zinc-200" onClick={() => toggleSort('status')}>Статус{sortIcon('status')}</th>
                  <th className="px-2 py-2 w-24 cursor-pointer select-none whitespace-nowrap hover:text-zinc-700 dark:hover:text-zinc-200" onClick={() => toggleSort('created')}>Создано{sortIcon('created')}</th>
                  <th className="px-2 py-2 w-24 cursor-pointer select-none whitespace-nowrap hover:text-zinc-700 dark:hover:text-zinc-200" onClick={() => toggleSort('updated')}>Обновлено{sortIcon('updated')}</th>
                  <th className="px-2 py-2">Характеристики</th>
                  <th className="px-2 py-2">Адрес</th>
                  <th className="px-2 py-2 w-28 text-right cursor-pointer select-none hover:text-zinc-700 dark:hover:text-zinc-200" onClick={() => toggleSort('price')}>Цена{sortIcon('price')}</th>
                  <th className="px-2 py-2 w-28">Контакт</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {!loading && tableRows.length === 0 ? (
                  <tr><td colSpan={9} className="px-4 py-12 text-center text-zinc-400 text-sm">Нет данных. Откройте «Обработка объявлений» для импорта.</td></tr>
                ) : pagedRows.map((row, idx) => renderRow(row, idx))}
              </tbody>
            </table>
          </div>

          {/* Pagination bottom */}
          <PaginationBar
              page={page} totalPages={totalPages} pageSize={pageSize}
              totalItems={topLevelRows.length} position="bottom"
              onPageChange={setPage}
              onPageSizeChange={s => { setPageSize(s); setPage(1); }}
            />
        </div>
      </div>

      {/* Detail Ad Modal */}
      {detailAd && (
        <AdDetailModal
          ad={detailAd}
          addresses={addresses}
          comparableAds={showLowMarket ? baseFilteredAds : undefined}
          marketOptions={showLowMarket ? lowMarketOptions : undefined}
          polygonsCoords={polygonsCoords}
          referenceData={{
            wallMaterials: refWallMaterials,
            houseSeries: refHouseSeries,
            houseClasses: refHouseClasses,
            ceilingMaterials: refCeilingMaterials,
            houseProblems: refHouseProblems,
          }}
          onClose={() => setDetailAd(null)}
          onSave={async (updated) => {
            // Сохраняем в БД
            if (updated.id) {
              await adsRepository.update(updated.id, updated);
            }
            setAllAds(prev => prev.map(a => a.id === updated.id ? updated : a));
            // Если объявление привязано к объекту — пересчитать объект
            if (updated.object_id) {
              await recalculateAndSaveObject(updated.object_id);
            }
            await loadData();
            await loadStats();
          }}
          onDelete={async (deleted) => {
            if (deleted.id) {
              await db.table('ads').delete(deleted.id);
            }
            setAllAds(prev => prev.filter(a => a.id !== deleted.id));
            setDetailAd(null);
            await loadData();
            await loadStats();
          }}
          onAddressChange={async () => {
            const adId = detailAd?.id;
            if (!adId) return;
            await loadData();
            await loadStats();
            // Не открываем модалку повторно, если пользователь её закрыл
            if (detailAdRef.current?.id !== adId) return;
            const fresh = await db.table<Ad>('ads').get(adId);
            if (fresh && detailAdRef.current?.id === adId) setDetailAd(fresh);
          }}
          onOpenCreateAddress={handleOpenCreateAddress}
          onOpenEditAddress={(addr) => { setAddressModalMode('edit'); setDetailAddress(addr); }}
        />
      )}

      {/* Detail Object Modal */}
      {detailObject && (
        <AdObjectDetailModal
          obj={detailObject}
          listings={objectAds.get(detailObject.id!) || []}
          addresses={addresses}
          comparableAds={showLowMarket ? baseFilteredAds : undefined}
          marketOptions={showLowMarket ? lowMarketOptions : undefined}
          polygonsCoords={polygonsCoords}
          dealsModuleActive={dealsModuleActive}
          onClose={() => setDetailObject(null)}
          onAdClick={(ad) => { setDetailObject(null); setDetailAd(ad); }}
          onLinkDeal={async (objectId, saleDeal) => {
            await db.table('ad_objects').update(objectId, { sale_deal: saleDeal });
            setDetailObject(prev => prev ? { ...prev, sale_deal: saleDeal } : prev);
            await loadData();
          }}
          onUnlinkDeal={async (objectId) => {
            await db.table('ad_objects').update(objectId, { sale_deal: null });
            setDetailObject(prev => prev ? { ...prev, sale_deal: null } : prev);
            await loadData();
          }}
        />
      )}

      {/* Address Assign Modal — привязка/смена адреса */}
      {assignAd && (
        <AdAddressAssignModal
          ad={assignAd}
          addresses={addresses}
          referenceData={{
            wallMaterials: refWallMaterials,
            houseSeries: refHouseSeries,
            houseClasses: refHouseClasses,
            ceilingMaterials: refCeilingMaterials,
            houseProblems: refHouseProblems,
          }}
          onClose={() => setAssignAd(null)}
          onLink={handleLinkAd}
          onUnlink={handleUnlinkAd}
          onConfirm={handleConfirmAd}
          onOpenCreate={handleOpenCreateAddress}
          onOpenEdit={(addr) => { setAssignAd(null); setAddressModalMode('edit'); setDetailAddress(addr); }}
        />
      )}

      {/* Address Modal — редактирование / создание адреса */}
      {detailAddress && (
        <AdAddressModal
          address={detailAddress}
          mode={addressModalMode}
          referenceData={{
            wallMaterials: refWallMaterials,
            houseSeries: refHouseSeries,
            houseClasses: refHouseClasses,
            ceilingMaterials: refCeilingMaterials,
            houseProblems: refHouseProblems,
          }}
          onClose={() => { setDetailAddress(null); setCreateAddressForAd(null); }}
          onSave={handleAddressSaved}
          onDelete={async (deletedId) => {
            // Удалить адрес из state — карта перерисуется автоматически
            setAddresses(prev => prev.filter(a => a.id !== deletedId));
            await loadData();
            await loadStats();
          }}
        />
      )}

      {/* Saved Filters Panel */}
      <AdsSavedFiltersPanel
        open={showSavedPanel}
        onClose={() => setShowSavedPanel(false)}
        currentState={getFilterState()}
        onApply={handleApplySavedFilter}
        activeFilterId={activeFilterId}
      />
    </div>
  );
};

export default AdsPage;
