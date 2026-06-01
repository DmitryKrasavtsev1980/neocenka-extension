/**
 * Модальное окно деталей объекта недвижимости
 * — Характеристики объекта + параметры
 * — Текущая цена + график динамики
 * — Фотографии и описание выбранного объявления
 * — Таблица объявлений объекта
 * — Подходящие сделки Росреестра (если модуль активен)
 * — Привязка сделки к объекту (подтверждённая продажа)
 */

import React, { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { AdObject, Ad, AdAddress, SaleDeal } from '@/types';
import type { Deal } from '@/types';
import { getMapConfig, createTileLayer } from '@/services/map-config';
import { dealsRepository } from '@/db/repositories/deals.repository';
import { cadastralRepository } from '@/db/repositories/cadastral.repository';
import { REAL_ESTATE_TYPES, WALL_MATERIALS, getWallMaterialName } from '@/constants/catalogs';

const PROPERTY_TYPE_FULL: Record<string, string> = {
  studio: 'Студия', '1k': '1-комн.', '2k': '2-комн.', '3k': '3-комн.', '4k+': '4+ комн.',
};
const SOURCE_LABELS: Record<string, string> = {
  avito: 'avito.ru', cian: 'cian.ru', domclick: 'domclick.ru', yandex: 'realty.yandex.ru', youla: 'youla.io', sob: 'sob.ru', bazarpnz: 'bazarpnz.ru', move: 'move.ru', gipernn: 'gipernn.ru', orsk: 'orsk.ru', doskaYkt: 'doska.ykt.ru', unknown: '?',
};
const SELLER_TYPE_LABELS: Record<string, string> = {
  owner: 'Собственник', agent: 'Агент', developer: 'Застройщик',
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

const fmtDateTime = (date: string | null): string => {
  if (!date) return '—';
  try { return new Date(date).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }); }
  catch { return date; }
};

const formatPeriod = (yq: string): string => {
  const [year, q] = yq.split('-Q');
  return `Q${q} ${year}`;
};

const formatDealPrice = (price: number): string => {
  return Math.round(price).toLocaleString('ru-RU');
};

const formatPricePerMeter = (price: number, area: number): string | null => {
  if (!area || area <= 0) return null;
  return `${Math.round(price / area).toLocaleString('ru-RU')} ₽/м²`;
};

// pointInPolygon — ray casting алгоритм
function pointInPolygon(lat: number, lng: number, polygon: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [latI, lngI] = polygon[i];
    const [latJ, lngJ] = polygon[j];
    if (((latI > lat) !== (latJ > lat)) &&
        (lng < (lngJ - lngI) * (lat - latI) / (latJ - latI) + lngI)) {
      inside = !inside;
    }
  }
  return inside;
}

// Приблизительная площадь полигона в квадратных градусах (Shoelace formula)
// Используется только для сравнения — выбирать наименьший из вложенных кварталов
function polygonArea(polygon: [number, number][]): number {
  let area = 0;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    area += (polygon[j][0] + polygon[i][0]) * (polygon[j][1] - polygon[i][1]);
  }
  return Math.abs(area / 2);
}

// Текущий + следующий квартал года
function getRelevantYearQuarters(dateStr: string | null): string[] {
  const date = dateStr ? new Date(dateStr) : new Date();
  const year = date.getFullYear();
  const month = date.getMonth();
  const quarter = Math.floor(month / 3) + 1;
  const result = [`${year}-Q${quarter}`];
  if (quarter === 4) {
    result.push(`${year + 1}-Q1`);
  } else {
    result.push(`${year}-Q${quarter + 1}`);
  }
  return result;
}

interface AdObjectDetailModalProps {
  obj: AdObject;
  listings: Ad[];
  addresses: AdAddress[];
  dealsModuleActive: boolean;
  onClose: () => void;
  onAdClick?: (ad: Ad) => void;
  onLinkDeal?: (objectId: number, saleDeal: SaleDeal) => void;
  onUnlinkDeal?: (objectId: number) => void;
}

