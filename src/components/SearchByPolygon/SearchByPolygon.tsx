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
  onQuartersSelected: (cadNumbers: string[]) => void;
}

const SearchByPolygon: React.FC<SearchByPolygonProps> = ({
  quarters,
  deals,
  onQuartersSelected,
}) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const drawnItemsRef = useRef<L.FeatureGroup>(null);
  const quarterLayersRef = useRef<L.Layer[]>([]);
  const [selectedCount, setSelectedCount] = useState(0);
  const [loading, setLoading] = useState(false);

  // Предположение: средняя цена за м² в сделках одного квартала
  const getQuarterPricePerSqm = useCallback(
    (cadNumber: string): number | null => {
      const quarterDeals = deals.filter((d) => d.quarter_cad_number === cadNumber);
      if (quarterDeals.length === 0) return null;
      const total = quarterDeals.reduce((sum, d) => sum + d.deal_price, 0);
      const totalArea = quarterDeals.reduce((sum, d) => sum + d.area, 0);
      return totalArea > 0 ? total / totalArea : null;
    },
    [deals]
  );

  // Инициализация карты
  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    const map = L.map(mapRef.current, { preferCanvas: true }).setView([55.7558, 37.6173], 10);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
    }).addTo(map);

    // Слой для рисования
    const drawnItems = new L.FeatureGroup();
    map.addLayer(drawnItems);
    drawnItemsRef.current = drawnItems;

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

    mapInstanceRef.current = map;

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Отрисовка кварталов на карте
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || quarters.length === 0) return;

    // Удаляем старые слои
    quarterLayersRef.current.forEach((layer) => map.removeLayer(layer));
    quarterLayersRef.current = [];

    // Группируем сделки по кварталам для подсчета
    const dealsByQuarter: Record<string, number> = {};
    deals.forEach((d) => {
      dealsByQuarter[d.quarter_cad_number] = (dealsByQuarter[d.quarter_cad_number] || 0) + 1;
    });

    const bounds = L.latLngBounds([]);

    quarters.forEach((q) => {
      if (!q.geojson || !q.center_lat || !q.center_lon) return;

      try {
        const coords = q.geojson.geometry.coordinates[0].map(
          (c: number[]) => [c[1], c[0]] as [number, number] // GeoJSON [lon,lat] -> Leaflet [lat,lon]
        );

        const dealCount = dealsByQuarter[q.cad_number] || 0;
        const pricePerSqm = getQuarterPricePerSqm(q.cad_number);

        // Цвет зависит от наличия сделок
        let fillColor = '#aaaaaa';
        let fillOpacity = 0.2;
        if (dealCount > 0) {
          fillColor = '#1a73e8';
          fillOpacity = 0.35;
        }

        const polygon = L.polygon(coords, {
          color: '#4285f4',
          weight: 1.5,
          fillColor,
          fillOpacity,
        }).addTo(map);

        const popupContent = `
          <div class="quarter-popup">
            <strong>${q.cad_number}</strong><br/>
            Сделок: ${dealCount}<br/>
            ${pricePerSqm ? `Ср. цена/м²: ${Math.round(pricePerSqm).toLocaleString('ru-RU')} ₽` : 'Нет данных по цене'}
          </div>
        `;
        polygon.bindPopup(popupContent);

        quarterLayersRef.current.push(polygon);

        if (q.center_lat && q.center_lon) {
          bounds.extend([q.center_lat, q.center_lon]);
        }
      } catch (err) {
        console.warn('Error rendering quarter:', q.cad_number, err);
      }
    });

    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [20, 20] });
    }
  }, [quarters, deals, getQuarterPricePerSqm]);

  // Поиск пересекающихся кварталов
  const findIntersectingQuarters = (drawnLayer: L.Layer) => {
    const drawnPolygon = drawnLayer as L.Polygon;
    const latLngs = drawnPolygon.getLatLngs()[0] as L.LatLng[];

    // Конвертируем в GeoJSON Polygon [lon, lat]
    const drawnCoords = latLngs.map((ll) => [ll.lng, ll.lat]);
    drawnCoords.push(drawnCoords[0]); // замыкаем кольцо

    const drawnTurf = turfPolygon([drawnCoords]);

    const intersecting: string[] = [];

    quarters.forEach((q) => {
      if (!q.geojson) return;
      try {
        const quarterTurf = q.geojson as Feature<TurfPolygon>;
        if (booleanIntersects(drawnTurf, quarterTurf)) {
          intersecting.push(q.cad_number);
        }
      } catch {
        // Пропускаем невалидную геометрию
      }
    });

    setSelectedCount(intersecting.length);
    onQuartersSelected(intersecting);
  };

  const clearDrawing = () => {
    if (drawnItemsRef.current) {
      drawnItemsRef.current.clearLayers();
    }
    setSelectedCount(0);
    onQuartersSelected([]);
  };

  return (
    <div className="search-by-polygon">
      <div className="polygon-toolbar">
        <span className="polygon-hint">
          Нарисуйте полигон на карте для поиска пересекающихся кварталов
        </span>
        {selectedCount > 0 && (
          <span className="polygon-selected">
            Выбрано кварталов: <strong>{selectedCount}</strong>
          </span>
        )}
        <button className="btn btn-secondary" onClick={clearDrawing}>
          Сбросить выделение
        </button>
      </div>
      <div ref={mapRef} className="polygon-map"></div>
    </div>
  );
};

export default SearchByPolygon;
