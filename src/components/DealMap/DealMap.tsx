import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Deal, CadastralQuarter } from '../../types';
import { getMapConfig, createTileLayer } from '../../services/map-config';

interface QuarterGeometryResult {
  label: string;
  latLngs: L.LatLng[][];
  cnt_land: number;
  cnt_oks: number;
}

interface DealMapProps {
  deals: Deal[];
  quarters?: CadastralQuarter[];
  selectedDeal?: Deal | null;
  filterPolygons?: [number, number][][] | null;
  onClose?: () => void;
}

function epsg3857ToEpsg4326(x: number, y: number): [number, number] {
  const lon = (x / 20037508.34) * 180;
  const lat = (180 / Math.PI) * (2 * Math.atan(Math.exp((y / 20037508.34) * Math.PI)) - Math.PI / 2);
  return [lat, lon];
}

function transformPolygonCoordinates(coords: number[][][]): L.LatLng[][] {
  return coords.map(ring =>
    ring.map(point => {
      const [lat, lon] = epsg3857ToEpsg4326(point[0], point[1]);
      return L.latLng(lat, lon);
    })
  );
}

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

const DealMap: React.FC<DealMapProps> = ({ deals, quarters, selectedDeal, filterPolygons, onClose }) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const polygonsRef = useRef<L.Polygon[]>([]);
  const filterPolygonsRef = useRef<L.Polygon[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentQuarter, setCurrentQuarter] = useState<string | null>(null);

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    const map = L.map(mapRef.current, { attributionControl: false }).setView([55.7558, 37.6173], 10);
    L.control.attribution({ prefix: false }).addTo(map);

    const mapConfig = getMapConfig();
    createTileLayer(mapConfig).addTo(map);

    mapInstanceRef.current = map;

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  const loadQuarterGeometry = async (cadNumber: string): Promise<QuarterGeometryResult | null> => {
    if (quarters && quarters.length > 0) {
      const localQuarter = quarters.find(q => q.cad_number === cadNumber);
      if (localQuarter?.geojson) {
        try {
          const coords = localQuarter.geojson.geometry.coordinates[0].map(
            (c: number[]) => L.latLng(c[1], c[0])
          );
          return {
            label: localQuarter.cad_number,
            latLngs: [coords],
            cnt_land: 0,
            cnt_oks: 0,
          };
        } catch {
          // fallback на API
        }
      }
    }

    try {
      const response = await fetch(`https://map.ru/api/kad/search?query=${cadNumber}`);
      const data: MapRuResponse = await response.json();

      if (data.success && data.features && data.features.length > 0) {
        const feature = data.features[0];
        const latLngs = transformPolygonCoordinates(feature.geometry.coordinates);
        return {
          label: feature.properties.label,
          latLngs,
          cnt_land: feature.properties.options.cnt_land || 0,
          cnt_oks: feature.properties.options.cnt_oks || 0,
        };
      }
      return null;
    } catch (err) {
      console.error('Error loading quarter geometry:', err);
      return null;
    }
  };

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

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
        const result = await loadQuarterGeometry(selectedDeal.quarter_cad_number!);

        if (!result) {
          setError('Не удалось загрузить геометрию квартала');
          setLoading(false);
          return;
        }

        setCurrentQuarter(result.label);

        const polygon = L.polygon(result.latLngs, {
          color: '#3b82f6',
          weight: 3,
          fillColor: '#3b82f6',
          fillOpacity: 0.15
        }).addTo(map);

        const popupContent = `
          <div style="font-family: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; min-width: 220px; padding: 4px;">
            <div style="font-size: 11px; font-weight: 500; color: #71717a; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px;">Кадастровый квартал</div>
            <div style="font-size: 14px; font-weight: 600; color: #18181b; margin-bottom: 8px;">${result.label}</div>
            <div style="border-top: 1px solid #e4e4e7; margin: 8px 0;"></div>
            <div style="font-size: 13px; color: #3f3f46; line-height: 1.6;">
              <div><strong>Адрес:</strong> ${selectedDeal.city || '-'}, ${selectedDeal.street || '-'}</div>
              <div><strong>Площадь:</strong> ${selectedDeal.area?.toLocaleString('ru-RU') || '-'} м²</div>
              <div><strong>Цена:</strong> ${selectedDeal.deal_price?.toLocaleString('ru-RU') || '-'} ₽</div>
              <div><strong>Период:</strong> ${selectedDeal.year_quarter || '-'}</div>
            </div>
            ${result.cnt_land || result.cnt_oks ? `
            <div style="border-top: 1px solid #e4e4e7; margin: 8px 0;"></div>
            <div style="font-size: 11px; color: #71717a;">
              Земельных участков: ${result.cnt_land}<br>
              ОКС: ${result.cnt_oks}
            </div>
            ` : ''}
          </div>
        `;

        polygon.bindPopup(popupContent);
        polygonsRef.current.push(polygon);

        if (filterPolygonsRef.current.length > 0) {
          filterPolygonsRef.current.forEach(p => p.remove());
          filterPolygonsRef.current = [];
        }
        if (filterPolygons && filterPolygons.length > 0) {
          const allBounds = polygon.getBounds();
          filterPolygons.forEach(poly => {
            if (poly && poly.length >= 3) {
              const filterLatLngs = poly.map((c) => L.latLng(c[0], c[1]));
              const filterLayer = L.polygon(filterLatLngs, {
                color: '#ef4444',
                weight: 2,
                dashArray: '8 4',
                fillColor: '#ef4444',
                fillOpacity: 0.06,
              }).addTo(map);
              filterPolygonsRef.current.push(filterLayer);
              allBounds.extend(filterLayer.getBounds());
            }
          });
          map.fitBounds(allBounds, { padding: [50, 50] });
        } else {
          map.fitBounds(polygon.getBounds(), { padding: [50, 50] });
        }

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
    <div className="fixed right-0 top-0 z-50 flex h-screen w-1/2 flex-col border-l border-zinc-200 bg-white shadow-2xl dark:border-zinc-700 dark:bg-zinc-900 max-lg:w-full lg:w-1/2">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-200 bg-zinc-50 px-4 py-3 dark:border-zinc-700 dark:bg-zinc-800">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-xs font-bold text-white">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
              <path fillRule="evenodd" d="m9.69 18.933.003.001C9.89 19.02 10 19 10 19s.11.02.308-.066l.002-.001.006-.003.018-.008a5.741 5.741 0 0 0 .281-.14c.186-.096.446-.24.757-.433.62-.384 1.445-.966 2.274-1.765C15.302 14.988 17 12.493 17 9A7 7 0 1 0 3 9c0 3.492 1.698 5.988 3.355 7.584a13.731 13.731 0 0 0 2.274 1.765 11.307 11.307 0 0 0 .757.433l.04.021.01.006.004.002ZM10 11.25a2.25 2.25 0 1 0 0-4.5 2.25 2.25 0 0 0 0 4.5Z" clipRule="evenodd" />
            </svg>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-zinc-950 dark:text-white">Расположение на карте</h3>
            {currentQuarter && (
              <p className="text-xs text-zinc-500 dark:text-zinc-400">{currentQuarter}</p>
            )}
          </div>
        </div>
        <button
          onClick={onClose}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-zinc-200 hover:text-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-700 dark:hover:text-zinc-200"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
            <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
          </svg>
        </button>
      </div>

      {/* Loading */}
      {loading && (
        <div className="absolute left-1/2 top-16 z-50 flex -translate-x-1/2 items-center gap-2 rounded-lg border border-zinc-200 bg-white px-4 py-2.5 shadow-lg dark:border-zinc-700 dark:bg-zinc-800">
          <svg className="h-4 w-4 animate-spin text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <span className="text-sm text-zinc-600 dark:text-zinc-300">Загрузка геометрии квартала...</span>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="absolute left-1/2 top-16 z-50 -translate-x-1/2 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700 shadow-lg dark:border-red-800 dark:bg-red-900/30 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Map */}
      <div ref={mapRef} className="flex-1" style={{ minHeight: '400px' }} />
    </div>
  );
};

export default DealMap;
