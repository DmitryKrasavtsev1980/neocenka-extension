import React, { useEffect, useRef, useState, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet-draw';
import 'leaflet-draw/dist/leaflet.draw.css';
import { booleanIntersects, polygon as turfPolygon } from '@turf/turf';
import type { Feature, Polygon as TurfPolygon } from 'geojson';
import { CadastralQuarter, Deal } from '../../types';
import { getMapConfig, createTileLayer } from '../../services/map-config';
import './SearchByPolygon.css';

interface FlyToTarget {
  lat: number;
  lon: number;
  zoom: number;
}

interface SearchByPolygonProps {
  quarters: CadastralQuarter[];
  deals: Deal[];
  onQuartersSelected: (cadNumbers: string[], polygonsCoords?: [number, number][][]) => void;
  initialPolygons?: [number, number][][] | null;
  flyTo?: FlyToTarget | null;
}

const SearchByPolygon: React.FC<SearchByPolygonProps> = ({
  quarters,
  deals,
  onQuartersSelected,
  initialPolygons,
  flyTo,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const drawnItemsRef = useRef<L.FeatureGroup | null>(null);
  const quarterLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const quartersRef = useRef(quarters);
  const dealsRef = useRef(deals);
  const [selectedCount, setSelectedCount] = useState(0);
  const [intersectingCadNumbers, setIntersectingCadNumbers] = useState<Set<string>>(new Set());
  const [quartersLoaded, setQuartersLoaded] = useState(false);

  // Держим quarters/deals в актуальных ref + отслеживаем загрузку
  useEffect(() => {
    quartersRef.current = quarters;
    dealsRef.current = deals;
    if (quarters.length > 0 && !quartersLoaded) {
      setQuartersLoaded(true);
    }
  }, [quarters, deals]);

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
      const polyCoords: [number, number][] = latLngs.map((ll) => [ll.lat, ll.lng]);
      const drawnTurf = turfPolygon([drawnCoords]);

      const intersecting: string[] = [];
      const quarters = quartersRef.current;
      const len = quarters.length;

      for (let i = 0; i < len; i++) {
        const q = quarters[i];
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

  // Пересчёт всех нарисованных полигонов и отправка результата наверх
  const recalcAllPolygons = useCallback(() => {
    const drawnItems = drawnItemsRef.current;
    if (!drawnItems) return;

    const layers = drawnItems.getLayers();
    if (layers.length === 0) {
      setSelectedCount(0);
      setIntersectingCadNumbers(new Set());
      onQuartersSelected([], undefined);
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
    setIntersectingCadNumbers(allCadNumbers);
    onQuartersSelected(Array.from(allCadNumbers), allPolyCoords);
  }, [findIntersectingForLayer, onQuartersSelected]);

  // Ref для доступа к recalcAllPolygons из замыканий инициализации карты
  const recalcAllPolygonsRef = useRef(recalcAllPolygons);
  recalcAllPolygonsRef.current = recalcAllPolygons;

  // Инициализация карты
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

    // Слой для кадастровых кварталов (по умолчанию включен)
    const quarterLayerGroup = L.layerGroup();
    quarterLayerGroupRef.current = quarterLayerGroup;
    map.addLayer(quarterLayerGroup);

    // Управление слоями
    const baseLayers: Record<string, L.Layer> = {};
    const overlayLayers = { 'Кадастровые кварталы': quarterLayerGroup };
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

    // Обработка нарисованного полигона (добавляем к существующим)
    map.on((L as any).Draw.Event.CREATED, (e: any) => {
      drawnItems.addLayer(e.layer);
      recalcAllPolygonsRef.current();
    });

    // Обработка редактирования полигона
    map.on((L as any).Draw.Event.EDITED, () => {
      recalcAllPolygonsRef.current();
    });

    // Обработка удаления полигона
    map.on((L as any).Draw.Event.DELETED, () => {
      recalcAllPolygonsRef.current();
    });

    mapInstanceRef.current = map;

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Восстановление полигонов из initialPolygons + пересчёт при загрузке кварталов
  const polygonAppliedRef = useRef(false);
  useEffect(() => {
    const map = mapInstanceRef.current;
    const drawnItems = drawnItemsRef.current;
    if (!map || !drawnItems || !quartersLoaded) return;

    if (polygonAppliedRef.current) {
      // Полигоны уже восстановлены — только пересчитываем кварталы
      recalcAllPolygons();
      return;
    }

    if (!initialPolygons || initialPolygons.length === 0) return;

    drawnItems.clearLayers();
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
    polygonAppliedRef.current = true;

    recalcAllPolygons();
  }, [initialPolygons, recalcAllPolygons, quartersLoaded]);

  // ResizeObserver для invalidateSize
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

  // Обработка flyTo — перелёт карты на указанные координаты
  useEffect(() => {
    if (!flyTo || !mapInstanceRef.current) return;
    mapInstanceRef.current.flyTo([flyTo.lat, flyTo.lon], flyTo.zoom, { duration: 1.5 });
  }, [flyTo]);

  // Отрисовка кварталов — только при изменении выбранных кварталов
  useEffect(() => {
    const layerGroup = quarterLayerGroupRef.current;
    if (!layerGroup || quarters.length === 0) return;

    // Очищаем слой кварталов
    layerGroup.clearLayers();

    if (intersectingCadNumbers.size === 0) return;

    // Предвычисляем статистику по кварталам за один проход O(deals)
    const currentDeals = dealsRef.current;
    const quarterStats: Record<string, { count: number; totalPrice: number; totalArea: number }> = {};
    for (let i = 0; i < currentDeals.length; i++) {
      const d = currentDeals[i];
      const key = d.quarter_cad_number;
      if (!quarterStats[key]) {
        quarterStats[key] = { count: 0, totalPrice: 0, totalArea: 0 };
      }
      quarterStats[key].count++;
      quarterStats[key].totalPrice += d.deal_price;
      quarterStats[key].totalArea += d.area;
    }

    quarters
      .filter((q) => intersectingCadNumbers.has(q.cad_number))
      .forEach((q) => {
        if (!q.geojson || !q.center_lat || !q.center_lon) return;

        try {
          const coords = q.geojson.geometry.coordinates[0].map(
            (c: number[]) => [c[1], c[0]] as [number, number]
          );

          const stats = quarterStats[q.cad_number];
          const dealCount = stats?.count || 0;
          const pricePerSqm = stats && stats.totalArea > 0 ? stats.totalPrice / stats.totalArea : null;

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
        } catch (_err) {
          // Skip failed quarter render
        }
      });
  }, [quarters, intersectingCadNumbers]);

  const clearDrawing = () => {
    if (drawnItemsRef.current) {
      drawnItemsRef.current.clearLayers();
    }
    setSelectedCount(0);
    setIntersectingCadNumbers(new Set());
    onQuartersSelected([], undefined);
  };

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
      <div ref={mapRef} className="polygon-map"></div>
    </div>
  );
};

export default SearchByPolygon;
