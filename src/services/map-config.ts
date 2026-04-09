import L from 'leaflet';
import { leafletLayer as protomapsLeafletLayer, paintRules, labelRules } from 'protomaps-leaflet';
import { LIGHT } from '@protomaps/basemaps';

const PMTILES_URL = 'https://55ff837e6c44-neo-maps.s3.ru1.storage.beget.cloud/maps/russia_z14.pmtiles';

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

export function createTileLayer(config: MapTileConfig): L.Layer {
  if (config.active && config.tiles && config.tiles.type === 'pmtiles') {
    return protomapsLeafletLayer({
      url: config.tiles.url,
      attribution: config.tiles.attribution,
      paintRules: paintRules(LIGHT),
      labelRules: labelRules(LIGHT, 'ru'),
      maxDataZoom: 14,
    }) as unknown as L.Layer;
  }

  const tileConfig = config.fallback;
  return L.tileLayer(tileConfig.url, {
    attribution: tileConfig.attribution,
    maxZoom: tileConfig.maxzoom,
  });
}
