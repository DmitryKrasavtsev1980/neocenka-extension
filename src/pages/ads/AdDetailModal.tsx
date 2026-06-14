/**
 * Модальное окно деталей объявления
 * — Заголовок, адрес, характеристики
 * — Секция «Местоположение» с селектором адреса (как в neocenka-extension)
 * — Цена + история цены
 * — Продавец, описание, фото
 * — Ссылка на источник
 */

import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Ad, AdAddress, PriceHistoryItem, ReferenceItem } from '@/types';
import { adsAddressService } from '@/services/ads-address-service';
import { getMapConfig, createTileLayer } from '@/services/map-config';
import { actualizeCianAd } from '@/services/cian-update-service';
import { actualizeAvitoAd } from '@/services/avito-update-service';
import { useArchivedPhotos } from '@/hooks/useArchivedPhotos';

const SELLER_TYPE_LABELS: Record<string, string> = {
  owner: 'Собственник', agent: 'Агент', developer: 'Застройщик',
};

const CONFIDENCE_COLORS: Record<string, string> = {
  perfect: 'text-green-600 dark:text-green-400',
  high: 'text-green-600 dark:text-green-400',
  medium: 'text-yellow-600 dark:text-yellow-400',
  low: 'text-orange-600 dark:text-orange-400',
  very_low: 'text-red-600 dark:text-red-400',
  manual: 'text-blue-600 dark:text-blue-400',
  none: 'text-gray-500',
};

const CONFIDENCE_TEXTS: Record<string, string> = {
  perfect: 'Идеальное',
  high: 'Высокая',
  medium: 'Средняя',
  low: 'Низкая',
  very_low: 'Очень низкая',
  manual: 'Вручную',
  none: 'Не определена',
};

