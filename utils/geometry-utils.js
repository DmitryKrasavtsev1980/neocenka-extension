/**
 * Утилиты для работы с геометрией
 * Проверка вхождения точек в полигоны, расчет расстояний и т.д.
 */

class GeometryUtils {
  
  /**
   * Проверка, находится ли точка внутри полигона
   * Использует алгоритм ray casting
   * @param {Object} point - Точка {lat: number, lng: number}
   * @param {Array} polygon - Массив точек полигона [{lat: number, lng: number}]
   * @returns {boolean}
   */
  static isPointInPolygon(point, polygon) {
    if (!point || !polygon || polygon.length < 3) {
      return false;
    }

    const lat = point.lat;
    const lng = point.lng;
    let inside = false;

    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const pi = polygon[i];
      const pj = polygon[j];
      
      if (((pi.lat > lat) !== (pj.lat > lat)) &&
          (lng < (pj.lng - pi.lng) * (lat - pi.lat) / (pj.lat - pi.lat) + pi.lng)) {
        inside = !inside;
      }
    }

    return inside;
  }

  /**
   * Поиск адресов, входящих в область на карте
   * @param {Array} addresses - Массив адресов
   * @param {Object} mapArea - Область на карте с полигоном
   * @returns {Array} - Адреса, входящие в область
   */
  static getAddressesInMapArea(addresses, mapArea) {
    if (!addresses || !mapArea || !mapArea.polygon) {
      return [];
    }

    return addresses.filter(address => {
      if (!address.coordinates) {
        return false;
      }
      
      let point;
      if (Array.isArray(address.coordinates) && address.coordinates.length >= 2) {
        point = { lat: address.coordinates[0], lng: address.coordinates[1] };
      } else if (address.coordinates.lat && address.coordinates.lng) {
        point = address.coordinates;
      } else {
        return false;
      }
      
      return this.isPointInPolygon(point, mapArea.polygon);
    });
  }

  /**
   * Фильтрация объявлений по области на карте через адреса
   * @param {Array} listings - Массив объявлений
   * @param {Array} addresses - Массив адресов
   * @param {Object} mapArea - Область на карте
   * @returns {Array} - Объявления в области
   */
  static getListingsInMapArea(listings, addresses, mapArea) {
    if (!listings || !addresses || !mapArea) {
      return [];
    }

    // Получаем адреса в области
    const addressesInArea = this.getAddressesInMapArea(addresses, mapArea);
    const addressIds = new Set(addressesInArea.map(addr => addr.id));

    // Фильтруем объявления по адресам
    return listings.filter(listing => {
      return listing.address_id && addressIds.has(listing.address_id);
    });
  }

  /**
   * Фильтрация объектов недвижимости по области на карте через адреса
   * @param {Array} objects - Массив объектов недвижимости
   * @param {Array} addresses - Массив адресов
   * @param {Object} mapArea - Область на карте
   * @returns {Array} - Объекты в области
   */
  static getObjectsInMapArea(objects, addresses, mapArea) {
    if (!objects || !addresses || !mapArea) {
      return [];
    }

    // Получаем адреса в области
    const addressesInArea = this.getAddressesInMapArea(addresses, mapArea);
    const addressIds = new Set(addressesInArea.map(addr => addr.id));

    // Фильтруем объекты по адресам
    return objects.filter(object => {
      return object.address_id && addressIds.has(object.address_id);
    });
  }

  /**
   * Применение фильтров сегмента к адресам
   * @param {Array} addresses - Массив адресов
   * @param {Object} segment - Сегмент с фильтрами
   * @returns {Array} - Отфильтрованные адреса
   */
  static applySegmentFilter(addresses, segment) {
    if (!addresses || !segment) {
      return [];
    }

    return addresses.filter(address => {
      // Фильтр по серии дома
      if (segment.house_series && address.house_series !== segment.house_series) {
        return false;
      }

      // Фильтр по материалу перекрытий
      if (segment.ceiling_material && address.ceiling_material !== segment.ceiling_material) {
        return false;
      }

      // Фильтр по материалу стен
      if (segment.wall_material && address.wall_material !== segment.wall_material) {
        return false;
      }

      return true;
    });
  }

  /**
   * Применение фильтров подсегмента к объявлениям
   * @param {Array} listings - Массив объявлений
   * @param {Object} subsegment - Подсегмент с фильтрами
   * @returns {Array} - Отфильтрованные объявления
   */
  static applySubsegmentFilter(listings, subsegment) {
    if (!listings || !subsegment) {
      return [];
    }

    return listings.filter(listing => {
      // Фильтр по типу операции (продажа/аренда)
      if (subsegment.operation_type && listing.operation_type !== subsegment.operation_type) {
        return false;
      }

      // Фильтр по типу недвижимости
      if (subsegment.property_type && listing.property_type !== subsegment.property_type) {
        return false;
      }

      // Фильтр по типу контакта
      if (subsegment.contact_type && listing.contact_type !== subsegment.contact_type) {
        return false;
      }

      return true;
    });
  }

  /**
   * Получение объявлений для подсегмента с учетом всех фильтров
   * @param {Array} listings - Все объявления
   * @param {Array} addresses - Все адреса
   * @param {Object} subsegment - Подсегмент
   * @param {Object} segment - Сегмент
   * @param {Object} mapArea - Область на карте
   * @returns {Array} - Отфильтрованные объявления
   */
  static getListingsForSubsegment(listings, addresses, subsegment, segment, mapArea) {
    // 1. Фильтруем адреса по области на карте
    const addressesInArea = this.getAddressesInMapArea(addresses, mapArea);
    
    // 2. Применяем фильтры сегмента к адресам
    const segmentAddresses = this.applySegmentFilter(addressesInArea, segment);
    const segmentAddressIds = new Set(segmentAddresses.map(addr => addr.id));

    // 3. Фильтруем объявления по адресам сегмента
    const segmentListings = listings.filter(listing => {
      return listing.address_id && segmentAddressIds.has(listing.address_id);
    });

    // 4. Применяем фильтры подсегмента
    return this.applySubsegmentFilter(segmentListings, subsegment);
  }

  /**
   * Расчет расстояния между двумя точками (формула Haversine)
   * @param {Object} point1 - Первая точка {lat: number, lng: number}
   * @param {Object} point2 - Вторая точка {lat: number, lng: number}
   * @returns {number} - Расстояние в метрах
   */
  static calculateDistance(point1, point2) {
    const R = 6371000; // Радиус Земли в метрах
    const lat1Rad = point1.lat * Math.PI / 180;
    const lat2Rad = point2.lat * Math.PI / 180;
    const deltaLatRad = (point2.lat - point1.lat) * Math.PI / 180;
    const deltaLngRad = (point2.lng - point1.lng) * Math.PI / 180;

    const a = Math.sin(deltaLatRad / 2) * Math.sin(deltaLatRad / 2) +
              Math.cos(lat1Rad) * Math.cos(lat2Rad) *
              Math.sin(deltaLngRad / 2) * Math.sin(deltaLngRad / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  }

  /**
   * Получение центра полигона
   * @param {Array} polygon - Массив точек полигона
   * @returns {Object} - Центральная точка {lat: number, lng: number}
   */
  static getPolygonCenter(polygon) {
    if (!polygon || polygon.length === 0) {
      return { lat: 0, lng: 0 };
    }

    let totalLat = 0;
    let totalLng = 0;

    polygon.forEach(point => {
      totalLat += point.lat;
      totalLng += point.lng;
    });

    return {
      lat: totalLat / polygon.length,
      lng: totalLng / polygon.length
    };
  }

  /**
   * Проверка валидности полигона
   * @param {Array} polygon - Массив точек полигона
   * @returns {boolean}
   */
  static isValidPolygon(polygon) {
    if (!polygon || !Array.isArray(polygon)) {
      return false;
    }

    // Минимум 3 точки для полигона
    if (polygon.length < 3) {
      return false;
    }

    // Проверяем, что все точки имеют корректные координаты
    return polygon.every(point => {
      return point && 
             typeof point.lat === 'number' && 
             typeof point.lng === 'number' &&
             point.lat >= -90 && point.lat <= 90 &&
             point.lng >= -180 && point.lng <= 180;
    });
  }
}

// Экспорт для использования в других модулях
if (typeof module !== 'undefined' && module.exports) {
  module.exports = GeometryUtils;
}