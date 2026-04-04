import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './DealMap.css';
import { Deal } from '../../types/deal';

interface DealMapProps {
  deals: Deal[];
  selectedDeal?: Deal | null;
  onClose?: () => void;
}

// Преобразование координат из EPSG:3857 (Web Mercator) в EPSG:4326 (WGS84)
function epsg3857ToEpsg4326(x: number, y: number): [number, number] {
  const lon = (x / 20037508.34) * 180;
  const lat = (180 / Math.PI) * (2 * Math.atan(Math.exp((y / 20037508.34) * Math.PI)) - Math.PI / 2);
  return [lat, lon];
}

// Преобразование координат полигона
function transformPolygonCoordinates(coords: number[][][]): L.LatLng[][] {
  return coords.map(ring =>
    ring.map(point => {
      const [lat, lon] = epsg3857ToEpsg4326(point[0], point[1]);
      return L.latLng(lat, lon);
    })
  );
}

// Интерфейс для ответа API map.ru
interface MapRuFeature {
  id: number;
  geometry: {
    type: string;
    crs: {
      type: string;
      properties: { name: string };
    };
    coordinates: number[][][];
  };
  properties: {
    label: string;
    options: {
      cad_num: string;
      cnt_land: number;
      cnt_oks: number;
      sum_land_area: number;
    };
  };
}

interface MapRuResponse {
  success: boolean;
  features: MapRuFeature[];
}

const DealMap: React.FC<DealMapProps> = ({ deals, selectedDeal, onClose }) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const polygonsRef = useRef<L.Polygon[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentQuarter, setCurrentQuarter] = useState<string | null>(null);

  // Инициализация карты
  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    const map = L.map(mapRef.current).setView([55.7558, 37.6173], 10); // Москва по умолчанию

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors'
    }).addTo(map);

    mapInstanceRef.current = map;

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Загрузка геометрии кадастрового квартала
  const loadQuarterGeometry = async (cadNumber: string): Promise<MapRuFeature | null> => {
    try {
      const response = await fetch(`https://map.ru/api/kad/search?query=${cadNumber}`);
      const data: MapRuResponse = await response.json();

      if (data.success && data.features && data.features.length > 0) {
        return data.features[0];
      }
      return null;
    } catch (err) {
      console.error('Error loading quarter geometry:', err);
      return null;
    }
  };

  // Отображение выбранной сделки на карте
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    // Очищаем предыдущие полигоны
    polygonsRef.current.forEach(polygon => polygon.remove());
    polygonsRef.current = [];
    setError(null);
    setCurrentQuarter(null);

    if (!selectedDeal?.quarter_cad_number) {
      return;
    }

    const loadAndDisplay = async () => {
      setLoading(true);
      try {
        const feature = await loadQuarterGeometry(selectedDeal.quarter_cad_number!);

        if (!feature) {
          setError('Не удалось загрузить геометрию квартала');
          setLoading(false);
          return;
        }

        setCurrentQuarter(feature.properties.label);

        // Преобразуем координаты и создаём полигон
        const latLngs = transformPolygonCoordinates(feature.geometry.coordinates);

        const polygon = L.polygon(latLngs, {
          color: '#1a73e8',
          weight: 3,
          fillColor: '#1a73e8',
          fillOpacity: 0.2
        }).addTo(map);

        // Добавляем информацию о сделке в popup
        const popupContent = `
          <div class="deal-popup">
            <h4>Кадастровый квартал</h4>
            <p><strong>${feature.properties.label}</strong></p>
            <hr>
            <p><strong>Адрес:</strong> ${selectedDeal.city || '-'}, ${selectedDeal.street || '-'}</p>
            <p><strong>Тип:</strong> ${selectedDeal.realestate_type_code || '-'}</p>
            <p><strong>Площадь:</strong> ${selectedDeal.area?.toLocaleString('ru-RU') || '-'} м²</p>
            <p><strong>Цена:</strong> ${selectedDeal.deal_price?.toLocaleString('ru-RU') || '-'} ₽</p>
            <p><strong>Период:</strong> ${selectedDeal.year_quarter || '-'}</p>
            <hr>
            <p class="small">Земельных участков: ${feature.properties.options.cnt_land || 0}</p>
            <p class="small">ОКС: ${feature.properties.options.cnt_oks || 0}</p>
          </div>
        `;

        polygon.bindPopup(popupContent);
        polygonsRef.current.push(polygon);

        // Центрируем карту на полигоне
        map.fitBounds(polygon.getBounds(), { padding: [50, 50] });

        setLoading(false);
      } catch (err) {
        setError('Ошибка загрузки данных');
        setLoading(false);
      }
    };

    loadAndDisplay();
  }, [selectedDeal]);

  if (!selectedDeal) {
    return null;
  }

  return (
    <div className="deal-map-container">
      <div className="deal-map-header">
        <h3>📍 Расположение на карте</h3>
        <button className="close-btn" onClick={onClose}>✕</button>
      </div>

      {loading && (
        <div className="map-loading">
          <div className="spinner"></div>
          <span>Загрузка геометрии квартала...</span>
        </div>
      )}

      {error && (
        <div className="map-error">
          ⚠️ {error}
        </div>
      )}

      {currentQuarter && (
        <div className="current-quarter">
          Квартал: <strong>{currentQuarter}</strong>
        </div>
      )}

      <div ref={mapRef} className="deal-map"></div>
    </div>
  );
};

export default DealMap;
