import React, { useEffect, useRef, useState, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Полифилл для leaflet-draw: библиотека использует устаревший L.Polyline._flat,
// который в Leaflet 1.9 пишет console.warn. Перезаписываем на тихую версию.
(L.Polyline as any)._flat = function (latlngs: any): boolean {
  return !Array.isArray(latlngs[0]) || (typeof latlngs[0][0] !== 'object' && typeof latlngs[0][0] !== 'undefined');
};

// Патч безопасности: в минифицированном бандле Leaflet метод LatLngBounds.contains
// вызывает J(y) (latLngBounds factory) вместо K(y) (latLng factory).
// Из-за этого contains([lat, lng]) создаёт пустой bounds и падает с TypeError.
// Также extend получает отдельные числа (lat/lng из массива) вместо LatLng —
// патчим оба метода для безопасной конвертации.
const _origExtend = L.LatLngBounds.prototype.extend;
(L.LatLngBounds.prototype as any).extend = function (obj: any): any {
  if (obj && !(obj instanceof L.LatLng) && !(obj instanceof (L.LatLngBounds as any))) {
    if (typeof obj === 'object' && '_southWest' in obj && '_northEast' in obj) {
      const sw = obj._southWest, ne = obj._northEast;
      if (sw && ne) {
        _origExtend.call(this, L.latLng(sw.lat, sw.lng));
        _origExtend.call(this, L.latLng(ne.lat, ne.lng));
        return this;
      }
      return this;
    }
    const latlng = L.latLng(obj);
    if (latlng) return _origExtend.call(this, latlng);
    if (Array.isArray(obj)) {
      for (const item of obj) {
        const ll = L.latLng(item);
        if (ll) _origExtend.call(this, ll);
      }
      return this;
    }
    return this;
  }
  return _origExtend.call(this, obj);
};
(L.LatLngBounds.prototype as any).contains = function (obj: any): boolean {
  if (!this._southWest || !this._northEast) return false;
  if (obj && (obj instanceof (L.LatLngBounds as any)) && obj._southWest && obj._northEast) {
    return obj._southWest.lat >= this._southWest.lat &&
           obj._northEast.lat <= this._northEast.lat &&
           obj._southWest.lng >= this._southWest.lng &&
           obj._northEast.lng <= this._northEast.lng;
  }
  const latlng = L.latLng(obj);
  if (!latlng) return false;
  return latlng.lat >= this._southWest.lat && latlng.lat <= this._northEast.lat &&
         latlng.lng >= this._southWest.lng && latlng.lng <= this._northEast.lng;
};

import 'leaflet-draw';
import 'leaflet-draw/dist/leaflet.draw.css';
import { booleanIntersects, polygon as turfPolygon } from '@turf/turf';
import type { Feature, Polygon as TurfPolygon } from 'geojson';
import { CadastralQuarter } from '../../types';
import type { AdAddress, ReferenceItem } from '../../types';
import { getMapConfig, createTileLayer } from '../../services/map-config';
import './SearchByPolygon.css';

// ─── Константы маркеров ───

type MapFilterType = 'year' | 'series' | 'floors' | 'objects' | 'listings';

/** Цвета материалов стен (по server_id) */
const WALL_MATERIAL_COLORS: Record<string, string> = {
  brick: '#8B4513',
  panel: '#808080',
  monolith: '#cbcbc8',
  blocky: '#F5F5DC',
};

/** Названия материалов стен */
const WALL_MATERIAL_NAMES: Record<string, string> = {
  brick: 'Кирпичный',
  panel: 'Панельный',
  monolith: 'Монолитный',
  blocky: 'Блочный',
};

/** Названия серий домов (fallback) */
const HOUSE_SERIES_NAMES: Record<string, string> = {
  khrushchevka: 'Хрущёвка',
  stalinka: 'Сталинка',
  brezhnevka: 'Брежневка',
  modern: 'Современная',
};

function getMarkerHeight(floors: number | null): number {
  if (!floors || floors <= 5) return 10;
  if (floors <= 10) return 15;
  if (floors <= 20) return 20;
  return 25;
}

// ─── Интерфейсы ───

interface FlyToTarget {
  lat: number;
  lon: number;
  zoom: number;
}

interface QuarterStats {
  count: number;
  totalPrice: number;
  totalArea: number;
}

interface SearchByPolygonProps {
  quarters: CadastralQuarter[];
  quarterStats: Record<string, QuarterStats>;
  onQuartersSelected: (cadNumbers: string[], polygonsCoords?: [number, number][][]) => void;
  initialPolygons?: [number, number][][] | null;
  flyTo?: FlyToTarget | null;
  addresses?: AdAddress[];
  addressStats?: Record<number, { objects: number; listings: number }>;
  referenceData?: {
    wallMaterials: ReferenceItem[];
    houseSeries: ReferenceItem[];
    houseClasses?: ReferenceItem[];
    ceilingMaterials?: ReferenceItem[];
  };
  onAddressClick?: (address: AdAddress) => void;
  selectedAddressIds?: Set<number>;
  highlightedAddressIds?: Set<number>;
  excludedAddressIds?: Set<number>;
  onAddressToggle?: (address: AdAddress) => void;
  onSelectAllInPolygon?: () => void;
  polygonsCoords?: [number, number][][] | null;
}

const SearchByPolygon: React.FC<SearchByPolygonProps> = ({
  quarters,
  quarterStats,
  onQuartersSelected,
  initialPolygons,
  flyTo,
  addresses,
  addressStats,
  referenceData,
  onAddressClick,
  selectedAddressIds,
  highlightedAddressIds,
  excludedAddressIds,
  onAddressToggle,
  onSelectAllInPolygon,
  polygonsCoords,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const drawnItemsRef = useRef<L.FeatureGroup | null>(null);
  const quarterLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const addressLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const quartersRef = useRef(quarters);
  const quarterStatsRef = useRef(quarterStats);
  const onQuartersSelectedRef = useRef(onQuartersSelected);
  onQuartersSelectedRef.current = onQuartersSelected;
  const [selectedCount, setSelectedCount] = useState(0);
  const [quartersLoaded, setQuartersLoaded] = useState(false);
  const [addressEnabled, setAddressEnabled] = useState(false);
  const [addressQuery, setAddressQuery] = useState('');
  const [addressSuggestions, setAddressSuggestions] = useState<AdAddress[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [highlightedSuggestionIdx, setHighlightedSuggestionIdx] = useState(-1);
  const [geocoding, setGeocoding] = useState(false);
  const addressMarkerRef = useRef<L.Marker | null>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  // Есть ли локальные адреса — если нет, используем Nominatim
  const hasLocalAddresses = (addresses && addresses.length > 0);

  // Маркеры адресов
  const [activeMapFilter, setActiveMapFilter] = useState<MapFilterType>('year');
  const addressesRef = useRef(addresses);
  const addressStatsRef = useRef(addressStats);
  const onAddressClickRef = useRef(onAddressClick);
  onAddressClickRef.current = onAddressClick;
  const selectedAddressIdsRef = useRef(selectedAddressIds);
  selectedAddressIdsRef.current = selectedAddressIds;
  const highlightedAddressIdsRef = useRef(highlightedAddressIds);
  highlightedAddressIdsRef.current = highlightedAddressIds;
  const excludedAddressIdsRef = useRef(excludedAddressIds);
  excludedAddressIdsRef.current = excludedAddressIds;
  const onAddressToggleRef = useRef(onAddressToggle);
  onAddressToggleRef.current = onAddressToggle;
  const activeMapFilterRef = useRef(activeMapFilter);
  const [addressVisible, setAddressVisible] = useState(true);
  const [addressCount, setAddressCount] = useState(0);

  // Справочники (загружаются из IndexedDB)
  const wallMaterialMapRef = useRef<Map<string, ReferenceItem>>(new Map());
  const houseSeriesMapRef = useRef<Map<string, ReferenceItem>>(new Map());
  const houseClassMapRef = useRef<Map<string, ReferenceItem>>(new Map());
  const ceilingMaterialMapRef = useRef<Map<string, ReferenceItem>>(new Map());

  // Флаг: предотвращает циклическое пересоздание полигонов
  const isInternalUpdateRef = useRef(false);

  // Рефы для доступа к функциям из замыканий карты
  const setAddressMarkerRef = useRef<(lat: number, lng: number) => void>(() => {});
  const reverseGeocodeRef = useRef<(lat: number, lng: number) => void>(() => {});
  const findNearestAddressRef = useRef<(lat: number, lng: number) => void>(() => {});
  const addressEnabledRef = useRef(addressEnabled);
  addressEnabledRef.current = addressEnabled;

  // ─── Построение мапов справочников из пропсов ───
  useEffect(() => {
    if (referenceData?.wallMaterials) {
      const map = new Map<string, ReferenceItem>();
      referenceData.wallMaterials.forEach(item => {
        if (item.server_id) map.set(item.server_id, item);
      });
      wallMaterialMapRef.current = map;
    }
    if (referenceData?.houseSeries) {
      const map = new Map<string, ReferenceItem>();
      referenceData.houseSeries.forEach(item => {
        if (item.server_id) map.set(item.server_id, item);
      });
      houseSeriesMapRef.current = map;
    }
    if (referenceData?.houseClasses) {
      const map = new Map<string, ReferenceItem>();
      referenceData.houseClasses.forEach(item => {
        if (item.server_id) map.set(item.server_id, item);
      });
      houseClassMapRef.current = map;
    }
    if (referenceData?.ceilingMaterials) {
      const map = new Map<string, ReferenceItem>();
      referenceData.ceilingMaterials.forEach(item => {
        if (item.server_id) map.set(item.server_id, item);
      });
      ceilingMaterialMapRef.current = map;
    }
  }, [referenceData]);

  // Держим refs актуальными
  useEffect(() => {
    addressesRef.current = addresses;
    addressStatsRef.current = addressStats;
  }, [addresses, addressStats]);

  // Автодополнение: фильтрация адресов при вводе
  useEffect(() => {
    const raw = addressQuery.trim().toLowerCase();
    if (!addressEnabled || raw.length < 2) {
      setAddressSuggestions([]);
      setShowSuggestions(false);
      setHighlightedSuggestionIdx(-1);
      return;
    }
    // Нормализация: убираем punctuation и служебные слова
    const normalize = (s: string) =>
      s.replace(/[,.\s]+/g, ' ')
        .replace(/\b(д|дом|корп|к|стр|вл|влад)\b/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    // Токены запроса: "иванова 45" → ["иванова", "45"]
    const tokens = normalize(raw).split(/\s+/).filter(Boolean);
    if (tokens.length === 0) {
      setAddressSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    const addrs = addresses || [];
    // Каждый токен должен присутствовать в нормализованном адресе
    const filtered = addrs.filter(a => {
      const na = normalize(a.address.toLowerCase());
      return tokens.every(t => na.includes(t));
    });
    // Сортировка: приоритет — более короткие адреса (точнее совпадение)
    filtered.sort((a, b) => a.address.length - b.address.length);
    setAddressSuggestions(filtered.slice(0, 30));
    setShowSuggestions(filtered.length > 0);
    setHighlightedSuggestionIdx(-1);
  }, [addressQuery, addressEnabled, addresses]);

  useEffect(() => {
    activeMapFilterRef.current = activeMapFilter;
  }, [activeMapFilter]);

  useEffect(() => {
    quartersRef.current = quarters;
    quarterStatsRef.current = quarterStats;
    if (!quartersLoaded) {
      setQuartersLoaded(true);
    }
  }, [quarters, quarterStats]);

  // ─── Создание треугольного маркера адреса ───
  const createTriangleMarker = useCallback((address: AdAddress, filter: MapFilterType): L.Marker => {
    const floors = address.floors_count || 0;
    const markerHeight = getMarkerHeight(floors);

    // Цвет: из справочника по wall_material_id, или дефолт
    let markerColor = '#3b82f6';
    if (address.wall_material_id) {
      const refItem = wallMaterialMapRef.current.get(address.wall_material_id);
      if (refItem?.color) {
        markerColor = refItem.color;
      } else if (WALL_MATERIAL_COLORS[address.wall_material_id]) {
        markerColor = WALL_MATERIAL_COLORS[address.wall_material_id];
      }
    }

    // Метка в зависимости от фильтра
    let labelText = '';
    switch (filter) {
      case 'year':
        labelText = address.build_year ? String(address.build_year) : '';
        break;
      case 'series':
        if (address.house_series_id) {
          const refItem = houseSeriesMapRef.current.get(address.house_series_id);
          labelText = refItem?.name || HOUSE_SERIES_NAMES[address.house_series_id] || address.house_series_id;
        }
        break;
      case 'floors':
        labelText = address.floors_count ? String(address.floors_count) : '';
        break;
      case 'objects':
        if (address.id && addressStatsRef.current) {
          const stats = addressStatsRef.current[address.id];
          labelText = stats ? String(stats.objects) : '';
        }
        break;
      case 'listings':
        if (address.id && addressStatsRef.current) {
          const stats = addressStatsRef.current[address.id];
          labelText = stats ? String(stats.listings) : '';
        }
        break;
    }

    const marker = L.marker([address.coordinates.lat!, address.coordinates.lng!], {
      icon: L.divIcon({
        className: 'triangle-marker',
        html: `<div style="position:relative;">
          <div style="width:0;height:0;border-left:7.5px solid transparent;border-right:7.5px solid transparent;border-top:${markerHeight}px solid ${markerColor};"></div>
          ${labelText ? `<span style="position:absolute;left:15px;top:0;font-size:11px;font-weight:600;color:#374151;background:rgba(255,255,255,0.95);padding:1px 4px;border-radius:3px;white-space:nowrap;box-shadow:0 1px 3px rgba(0,0,0,0.1);">${labelText}</span>` : ''}
        </div>`,
        iconSize: [15, markerHeight],
        iconAnchor: [7.5, markerHeight],
      }),
    });

    // Popup — как в neocenka-extension
    const wallName = address.wall_material_id
      ? (wallMaterialMapRef.current.get(address.wall_material_id)?.name || WALL_MATERIAL_NAMES[address.wall_material_id] || String(address.wall_material_id))
      : '';
    const seriesName = address.house_series_id
      ? (houseSeriesMapRef.current.get(address.house_series_id)?.name || HOUSE_SERIES_NAMES[address.house_series_id] || String(address.house_series_id))
      : '';
    const classId = address.house_class_id;
    const className = classId
      ? (houseClassMapRef.current.get(classId)?.name || String(classId))
      : '';
    const ceilingId = address.ceiling_material_id;
    const ceilingName = ceilingId
      ? (ceilingMaterialMapRef.current.get(ceilingId)?.name || String(ceilingId))
      : '';
    const gasText = address.gas_supply === true ? 'Да' : (address.gas_supply === false ? 'Нет' : 'Не указано');
    const heatingText = address.individual_heating === true ? 'Да' : (address.individual_heating === false ? 'Нет' : 'Не указано');
    const addrId = address.id ?? '';
    const isExcluded = excludedAddressIdsRef.current?.has(address.id!) ?? false;

    const popupContent = `
      <div style="width:260px;max-width:260px;">
        <div style="margin-bottom:6px;display:flex;align-items:center;justify-content:space-between;">
          <div style="font-weight:bold;font-size:13px;color:#111;">📍 Адрес</div>
          <button data-action="edit-address" data-address-id="${addrId}"
            style="padding:3px 8px;font-size:11px;background:#2563eb;color:#fff;border:none;border-radius:4px;cursor:pointer;">
            ✏️ Редактировать
          </button>
        </div>
        <div style="font-weight:500;font-size:12px;color:#333;margin-bottom:6px;">${address.address || 'Не указан'}</div>
        <div style="font-size:12px;color:#555;line-height:1.6;">
          <div><strong>Серия дома:</strong> ${seriesName || 'Не указана'}</div>
          <div><strong>Класс дома:</strong> ${className || 'Не указан'}</div>
          <div><strong>Материал стен:</strong> ${wallName || 'Не указан'}</div>
          <div><strong>Материал перекрытий:</strong> ${ceilingName || 'Не указано'}</div>
          <div><strong>Газоснабжение:</strong> ${gasText}</div>
          <div><strong>Индивидуальное отопление:</strong> ${heatingText}</div>
          <div><strong>Этажей:</strong> ${address.floors_count || 'Не указано'}</div>
          <div><strong>Год постройки:</strong> ${address.build_year || 'Не указан'}</div>
        </div>
        <div style="margin-top:8px;">
          <button data-action="toggle-address-filter" data-address-id="${addrId}"
            style="display:block;width:100%;padding:5px 8px;font-size:12px;background:${isExcluded ? '#16a34a' : '#dc2626'};color:#fff;border:none;border-radius:4px;cursor:pointer;">
            ${isExcluded ? '＋ Добавить в фильтр' : '✕ Убрать из фильтра'}
          </button>
        </div>
      </div>
    `;
    marker.bindPopup(popupContent, { maxWidth: 280, className: 'address-popup-container' });

    // Обработка кнопок в popup
    marker.on('popupopen', () => {
      setTimeout(() => {
        const btn = document.querySelector(`[data-action="edit-address"][data-address-id="${addrId}"]`);
        if (btn) {
          btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            marker.closePopup();
            if (onAddressClickRef.current) onAddressClickRef.current(address);
          });
        }
        // Обновляем состояние кнопки toggle по текущему excludedAddressIds
        const toggleBtn = document.querySelector(`[data-action="toggle-address-filter"][data-address-id="${addrId}"]`) as HTMLElement | null;
        if (toggleBtn) {
          const nowExcluded = excludedAddressIdsRef.current?.has(address.id!) ?? false;
          toggleBtn.style.background = nowExcluded ? '#16a34a' : '#dc2626';
          toggleBtn.textContent = nowExcluded ? '＋ Добавить в фильтр' : '✕ Убрать из фильтра';
          toggleBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (onAddressToggleRef.current) onAddressToggleRef.current(address);
            marker.closePopup();
          });
        }
      }, 0);
    });

    return marker;
  }, []);

  // ─── Применение прозрачности маркеров ───
  const applyMarkerOpacity = useCallback((layerGroup: L.LayerGroup) => {
    const sel = selectedAddressIdsRef.current;
    const hl = highlightedAddressIdsRef.current;
    const excl = excludedAddressIdsRef.current;
    const hasSelection = sel && sel.size > 0;
    layerGroup.eachLayer((layer) => {
      const el = (layer as L.Marker).getElement?.();
      if (!el) return;
      el.style.transition = 'opacity 0.2s';
      if (!hasSelection) { el.style.opacity = '1'; return; }
      const marker = layer as L.Marker;
      const popupContent = marker.getPopup?.()?.getContent?.() as string | undefined;
      const match = popupContent?.match(/data-address-id="(\d+)"/);
      const addrId = match ? Number(match[1]) : null;
      if (addrId == null || !sel!.has(addrId)) { el.style.opacity = '0.5'; return; }
      // Подходит (не excluded и в highlighted) → полная непрозрачность
      const isExcluded = excl && excl.has(addrId);
      const isHighlighted = hl && hl.has(addrId);
      el.style.opacity = (!isExcluded && isHighlighted) ? '1' : '0.5';
    });
  }, []);

  // ─── Рендер адресных маркеров на карте ───
  const renderAddressMarkers = useCallback(() => {
    const layerGroup = addressLayerGroupRef.current;
    const map = mapInstanceRef.current;
    if (!layerGroup || !map) return;

    layerGroup.clearLayers();

    if (!addressVisible) {
      setAddressCount(0);
      return;
    }

    const currentAddresses = addressesRef.current;
    if (!currentAddresses || currentAddresses.length === 0) {
      setAddressCount(0);
      return;
    }

    // Показываем маркеры только при достаточном зуме
    const zoom = map.getZoom();
    if (zoom < 12) {
      setAddressCount(0);
      return;
    }

    // Фильтрация: если есть выбранные адреса (полигон) — показываем только их
    const sel = selectedAddressIdsRef.current;
    const hasSelection = sel && sel.size > 0;
    const filtered = hasSelection
      ? currentAddresses.filter(a => a.id != null && sel.has(a.id))
      : currentAddresses;

    // Фильтрация по видимой области
    const bounds = map.getBounds();
    const visible = filtered.filter(a => {
      if (!a.coordinates?.lat || !a.coordinates?.lng) return false;
      return bounds.contains([a.coordinates.lat, a.coordinates.lng]);
    });

    // Ограничение для производительности
    const maxMarkers = 800;
    const toRender = visible.length > maxMarkers ? visible.slice(0, maxMarkers) : visible;

    const filter = activeMapFilterRef.current;
    for (const addr of toRender) {
      const marker = createTriangleMarker(addr, filter);
      marker.addTo(layerGroup);
    }

    // Применяем прозрачность сразу после создания маркеров
    requestAnimationFrame(() => applyMarkerOpacity(layerGroup));

    setAddressCount(toRender.length);
  }, [createTriangleMarker, addressVisible, applyMarkerOpacity]);

  const renderAddressMarkersRef = useRef(renderAddressMarkers);
  renderAddressMarkersRef.current = renderAddressMarkers;

  // Перерисовка при изменении фильтра или адресов
  useEffect(() => {
    renderAddressMarkers();
  }, [renderAddressMarkers, activeMapFilter, addresses, addressVisible]);

  // Обновление прозрачности маркеров при изменении выбранных/подсвеченных адресов
  useEffect(() => {
    const layerGroup = addressLayerGroupRef.current;
    if (!layerGroup) return;
    applyMarkerOpacity(layerGroup);
  }, [selectedAddressIds, highlightedAddressIds, excludedAddressIds, renderAddressMarkers, activeMapFilter, addresses, addressVisible]);

  // Поиск пересекающихся кварталов для одного полигона
  const findIntersectingForLayer = useCallback(
    (drawnLayer: L.Layer): { cadNumbers: string[]; polyCoords: [number, number][] } => {
      const drawnPolygon = drawnLayer as L.Polygon;
      const latLngs = drawnPolygon.getLatLngs()[0] as L.LatLng[];

      const drawnCoords = latLngs.map((ll) => [ll.lng, ll.lat]);
      drawnCoords.push(drawnCoords[0]);

      let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
      for (const ll of latLngs) {
        if (ll.lat < minLat) minLat = ll.lat;
        if (ll.lat > maxLat) maxLat = ll.lat;
        if (ll.lng < minLng) minLng = ll.lng;
        if (ll.lng > maxLng) maxLng = ll.lng;
      }
      const bboxPadding = 0.001;
      const polyCoords: [number, number][] = latLngs.map((ll) => [
        Math.round(ll.lat * 1e6) / 1e6,
        Math.round(ll.lng * 1e6) / 1e6,
      ]);
      const drawnTurf = turfPolygon([drawnCoords]);

      const intersecting: string[] = [];
      const currentQuarters = quartersRef.current;
      const len = currentQuarters.length;

      for (let i = 0; i < len; i++) {
        const q = currentQuarters[i];
        if (!q.geojson || !q.center_lat || !q.center_lon) continue;
        if (
          q.center_lat < minLat - bboxPadding ||
          q.center_lat > maxLat + bboxPadding ||
          q.center_lon < minLng - bboxPadding ||
          q.center_lon > maxLng + bboxPadding
        ) continue;
        try {
          const quarterTurf = q.geojson as Feature<TurfPolygon>;
          if (booleanIntersects(drawnTurf, quarterTurf)) {
            intersecting.push(q.cad_number);
          }
        } catch { /* skip invalid geometry */ }
      }

      return { cadNumbers: intersecting, polyCoords };
    },
    []
  );

  // Рендер кварталов на карту
  const renderQuartersOnMap = useCallback((cadNumbers: Set<string>) => {
    const layerGroup = quarterLayerGroupRef.current;
    if (!layerGroup) return;
    layerGroup.clearLayers();
    if (cadNumbers.size === 0) return;

    const currentQuarters = quartersRef.current;
    const stats = quarterStatsRef.current;

    currentQuarters
      .filter((q) => cadNumbers.has(q.cad_number))
      .forEach((q) => {
        if (!q.geojson || !q.center_lat || !q.center_lon) return;
        try {
          const coords = q.geojson.geometry.coordinates[0].map(
            (c: number[]) => [c[1], c[0]] as [number, number]
          );
          const qStats = stats[q.cad_number];
          const dealCount = qStats?.count || 0;
          const pricePerSqm = qStats && qStats.totalArea > 0 ? qStats.totalPrice / qStats.totalArea : null;

          const polygon = L.polygon(coords, {
            color: '#4285f4',
            weight: 1.5,
            fill: false,
          });
          const popupContent = `
            <div class="quarter-popup">
              <strong>${q.cad_number}</strong><br/>
              Сделок: ${dealCount}<br/>
              ${pricePerSqm ? `Ср. цена/м²: ${Math.round(pricePerSqm).toLocaleString('ru-RU')} ₽` : 'Нет данных по цене'}
            </div>
          `;
          polygon.bindPopup(popupContent);
          polygon.addTo(layerGroup);
        } catch { /* skip */ }
      });
  }, []);

  // Кастомная иконка маркера (SVG)
  const createMarkerIcon = useCallback(() => {
    return L.divIcon({
      html: `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="40" viewBox="0 0 28 40">
        <path d="M14 0C6.27 0 0 6.27 0 14c0 10.5 14 26 14 26s14-15.5 14-26C28 6.27 21.73 0 14 0z" fill="#ea4335"/>
        <circle cx="14" cy="14" r="6" fill="#fff"/>
      </svg>`,
      iconSize: [28, 40],
      iconAnchor: [14, 40],
      className: '',
    });
  }, []);

  // Установить или переместить маркер адреса
  const setAddressMarker = useCallback((lat: number, lng: number) => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (addressMarkerRef.current) {
      addressMarkerRef.current.setLatLng([lat, lng]);
    } else {
      const marker = L.marker([lat, lng], {
        icon: createMarkerIcon(),
        draggable: true,
      }).addTo(map);

      marker.on('dragend', () => {
        const pos = marker.getLatLng();
        findNearestAddressRef.current(pos.lat, pos.lng);
      });

      addressMarkerRef.current = marker;
    }
  }, [createMarkerIcon]);

  // Поиск ближайшего адреса: из локальной базы или через Nominatim
  const findNearestAddress = useCallback(async (lat: number, lng: number) => {
    const addrs = addressesRef.current || [];
    if (addrs.length > 0) {
      let best: AdAddress | null = null;
      let bestDist = Infinity;
      for (const a of addrs) {
        if (a.coordinates?.lat == null || a.coordinates?.lng == null) continue;
        const d = Math.sqrt((a.coordinates.lat - lat) ** 2 + (a.coordinates.lng - lng) ** 2);
        if (d < bestDist) { bestDist = d; best = a; }
      }
      if (best) {
        setAddressQuery(best.address);
        return;
      }
    }
    // Fallback: Nominatim обратное геокодирование
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=ru`,
        { headers: { 'User-Agent': 'NeocenkaExtension/1.0' } }
      );
      const data = await res.json();
      if (data.display_name) {
        setAddressQuery(data.display_name);
      }
    } catch { /* ignore */ }
  }, []);

  // Nominatim прямое геокодирование (когда нет локальных адресов)
  const geocodeAddress = useCallback(async () => {
    const query = addressQuery.trim();
    if (!query) return;
    setGeocoding(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1&accept-language=ru`,
        { headers: { 'User-Agent': 'NeocenkaExtension/1.0' } }
      );
      const data = await res.json();
      if (data && data.length > 0) {
        const { lat, lon, display_name } = data[0];
        const latNum = parseFloat(lat);
        const lonNum = parseFloat(lon);
        const map = mapInstanceRef.current;
        if (map) {
          map.flyTo([latNum, lonNum], 16, { duration: 1.5 });
        }
        setAddressMarker(latNum, lonNum);
        if (display_name) {
          setAddressQuery(display_name);
        }
      }
    } catch { /* ignore */ }
    setGeocoding(false);
  }, [addressQuery, setAddressMarker]);

  // Выбор адреса из автодополнения
  const selectSuggestion = useCallback((addr: AdAddress) => {
    setAddressQuery(addr.address);
    setShowSuggestions(false);
    setHighlightedSuggestionIdx(-1);
    if (addr.coordinates?.lat != null && addr.coordinates?.lng != null) {
      const map = mapInstanceRef.current;
      if (map) {
        map.flyTo([addr.coordinates.lat, addr.coordinates.lng], 17, { duration: 1 });
      }
      setAddressMarker(addr.coordinates.lat, addr.coordinates.lng);
    }
  }, [setAddressMarker]);

  // Обновляем рефы для доступа из замыканий карты
  setAddressMarkerRef.current = setAddressMarker;
  reverseGeocodeRef.current = findNearestAddress;
  findNearestAddressRef.current = findNearestAddress;

  // Полный пересчёт + уведомление родителя
  const recalcAndNotify = useCallback(() => {
    const drawnItems = drawnItemsRef.current;
    if (!drawnItems) return;

    const layers = drawnItems.getLayers();
    if (layers.length === 0) {
      setSelectedCount(0);
      renderQuartersOnMap(new Set());
      // Не уведомляем родителя если есть initialPolygons — значит слои ещё не восстановлены
      const hasInitial = initialPolygonsRef.current && initialPolygonsRef.current.length > 0;
      if (!hasInitial) {
        isInternalUpdateRef.current = true;
        onQuartersSelectedRef.current([], undefined);
      }
      return;
    }

    const allCadNumbers = new Set<string>();
    const allPolyCoords: [number, number][][] = [];

    for (const layer of layers) {
      const result = findIntersectingForLayer(layer);
      result.cadNumbers.forEach((cn) => allCadNumbers.add(cn));
      allPolyCoords.push(result.polyCoords);
    }

    setSelectedCount(allCadNumbers.size);
    renderQuartersOnMap(allCadNumbers);
    isInternalUpdateRef.current = true;
    onQuartersSelectedRef.current(Array.from(allCadNumbers), allPolyCoords);
  }, [findIntersectingForLayer, renderQuartersOnMap, initialPolygons]);

  const recalcAndNotifyRef = useRef(recalcAndNotify);
  recalcAndNotifyRef.current = recalcAndNotify;

  // ─── Инициализация карты ───
  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    const map = L.map(mapRef.current, { attributionControl: false }).setView([55.7558, 37.6173], 10);
    L.control.attribution({ prefix: false }).addTo(map);

    const mapConfig = getMapConfig();
    createTileLayer(mapConfig).addTo(map);

    // Слой для рисования
    const drawnItems = new L.FeatureGroup();
    map.addLayer(drawnItems);
    drawnItemsRef.current = drawnItems;

    // Слой для кадастровых кварталов
    const quarterLayerGroup = L.layerGroup();
    quarterLayerGroupRef.current = quarterLayerGroup;
    map.addLayer(quarterLayerGroup);

    // Слой для адресных маркеров
    const addressLayerGroup = L.layerGroup();
    addressLayerGroupRef.current = addressLayerGroup;
    map.addLayer(addressLayerGroup);

    // Управление слоями
    const baseLayers: Record<string, L.Layer> = {};
    const overlayLayers = {
      'Кадастровые кварталы': quarterLayerGroup,
      'Адреса': addressLayerGroup,
    };
    L.control.layers(baseLayers, overlayLayers, { collapsed: false }).addTo(map);

    // Контроллер рисования
    const drawControl = new (L.Control as any).Draw({
      draw: {
        polyline: false,
        circlemarker: false,
        marker: false,
        circle: false,
        rectangle: false,
        polygon: {
          allowIntersection: false,
          shapeOptions: {
            color: '#e74c3c',
            weight: 3,
          },
        },
      },
      edit: {
        featureGroup: drawnItems,
        remove: true,
      },
    });
    map.addControl(drawControl);

    // Обработка нарисованного полигона
    map.on((L as any).Draw.Event.CREATED, (e: any) => {
      drawnItems.addLayer(e.layer);
      recalcAndNotifyRef.current();
    });

    map.on((L as any).Draw.Event.EDITED, () => {
      recalcAndNotifyRef.current();
    });

    map.on((L as any).Draw.Event.DELETED, () => {
      recalcAndNotifyRef.current();
    });

    // Перетаскивание вершин
    const recalcForVertexRef = { current: () => {} };
    map.on((L as any).Draw.Event.EDITVERTEX, () => {
      recalcForVertexRef.current();
    });
    recalcForVertexRef.current = () => {
      const items = drawnItemsRef.current;
      if (!items) return;
      const layers = items.getLayers();
      if (layers.length === 0) {
        setSelectedCount(0);
        renderQuartersOnMap(new Set());
        return;
      }
      const allCadNumbers = new Set<string>();
      for (const layer of layers) {
        const result = findIntersectingForLayer(layer);
        result.cadNumbers.forEach((cn) => allCadNumbers.add(cn));
      }
      setSelectedCount(allCadNumbers.size);
      renderQuartersOnMap(allCadNumbers);
    };

    // Клик по карте — установка маркера адреса + обратное геокодирование
    map.on('click', (e: L.LeafletMouseEvent) => {
      if (!addressEnabledRef.current) return;
      const { lat, lng } = e.latlng;
      setAddressMarkerRef.current(lat, lng);
      reverseGeocodeRef.current(lat, lng);
    });

    // При перемещении карты — обновить адресные маркеры
    map.on('moveend', () => {
      renderAddressMarkersRef.current();
    });

    mapInstanceRef.current = map;

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
      addressMarkerRef.current = null;
    };
  }, []);

  // Восстановление полигонов из initialPolygons
  const prevPolygonsJsonRef = useRef('');
  const initialPolygonsRef = useRef(initialPolygons);
  initialPolygonsRef.current = initialPolygons;
  useEffect(() => {
    const map = mapInstanceRef.current;
    const drawnItems = drawnItemsRef.current;
    if (!map || !drawnItems || !quartersLoaded) return;

    const currentJson = JSON.stringify(initialPolygons);
    const polygonsChanged = prevPolygonsJsonRef.current !== currentJson;
    prevPolygonsJsonRef.current = currentJson;

    // Если полигон не изменился — пропускаем
    if (!polygonsChanged) {
      isInternalUpdateRef.current = false;
      return;
    }
    // Если полигон изменился — всегда перерисовываем,
    // даже если isInternalUpdateRef = true (остаточный от предыдущего recalcAndNotify)
    isInternalUpdateRef.current = false;

    drawnItems.clearLayers();

    if (!initialPolygons || initialPolygons.length === 0) {
      setSelectedCount(0);
      renderQuartersOnMap(new Set());
      onQuartersSelectedRef.current([], undefined);
      return;
    }

    let allBounds: L.LatLngBounds | null = null;

    for (const polyCoords of initialPolygons) {
      if (polyCoords.length < 3) continue;
      const latLngs = polyCoords.map((c) => L.latLng(c[0], c[1]));
      const polygon = L.polygon(latLngs, {
        color: '#e74c3c',
        weight: 3,
      });
      drawnItems.addLayer(polygon);
      if (!allBounds) {
        allBounds = polygon.getBounds();
      } else {
        allBounds.extend(polygon.getBounds());
      }
    }

    if (allBounds) {
      map.fitBounds(allBounds, { padding: [20, 20] });
    }

    recalcAndNotify();
  }, [initialPolygons, recalcAndNotify, quartersLoaded, renderQuartersOnMap]);

  // ResizeObserver
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver(() => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.invalidateSize();
      }
    });
    observer.observe(container);

    return () => observer.disconnect();
  }, []);

  // flyTo
  useEffect(() => {
    if (!flyTo || !mapInstanceRef.current) return;
    mapInstanceRef.current.flyTo([flyTo.lat, flyTo.lon], flyTo.zoom, { duration: 1.5 });
  }, [flyTo]);

  const clearDrawing = () => {
    if (drawnItemsRef.current) {
      drawnItemsRef.current.clearLayers();
    }
    setSelectedCount(0);
    renderQuartersOnMap(new Set());
    onQuartersSelected([], undefined);
  };

  const clearAddress = () => {
    setAddressQuery('');
    setShowSuggestions(false);
    setHighlightedSuggestionIdx(-1);
    if (addressMarkerRef.current && mapInstanceRef.current) {
      mapInstanceRef.current.removeLayer(addressMarkerRef.current);
      addressMarkerRef.current = null;
    }
  };

  const handleFilterClick = (filter: MapFilterType) => {
    setActiveMapFilter(prev => prev === filter ? prev : filter);
  };

  const hasAddresses = addresses && addresses.length > 0;

  return (
    <div className="search-by-polygon" ref={containerRef}>
      <div className="polygon-toolbar">
        <span className="polygon-hint">
          Нарисуйте полигон(ы) на карте для поиска пересекающихся кварталов
        </span>
        {selectedCount > 0 && (
          <span className="polygon-selected">
            Выбрано кварталов: <strong>{selectedCount}</strong>
          </span>
        )}
        <button className="btn btn-secondary btn-small" onClick={clearDrawing}>
          Сбросить
        </button>
      </div>

      {/* Панель фильтров маркеров */}
      {hasAddresses && (
        <div className="marker-filter-toolbar">
          <label className="address-toggle" title="Показать/скрыть маркеры адресов">
            <input
              type="checkbox"
              checked={addressVisible}
              onChange={(e) => setAddressVisible(e.target.checked)}
            />
            <span className="address-toggle-label">Адреса</span>
          </label>
          <div className="marker-filter-buttons">
            {([
              { key: 'year' as MapFilterType, label: 'Год' },
              { key: 'series' as MapFilterType, label: 'Серия' },
              { key: 'floors' as MapFilterType, label: 'Этажность' },
              { key: 'objects' as MapFilterType, label: 'Объектов' },
              { key: 'listings' as MapFilterType, label: 'Объявлений' },
            ]).map(f => (
              <button
                key={f.key}
                className={`marker-filter-btn${activeMapFilter === f.key ? ' active' : ''}`}
                onClick={() => handleFilterClick(f.key)}
              >
                {f.label}
              </button>
            ))}
          </div>
          <span className="marker-filter-count">
            {addressCount > 0 ? `${addressCount} на карте` : `${addresses.length} всего`}
          </span>
        </div>
      )}

      <div className="address-toolbar">
        <label className="address-toggle" title="Включить поиск по адресу">
          <input
            type="checkbox"
            checked={addressEnabled}
            onChange={(e) => setAddressEnabled(e.target.checked)}
          />
          <span className="address-toggle-label">Адрес</span>
        </label>
        <div className="address-search address-search-autocomplete">
          <input
            type="text"
            className="address-input"
            placeholder={addressEnabled ? 'Введите адрес или кликните на карту...' : ''}
            value={addressQuery}
            onChange={(e) => setAddressQuery(e.target.value)}
            onFocus={() => { if (addressSuggestions.length > 0) setShowSuggestions(true); }}
            onBlur={() => { setTimeout(() => setShowSuggestions(false), 200); }}
            onKeyDown={(e) => {
              if (!addressEnabled) return;
              if (e.key === 'Escape') { setShowSuggestions(false); return; }
              if (showSuggestions && addressSuggestions.length > 0) {
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  setHighlightedSuggestionIdx(prev => Math.min(prev + 1, addressSuggestions.length - 1));
                  return;
                }
                if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setHighlightedSuggestionIdx(prev => Math.max(prev - 1, 0));
                  return;
                }
                if (e.key === 'Enter' && highlightedSuggestionIdx >= 0) {
                  e.preventDefault();
                  selectSuggestion(addressSuggestions[highlightedSuggestionIdx]);
                  return;
                }
              }
              // Nominatim геокодирование по Enter (когда нет локальных адресов)
              if (e.key === 'Enter' && !hasLocalAddresses) {
                e.preventDefault();
                geocodeAddress();
              }
            }}
            disabled={!addressEnabled || geocoding}
          />
          {!hasLocalAddresses && (
            <button
              className={`address-search-btn${!(addressQuery && addressEnabled) ? ' rounded-right' : ''}`}
              onClick={geocodeAddress}
              disabled={!addressEnabled || geocoding || !addressQuery.trim()}
              title="Найти адрес"
            >
              {geocoding ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#666" strokeWidth="2.5" strokeLinecap="round">
                  <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83">
                    <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="0.7s" repeatCount="indefinite"/>
                  </path>
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#666" strokeWidth="2" strokeLinecap="round">
                  <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
              )}
            </button>
          )}
          {addressQuery && addressEnabled && (
            <button className="address-clear-btn" onClick={clearAddress} title="Очистить">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#666" strokeWidth="2" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          )}
          {showSuggestions && addressSuggestions.length > 0 && (
            <div ref={suggestionsRef} className="address-suggestions">
              {addressSuggestions.map((addr, i) => (
                <div
                  key={addr.id ?? i}
                  className={`address-suggestion-item${i === highlightedSuggestionIdx ? ' highlighted' : ''}`}
                  onMouseDown={() => selectSuggestion(addr)}
                  onMouseEnter={() => setHighlightedSuggestionIdx(i)}
                >
                  <span className="address-suggestion-text">{addr.address}</span>
                  {addr.floors_count != null && <span className="address-suggestion-meta">{addr.floors_count} эт.</span>}
                  {addr.build_year != null && <span className="address-suggestion-meta">{addr.build_year} г.</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <div ref={mapRef} className="polygon-map"></div>

      {/* Панель адресов: либо список, либо кнопка «Выбрать все» */}
      {(!selectedAddressIds || selectedAddressIds.size === 0) && polygonsCoords && polygonsCoords.length > 0 && onSelectAllInPolygon && (
        <div className="selected-addresses-panel">
          <div className="selected-addresses-header" style={{ justifyContent: 'center' }}>
            <button onClick={onSelectAllInPolygon} style={{
              padding: '5px 14px', fontSize: '12px', fontWeight: 500, border: 'none',
              background: '#2563eb', color: '#fff', borderRadius: '6px', cursor: 'pointer',
            }}>
              Выбрать все адреса в полигоне
            </button>
          </div>
        </div>
      )}
      {selectedAddressIds && selectedAddressIds.size > 0 && (
        <div className="selected-addresses-panel">
          <div className="selected-addresses-header">
            <button className="selected-addresses-toggle" onClick={() => {
              const el = document.getElementById('selected-addresses-list');
              if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
            }}>
              <span className="selected-addresses-title">
                {(() => {
                  const excluded = excludedAddressIds ? excludedAddressIds.size : 0;
                  const active = selectedAddressIds.size - excluded;
                  const hl = highlightedAddressIds ? highlightedAddressIds.size : active;
                  if (hl !== active) return `Подходит: ${hl} из ${selectedAddressIds.size} (активных: ${active})`;
                  if (excluded > 0) return `Активных: ${active} из ${selectedAddressIds.size} адресов`;
                  return `Выбрано адресов: ${selectedAddressIds.size}`;
                })()}
              </span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#666" strokeWidth="2" strokeLinecap="round">
                <path d="M6 9l6 6 6-6"/>
              </svg>
            </button>
            <div style={{ display: 'flex', gap: '4px' }}>
              <button className="selected-addresses-clear" onClick={() => {
                if (onSelectAllInPolygon) onSelectAllInPolygon();
              }}>
                Включить все
              </button>
              <button className="selected-addresses-clear" onClick={() => {
                if (onAddressToggle) {
                  const current = addressesRef.current || [];
                  for (const addr of current) {
                    if (addr.id != null && selectedAddressIds.has(addr.id) && !(excludedAddressIds?.has(addr.id))) {
                      onAddressToggle(addr);
                    }
                  }
                }
              }}>
                Отключить все
              </button>
            </div>
          </div>
          <div id="selected-addresses-list" className="selected-addresses-list">
            <table className="selected-addresses-table">
              <thead>
                <tr>
                  <th>Адрес</th>
                  <th>Серия</th>
                  <th>Этаж.</th>
                  <th>Год</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const all = (addressesRef.current || [])
                    .filter(a => a.id != null && selectedAddressIds.has(a.id));
                  const hasHL = highlightedAddressIds && highlightedAddressIds.size > 0;
                  const hasExcl = excludedAddressIds && excludedAddressIds.size > 0;
                  // Сортировка: highlighted → active → excluded
                  const sorted = [...all].sort((a, b) => {
                    const aExcl = hasExcl && excludedAddressIds!.has(a.id!) ? 2 : 0;
                    const bExcl = hasExcl && excludedAddressIds!.has(b.id!) ? 2 : 0;
                    const aH = hasHL && highlightedAddressIds!.has(a.id!) ? 0 : 1;
                    const bH = hasHL && highlightedAddressIds!.has(b.id!) ? 0 : 1;
                    return (aExcl + aH) - (bExcl + bH);
                  });
                  return sorted.map(a => {
                    const seriesName = a.house_series_id
                      ? (houseSeriesMapRef.current.get(a.house_series_id)?.name || a.house_series_id)
                      : '—';
                    const isExcluded = hasExcl && excludedAddressIds!.has(a.id!);
                    const isHighlighted = hasHL && highlightedAddressIds!.has(a.id!);
                    const dimmed = isExcluded || (hasHL && !isHighlighted);
                    const opacity = dimmed ? 0.5 : 1;
                    return (
                      <tr key={a.id} style={{ opacity }}>
                        <td className="addr-cell" title={a.address}>{a.address}</td>
                        <td className="meta-cell">{seriesName}</td>
                        <td className="meta-cell">{a.floors_count || '—'}</td>
                        <td className="meta-cell">{a.build_year || '—'}</td>
                        <td className="action-cell">
                          <button className="addr-remove-btn" onClick={() => {
                            if (onAddressToggle) onAddressToggle(a);
                          }} title={isExcluded ? 'Добавить в фильтр' : 'Убрать из фильтра'}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={isExcluded ? '#16a34a' : '#dc2626'} strokeWidth="2" strokeLinecap="round">
                              {isExcluded
                                ? <><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></>
                                : <><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></>}
                            </svg>
                          </button>
                        </td>
                      </tr>
                    );
                  });
                })()}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default SearchByPolygon;
