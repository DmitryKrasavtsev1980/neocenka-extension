import React, { useEffect, useRef, useState, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet-draw';
import 'leaflet-draw/dist/leaflet.draw.css';
import { booleanIntersects, polygon as turfPolygon } from '@turf/turf';
import type { Feature, Polygon as TurfPolygon } from 'geojson';
import { CadastralQuarter, Deal } from '../../types';
import './SearchByPolygon.css';

interface SearchByPolygonProps {
  quarters: CadastralQuarter[];
  deals: Deal[];
  onQuartersSelected: (cadNumbers: string[], polygonCoords?: [number, number][]) => void;
  initialPolygon?: [number, number][] | null;
}

const SearchByPolygon: React.FC<SearchByPolygonProps> = ({
  quarters,
  deals,
  onQuartersSelected,
  initialPolygon,
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

  // Поиск пересекающихся кварталов с bounding box предфильтрацией
  const findIntersectingQuarters = useCallback(
    (drawnLayer: L.Layer) => {
      const drawnPolygon = drawnLayer as L.Polygon;
      const latLngs = drawnPolygon.getLatLngs()[0] as L.LatLng[];

      const drawnCoords = latLngs.map((ll) => [ll.lng, ll.lat]);
      drawnCoords.push(drawnCoords[0]);

      // Вычисляем bounding box нарисованного полигона
      let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
      for (const ll of latLngs) {
        if (ll.lat < minLat) minLat = ll.lat;
        if (ll.lat > maxLat) maxLat = ll.lat;
        if (ll.lng < minLng) minLng = ll.lng;
        if (ll.lng > maxLng) maxLng = ll.lng;
      }
      // Расширяем bbox на небольшую дельту для захвата граничных кварталов
      const bboxPadding = 0.001;

      const polyCoords: [number, number][] = latLngs.map((ll) => [ll.lat, ll.lng]);

      // Создаём Turf-полигон один раз, вне цикла
      const drawnTurf = turfPolygon([drawnCoords]);

      const intersecting: string[] = [];
      const quarters = quartersRef.current;
      const len = quarters.length;

      for (let i = 0; i < len; i++) {
        const q = quarters[i];
        if (!q.geojson || !q.center_lat || !q.center_lon) continue;

        // Шаг 1: Быстрая проверка по центру квартала (center_lat/center_lon)
        if (
          q.center_lat < minLat - bboxPadding ||
          q.center_lat > maxLat + bboxPadding ||
          q.center_lon < minLng - bboxPadding ||
          q.center_lon > maxLng + bboxPadding
        ) {
          continue;
        }

        // Шаг 2: Точная проверка через Turf.js (только для прошедших bbox)
        try {
          const quarterTurf = q.geojson as Feature<TurfPolygon>;
          if (booleanIntersects(drawnTurf, quarterTurf)) {
            intersecting.push(q.cad_number);
          }
        } catch {
          // Пропускаем невалидную геометрию
        }
      }

      setSelectedCount(intersecting.length);
      setIntersectingCadNumbers(new Set(intersecting));
      onQuartersSelected(intersecting, polyCoords);
    },
    [onQuartersSelected]
  );

  // Инициализация карты
  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    const map = L.map(mapRef.current, { preferCanvas: true }).setView([55.7558, 37.6173], 10);

    const tileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
    }).addTo(map);

    // Слой для рисования
    const drawnItems = new L.FeatureGroup();
    map.addLayer(drawnItems);
    drawnItemsRef.current = drawnItems;

    // Слой для кадастровых кварталов (по умолчанию выключен)
    const quarterLayerGroup = L.layerGroup();
    quarterLayerGroupRef.current = quarterLayerGroup;

    // Управление слоями
    const baseLayers = { 'OpenStreetMap': tileLayer };
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

    // Обработка нарисованного полигона
    map.on((L as any).Draw.Event.CREATED, (e: any) => {
      drawnItems.clearLayers();
      drawnItems.addLayer(e.layer);
      findIntersectingQuarters(e.layer);
    });

    // Обработка редактирования полигона
    map.on((L as any).Draw.Event.EDITED, (e: any) => {
      e.layers.eachLayer((layer: any) => {
        findIntersectingQuarters(layer);
      });
    });

    // Обработка удаления полигона
    map.on((L as any).Draw.Event.DELETED, () => {
      setSelectedCount(0);
      setIntersectingCadNumbers(new Set());
      onQuartersSelected([], undefined);
    });

    mapInstanceRef.current = map;

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Восстановление полигона из initialPolygon + пересчёт при загрузке кварталов
  useEffect(() => {
    const map = mapInstanceRef.current;
    const drawnItems = drawnItemsRef.current;
    if (!map || !drawnItems || !initialPolygon || initialPolygon.length < 3) return;
    if (!quartersLoaded) return;

    const layers = drawnItems.getLayers();
    let targetPolygon: L.Polygon;

    if (layers.length > 0) {
      targetPolygon = layers[0] as L.Polygon;
    } else {
      const latLngs = initialPolygon.map((c) => L.latLng(c[0], c[1]));
      targetPolygon = L.polygon(latLngs, {
        color: '#e74c3c',
        weight: 3,
      });
      drawnItems.clearLayers();
      drawnItems.addLayer(targetPolygon);
      map.fitBounds(targetPolygon.getBounds(), { padding: [20, 20] });
    }

    findIntersectingQuarters(targetPolygon);
  }, [initialPolygon, findIntersectingQuarters, quartersLoaded]);

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
        } catch (err) {
          console.warn('Error rendering quarter:', q.cad_number, err);
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
          Нарисуйте полигон на карте для поиска пересекающихся кварталов
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
