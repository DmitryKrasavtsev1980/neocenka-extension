import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { CadastralQuarter, Deal } from '../../types';
import './HeatMap.css';

interface HeatMapProps {
  quarters: CadastralQuarter[];
  deals: Deal[];
}

// Цветовая шкала: зелёный -> жёлтый -> красный
function priceToColor(min: number, max: number, value: number): string {
  if (max === min) return '#ffcc00';
  const ratio = (value - min) / (max - min);
  if (ratio < 0.5) {
    // Зелёный -> Жёлтый
    const t = ratio * 2;
    const r = Math.round(255 * t);
    return `rgb(${r}, 204, 0)`;
  } else {
    // Жёлтый -> Красный
    const t = (ratio - 0.5) * 2;
    const g = Math.round(204 * (1 - t));
    return `rgb(255, ${g}, 0)`;
  }
}

const HeatMap: React.FC<HeatMapProps> = ({ quarters, deals }) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    const map = L.map(mapRef.current, { preferCanvas: true }).setView([55.7558, 37.6173], 10);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
    }).addTo(map);

    mapInstanceRef.current = map;

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || quarters.length === 0) return;

    // Удаляем все слои кроме тайлов
    map.eachLayer((layer) => {
      if (!(layer instanceof L.TileLayer)) {
        map.removeLayer(layer);
      }
    });

    // Считаем среднюю цену за м² по кварталам
    const priceMap: Record<string, number> = {};
    deals.forEach((d) => {
      if (d.area <= 0 || !d.quarter_cad_number) return;
      const pricePerSqm = d.deal_price / d.area;
      if (!priceMap[d.quarter_cad_number]) {
        priceMap[d.quarter_cad_number] = 0;
      }
      priceMap[d.quarter_cad_number] += pricePerSqm;
    });

    // Считаем количество сделок для среднего
    const countMap: Record<string, number> = {};
    deals.forEach((d) => {
      if (d.area <= 0 || !d.quarter_cad_number) return;
      countMap[d.quarter_cad_number] = (countMap[d.quarter_cad_number] || 0) + 1;
    });

    // Вычисляем среднее
    const avgPrices: Record<string, number> = {};
    Object.keys(priceMap).forEach((key) => {
      avgPrices[key] = priceMap[key] / countMap[key];
    });

    const priceValues = Object.values(avgPrices);
    if (priceValues.length === 0) return;

    const minPrice = Math.min(...priceValues);
    const maxPrice = Math.max(...priceValues);

    const bounds = L.latLngBounds([]);

    quarters.forEach((q) => {
      if (!q.geojson || !q.center_lat || !q.center_lon) return;

      const avgPrice = avgPrices[q.cad_number];
      if (!avgPrice) return;

      try {
        const coords = q.geojson.geometry.coordinates[0].map(
          (c: number[]) => [c[1], c[0]] as [number, number]
        );

        const color = priceToColor(minPrice, maxPrice, avgPrice);

        L.polygon(coords, {
          color: '#333',
          weight: 1,
          fillColor: color,
          fillOpacity: 0.65,
        })
          .addTo(map)
          .bindPopup(`
            <div class="heatmap-popup">
              <strong>${q.cad_number}</strong><br/>
              Ср. цена/м²: <strong>${Math.round(avgPrice).toLocaleString('ru-RU')} ₽</strong><br/>
              Сделок: ${countMap[q.cad_number] || 0}
            </div>
          `);

        bounds.extend([q.center_lat!, q.center_lon!]);
      } catch (err) {
        console.warn('Error rendering heatmap quarter:', q.cad_number, err);
      }
    });

    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [20, 20] });
    }
  }, [quarters, deals]);

  return (
    <div className="heat-map">
      <div className="heatmap-legend">
        <span className="legend-label">Цена/м²:</span>
        <div className="legend-gradient"></div>
        <span className="legend-min">Низкая</span>
        <span className="legend-max">Высокая</span>
      </div>
      <div ref={mapRef} className="heatmap-map"></div>
    </div>
  );
};

export default HeatMap;