const AdObjectDetailModal: React.FC<AdObjectDetailModalProps> = ({
  obj, listings, addresses, dealsModuleActive, onClose, onAdClick, onLinkDeal, onUnlinkDeal,
}) => {
  const [selectedAd, setSelectedAd] = useState<Ad | null>(listings[0] || null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);

  // Deals state
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loadingDeals, setLoadingDeals] = useState(false);
  const [cadQuarter, setCadQuarter] = useState<string | null>(null);
  const [selectedDealId, setSelectedDealId] = useState<number | null>(null);
  const [useYearQuarters, setUseYearQuarters] = useState(obj.status === 'archive');
  const [useFloorFilter, setUseFloorFilter] = useState(true);
  const [useAreaFilter, setUseAreaFilter] = useState(true);

  const sortedListings = useMemo(() => {
    return [...listings].sort((a, b) => {
      const ta = new Date(a.updated || a.created || 0).getTime();
      const tb = new Date(b.updated || b.created || 0).getTime();
      return tb - ta;
    });
  }, [listings]);

  const objAddress = obj.address_id ? addresses.find(a => a.id === obj.address_id) : null;
  const mapLat = objAddress?.coordinates?.lat ?? listings.find(a => a.coordinates?.lat != null)?.coordinates?.lat;
  const mapLng = objAddress?.coordinates?.lng ?? listings.find(a => a.coordinates?.lng != null)?.coordinates?.lng;
  const mapAddressText = objAddress?.address || listings.find(a => a.address)?.address || '';

  // Инициализация мини-карты
  useEffect(() => {
    if (!mapContainerRef.current) return;
    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
    }
    const map = L.map(mapContainerRef.current, {
      attributionControl: false, zoomControl: true, dragging: true, scrollWheelZoom: false, doubleClickZoom: true,
    });
    const mapConfig = getMapConfig();
    createTileLayer(mapConfig).addTo(map);
    if (mapLat != null && mapLng != null) {
      map.setView([mapLat, mapLng], 17);
      L.marker([mapLat, mapLng], {
        icon: L.divIcon({
          html: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="36" viewBox="0 0 24 36"><path d="M12 0C5.37 0 0 5.37 0 12c0 9 12 24 12 24s12-15 12-24C24 5.37 18.63 0 12 0z" fill="#ea4335"/><circle cx="12" cy="12" r="5" fill="#fff"/></svg>`,
          iconSize: [24, 36], iconAnchor: [12, 36], className: '',
        }),
      }).addTo(map);
      if (mapAddressText) {
        L.popup({ closeButton: false, offset: [0, -36] }).setLatLng([mapLat, mapLng]).setContent(`<div style="font-size:12px;max-width:250px;">${mapAddressText}</div>`).openOn(map);
      }
    } else {
      map.setView([55.7558, 37.6173], 10);
    }
    setTimeout(() => map.invalidateSize(), 100);
    mapInstanceRef.current = map;
    return () => { if (mapInstanceRef.current) { mapInstanceRef.current.remove(); mapInstanceRef.current = null; } };
  }, [mapLat, mapLng, mapAddressText]);

  const photos = selectedAd?.photos || [];

  useEffect(() => {
    if (lightboxIndex == null) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightboxIndex(null);
      else if (e.key === 'ArrowLeft' && lightboxIndex > 0) setLightboxIndex(lightboxIndex - 1);
      else if (e.key === 'ArrowRight' && lightboxIndex < photos.length - 1) setLightboxIndex(lightboxIndex + 1);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [lightboxIndex, photos.length]);

  const priceChartData = useMemo(() => {
    const points: { date: string; price: number; shortDate: string }[] = [];
    for (const h of obj.price_history || []) {
      points.push({ date: h.date, price: h.new_price ?? h.price ?? 0, shortDate: fmtDate(h.date) });
    }
    if (obj.current_price != null) {
      const lastDate = obj.status === 'archive' && obj.updated ? obj.updated : new Date().toISOString();
      points.push({ date: lastDate, price: obj.current_price, shortDate: fmtDate(lastDate) });
    }
    return points;
  }, [obj.price_history, obj.current_price, obj.updated, obj.status]);

  const headerAddress = objAddress?.address
    || listings.find(a => a.address)?.address
    || (obj.address_id ? `Адрес #${obj.address_id}` : '');

  // Загрузка сделок
  const loadDeals = useCallback(async () => {
    if (!dealsModuleActive || !objAddress?.coordinates?.lat || !objAddress?.coordinates?.lng) return;
    setLoadingDeals(true);
    try {
      // Найти кадастровый квартал
      const quarters = await cadastralRepository.getAllWithGeojson();
      // Фильтруем «мусорные» кварталы вида "54:00:000000" — это областные/районные охваты
      const realQuarters = quarters.filter(q => {
        const parts = q.cad_number.split(':');
        if (parts.length >= 3) {
          const quarterPart = parts[2];
          // Отбрасываем кварталы, у которых часть после второго двоеточия — все нули
          if (/^0+$/.test(quarterPart)) return false;
        }
        return true;
      });
      // Среди попавших выбираем квартал с наименьшей площадью полигона
      let foundCadNumber: string | null = null;
      let bestArea = Infinity;
      for (const q of realQuarters) {
        if (q.geojson?.geometry?.type === 'Polygon') {
          const coords = q.geojson.geometry.coordinates[0] as number[][];
          const polygon: [number, number][] = coords.map(c => [c[1], c[0]]);
          if (pointInPolygon(objAddress.coordinates!.lat!, objAddress.coordinates!.lng!, polygon)) {
            const polyArea = polygonArea(polygon);
            if (polyArea < bestArea) {
              bestArea = polyArea;
              foundCadNumber = q.cad_number;
            }
          }
        }
      }
      setCadQuarter(foundCadNumber);
      if (!foundCadNumber) { setLoadingDeals(false); return; }

      // Фильтры
      const yearQuarters = useYearQuarters ? getRelevantYearQuarters(obj.updated) : undefined;
      const floorMin = useFloorFilter && obj.floor != null ? obj.floor : undefined;
      const floorMax = useFloorFilter && obj.floor != null ? obj.floor : undefined;
      const areaMin = useAreaFilter && obj.area_total != null ? obj.area_total - 5 : undefined;
      const areaMax = useAreaFilter && obj.area_total != null ? obj.area_total + 5 : undefined;

      const result = await dealsRepository.searchLight({
        quarter_cad_numbers: [foundCadNumber],
        year_quarters: yearQuarters,
        floor_min: floorMin,
        floor_max: floorMax,
        area_min: areaMin,
        area_max: areaMax,
      }, 1, 100);

      setDeals(result.pageDeals);
    } catch (err) {
      console.error('[Deals] Error loading deals:', err);
    } finally {
      setLoadingDeals(false);
    }
  }, [dealsModuleActive, objAddress?.coordinates?.lat, objAddress?.coordinates?.lng, obj.floor, obj.area_total, obj.updated, useYearQuarters, useFloorFilter, useAreaFilter]);

  useEffect(() => { loadDeals(); }, [loadDeals]);

  const handleLinkDeal = () => {
    const deal = deals.find(d => d.id === selectedDealId);
    if (!deal || !obj.id || !onLinkDeal) return;
    const saleDeal: SaleDeal = {
      deal_price: deal.deal_price,
      deal_area: deal.area,
      deal_floor: deal.floor,
      deal_year_quarter: deal.year_quarter,
      deal_doc_type: deal.doc_type,
      deal_price_per_meter: deal.area > 0 ? Math.round(deal.deal_price / deal.area) : 0,
      deal_linked_at: new Date().toISOString(),
    };
    onLinkDeal(obj.id, saleDeal);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-xl max-w-5xl w-full max-h-[90vh] flex flex-col mx-4" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex-shrink-0 px-5 py-3 border-b border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 rounded-t-xl z-20">
          <div className="flex items-center justify-between">
            <div className="min-w-0 flex items-center gap-2">
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-white truncate">
                {[
                  PROPERTY_TYPE_FULL[obj.property_type || ''] || obj.property_type || '—',
                  obj.area_total != null ? `${obj.area_total} м²` : '',
                  obj.floor != null ? `эт. ${obj.floor}/${obj.floors_total ?? '?'}` : '',
                  obj.owner_status || '',
                ].filter(Boolean).join(', ')}
              </h2>
              {obj.sale_deal && (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 whitespace-nowrap">
                  Подтверждённая продажа
                </span>
              )}
            </div>
            <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600 text-lg leading-none ml-3 flex-shrink-0">&times;</button>
          </div>
          {headerAddress && (
            <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate mt-0.5">{headerAddress}</p>
          )}
        </div>

        {/* Scrollable content */}
        <div className="overflow-y-auto flex-1 p-5 space-y-4">
          {/* Параметры объекта */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <InfoCell label="Тип недвижимости" value={`${PROPERTY_TYPE_FULL[obj.property_type || ''] || obj.property_type || '—'} квартира`} />
            <InfoCell label="Общая площадь" value={obj.area_total != null ? `${obj.area_total} м²` : '—'} />
            <InfoCell label="Жилая" value={obj.area_living != null ? `${obj.area_living} м²` : '—'} />
            <InfoCell label="Кухня" value={obj.area_kitchen != null ? `${obj.area_kitchen} м²` : '—'} />
            <InfoCell label="Этаж" value={obj.floor != null ? `${obj.floor} из ${obj.floors_total ?? '?'}` : '—'} />
            <InfoCell label="Статус" value={obj.status === 'active' ? 'Активный' : 'Архивный'} />
            <InfoCell label="Объявлений" value={`${obj.listings_count} (${obj.active_listings_count} акт.)`} />
            <InfoCell label="Статус собственника" value={obj.owner_status || '—'} />
          </div>

          {/* Карта */}
          <div>
            <h4 className="text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">Местоположение</h4>
            <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 overflow-hidden">
              <div ref={mapContainerRef} style={{ height: 220, width: '100%' }} />
            </div>
          </div>

          {/* Цена */}
          <div className="bg-green-50 dark:bg-green-900/10 rounded-lg p-3">
            <div className="flex items-center gap-4">
              <div>
                <div className="text-lg font-semibold text-green-700 dark:text-green-400">{fmtPrice(obj.current_price)} ₽</div>
                {obj.price_per_meter != null && <div className="text-xs text-green-600 dark:text-green-500">{obj.price_per_meter.toLocaleString('ru-RU')} ₽/м²</div>}
              </div>
              <div className="text-[10px] text-zinc-400 ml-auto">
                <div>Создано: {fmtDateTime(obj.created)}</div>
                <div>Обновлено: {fmtDateTime(obj.updated)}</div>
              </div>
            </div>
          </div>

          {/* Привязанная сделка */}
          {obj.sale_deal && (
            <div className="bg-emerald-50 dark:bg-emerald-900/10 rounded-lg p-3 border border-emerald-200 dark:border-emerald-800">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400 uppercase">Подтверждённая продажа</span>
                  <div className="text-sm font-semibold text-emerald-800 dark:text-emerald-300 mt-1">
                    {formatDealPrice(obj.sale_deal.deal_price)} ₽
                    <span className="text-xs font-normal text-emerald-600 dark:text-emerald-500 ml-2">
                      {obj.sale_deal.deal_area} м² · {formatDealPrice(obj.sale_deal.deal_price_per_meter)} ₽/м²
                    </span>
                  </div>
                  <div className="text-[10px] text-emerald-600 dark:text-emerald-500 mt-0.5">
                    {formatPeriod(obj.sale_deal.deal_year_quarter)} · {obj.sale_deal.deal_doc_type}
                    {obj.sale_deal.deal_floor != null && ` · эт. ${obj.sale_deal.deal_floor}`}
                    <span className="ml-2">Привязано: {fmtDate(obj.sale_deal.deal_linked_at)}</span>
                  </div>
                </div>
                {onUnlinkDeal && obj.id && (
                  <button
                    onClick={() => onUnlinkDeal(obj.id!)}
                    className="text-[10px] text-red-500 hover:text-red-700 font-medium"
                  >Отвязать</button>
                )}
              </div>
            </div>
          )}

          {/* График цены */}
          {priceChartData.length > 0 && (
            <div>
              <h4 className="text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">Динамика цены</h4>
              <div className="bg-white dark:bg-zinc-800 rounded-lg border border-zinc-200 dark:border-zinc-700 p-2">
                {priceChartData.length === 1 ? (
                  <div className="flex items-center justify-center h-[160px] text-sm text-zinc-500">
                    {fmtPrice(priceChartData[0].price)} ₽ — единственная запись
                  </div>
                ) : (
                <ResponsiveContainer width="100%" height={160}>
                  <LineChart data={priceChartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="shortDate" tick={{ fontSize: 10 }} stroke="#9ca3af" />
                    <YAxis tick={{ fontSize: 10 }} stroke="#9ca3af" tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}к`} />
                    <Tooltip
                      formatter={(value: number) => [`${value.toLocaleString('ru-RU')} ₽`, 'Цена']}
                      contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }}
                    />
                    <Line type="stepAfter" dataKey="price" stroke="#16a34a" strokeWidth={2} dot={{ r: 3, fill: '#16a34a' }} />
                  </LineChart>
                </ResponsiveContainer>
                )}
              </div>
            </div>
          )}

          {/* Подходящие сделки Росреестра */}
          {dealsModuleActive && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                  Подходящие сделки {deals.length > 0 ? `(${deals.length})` : ''}
                  {cadQuarter && <span className="text-zinc-400 font-normal ml-1">Квартал: {cadQuarter}</span>}
                </h4>
              </div>

              {/* Фильтры */}
              <div className="flex flex-wrap items-center gap-3 mb-2">
                <label className="flex items-center gap-1 text-[10px] text-zinc-600 dark:text-zinc-400 cursor-pointer">
                  <input type="checkbox" checked={useFloorFilter} onChange={e => setUseFloorFilter(e.target.checked)} className="rounded border-zinc-300 dark:border-zinc-600" />
                  Этаж{obj.floor != null ? `: ${obj.floor}` : ''}
                </label>
                <label className="flex items-center gap-1 text-[10px] text-zinc-600 dark:text-zinc-400 cursor-pointer">
                  <input type="checkbox" checked={useAreaFilter} onChange={e => setUseAreaFilter(e.target.checked)} className="rounded border-zinc-300 dark:border-zinc-600" />
                  Площадь{obj.area_total != null ? `: ${obj.area_total - 5}–${obj.area_total + 5} м²` : ''}
                </label>
                <label className="flex items-center gap-1 text-[10px] text-zinc-600 dark:text-zinc-400 cursor-pointer">
                  <input type="checkbox" checked={useYearQuarters} onChange={e => setUseYearQuarters(e.target.checked)} className="rounded border-zinc-300 dark:border-zinc-600" />
                  Кварталы года{useYearQuarters ? `: ${getRelevantYearQuarters(obj.updated).join(', ')}` : ''}
                </label>
              </div>

              {loadingDeals ? (
                <div className="flex items-center justify-center py-8 text-xs text-zinc-400">
                  <svg className="w-4 h-4 animate-spin mr-2" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                  Загрузка сделок...
                </div>
              ) : !cadQuarter ? (
                <div className="text-xs text-zinc-400 text-center py-6">
                  {!objAddress?.coordinates?.lat ? 'Нет координат адреса' : 'Кадастровый квартал не найден'}
                </div>
              ) : deals.length === 0 ? (
                <div className="text-xs text-zinc-400 text-center py-6">Сделки не найдены</div>
              ) : (
                <>
                  <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-700">
                    <table className="w-full text-xs min-w-[700px]">
                      <thead className="bg-zinc-50 dark:bg-zinc-800">
                        <tr className="text-[10px] font-medium text-zinc-500 dark:text-zinc-400 uppercase">
                          <th className="px-2 py-1.5 text-left">Период</th>
                          <th className="px-2 py-1.5 text-left">Тип</th>
                          <th className="px-2 py-1.5 text-right">Пл.</th>
                          <th className="px-2 py-1.5 text-center">Этаж</th>
                          <th className="px-2 py-1.5 text-center">Год</th>
                          <th className="px-2 py-1.5 text-left">Материал</th>
                          <th className="px-2 py-1.5 text-right">Цена</th>
                          <th className="px-2 py-1.5 text-center">Док.</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                        {deals.map(deal => (
                          <tr
                            key={deal.id}
                            className={`cursor-pointer transition-colors ${
                              selectedDealId === deal.id
                                ? 'bg-emerald-50 dark:bg-emerald-900/10 hover:bg-emerald-100 dark:hover:bg-emerald-900/20'
                                : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/50'
                            }`}
                            onClick={() => setSelectedDealId(selectedDealId === deal.id ? null : deal.id!)}
                          >
                            <td className="px-2 py-1.5 whitespace-nowrap">{formatPeriod(deal.year_quarter)}</td>
                            <td className="px-2 py-1.5">
                              <span className="inline-flex items-center px-1 py-0.5 rounded text-[9px] font-medium bg-zinc-100 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300">
                                {(REAL_ESTATE_TYPES[deal.realestate_type_code] || deal.realestate_type_code).substring(0, 3)}
                              </span>
                            </td>
                            <td className="px-2 py-1.5 text-right whitespace-nowrap">
                              {deal.area > 0 ? deal.area.toLocaleString('ru-RU') : '—'}
                              {deal.number > 1 && <span className="text-zinc-400 ml-1">×{deal.number}</span>}
                            </td>
                            <td className="px-2 py-1.5 text-center">{deal.floor ?? '—'}</td>
                            <td className="px-2 py-1.5 text-center">{deal.year_build ?? '—'}</td>
                            <td className="px-2 py-1.5 text-zinc-600 dark:text-zinc-400">{getWallMaterialName(deal.wall_material_code)}</td>
                            <td className="px-2 py-1.5 text-right whitespace-nowrap">
                              <div className="font-semibold text-green-600 dark:text-green-400">{formatDealPrice(deal.deal_price)} ₽</div>
                              {formatPricePerMeter(deal.deal_price, deal.area) && (
                                <div className="text-[10px] text-zinc-400">{formatPricePerMeter(deal.deal_price, deal.area)}</div>
                              )}
                            </td>
                            <td className="px-2 py-1.5 text-center">
                              <span className={`inline-flex items-center px-1 py-0.5 rounded text-[9px] font-medium ${
                                deal.doc_type === 'ДКП' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                                : deal.doc_type === 'ДДУ' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                                : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300'
                              }`}>{deal.doc_type}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Кнопка привязки */}
                  <div className="flex items-center justify-end gap-2 mt-2">
                    {selectedDealId && (
                      <button
                        onClick={handleLinkDeal}
                        className="rounded-md bg-emerald-600 px-3 py-1.5 text-[11px] font-medium text-white hover:bg-emerald-700 transition-colors"
                      >
                        Привязать сделку к объекту
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Фото и описание */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                Фото и описание {selectedAd ? `(${SOURCE_LABELS[selectedAd.source] || selectedAd.source})` : ''}
              </h4>
              {selectedAd?.url && (
                <a href={selectedAd.url} target="_blank" rel="noopener noreferrer" className="text-[10px] text-blue-600 hover:underline">
                  Открыть на источнике
                </a>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 overflow-hidden bg-zinc-100 dark:bg-zinc-800 min-h-[200px]">
                {photos.length > 0 ? (
                  <div className="grid grid-cols-3 gap-1 p-1">
                    {photos.slice(0, 9).map((url, i) => (
                      <div key={i} className="relative group cursor-pointer aspect-square" onClick={() => setLightboxIndex(i)}>
                        <img src={url} alt="" className="w-full h-full object-cover rounded" onError={e => { (e.currentTarget.style.display = 'none'); }} />
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors rounded" />
                      </div>
                    ))}
                    {photos.length > 9 && (
                      <div className="flex items-center justify-center bg-zinc-200 dark:bg-zinc-700 rounded text-xs text-zinc-500">
                        +{photos.length - 9}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-[200px] text-sm text-zinc-400">Нет фото</div>
                )}
              </div>
              <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 p-3 bg-white dark:bg-zinc-800 max-h-[300px] overflow-y-auto">
                {selectedAd?.description ? (
                  <p className="text-xs text-zinc-600 dark:text-zinc-400 whitespace-pre-wrap">{selectedAd.description}</p>
                ) : (
                  <div className="flex items-center justify-center h-full text-sm text-zinc-400">Нет описания</div>
                )}
              </div>
            </div>
          </div>

          {/* Lightbox */}
          {lightboxIndex != null && photos[lightboxIndex] && (
            <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/90" onClick={() => setLightboxIndex(null)}>
              <button onClick={() => setLightboxIndex(null)} className="absolute top-4 right-4 text-white/70 hover:text-white text-2xl font-light z-10">&times;</button>
              <div className="text-white/60 text-sm absolute top-4 left-4">{lightboxIndex + 1} / {photos.length}</div>
              {lightboxIndex > 0 && (
                <button onClick={(e) => { e.stopPropagation(); setLightboxIndex(lightboxIndex - 1); }} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/70 hover:text-white text-3xl z-10 w-10 h-10 flex items-center justify-center">&#8249;</button>
              )}
              {lightboxIndex < photos.length - 1 && (
                <button onClick={(e) => { e.stopPropagation(); setLightboxIndex(lightboxIndex + 1); }} className="absolute right-4 top-1/2 -translate-y-1/2 text-white/70 hover:text-white text-3xl z-10 w-10 h-10 flex items-center justify-center">&#8250;</button>
              )}
              <img src={photos[lightboxIndex]} alt="" className="max-w-[90vw] max-h-[85vh] object-contain rounded-lg" onClick={e => e.stopPropagation()} />
            </div>
          )}

          {/* Таблица объявлений */}
          {sortedListings.length > 0 && (
            <div>
              <h4 className="text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-2">Объявления объекта ({sortedListings.length})</h4>
              <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-700">
                <table className="w-full text-xs">
                  <thead className="bg-zinc-50 dark:bg-zinc-800">
                    <tr className="text-[10px] font-medium text-zinc-500 dark:text-zinc-400 uppercase">
                      <th className="px-2 py-1.5 text-left">Статус</th>
                      <th className="px-2 py-1.5 text-left">Создано</th>
                      <th className="px-2 py-1.5 text-left">Обновлено</th>
                      <th className="px-2 py-1.5 text-left">Характеристики</th>
                      <th className="px-2 py-1.5 text-left">Адрес из объявления</th>
                      <th className="px-2 py-1.5 text-right">Цена</th>
                      <th className="px-2 py-1.5 text-left">Источник</th>
                      <th className="px-2 py-1.5 text-left">Продавец</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                    {sortedListings.map(ad => (
                      <tr
                        key={ad.id}
                        className={`hover:bg-zinc-50 dark:hover:bg-zinc-800/50 cursor-pointer ${selectedAd?.id === ad.id ? 'bg-blue-50 dark:bg-blue-900/10' : ''}`}
                        onClick={() => { setSelectedAd(ad); setLightboxIndex(null); }}
                      >
                        <td className="px-2 py-1.5">
                          <span className={`inline-flex items-center px-1 py-0.5 rounded text-[9px] font-medium ${
                            ad.status === 'active' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-700 dark:text-zinc-400'
                          }`}>{ad.status === 'active' ? 'Акт.' : 'Арх.'}</span>
                        </td>
                        <td className="px-2 py-1.5 text-zinc-500 whitespace-nowrap">{fmtDate(ad.created)}</td>
                        <td className="px-2 py-1.5 text-zinc-500 whitespace-nowrap">{fmtDate(ad.updated)}</td>
                        <td className="px-2 py-1.5 text-zinc-600 dark:text-zinc-400 whitespace-nowrap">
                          {ad.property_type ? (PROPERTY_TYPE_FULL[ad.property_type] || ad.property_type) : ''}
                          {ad.area_total != null ? `, ${ad.area_total}м²` : ''}
                          {ad.floor != null ? `, ${ad.floor}/${ad.floors_total ?? '?'} эт.` : ''}
                        </td>
                        <td className="px-2 py-1.5">
                          <span className="text-blue-600 dark:text-blue-400 hover:underline truncate block max-w-[200px]">{ad.address || '—'}</span>
                        </td>
                        <td className="px-2 py-1.5 text-right font-medium text-green-600 dark:text-green-400 whitespace-nowrap">
                          {fmtPrice(ad.price)}
                          {ad.price_per_meter != null && <div className="text-[10px] text-zinc-400 font-normal">{ad.price_per_meter.toLocaleString('ru-RU')} ₽/м²</div>}
                        </td>
                        <td className="px-2 py-1.5">
                          {ad.url ? (
                            <a href={ad.url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="text-blue-600 hover:underline">
                              {ad.source_metadata?.original_source || SOURCE_LABELS[ad.source] || ad.source}
                            </a>
                          ) : (
                            <span>{SOURCE_LABELS[ad.source] || ad.source}</span>
                          )}
                        </td>
                        <td className="px-2 py-1.5">
                          <div>{SELLER_TYPE_LABELS[ad.seller_info?.type || ad.seller_type] || '—'}</div>
                          {ad.seller_info?.name && <div className="text-[10px] text-zinc-400 truncate max-w-[100px]">{ad.seller_info.name}</div>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const InfoCell: React.FC<{ label: string; value: string | number | null }> = ({ label, value }) => (
  <div>
    <span className="block text-[10px] font-medium text-zinc-500 dark:text-zinc-400">{label}</span>
    <p className="text-xs text-zinc-800 dark:text-zinc-200">{value ?? '—'}</p>
  </div>
);

export default AdObjectDetailModal;
