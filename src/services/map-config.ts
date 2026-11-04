import L from 'leaflet';
import { leafletLayer as protomapsLeafletLayer, paintRules, labelRules } from 'protomaps-leaflet';
import { LIGHT } from '@protomaps/basemaps';

const PMTILES_URL = 'https://s3-990149.s3.spb.sprinthost.ru/maps/russia_z14.pmtiles';

export interface MapTileConfig {
  active: boolean;
  tiles: {
    type: string;
    url: string;
    maxzoom: number;
    attribution: string;
  } | null;
  fallback: {
    type: string;
    url: string;
    maxzoom: number;
    attribution: string;
  };
}

export function getMapConfig(): MapTileConfig {
  return {
    active: true,
    tiles: {
      type: 'pmtiles',
      url: PMTILES_URL,
      maxzoom: 14,
      attribution: 'OpenStreetMap contributors, Protomaps',
    },
    fallback: {
      type: 'xyz',
      url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      maxzoom: 19,
      attribution: 'OpenStreetMap contributors',
    },
  };
}

const PMTILES_PROBE_TIMEOUT_MS = 6000;
const TILE_ERROR_LIMIT = 5;

export function createTileLayer(config: MapTileConfig): L.Layer {
  const makeFallbackLayer = () =>
    L.tileLayer(config.fallback.url, {
      attribution: config.fallback.attribution,
      maxZoom: config.fallback.maxzoom,
    });

  if (config.active && config.tiles && config.tiles.type === 'pmtiles') {
    const tilesUrl = config.tiles.url;
    const layer = protomapsLeafletLayer({
      url: tilesUrl,
      attribution: config.tiles.attribution,
      paintRules: paintRules(LIGHT),
      labelRules: labelRules(LIGHT, 'ru'),
      maxDataZoom: 14,
    }) as unknown as L.Layer;

    // Если наша подложка не грузится (S3 недоступен, сеть, CORS) —
    // переключаемся на резервную подложку OSM.
    let swapped = false;
    let tileErrors = 0;
    const swapToFallback = () => {
      if (swapped) return;
      const map = (layer as unknown as { _map?: L.Map })._map;
      if (!map) return;
      swapped = true;
      map.removeLayer(layer);
      makeFallbackLayer().addTo(map);
    };

    layer.on('add', () => {
      try {
        fetch(tilesUrl, {
          headers: { Range: 'bytes=0-0' },
          signal: AbortSignal.timeout(PMTILES_PROBE_TIMEOUT_MS),
        })
          .then((r) => {
            if (!r.ok) swapToFallback();
            r.body?.cancel?.();
          })
          .catch(() => swapToFallback());
      } catch {
        swapToFallback();
      }
    });

    // Страховка на рантайм: тайлы посыпались после успешного probe — тоже уходим на OSM.
    layer.on('tileerror', () => {
      tileErrors += 1;
      if (tileErrors >= TILE_ERROR_LIMIT) swapToFallback();
    });

    return layer;
  }

  return makeFallbackLayer();
}
