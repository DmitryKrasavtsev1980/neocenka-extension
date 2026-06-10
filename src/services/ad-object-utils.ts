/**
 * Утилиты для работы с объектами объявлений
 * Извлечено из AdsPage.tsx для повторного использования в сервисе дедупликации
 */
import type { Ad, AdObject, PriceHistoryItem } from '@/types';

/** Объединение историй цен из нескольких объявлений */
export function mergePriceHistory(ads: Ad[]): PriceHistoryItem[] {
  type Entry = { date: string; price: number; adId: number };
  const entries: Entry[] = [];

  for (const ad of ads) {
    if (ad.price_history && ad.price_history.length > 0) {
      for (const h of ad.price_history) {
        const price = h.new_price ?? h.price;
        if (price != null && h.date) {
          entries.push({ date: h.date, price, adId: ad.id ?? 0 });
        }
      }
    }
    if (ad.price != null) {
      const date = ad.updated || ad.created || new Date().toISOString();
      entries.push({ date, price: ad.price, adId: ad.id ?? 0 });
    }
  }

  entries.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const seen = new Set<string>();
  const unique: PriceHistoryItem[] = [];
  for (const e of entries) {
    const day = e.date.slice(0, 10);
    const key = `${day}|${e.price}|${e.adId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push({ date: e.date, new_price: e.price, price: e.price });
  }

  return unique;
}

/** Пересчёт объекта из массива объявлений */
export function recalculateObjectFromAds(ads: Ad[]): Omit<AdObject, 'id' | 'created_at' | 'updated_at'> {
  if (ads.length === 0) {
    return {
      address_id: null, property_type: null, area_total: null, area_living: null,
      area_kitchen: null, floor: null, floors_total: null, rooms: null,
      status: 'archive', current_price: null, price_per_meter: null,
      price_history: [], listings_count: 0, active_listings_count: 0,
      owner_status: '', sale_deal: null, created: null, updated: null, last_recalculated_at: new Date().toISOString(),
    };
  }

  // Преобладающий тип
  const typeCounts: Record<string, number> = {};
  for (const ad of ads) {
    if (ad.property_type) typeCounts[ad.property_type] = (typeCounts[ad.property_type] || 0) + 1;
  }
  const dominantType = Object.entries(typeCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;

  // Преобладающий этаж
  const floorCounts: Record<number, number> = {};
  for (const ad of ads) {
    if (ad.floor != null) floorCounts[ad.floor] = (floorCounts[ad.floor] || 0) + 1;
  }
  const dominantFloor = Object.entries(floorCounts)
    .sort((a, b) => b[1] - a[1] || Number(a[0]) - Number(b[0]))[0]
    ? [Number(Object.entries(floorCounts).sort((a, b) => b[1] - a[1] || Number(a[0]) - Number(b[0]))[0]?.[0])]
    : null;

  // Минимальные площади
  const areas = ads.map(a => a.area_total).filter((v): v is number => v != null);
  const areasLiving = ads.map(a => a.area_living).filter((v): v is number => v != null);
  const areasKitchen = ads.map(a => a.area_kitchen).filter((v): v is number => v != null);

  // Комнаты из property_type
  const roomsMap: Record<string, number> = { studio: 0, '1k': 1, '2k': 2, '3k': 3, '4k+': 4 };
  const rooms = dominantType ? (roomsMap[dominantType] ?? null) : null;

  // Общий address_id
  const addressIds = [...new Set(ads.map(a => a.address_id).filter((v): v is number => v != null))];
  const commonAddressId = addressIds.length === 1 ? addressIds[0] : (addressIds.length > 0 ? addressIds[0] : null);

  // Статус
  const hasActive = ads.some(a => a.status === 'active');
  const status = hasActive ? 'active' : 'archive';

  // Даты
  const dates = ads.map(a => a.created).filter((v): v is string => !!v);
  const updatedDates = ads.map(a => a.updated || a.created).filter((v): v is string => !!v);
  const earliest = dates.length > 0 ? dates.sort()[0] : null;
  const latest = updatedDates.length > 0 ? updatedDates.sort().reverse()[0] : null;

  // История цен
  const priceHistory = mergePriceHistory(ads);
  const currentPrice = priceHistory.length > 0 ? priceHistory[priceHistory.length - 1].new_price ?? priceHistory[priceHistory.length - 1].price ?? null : null;
  const areaTotal = areas.length > 0 ? Math.min(...areas) : null;
  const pricePerMeter = (currentPrice != null && areaTotal != null && areaTotal > 0)
    ? Math.round(currentPrice / areaTotal)
    : null;

  // Статус собственника
  const hasOwner = ads.some(a =>
    a.seller_type === 'owner' || a.seller_info?.type === 'owner'
  );
  const ownerStatus = hasOwner ? 'есть от собственника' : 'только от агентов';

  // Подсчёт объявлений
  const listingsCount = ads.length;
  const activeListingsCount = ads.filter(a => a.status === 'active').length;

  return {
    address_id: commonAddressId,
    property_type: dominantType,
    area_total: areaTotal,
    area_living: areasLiving.length > 0 ? Math.min(...areasLiving) : null,
    area_kitchen: areasKitchen.length > 0 ? Math.min(...areasKitchen) : null,
    floor: dominantFloor?.[0] ?? null,
    floors_total: ads[0]?.floors_total ?? null,
    rooms,
    status,
    current_price: currentPrice,
    price_per_meter: pricePerMeter,
    price_history: priceHistory,
    listings_count: listingsCount,
    active_listings_count: activeListingsCount,
    owner_status: ownerStatus,
    sale_deal: null,
    created: earliest,
    updated: latest,
    last_recalculated_at: new Date().toISOString(),
  };
}
