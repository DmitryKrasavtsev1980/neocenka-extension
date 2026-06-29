/**
 * Модальное окно редактирования/создания адреса
 * Точная копия по функционалу neocenka-extension (area.html + AddressManager.js)
 * — Двухколоночный layout: форма слева, карта справа
 * — Карта Leaflet с перетаскиваемым маркером
 * — Ссылки на 2ГИС, Яндекс Карты, Яндекс Панорамы
 * — Обратное геокодирование при перетаскивании маркера
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { AdAddress, ReferenceItem } from '@/types';
import { adsAddressService } from '@/services/ads-address-service';
import { addressSyncService } from '@/services/address-sync-service';
import { getMapConfig, createTileLayer } from '@/services/map-config';

const TYPE_OPTIONS = [
  { value: 'house', label: 'Дом' },
  { value: 'house_with_land', label: 'Дом с участком' },
  { value: 'land', label: 'Участок' },
  { value: 'commercial', label: 'Коммерция' },
  { value: 'building', label: 'Здание' },
];

const TRIPLE_OPTIONS = [
  { value: '', label: 'Не указано' },
  { value: 'true', label: 'Да' },
  { value: 'false', label: 'Нет' },
];

interface AdAddressModalProps {
  address: AdAddress;
  mode?: 'edit' | 'create';
  referenceData: {
    wallMaterials: ReferenceItem[];
    houseSeries: ReferenceItem[];
    houseClasses?: ReferenceItem[];
    ceilingMaterials?: ReferenceItem[];
    houseProblems?: ReferenceItem[];
  };
  onClose: () => void;
  onSave?: (updated: AdAddress) => void;
  onDelete?: (deletedId: number) => void;
}

const AdAddressModal: React.FC<AdAddressModalProps> = ({ address: initialAddress, mode = 'edit', referenceData, onClose, onSave, onDelete }) => {
  const [addr, setAddr] = useState<AdAddress>({ ...initialAddress });
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(false);
  const [geocoding, setGeocoding] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const isCreate = mode === 'create';

  // Refs для карты
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);

  const update = <K extends keyof AdAddress>(key: K, value: AdAddress[K]) => {
    setAddr(prev => ({ ...prev, [key]: value }));
  };

  // ─── Ссылки на внешние сервисы ───
  const externalLinks = useMemo(() => {
    const lat = addr.coordinates?.lat;
    const lng = addr.coordinates?.lng;
    const addressText = addr.address || '';

    if (lat == null || lng == null) return null;

    // Определение города для 2ГИС
    const lower = addressText.toLowerCase();
    let city = 'novosibirsk';
    if (lower.includes('москва')) city = 'moscow';
    else if (lower.includes('санкт-петербург') || lower.includes('спб')) city = 'spb';
    else if (lower.includes('екатеринбург')) city = 'ekaterinburg';
    else if (lower.includes('казань')) city = 'kazan';
    else if (lower.includes('нижний новгород')) city = 'nizhniy_novgorod';

    return {
      gis2: `https://2gis.ru/${city}/search/${encodeURIComponent(addressText)}`,
      yandex: `https://yandex.ru/maps/?whatshere[point]=${lng},${lat}&whatshere[zoom]=17`,
      panorama: `https://yandex.ru/maps/?panorama[point]=${lng},${lat}&panorama[direction]=0,0&panorama[span]=130.000000,71.919192`,
    };
  }, [addr.coordinates, addr.address]);

  // ─── Обратное геокодирование (OSM Nominatim) ───
  const reverseGeocode = async (lat: number, lng: number) => {
    setGeocoding(true);
    try {
      const resp = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=ru`,
        { headers: { 'User-Agent': 'NeocenkaExtension/1.0' } }
      );
      const data = await resp.json();
      if (data?.display_name) {
        setAddr(prev => ({ ...prev, address: data.display_name }));
      }
    } catch {
      // silent — не удалось геокодировать
    } finally {
      setGeocoding(false);
    }
  };

  // ─── Обновление координат (при drag / click) ───
  const handleCoordinatesChange = (lat: number, lng: number) => {
    setAddr(prev => ({
      ...prev,
      coordinates: { ...prev.coordinates, lat, lng },
    }));
    reverseGeocode(lat, lng);
  };

  // ─── Инициализация карты Leaflet ───
  useEffect(() => {
    const container = mapContainerRef.current;
    if (!container) return;

    // Координаты: из адреса или по умолчанию (Москва)
    const lat = Number(addr.coordinates?.lat) || 55.7558;
    const lng = Number(addr.coordinates?.lng) || 37.6173;

    const map = L.map(container, {
      center: [lat, lng],
      zoom: 16,
      zoomControl: true,
      attributionControl: false,
    });
    mapInstanceRef.current = map;

    // Тайлы (как в SearchByPolygon)
    const mapConfig = getMapConfig();
    createTileLayer(mapConfig).addTo(map);

    // Перетаскиваемый маркер — синий треугольник
    const markerHeight = 25;
    const markerColor = '#3b82f6';
    const marker = L.marker([lat, lng], {
      draggable: true,
      icon: L.divIcon({
        className: 'edit-address-marker',
        html: `<div style="position:relative;">
          <div style="width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-top:${markerHeight}px solid ${markerColor};filter:drop-shadow(0 2px 4px rgba(0,0,0,0.3));opacity:0.9;"></div>
          <span style="position:absolute;left:12px;top:0;font-size:10px;font-weight:600;color:white;background:${markerColor};padding:2px 4px;border-radius:3px;white-space:nowrap;box-shadow:0 1px 3px rgba(0,0,0,0.2);">📍 РЕДАКТИРОВАНИЕ</span>
        </div>`,
        iconSize: [12, markerHeight],
        iconAnchor: [6, markerHeight],
      }),
    }).addTo(map);
    markerRef.current = marker;

    // Drag → обновить координаты
    marker.on('dragend', () => {
      const pos = marker.getLatLng();
      handleCoordinatesChange(pos.lat, pos.lng);
    });

    // Click по карте → переместить маркер
    map.on('click', (e: L.LeafletMouseEvent) => {
      const { lat: clickLat, lng: clickLng } = e.latlng;
      marker.setLatLng([clickLat, clickLng]);
      handleCoordinatesChange(clickLat, clickLng);
    });

    // invalidateSize после рендера
    setTimeout(() => map.invalidateSize(), 200);

    return () => {
      marker.remove();
      map.remove();
      mapInstanceRef.current = null;
      markerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Сохранение ───
  const handleSave = async () => {
    setSaving(true);
    setSubmitError(false);
    try {
      let savedId: number | undefined;

      if (isCreate) {
        // Новый адрес — source='user', synced_at=null (пока не отправлен)
        savedId = await adsAddressService.create({
          ...addr,
          source: 'user',
          synced_at: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      } else {
        // Редактирование — сбрасываем synced_at, чтобы отправить изменения на модерацию
        await adsAddressService.update(addr.id!, {
          ...addr,
          synced_at: null,
          updated_at: new Date().toISOString(),
        });
        savedId = addr.id;
      }

      onSave?.({ ...addr, id: savedId });

      // Автоматическая отправка на модерацию
      if (savedId) {
        setSubmitting(true);
        try {
          await addressSyncService.submitOne(savedId);
        } catch (e) {
          // Адрес сохранён локально, но отправка не удалась (сеть/сервер)
          console.error('[AdAddressModal] Ошибка отправки на модерацию:', e);
          setSubmitError(true);
        } finally {
          setSubmitting(false);
        }
      }

      onClose();
    } catch {
      // silent
    } finally {
      setSaving(false);
    }
  };

  // ─── Удаление ───
  const handleDelete = async () => {
    if (!addr.id) return;
    setDeleting(true);
    try {
      // Если адрес уже на сервере — отправляем запрос на модерацию
      if (addr.server_id) {
        try {
          await addressSyncService.submitDelete(addr.id);
        } catch (e) {
          console.error('[AdAddressModal] Ошибка отправки удаления на модерацию:', e);
          setSubmitError(true);
        }
      }
      // Удаляем локально
      await adsAddressService.remove(addr.id);
      onDelete?.(addr.id);
      onClose();
    } catch {
      // silent
    } finally {
      setDeleting(false);
    }
  };

  // ─── Хелперы для рендера полей ───
  const inputCls = 'w-full rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-700 px-2 py-1.5 text-xs text-zinc-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500';
  const labelCls = 'block text-[11px] font-medium text-zinc-600 dark:text-zinc-400 mb-1';

  const refSelect = (label: string, key: keyof AdAddress, items: ReferenceItem[] | undefined) => {
    if (!items || items.length === 0) return null;
    return (
      <div>
        <label className={labelCls}>{label}</label>
        <select value={(addr[key] as string) || ''} onChange={e => update(key, e.target.value || null)} className={inputCls}>
          <option value="">—</option>
          {items.map(item => (
            <option key={item.server_id || item.id} value={item.server_id || ''}>{item.name}</option>
          ))}
        </select>
      </div>
    );
  };

  const tripleSelect = (label: string, key: keyof AdAddress) => {
    const val = addr[key];
    const strVal = val === true ? 'true' : val === false ? 'false' : '';
    return (
      <div>
        <label className={labelCls}>{label}</label>
        <select value={strVal} onChange={e => {
          const v = e.target.value;
          update(key, v === 'true' ? true as any : v === 'false' ? false as any : null as any);
        }} className={inputCls}>
          {TRIPLE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>
    );
  };

  const numField = (label: string, key: keyof AdAddress, min?: number, max?: number) => (
    <div>
      <label className={labelCls}>{label}</label>
      <input type="number" min={min} max={max}
        value={addr[key] != null ? String(addr[key]) : ''}
        onChange={e => update(key, e.target.value ? Number(e.target.value) : null)}
        className={inputCls} />
    </div>
  );

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/30" onClick={onClose}>
      <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto mx-4 relative" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-zinc-200 dark:border-zinc-700 sticky top-0 bg-white dark:bg-zinc-900 z-10">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-white truncate max-w-md">
              {isCreate ? 'Новый адрес' : 'Редактировать адрес'}
            </h2>
            {addr.source && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">{addr.source}</span>
            )}
          </div>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600 text-lg leading-none">&times;</button>
        </div>

        {/* Двухколоночный layout */}
        <div className="p-5">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* ─── Левая колонка — форма ─── */}
            <div className="space-y-4">
              {/* Адрес */}
              <div>
                <label className={labelCls}>Адрес</label>
                <input type="text" value={addr.address || ''} onChange={e => update('address', e.target.value)}
                  disabled={geocoding}
                  className={inputCls + (geocoding ? ' bg-zinc-100 text-zinc-400 ' : '')}
                  placeholder={geocoding ? '🔍 Поиск адреса...' : ''} />
              </div>

              {/* Тип */}
              <div>
                <label className={labelCls}>Тип</label>
                <select value={addr.type || ''} onChange={e => update('type', e.target.value)} className={inputCls}>
                  {TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>

              {/* Справочники */}
              {refSelect('Серия дома', 'house_series_id', referenceData.houseSeries)}
              {refSelect('Класс дома', 'house_class_id', referenceData.houseClasses)}
              {refSelect('Материал стен', 'wall_material_id', referenceData.wallMaterials)}
              {refSelect('Материал перекрытий', 'ceiling_material_id', referenceData.ceilingMaterials)}
              {refSelect('Проблемы дома', 'house_problem_id', referenceData.houseProblems)}

              {/* Газ / Отопление */}
              <div className="grid grid-cols-2 gap-3">
                {tripleSelect('Газоснабжение', 'gas_supply')}
                {tripleSelect('Инд. отопление', 'individual_heating')}
              </div>

              {/* Инфраструктура */}
              <div className="grid grid-cols-2 gap-3">
                {tripleSelect('Детская площадка', 'has_playground')}
                {tripleSelect('Спортплощадка', 'has_sports_area')}
              </div>

              {/* Этажей / Высота */}
              <div className="grid grid-cols-2 gap-3">
                {numField('Этажей', 'floors_count', 1, 100)}
                <div>
                  <label className={labelCls}>Высота потолков</label>
                  <input type="text" value={addr.ceiling_height || ''} onChange={e => update('ceiling_height', e.target.value || null)} placeholder="напр. 2.7" className={inputCls} />
                </div>
              </div>

              {/* Год / Подъездов */}
              <div className="grid grid-cols-2 gap-3">
                {numField('Год постройки', 'build_year', 1800, 2100)}
                {numField('Подъездов', 'entrances_count', 1, 50)}
              </div>

              {/* Жилых помещений */}
              {numField('Жилых помещений', 'living_spaces_count', 0)}
            </div>

            {/* ─── Правая колонка — карта и сервисы ─── */}
            <div>
              <label className="block text-[11px] font-medium text-zinc-600 dark:text-zinc-400 mb-2">Местоположение на карте</label>

              {/* Карта */}
              <div ref={mapContainerRef} className="border border-zinc-300 dark:border-zinc-600 rounded-md" style={{ height: 400, width: '100%' }} />

              {/* Координаты */}
              <p className="mt-2 text-[11px] text-zinc-500 dark:text-zinc-400">
                {addr.coordinates?.lat != null && addr.coordinates?.lng != null
                  ? <>Координаты: {Number(addr.coordinates.lat).toFixed(6)}, {Number(addr.coordinates.lng).toFixed(6)} — перетащите маркер для изменения</>
                  : 'Перетащите маркер на карте для изменения координат'}
              </p>

              {/* Ссылки на внешние сервисы */}
              <div className="mt-4">
                <label className="block text-[11px] font-medium text-zinc-600 dark:text-zinc-400 mb-2">Просмотр на картах</label>
                <div className="grid grid-cols-3 gap-2">
                  {externalLinks ? (
                    <>
                      <a href={externalLinks.gis2} target="_blank" rel="noopener noreferrer"
                        className="inline-flex w-full justify-center items-center rounded-md border border-zinc-300 bg-green-100 dark:bg-green-900/20 px-2 py-2 text-xs font-medium text-zinc-700 dark:text-green-400 shadow-sm hover:bg-green-200 dark:hover:bg-green-900/30">
                        2ГИС
                        <svg className="ml-1 w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                      </a>
                      <a href={externalLinks.yandex} target="_blank" rel="noopener noreferrer"
                        className="inline-flex w-full justify-center items-center rounded-md border border-zinc-300 bg-red-100 dark:bg-red-900/20 px-2 py-2 text-xs font-medium text-zinc-700 dark:text-red-400 shadow-sm hover:bg-red-200 dark:hover:bg-red-900/30">
                        Яндекс
                        <svg className="ml-1 w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                      </a>
                      <a href={externalLinks.panorama} target="_blank" rel="noopener noreferrer"
                        className="inline-flex w-full justify-center items-center rounded-md border border-zinc-300 bg-yellow-100 dark:bg-yellow-900/20 px-2 py-2 text-xs font-medium text-zinc-700 dark:text-yellow-400 shadow-sm hover:bg-yellow-200 dark:hover:bg-yellow-900/30">
                        Панорамы
                        <svg className="ml-1 w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                      </a>
                    </>
                  ) : (
                    <span className="col-span-3 text-[11px] text-zinc-400">Укажите координаты для перехода</span>
                  )}
                </div>
              </div>

              {/* Комментарий */}
              <div className="mt-4">
                <label className={labelCls}>Комментарий</label>
                <textarea value={addr.comment || ''} onChange={e => update('comment', e.target.value)}
                  rows={8} placeholder="Введите комментарий к адресу..."
                  className="w-full rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-700 px-2 py-1.5 text-xs text-zinc-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
                  style={{ height: 200, minHeight: 150 }} />
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-zinc-200 dark:border-zinc-700 sticky bottom-0 bg-white dark:bg-zinc-900">
          {submitError && (
            <span className="text-[11px] text-amber-600 dark:text-amber-400 mr-auto">
              Сохранено локально, отправка на модерацию не удалась
            </span>
          )}
          {!isCreate && !deleteConfirm && (
            <button
              onClick={() => setDeleteConfirm(true)}
              disabled={deleting}
              className="rounded-md px-3 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50 mr-auto"
            >
              Удалить
            </button>
          )}
          {!isCreate && deleteConfirm && (
            <div className="flex items-center gap-1 mr-auto">
              <span className="text-[10px] text-red-600 dark:text-red-400">Удалить адрес?</span>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="px-2 py-1 rounded text-[10px] font-medium bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
              >
                {deleting ? '...' : 'Да'}
              </button>
              <button
                onClick={() => setDeleteConfirm(false)}
                disabled={deleting}
                className="px-2 py-1 rounded text-[10px] font-medium bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-700 dark:text-zinc-300"
              >
                Нет
              </button>
            </div>
          )}
          <button onClick={onClose} className="rounded-md px-3 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800">Отмена</button>
          <button onClick={handleSave} disabled={saving || submitting} className="rounded-md bg-blue-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2">
            {(saving || submitting) && <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" /></svg>}
            {saving ? 'Сохранение...' : submitting ? 'Отправка на модерацию...' : 'Сохранить'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AdAddressModal;