const METHOD_TEXTS: Record<string, string> = {
  exact_geo: 'Точное совпадение по координатам',
  near_geo_text: 'Поиск рядом + анализ текста',
  extended_geo_text: 'Расширенный поиск + анализ текста',
  global_text: 'Глобальный поиск по тексту',
  obvious: 'Очевидное совпадение',
  smart_near: 'Умный поиск рядом',
  ml_extended: 'ML-расширенный поиск',
  fuzzy_global: 'Нечёткий глобальный поиск',
  manual: 'Вручную',
  manual_selection: 'Ручной выбор',
  no_match: 'Совпадения не найдены',
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

interface AdDetailModalProps {
  ad: Ad;
  addresses: AdAddress[];
  referenceData: {
    wallMaterials: ReferenceItem[];
    houseSeries: ReferenceItem[];
    houseClasses?: ReferenceItem[];
    ceilingMaterials?: ReferenceItem[];
    houseProblems?: ReferenceItem[];
  };
  onClose: () => void;
  onSave?: (updated: Ad) => void;
  onDelete?: (ad: Ad) => void;
  onAddressChange?: () => void;
  onOpenCreateAddress?: (ad: Ad) => void;
  onOpenEditAddress?: (address: AdAddress) => void;
}

const AdDetailModal: React.FC<AdDetailModalProps> = ({
  ad: initialAd,
  addresses,
  referenceData,
  onClose,
  onSave,
  onDelete,
  onAddressChange,
  onOpenCreateAddress,
  onOpenEditAddress,
}) => {
  const [ad, setAd] = useState<Ad>(() => {
    const history = [...(initialAd.price_history || [])];
    const createdDate = initialAd.created;

    if (initialAd.price != null && createdDate) {
      // Гарантируем запись на дату создания или раньше
      const hasEntryAtCreation = history.some(h => new Date(h.date) <= new Date(createdDate));
      if (!hasEntryAtCreation) {
        history.push({ date: createdDate, price: initialAd.price });
      }
    }

    return { ...initialAd, price_history: history };
  });
  const [locationExpanded, setLocationExpanded] = useState(true);
  const [selectedAddressId, setSelectedAddressId] = useState<string>(String(ad.address_id || ''));
  const [saving, setSaving] = useState(false);
  const [addressSearch, setAddressSearch] = useState('');
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [editHistoryIdx, setEditHistoryIdx] = useState<number | null>(null);
  const [editHistoryDate, setEditHistoryDate] = useState('');
  const [editHistoryPrice, setEditHistoryPrice] = useState('');
  const [showAddHistory, setShowAddHistory] = useState(false);
  const [newHistDate, setNewHistDate] = useState('');
  const [newHistNewPrice, setNewHistNewPrice] = useState('');
  const [deleteConfirmIdx, setDeleteConfirmIdx] = useState<number | null>(null);
  const [deleteAdConfirm, setDeleteAdConfirm] = useState(false);
  const [actualizing, setActualizing] = useState(false);
  const [actualizeResult, setActualizeResult] = useState<{ changes: string[] } | null>(null);
  const [editUpdatedDate, setEditUpdatedDate] = useState('');
  const [showEditUpdated, setShowEditUpdated] = useState(false);
  const [editCreatedDate, setEditCreatedDate] = useState('');
  const [showEditCreated, setShowEditCreated] = useState(false);
  const [locationTab, setLocationTab] = useState<'map' | 'info'>('map');
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);

  // Текущий привязанный адрес
  const currentAddress = ad.address_id
    ? addresses.find(a => a.id === ad.address_id)
    : null;

  // Координаты адреса и объявления
  const addrLat = currentAddress?.coordinates?.lat ?? null;
  const addrLng = currentAddress?.coordinates?.lng ?? null;
  const adLat = ad.coordinates?.lat ?? null;
  const adLng = ad.coordinates?.lng ?? null;

  // Инициализация мини-карты
  useEffect(() => {
    if (locationTab !== 'map' || !locationExpanded || !mapContainerRef.current) return;

    // Уничтожаем предыдущую карту
    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
    }

    const map = L.map(mapContainerRef.current, {
      attributionControl: false,
      zoomControl: true,
      dragging: true,
      scrollWheelZoom: false,
      doubleClickZoom: true,
    });

    const mapConfig = getMapConfig();
    createTileLayer(mapConfig).addTo(map);

    const validCoord = (v: number | null): v is number => v != null && isFinite(v);
    const hasAddr = validCoord(addrLat) && validCoord(addrLng);
    const hasAd = validCoord(adLat) && validCoord(adLng);

    if (!hasAddr && !hasAd) {
      map.setView([55.7558, 37.6173], 10);
    } else {
      // Маркер определённого адреса (синий)
      if (hasAddr) {
        L.marker([addrLat!, addrLng!], {
          icon: L.divIcon({
            html: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="36" viewBox="0 0 24 36">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 9 12 24 12 24s12-15 12-24C24 5.37 18.63 0 12 0z" fill="#2563eb"/>
              <circle cx="12" cy="12" r="5" fill="#fff"/>
            </svg>`,
            iconSize: [24, 36],
            iconAnchor: [12, 36],
            className: '',
          }),
        }).addTo(map).bindTooltip('Адрес', { direction: 'top', offset: [0, -36] });
      }

      // Маркер координат объявления (красный)
      if (hasAd) {
        L.marker([adLat!, adLng!], {
          icon: L.divIcon({
            html: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="36" viewBox="0 0 24 36">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 9 12 24 12 24s12-15 12-24C24 5.37 18.63 0 12 0z" fill="#ea4335"/>
              <circle cx="12" cy="12" r="5" fill="#fff"/>
            </svg>`,
            iconSize: [24, 36],
            iconAnchor: [12, 36],
            className: '',
          }),
        }).addTo(map).bindTooltip('Объявление', { direction: 'top', offset: [0, -36] });
      }

      if (hasAddr && hasAd) {
        // Пунктирная линия между маркерами
        L.polyline([[addrLat!, addrLng!], [adLat!, adLng!]], {
          color: '#6b7280',
          weight: 2,
          dashArray: '6, 6',
        }).addTo(map);

        // Расчёт расстояния (формула гаверсинуса)
        const R = 6371000;
        const dLat = (adLat! - addrLat!) * Math.PI / 180;
        const dLng = (adLng! - addrLng!) * Math.PI / 180;
        const a = Math.sin(dLat / 2) ** 2 +
          Math.cos(addrLat! * Math.PI / 180) * Math.cos(adLat! * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
        const dist = Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
        const distText = dist < 1000 ? `${dist} м` : `${(dist / 1000).toFixed(1)} км`;

        const midLat = (addrLat! + adLat!) / 2;
        const midLng = (addrLng! + adLng!) / 2;
        L.popup({ closeButton: false, offset: [0, 0] })
          .setLatLng([midLat, midLng])
          .setContent(`<div style="font-size:12px;font-weight:600;">≈ ${distText}</div>`)
          .openOn(map);

        // Подогнать масштаб, чтобы оба маркера были видны
        map.fitBounds(L.latLngBounds([[addrLat!, addrLng!], [adLat!, adLng!]]), { padding: [60, 60], maxZoom: 17 });
      } else if (hasAddr) {
        map.setView([addrLat!, addrLng!], 17);
        const popupAddr = currentAddress?.address || ad.address || '';
        if (popupAddr) {
          L.popup({ closeButton: false, offset: [0, -36] })
            .setLatLng([addrLat!, addrLng!])
            .setContent(`<div style="font-size:12px;max-width:250px;">${popupAddr}</div>`)
            .openOn(map);
        }
      } else {
        map.setView([adLat!, adLng!], 17);
      }
    }

    // Небольшая задержка для корректного рендера
    setTimeout(() => map.invalidateSize(), 100);
    mapInstanceRef.current = map;

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [locationTab, locationExpanded, addrLat, addrLng, adLat, adLng]);

  // Фильтрация адресов для селектора
  const filteredAddresses = useMemo(() => {
    if (!addressSearch || addressSearch.length < 2) return addresses;
    const q = addressSearch.toLowerCase();
    return addresses.filter(a => a.address.toLowerCase().includes(q));
  }, [addressSearch, addresses]);

  // Статус для шапки секции
  const statusInfo = useMemo(() => {
    if (!ad.address_id) {
      return { text: 'Не определён', cls: 'text-orange-600 dark:text-orange-400' };
    }
    const conf = ad.address_match_confidence;
    if (conf === 'manual') {
      return { text: 'Подтверждён', cls: 'text-green-600 dark:text-green-400' };
    }
    const label = CONFIDENCE_TEXTS[conf || 'none'] || conf;
    const cls = CONFIDENCE_COLORS[conf || 'none'] || 'text-gray-500';
    return { text: label, cls };
  }, [ad]);

  // Данные для графика цены — из price_history + текущая цена на дату обновления
  const priceChartData = useMemo(() => {
    const points: { date: string; price: number; shortDate: string }[] = [];

    for (const h of ad.price_history || []) {
      const p = h.new_price ?? h.price;
      if (p != null) {
        points.push({
          date: h.date,
          price: p,
          shortDate: fmtDate(h.date),
        });
      }
    }

    points.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // Добавляем текущую цену на дату обновления (или сейчас для активных)
    if (ad.price != null && points.length > 0) {
      const lastPoint = points[points.length - 1];
      const lastPrice = lastPoint.price;
      const lastDate = lastPoint.date;

      // Дата для последней точки: updated для архивных, сейчас для активных
      const endDate = ad.status === 'archived' && ad.updated
        ? ad.updated
        : new Date().toISOString();

      // Добавляем только если дата или цена отличаются от последней точки
      if (ad.price !== lastPrice || endDate !== lastDate) {
        points.push({
          date: endDate,
          price: ad.price,
          shortDate: fmtDate(endDate),
        });
      }
    }

    return points;
  }, [ad.price_history, ad.price, ad.updated, ad.status]);

  // Lightbox: навигация клавиатурой
  const photos = useArchivedPhotos(ad.photos || []);
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

  // Пересчёт цены из истории: price = последняя (по дате) цена из price_history
  const recalcPriceFromHistory = useCallback((adWithHistory: Ad): Ad => {
    const history = adWithHistory.price_history || [];
    if (history.length === 0) return adWithHistory;

    // Находим запись с максимальной датой
    let latest = history[0];
    for (const h of history) {
      if (new Date(h.date).getTime() > new Date(latest.date).getTime()) {
        latest = h;
      }
    }

    const price = latest.new_price ?? latest.price ?? adWithHistory.price;
    if (price == null) return adWithHistory;

    const latestDate = new Date(latest.date).getTime();
    const currentUpdated = adWithHistory.updated ? new Date(adWithHistory.updated).getTime() : 0;
    const updated = latestDate > currentUpdated ? latest.date : adWithHistory.updated;

    return {
      ...adWithHistory,
      price,
      price_per_meter: adWithHistory.area_total ? Math.round(price / adWithHistory.area_total) : null,
      updated,
    };
  }, []);

  // История цен: обработчики
  const handleDeleteHistoryEntry = useCallback((idx: number) => {
    const history = [...(ad.price_history || [])];
    history.splice(idx, 1);
    const updated = recalcPriceFromHistory({ ...ad, price_history: history });
    setAd(updated);
    onSave?.(updated);
  }, [ad, onSave, recalcPriceFromHistory]);

  const handleSaveHistoryEdit = useCallback(() => {
    if (editHistoryIdx == null) return;
    const history = [...(ad.price_history || [])];
    const entry = { ...history[editHistoryIdx] };
    if (editHistoryDate) entry.date = new Date(editHistoryDate).toISOString();
    const newP = Number(editHistoryPrice.replace(/\s/g, '').replace(',', '.'));
    if (!isNaN(newP) && newP > 0) entry.new_price = newP;
    history[editHistoryIdx] = entry;
    const updated = recalcPriceFromHistory({ ...ad, price_history: history });
    setAd(updated);
    onSave?.(updated);
    setEditHistoryIdx(null);
  }, [editHistoryIdx, editHistoryDate, editHistoryPrice, ad, onSave, recalcPriceFromHistory]);

  const handleAddHistoryEntry = useCallback(() => {
    const newP = Number(newHistNewPrice.replace(/\s/g, '').replace(',', '.'));
    if (isNaN(newP) || newP <= 0) return;
    const date = newHistDate ? new Date(newHistDate).toISOString() : new Date().toISOString();
    const entry: PriceHistoryItem = { date, new_price: newP };
    const history = [...(ad.price_history || []), entry];
    const updated = recalcPriceFromHistory({ ...ad, price_history: history });
    setAd(updated);
    onSave?.(updated);
    setShowAddHistory(false);
    setNewHistDate('');
    setNewHistNewPrice('');
  }, [newHistDate, newHistNewPrice, ad, onSave, recalcPriceFromHistory]);

  /** Сохранить выбранный адрес из селектора */
  const handleSaveAddress = async () => {
    if (!ad.id) return;
    setSaving(true);
    try {
      if (selectedAddressId) {
        const addrId = Number(selectedAddressId);
        await adsAddressService.linkAdToAddress(ad.id, addrId);
        const updated: Ad = {
          ...ad,
          address_id: addrId,
          address_match_confidence: 'manual',
          address_match_method: 'manual_selection',
          address_match_score: 1.0,
          address_distance: null,
        };
        setAd(updated);
        onSave?.(updated);
      } else {
        await adsAddressService.unlinkAdFromAddress(ad.id);
        const updated: Ad = {
          ...ad,
          address_id: null,
          address_match_confidence: null,
          address_match_method: null,
          address_match_score: null,
          address_distance: null,
        };
        setAd(updated);
        onSave?.(updated);
      }
      onAddressChange?.();
    } finally {
      setSaving(false);
    }
  };

  /** Подтвердить текущий адрес */
  const handleConfirmAddress = async () => {
    if (!ad.id) return;
    setSaving(true);
    try {
      await adsAddressService.confirmAdAddress(ad.id);
      const updated: Ad = { ...ad, address_match_confidence: 'manual' };
      setAd(updated);
      onSave?.(updated);
      onAddressChange?.();
    } finally {
      setSaving(false);
    }
  };

  /** Отклонить текущий адрес */
  const handleRejectAddress = async () => {
    if (!ad.id) return;
    setSaving(true);
    try {
      await adsAddressService.unlinkAdFromAddress(ad.id);
      const updated: Ad = {
        ...ad,
        address_id: null,
        address_match_confidence: null,
        address_match_method: null,
        address_match_score: null,
        address_distance: null,
      };
      setAd(updated);
      setSelectedAddressId('');
      onSave?.(updated);
      onAddressChange?.();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/30" onClick={onClose}>
      <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-xl max-w-4xl w-full max-h-[90vh] flex flex-col mx-4" onClick={e => e.stopPropagation()}>
        {/* Header — вне прокручиваемой области */}
        <div className="flex-shrink-0 px-5 py-3 border-b border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 rounded-t-xl z-20">
          <div className="flex items-center justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-zinc-900 dark:text-white truncate">
                  {[
                    ad.property_type || '',
                    ad.area_total != null ? `${ad.area_total} м²` : '',
                    ad.floor != null ? `эт. ${ad.floor}/${ad.floors_total ?? '?'}` : '',
                    ad.price != null ? `${fmtPrice(ad.price)} ₽` : '',
                  ].filter(Boolean).join(', ')}
                </h2>
                <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium flex-shrink-0 ${
                  ad.status === 'active' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-700 dark:text-zinc-400'
                }`}>{ad.status === 'active' ? 'Активно' : 'Архив'}</span>
              </div>
              {(ad.address || ad.title) && (
                <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate mt-0.5">{ad.address || ad.title}</p>
              )}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {ad.url && (
                <a
                  href={ad.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-blue-700 transition-colors"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                  {ad.source === 'cian' ? 'CIAN' : ad.source === 'avito' ? 'Avito' : ad.source || 'Источник'}
                </a>
              )}
              <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600 text-lg leading-none">&times;</button>
            </div>
          </div>
        </div>

        {/* Прокручиваемый контент */}
        <div className="overflow-y-auto flex-1 p-5 space-y-4">
          {/* ─── Секция «Местоположение» с табами ─── */}
          <div className="bg-white dark:bg-zinc-800 shadow overflow-hidden rounded-md border border-zinc-200 dark:border-zinc-700">
            {/* Шапка секции */}
            <div
              className="px-4 py-3 cursor-pointer flex items-center justify-between hover:bg-zinc-50 dark:hover:bg-zinc-700/50"
              onClick={() => setLocationExpanded(!locationExpanded)}
            >
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-zinc-900 dark:text-white">📍 Местоположение</span>
                <span className={`text-xs ${statusInfo.cls}`}>{statusInfo.text}{ad.address_distance != null ? ` (${ad.address_distance}м)` : ''}</span>
              </div>
              <svg className={`w-4 h-4 text-zinc-400 transition-transform ${locationExpanded ? '-rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
              </svg>
            </div>

            {/* Содержимое */}
            {locationExpanded && (
              <div className="border-t border-zinc-100 dark:border-zinc-700">
                {/* Табы */}
                <div className="flex border-b border-zinc-200 dark:border-zinc-700">
                  <button
                    onClick={() => setLocationTab('map')}
                    className={`px-4 py-2 text-xs font-medium transition-colors ${
                      locationTab === 'map'
                        ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400 bg-blue-50 dark:bg-blue-900/10'
                        : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300'
                    }`}
                  >Карта</button>
                  <button
                    onClick={() => setLocationTab('info')}
                    className={`px-4 py-2 text-xs font-medium transition-colors ${
                      locationTab === 'info'
                        ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400 bg-blue-50 dark:bg-blue-900/10'
                        : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300'
                    }`}
                  >Данные</button>
                </div>

                {/* Таб: Карта */}
                {locationTab === 'map' && (
                  <>
                    <div ref={mapContainerRef} style={{ height: 260, width: '100%' }} />
                    {addrLat != null && isFinite(addrLat) && adLat != null && isFinite(adLat) && (
                      <div className="flex items-center gap-4 px-3 py-1.5 text-xs text-zinc-500 dark:text-zinc-400">
                        <span className="flex items-center gap-1.5">
                          <span className="inline-block w-3 h-3 rounded-full bg-blue-600" />
                          Адрес
                        </span>
                        <span className="flex items-center gap-1.5">
                          <span className="inline-block w-3 h-3 rounded-full bg-red-500" />
                          Объявление
                        </span>
                      </div>
                    )}
                  </>
                )}

                {/* Таб: Данные */}
                {locationTab === 'info' && (
                  <div className="px-4 pb-4 space-y-3">
                    {/* Адрес из объявления */}
                    <div className="pt-3">
                      <span className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Адрес из объявления:</span>
                      <span className="text-sm text-zinc-600 dark:text-zinc-300 ml-2">{ad.address || 'Не указан'}</span>
                    </div>

                    {/* Селектор адреса */}
                    <div>
                      <span className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
                        {ad.address_id ? 'Определённый адрес:' : 'Определить адрес:'}
                      </span>
                      <div className="flex items-center gap-2 mt-1">
                        <input
                          list={`address-datalist-${ad.id}`}
                          value={selectedAddressId ? (addresses.find(a => a.id === Number(selectedAddressId))?.address || addressSearch) : addressSearch}
                          onChange={e => {
                            const val = e.target.value;
                            const found = addresses.find(a => a.address === val);
                            if (found) {
                              setSelectedAddressId(String(found.id));
                              setAddressSearch('');
                            } else {
                              setSelectedAddressId('');
                              setAddressSearch(val);
                            }
                          }}
                          placeholder="Поиск адреса..."
                          className="flex-1 rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-700 px-2 py-1.5 text-xs text-zinc-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                        <datalist id={`address-datalist-${ad.id}`}>
                          {filteredAddresses.slice(0, 100).map(a => (
                            <option key={a.id} value={a.address} />
                          ))}
                        </datalist>
                        <button
                          onClick={handleSaveAddress}
                          disabled={saving}
                          className={`rounded-md px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50 ${
                            ad.address_id ? 'bg-blue-600 hover:bg-blue-700' : 'bg-green-600 hover:bg-green-700'
                          }`}
                        >{saving ? '...' : 'Сохранить'}</button>
                      </div>
                    </div>

                    {/* Точность / Статус */}
                    <div>
                      {ad.address_id && ad.address_match_confidence ? (
                        <>
                          <span className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Точность:</span>
                          <span className={`text-sm ml-2 ${CONFIDENCE_COLORS[ad.address_match_confidence] || 'text-zinc-600'}`}>
                            {CONFIDENCE_TEXTS[ad.address_match_confidence] || ad.address_match_confidence}
                            {ad.address_distance != null ? ` (${ad.address_distance}м)` : ''}
                          </span>
                          <div className="flex items-center gap-2 mt-1.5 ml-2">
                            {ad.address_match_confidence !== 'manual' && (
                              <>
                                <button
                                  onClick={handleConfirmAddress}
                                  disabled={saving}
                                  className="rounded-md bg-green-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-green-700 disabled:opacity-50"
                                >✅ Верный адрес</button>
                                <button
                                  onClick={handleRejectAddress}
                                  disabled={saving}
                                  className="rounded-md bg-red-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-red-700 disabled:opacity-50"
                                >❌ Неверный адрес</button>
                              </>
                            )}
                            {currentAddress && onOpenEditAddress && (
                              <button
                                onClick={() => onOpenEditAddress(currentAddress)}
                                className="rounded-md bg-zinc-100 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-300 px-2.5 py-1 text-[11px] font-medium hover:bg-zinc-200 dark:hover:bg-zinc-600"
                              >Редактировать</button>
                            )}
                          </div>
                          {(ad.address_match_method || ad.address_match_score != null) && (
                            <div className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1 ml-2">
                              Метод: {METHOD_TEXTS[ad.address_match_method || ''] || ad.address_match_method}
                              {ad.address_match_score != null && ` • Оценка: ${Math.round(ad.address_match_score * 100)}%`}
                            </div>
                          )}
                        </>
                      ) : (
                        <>
                          <span className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Статус:</span>
                          <span className="text-sm text-orange-600 dark:text-orange-400 ml-2">Адрес не определён</span>
                          <div className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5 ml-2">Требуется обработка для определения адреса</div>
                        </>
                      )}
                    </div>

                    {/* Координаты */}
                    <div>
                      <span className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Координаты:</span>
                      <span className="text-sm text-zinc-700 dark:text-zinc-300 ml-2">
                        {ad.coordinates.lat != null && ad.coordinates.lng != null
                          ? `${ad.coordinates.lat}, ${ad.coordinates.lng}`
                          : 'Не указаны'}
                      </span>
                      {(ad.coordinates.lat != null && ad.coordinates.lng != null) && (
                        <div className="text-[11px] text-zinc-500 dark:text-zinc-400 ml-2">
                          {currentAddress ? 'Используются координаты определённого адреса' : 'Используются координаты из объявления'}
                        </div>
                      )}
                    </div>

                    {/* Кнопка «Новый адрес» */}
                    {onOpenCreateAddress && (
                      <div className="pt-1">
                        <button
                          onClick={() => onOpenCreateAddress(ad)}
                          className="rounded-md bg-zinc-100 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-300 px-3 py-1.5 text-xs font-medium hover:bg-zinc-200 dark:hover:bg-zinc-600"
                        >+ Новый адрес</button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Характеристики */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <InfoCell label="Тип недвижимости" value={ad.property_type || '—'} />
            <InfoCell label="Площадь" value={ad.area_total != null ? `${ad.area_total} м²${ad.area_living ? ` (жилая ${ad.area_living})` : ''}${ad.area_kitchen ? ` (кухня ${ad.area_kitchen})` : ''}` : '—'} />
            <InfoCell label="Этаж" value={ad.floor != null ? `${ad.floor}/${ad.floors_total ?? '?'}` : '—'} />
            <InfoCell label="Комнат" value={ad.rooms != null ? String(ad.rooms) : '—'} />
            <InfoCell label="Год постройки" value={ad.year_built ?? ad.house_details?.build_year ?? '—'} />
            <InfoCell label="Тип дома" value={ad.house_type || '—'} />
            <InfoCell label="Ремонт" value={ad.condition || '—'} />
            <InfoCell label="Высота потолков" value={ad.ceiling_height != null ? `${ad.ceiling_height} м` : '—'} />
          </div>

          {/* Цена */}
          <div className="bg-green-50 dark:bg-green-900/10 rounded-lg p-3">
            <div className="text-lg font-semibold text-green-700 dark:text-green-400">{fmtPrice(ad.price)} ₽</div>
            {ad.price_per_meter != null && <div className="text-xs text-green-600 dark:text-green-500">{ad.price_per_meter.toLocaleString('ru-RU')} ₽/м²</div>}
          </div>

          {/* График цены */}
          {priceChartData.length > 0 && (
            <div>
              <h4 className="text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">Динамика цены</h4>
              <div className="bg-white dark:bg-zinc-800 rounded-lg border border-zinc-200 dark:border-zinc-700 p-2">
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
              </div>
            </div>
          )}

          {/* История цены — таблица */}
          {ad.price_history && ad.price_history.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <h4 className="text-xs font-medium text-zinc-700 dark:text-zinc-300">История цены ({ad.price_history.length})</h4>
                <button onClick={() => setShowAddHistory(!showAddHistory)} className="text-[10px] text-blue-600 hover:underline">
                  {showAddHistory ? 'Отмена' : '+ Добавить'}
                </button>
              </div>

              {showAddHistory && (
                <div className="flex items-center gap-2 mb-2 p-2 bg-blue-50 dark:bg-blue-900/10 rounded-lg">
                  <input type="date" value={newHistDate} onChange={e => setNewHistDate(e.target.value)} className="rounded border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-700 px-1.5 py-1 text-[11px] text-zinc-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500" />
                  <input type="text" value={newHistNewPrice} onChange={e => setNewHistNewPrice(e.target.value)} placeholder="Цена" className="rounded border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-700 px-1.5 py-1 text-[11px] text-zinc-900 dark:text-white w-28 focus:outline-none focus:ring-1 focus:ring-blue-500" onKeyDown={e => { if (e.key === 'Enter') handleAddHistoryEntry(); }} />
                  <button onClick={handleAddHistoryEntry} className="rounded bg-blue-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-blue-700">OK</button>
                </div>
              )}

              <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-700">
                <table className="w-full text-[11px] table-fixed">
                  <thead className="bg-zinc-50 dark:bg-zinc-800">
                    <tr className="text-[10px] font-medium text-zinc-500 dark:text-zinc-400 uppercase">
                      <th className="px-2 py-1.5 text-left w-[35%]">Дата</th>
                      <th className="px-2 py-1.5 text-right w-[35%]">Цена</th>
                      <th className="px-2 py-1.5 text-center w-[30%]">Действия</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                    {[...(ad.price_history || [])]
                      .map((h: PriceHistoryItem, idx: number) => ({ h, idx }))
                      .sort((a, b) => new Date(a.h.date).getTime() - new Date(b.h.date).getTime())
                      .map(({ h, idx }) => {
                        const isEditing = editHistoryIdx === idx;
                        const isDeleting = deleteConfirmIdx === idx;
                        return (
                          <tr key={idx} className={`hover:bg-zinc-50 dark:hover:bg-zinc-800/50 ${isDeleting ? 'bg-red-50 dark:bg-red-900/10' : ''}`}>
                            {isEditing ? (
                              <>
                                <td className="px-2 py-1"><input type="date" value={editHistoryDate} onChange={e => setEditHistoryDate(e.target.value)} className="rounded border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-700 px-1 py-0.5 text-[11px] text-zinc-900 dark:text-white w-full focus:outline-none focus:ring-1 focus:ring-blue-500" /></td>
                                <td className="px-2 py-1"><input type="text" value={editHistoryPrice} onChange={e => setEditHistoryPrice(e.target.value)} className="rounded border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-700 px-1 py-0.5 text-[11px] text-zinc-900 dark:text-white w-full text-right focus:outline-none focus:ring-1 focus:ring-blue-500" onKeyDown={e => { if (e.key === 'Enter') handleSaveHistoryEdit(); if (e.key === 'Escape') setEditHistoryIdx(null); }} /></td>
                                <td className="px-2 py-1 text-center">
                                  <button onClick={handleSaveHistoryEdit} className="text-green-600 hover:text-green-700 text-[10px] mr-1">OK</button>
                                  <button onClick={() => setEditHistoryIdx(null)} className="text-zinc-400 hover:text-zinc-600 text-[10px]">&times;</button>
                                </td>
                              </>
                            ) : isDeleting ? (
                              <>
                                <td className="px-2 py-1 text-zinc-500">{fmtDate(h.date)}</td>
                                <td className="px-2 py-1 text-right font-medium text-red-600 dark:text-red-400">{fmtPrice(h.new_price || h.price)}</td>
                                <td className="px-2 py-1 text-center">
                                  <button onClick={() => { handleDeleteHistoryEntry(idx); setDeleteConfirmIdx(null); }} className="text-red-600 hover:text-red-700 text-[10px] mr-1 font-medium">Удалить?</button>
                                  <button onClick={() => setDeleteConfirmIdx(null)} className="text-zinc-500 hover:text-zinc-700 text-[10px]">Отмена</button>
                                </td>
                              </>
                            ) : (
                              <>
                                <td className="px-2 py-1 text-zinc-500">{fmtDate(h.date)}</td>
                                <td className="px-2 py-1 text-right font-medium text-green-600 dark:text-green-400">{fmtPrice(h.new_price || h.price)}</td>
                                <td className="px-2 py-1 text-center">
                                  <button onClick={() => { setEditHistoryIdx(idx); setEditHistoryDate(h.date ? h.date.slice(0, 10) : ''); setEditHistoryPrice(String(h.new_price || h.price || '')); }} className="text-blue-500 hover:text-blue-700 text-[10px] mr-1">изм.</button>
                                  <button onClick={() => setDeleteConfirmIdx(idx)} className="text-red-400 hover:text-red-600 text-[10px]">уд.</button>
                                </td>
                              </>
                            )}
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Продавец */}
          <div className="grid grid-cols-3 gap-3">
            <InfoCell label="Продавец" value={ad.seller_info?.name || ad.seller_name || '—'} />
            <InfoCell label="Тип" value={SELLER_TYPE_LABELS[ad.seller_info?.type || ad.seller_type] || ad.seller_type || '—'} />
            <InfoCell label="Телефон" value={ad.seller_info?.phone || ad.phone || '—'} />
          </div>

          {/* Описание */}
          {ad.description && (
            <div>
              <h4 className="text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">Описание</h4>
              <p className="text-xs text-zinc-600 dark:text-zinc-400 whitespace-pre-wrap line-clamp-8">{ad.description}</p>
            </div>
          )}

          {/* Фото */}
          {photos.length > 0 && (
            <div>
              <h4 className="text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">Фотографии ({photos.length})</h4>
              <div className="grid grid-cols-4 gap-2">
                {photos.map((url, i) => (
                  <div key={i} className="relative group cursor-pointer" onClick={() => setLightboxIndex(i)}>
                    <img src={url} alt="" className="rounded-md w-full h-24 object-cover" onError={e => { (e.currentTarget.style.display = 'none'); }} />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors rounded-md" />
                  </div>
                ))}
              </div>
            </div>
          )}

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
              <img
                src={photos[lightboxIndex]}
                alt=""
                className="max-w-[90vw] max-h-[85vh] object-contain rounded-lg"
                onClick={e => e.stopPropagation()}
              />
            </div>
          )}

          {/* Ссылка */}
          {ad.url && (
            <a href={ad.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline">
              Открыть на источнике ({ad.source_metadata?.original_source || ad.source})
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
            </a>
          )}

          {/* Даты */}
          <div className="flex items-center gap-4 text-[10px] text-zinc-400">
            <span>Создано: {fmtDate(ad.created)}</span>
            <span>Обновлено: {fmtDate(ad.updated)}</span>
            {ad.parsed_at && <span>Спарсено: {fmtDate(ad.parsed_at)}</span>}
          </div>
        </div>

        {/* Подвал с действиями */}
        <div className="flex-shrink-0 border-t border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/50 px-5 py-3 rounded-b-xl">
          <div className="flex items-center justify-between gap-3">
            {/* Слева — Удалить */}
            {deleteAdConfirm ? (
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-red-600 dark:text-red-400 font-medium">Удалить объявление?</span>
                <button
                  onClick={() => { onDelete?.(ad); }}
                  className="inline-flex items-center gap-1 rounded-md bg-red-600 px-3 py-1.5 text-[11px] font-medium text-white hover:bg-red-700 transition-colors"
                >Да, удалить</button>
                <button
                  onClick={() => setDeleteAdConfirm(false)}
                  className="inline-flex items-center gap-1 rounded-md bg-zinc-100 dark:bg-zinc-700 px-3 py-1.5 text-[11px] font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-600 transition-colors"
                >Отмена</button>
              </div>
            ) : (
              <button
                onClick={() => setDeleteAdConfirm(true)}
                className="inline-flex items-center gap-1.5 rounded-md bg-red-50 dark:bg-red-900/20 px-3 py-1.5 text-[11px] font-medium text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                Удалить
              </button>
            )}

            {/* Справа — Актуализировать, Статус, Дата */}
            <div className="flex items-center gap-3 flex-wrap justify-end">
              <button
                onClick={async () => {
                  if (actualizing) return;
                  const isAvito = ad.url?.includes('avito.ru');
                  const isCian = ad.url?.includes('cian.ru');
                  if (!isAvito && !isCian) return;
                  setActualizing(true);
                  setActualizeResult(null);
                  try {
                    const result = isAvito
                      ? await actualizeAvitoAd(ad)
                      : await actualizeCianAd(ad);
                    if (result.success && result.ad) {
                      setAd(result.ad);
                      onSave?.(result.ad);
                      setActualizeResult({ changes: result.changes || ['Обновлено'] });
                    } else {
                      setActualizeResult({ changes: [`Ошибка: ${result.error || 'Неизвестная ошибка'}`] });
                    }
                  } catch (err) {
                    setActualizeResult({ changes: [`Ошибка: ${err instanceof Error ? err.message : String(err)}`] });
                  } finally {
                    setActualizing(false);
                  }
                }}
                disabled={actualizing || (!ad.url?.includes('cian.ru') && !ad.url?.includes('avito.ru'))}
                className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[11px] font-medium transition-colors ${
                  actualizing
                    ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 cursor-wait'
                    : !ad.url?.includes('cian.ru') && !ad.url?.includes('avito.ru')
                      ? 'bg-zinc-50 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-500 cursor-not-allowed'
                      : 'bg-zinc-100 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-600'
                }`}
              >
                {actualizing ? (
                  <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" /></svg>
                ) : (
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                )}
                {actualizing ? 'Актуализация...' : 'Актуализировать'}
              </button>

              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-zinc-500 dark:text-zinc-400">Статус:</span>
                <select
                  value={ad.status}
                  onChange={e => {
                    const newStatus = e.target.value as 'active' | 'archived';
                    const updatedAd = { ...ad, status: newStatus };
                    setAd(updatedAd);
                    onSave?.(updatedAd);
                  }}
                  className="rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-700 px-2 py-1 text-[11px] text-zinc-700 dark:text-zinc-300 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="active">Активное</option>
                  <option value="archived">Архив</option>
                </select>
              </div>

              {/* Дата создания — редактируемая */}
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-zinc-500 dark:text-zinc-400">Создано:</span>
                {showEditCreated ? (
                  <div className="flex items-center gap-1">
                    <input
                      type="date"
                      value={editCreatedDate}
                      onChange={e => setEditCreatedDate(e.target.value)}
                      className="rounded border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-700 px-1.5 py-0.5 text-[11px] text-zinc-700 dark:text-zinc-300 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    <button
                      onClick={() => {
                        if (!editCreatedDate) { setShowEditCreated(false); return; }
                        const newCreated = new Date(editCreatedDate).toISOString();
                        const history = [...(ad.price_history || [])];
                        // Добавляем запись в историю с ценой и новой датой создания
                        if (ad.price != null) {
                          history.push({ date: newCreated, price: ad.price });
                        }
                        const updatedAd = recalcPriceFromHistory({ ...ad, created: newCreated, price_history: history });
                        setAd(updatedAd);
                        onSave?.(updatedAd);
                        setShowEditCreated(false);
                      }}
                      className="text-[10px] text-blue-600 hover:text-blue-800 dark:text-blue-400 font-medium"
                    >ОК</button>
                    <button
                      onClick={() => setShowEditCreated(false)}
                      className="text-[10px] text-zinc-400 hover:text-zinc-600"
                    >Отмена</button>
                  </div>
                ) : (
                  <button
                    onClick={() => {
                      const d = ad.created ? new Date(ad.created) : new Date();
                      setEditCreatedDate(d.toISOString().slice(0, 10));
                      setShowEditCreated(true);
                    }}
                    className="text-[11px] text-zinc-600 dark:text-zinc-400 hover:text-blue-600 dark:hover:text-blue-400 hover:underline transition-colors"
                  >
                    {fmtDate(ad.created)}
                  </button>
                )}
              </div>

              {/* Дата обновления — редактируемая */}
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-zinc-500 dark:text-zinc-400">Обновлено:</span>
                {showEditUpdated ? (
                  <div className="flex items-center gap-1">
                    <input
                      type="date"
                      value={editUpdatedDate}
                      onChange={e => setEditUpdatedDate(e.target.value)}
                      className="rounded border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-700 px-1.5 py-0.5 text-[11px] text-zinc-700 dark:text-zinc-300 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    <button
                      onClick={() => {
                        if (!editUpdatedDate) { setShowEditUpdated(false); return; }
                        const updatedAd = { ...ad, updated: new Date(editUpdatedDate).toISOString() };
                        setAd(updatedAd);
                        onSave?.(updatedAd);
                        setShowEditUpdated(false);
                      }}
                      className="text-[10px] text-blue-600 hover:text-blue-800 dark:text-blue-400 font-medium"
                    >ОК</button>
                    <button
                      onClick={() => setShowEditUpdated(false)}
                      className="text-[10px] text-zinc-400 hover:text-zinc-600"
                    >Отмена</button>
                  </div>
                ) : (
                  <button
                    onClick={() => {
                      const d = ad.updated ? new Date(ad.updated) : new Date();
                      setEditUpdatedDate(d.toISOString().slice(0, 10));
                      setShowEditUpdated(true);
                    }}
                    className="text-[11px] text-zinc-600 dark:text-zinc-400 hover:text-blue-600 dark:hover:text-blue-400 hover:underline transition-colors"
                  >
                    {fmtDate(ad.updated)}
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Результат актуализации */}
          {actualizeResult && (
            <div className="border-t border-zinc-200 dark:border-zinc-700 bg-blue-50 dark:bg-blue-900/20 px-5 py-2 rounded-b-xl">
              <div className="flex items-center justify-between">
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  {actualizeResult.changes.map((c, i) => (
                    <span key={i} className="text-[10px] text-blue-700 dark:text-blue-300">{c}</span>
                  ))}
                </div>
                <button
                  onClick={() => setActualizeResult(null)}
                  className="text-[10px] text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 ml-2"
                >
                  Скрыть
                </button>
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

export default AdDetailModal;
