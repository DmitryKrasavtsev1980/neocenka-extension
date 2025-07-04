/**
 * Модели данных для Chrome Extension Neocenka
 * Определяют структуру объектов в IndexedDB
 */

/**
 * Модель области на карте
 */
class MapAreaModel {
  constructor(data = {}) {
    this.id = data.id || null;
    this.name = data.name || '';
    this.polygon = data.polygon || []; // Массив координат [{lat: number, lng: number}]
    this.avito_filter_url = data.avito_filter_url || '';
    this.cian_filter_url = data.cian_filter_url || '';
    this.created_at = data.created_at || new Date();
    this.updated_at = data.updated_at || new Date();
  }

  validate() {
    const errors = [];
    
    if (!this.name.trim()) {
      errors.push('Название области обязательно');
    }
    
    if (!this.polygon || this.polygon.length < 3) {
      errors.push('Область должна содержать минимум 3 точки');
    }
    
    if (!this.avito_filter_url.trim() && !this.cian_filter_url.trim()) {
      errors.push('Необходимо указать хотя бы один URL фильтра');
    }
    
    return errors;
  }

  /**
   * Проверка, находится ли точка внутри полигона области
   */
  containsPoint(lat, lng) {
    if (!this.polygon || this.polygon.length < 3) return false;
    
    let inside = false;
    for (let i = 0, j = this.polygon.length - 1; i < this.polygon.length; j = i++) {
      if (((this.polygon[i].lat > lat) !== (this.polygon[j].lat > lat)) &&
          (lng < (this.polygon[j].lng - this.polygon[i].lng) * (lat - this.polygon[i].lat) / (this.polygon[j].lat - this.polygon[i].lat) + this.polygon[i].lng)) {
        inside = !inside;
      }
    }
    return inside;
  }
}

/**
 * Модель материала стен (справочник)
 */
class WallMaterialModel {
  constructor(data = {}) {
    this.id = data.id || null;
    this.name = data.name || '';
    this.color = data.color || '#3b82f6'; // Цвет маркера на карте
    this.created_at = data.created_at || new Date();
    this.updated_at = data.updated_at || new Date();
  }

  validate() {
    const errors = [];
    
    if (!this.name.trim()) {
      errors.push('Название материала обязательно');
    }
    
    if (!this.color.trim()) {
      errors.push('Цвет обязателен');
    }
    
    return errors;
  }
}

/**
 * Модель серии дома (справочник)
 */
class HouseSeriesModel {
  constructor(data = {}) {
    this.id = data.id || null;
    this.name = data.name || '';
    this.created_at = data.created_at || new Date();
    this.updated_at = data.updated_at || new Date();
  }

  validate() {
    const errors = [];
    
    if (!this.name.trim()) {
      errors.push('Название серии дома обязательно');
    }
    
    return errors;
  }
}

/**
 * Модель материала перекрытий (справочник)
 */
class CeilingMaterialModel {
  constructor(data = {}) {
    this.id = data.id || null;
    this.name = data.name || '';
    this.created_at = data.created_at || new Date();
    this.updated_at = data.updated_at || new Date();
  }

  validate() {
    const errors = [];
    
    if (!this.name.trim()) {
      errors.push('Название материала перекрытий обязательно');
    }
    
    return errors;
  }
}

/**
 * Модель адреса объекта недвижимости
 */
class AddressModel {
  constructor(data = {}) {
    this.id = data.id || null;
    this.address = data.address || '';
    this.coordinates = data.coordinates || { lat: null, lng: null };
    
    // Тип недвижимости
    this.type = data.type || 'house'; // 'house' | 'house_with_land' | 'land' | 'commercial'
    
    // Характеристики дома (если type === 'house')
    this.house_series_id = data.house_series_id || null; // ID из справочника серий домов
    this.ceiling_material_id = data.ceiling_material_id || null; // ID из справочника материалов перекрытий
    this.wall_material_id = data.wall_material_id || null; // ID из справочника материалов стен
    this.floors_count = data.floors_count || null;
    this.build_year = data.build_year || null;
    this.entrances_count = data.entrances_count || null;
    this.living_spaces_count = data.living_spaces_count || null;
    this.gas_supply = data.gas_supply || null; // Газоснабжение: true/false
    
    // Инфраструктура
    this.has_playground = data.has_playground || false;
    this.has_sports_area = data.has_sports_area || false;
    
    this.created_at = data.created_at || new Date();
    this.updated_at = data.updated_at || new Date();
  }

  validate() {
    const errors = [];
    
    if (!this.address.trim()) {
      errors.push('Адрес обязателен');
    }
    
    if (!this.coordinates.lat || !this.coordinates.lng) {
      errors.push('Координаты обязательны');
    }
    
    if (!['house', 'land'].includes(this.type)) {
      errors.push('Неверный тип недвижимости');
    }
    
    return errors;
  }

  /**
   * Определение принадлежности к области на карте
   */
  belongsToMapArea(mapArea) {
    if (!this.coordinates.lat || !this.coordinates.lng) return false;
    return mapArea.containsPoint(this.coordinates.lat, this.coordinates.lng);
  }
}

/**
 * Модель сегмента рынка недвижимости (обновленная)
 */
class SegmentModel {
  constructor(data = {}) {
    this.id = data.id || null;
    this.name = data.name || '';
    this.map_area_id = data.map_area_id || null;
    
    // Фильтры по конструктиву
    this.house_series = data.house_series || '';
    this.ceiling_material = data.ceiling_material || '';
    this.wall_material = data.wall_material || '';
    
    this.created_at = data.created_at || new Date();
    this.updated_at = data.updated_at || new Date();
  }

  validate() {
    const errors = [];
    
    if (!this.name.trim()) {
      errors.push('Название сегмента обязательно');
    }
    
    if (!this.map_area_id) {
      errors.push('Необходимо указать область');
    }
    
    return errors;
  }
}

/**
 * Модель подсегмента недвижимости
 */
class SubsegmentModel {
  constructor(data = {}) {
    this.id = data.id || null;
    this.name = data.name || '';
    this.segment_id = data.segment_id || null;
    
    // Фильтры подсегмента
    this.operation_type = data.operation_type || 'sell'; // 'sell' | 'rent'
    this.property_type = data.property_type || ''; // 'studio' | '1k' | '2k' | '3k' | '4k+'
    this.contact_type = data.contact_type || ''; // 'owner' | 'agent'
    
    this.created_at = data.created_at || new Date();
    this.updated_at = data.updated_at || new Date();
  }

  validate() {
    const errors = [];
    
    if (!this.name.trim()) {
      errors.push('Название подсегмента обязательно');
    }
    
    if (!this.segment_id) {
      errors.push('Необходимо указать сегмент');
    }
    
    if (!this.property_type) {
      errors.push('Необходимо указать тип недвижимости');
    }
    
    return errors;
  }
}

/**
 * Модель объявления недвижимости
 */
class ListingModel {
  constructor(data = {}) {
    // Основные поля
    this.id = data.id || null;
    this.segment_id = data.segment_id || null;
    this.object_id = data.object_id || null; // ID объекта недвижимости (для объединенных)
    
    // Источник данных
    this.source = data.source || null; // 'avito' | 'cian'
    this.external_id = data.external_id || ''; // ID на источнике
    this.url = data.url || '';
    
    // Основная информация
    this.title = data.title || ''; // Заголовок объявления
    this.name = data.name || ''; // Краткое наименование (2к, 4эт/5эт, 120м2)
    this.description = data.description || '';
    this.address = data.address || '';
    this.coordinates = data.coordinates || { lat: null, lon: null };
    
    // Характеристики недвижимости
    this.property_type = data.property_type || ''; // 'studio' | '1k' | '2k' | '3k' | '4k+'
    this.area_total = data.area_total || null; // Общая площадь
    this.area_living = data.area_living || null; // Жилая площадь
    this.area_kitchen = data.area_kitchen || null; // Площадь кухни
    this.floor = data.floor || null; // Этаж
    this.floors_total = data.floors_total || null; // Этажность дома
    this.rooms = data.rooms || null; // Количество комнат
    
    // Дополнительные характеристики
    this.house_type = data.house_type || ''; // Тип дома (панель, кирпич, монолит)
    this.condition = data.condition || ''; // Состояние: Дизайнерский, Евроремонт, Эконом, Жилое состояние, Бетон, Не жилое состояние
    this.year_built = data.year_built || null; // Год постройки
    this.has_balcony = data.has_balcony || null; // Наличие балкона/лоджии
    this.bathroom_type = data.bathroom_type || ''; // Тип санузла
    this.ceiling_height = data.ceiling_height || null; // Высота потолков
    
    // Цена и история
    this.price = data.price || null; // Текущая цена
    this.price_per_meter = data.price_per_meter || null; // Цена за м2
    this.price_history = data.price_history || []; // История изменения цен [{date: Date, price: number}]
    
    // Медиа данные
    this.photos = data.photos || []; // Массив ссылок на фотографии
    this.photos_count = data.photos_count || 0; // Количество фотографий
    
    // Контактная информация
    this.seller_name = data.seller_name || '';
    this.seller_type = data.seller_type || ''; // Частное лицо, агентство
    this.phone = data.phone || '';
    
    // Статусы и даты
    this.status = data.status || 'needs_processing'; // 'active' | 'archived' | 'needs_processing'
    this.processing_status = data.processing_status || 'address_needed'; // 'address_needed' | 'duplicate_check_needed' | 'processed'
    this.address_id = data.address_id || null; // ID связанного адреса
    
    // Данные о точности определения адреса
    this.address_match_confidence = data.address_match_confidence || null; // 'high' | 'medium' | 'low' | 'very_low'
    this.address_match_method = data.address_match_method || null; // Метод определения адреса
    this.address_match_score = data.address_match_score || null; // Численная оценка совпадения (0-1)
    this.address_distance = data.address_distance || null; // Расстояние до найденного адреса (метры)
    this.listing_date = data.listing_date || null; // Дата размещения объявления
    this.last_update_date = data.last_update_date || null; // Дата последнего обновления объявления на сайте
    this.created_at = data.created_at || new Date(); // Дата добавления в базу
    this.updated_at = data.updated_at || new Date(); // Дата последнего обновления в базе
    this.last_seen = data.last_seen || new Date(); // Дата последней проверки
    
    // Дополнительные данные
    this.views_count = data.views_count || null; // Количество просмотров (если доступно)
    this.is_premium = data.is_premium || false; // Премиальное размещение
    this.parsing_errors = data.parsing_errors || []; // Ошибки парсинга
  }

  /**
   * Генерация краткого наименования
   */
  generateName() {
    const parts = [];
    
    // Тип недвижимости
    if (this.property_type) {
      const typeMap = {
        'studio': 'Студия',
        '1k': '1к',
        '2k': '2к', 
        '3k': '3к',
        '4k+': '4к+'
      };
      parts.push(typeMap[this.property_type] || this.property_type);
    }
    
    // Этаж
    if (this.floor && this.floors_total) {
      parts.push(`${this.floor}эт/${this.floors_total}эт`);
    }
    
    // Площадь
    if (this.area_total) {
      parts.push(`${this.area_total}м²`);
    }
    
    this.name = parts.join(', ');
    return this.name;
  }

  /**
   * Добавление записи в историю цен
   */
  addPriceHistory(newPrice, date = new Date()) {
    if (this.price !== newPrice) {
      this.price_history.push({
        date: date,
        price: this.price,
        new_price: newPrice
      });
      this.price = newPrice;
      
      // Пересчитываем цену за м2
      if (this.area_total && this.area_total > 0) {
        this.price_per_meter = Math.round(newPrice / this.area_total);
      }
    }
  }

  /**
   * Проверка, является ли объявление дублем
   */
  isDuplicateOf(otherListing) {
    // Базовые критерии для определения дубля
    const addressMatch = this.address && otherListing.address && 
                        this.address.toLowerCase() === otherListing.address.toLowerCase();
    
    const areaMatch = this.area_total === otherListing.area_total;
    const floorMatch = this.floor === otherListing.floor;
    const typeMatch = this.property_type === otherListing.property_type;
    
    return addressMatch && areaMatch && floorMatch && typeMatch;
  }

  /**
   * Создание объявления из данных Inpars API
   */
  static fromInparsAPI(inparsData, mapAreaId = null) {
    // Определяем источник по URL
    let source = 'unknown';
    if (inparsData.url?.includes('avito.ru')) {
      source = 'avito';
    } else if (inparsData.url?.includes('cian.ru')) {
      source = 'cian';
    } else if (inparsData.url?.includes('realty.yandex.ru')) {
      source = 'yandex';
    } else if (inparsData.url?.includes('domclick.ru')) {
      source = 'domclick';
    } else if (inparsData.source) {
      source = inparsData.source.toLowerCase();
    }

    // Определяем тип недвижимости по количеству комнат
    let property_type = '';
    if (inparsData.rooms === 0) {
      property_type = 'studio';
    } else if (inparsData.rooms >= 1 && inparsData.rooms <= 3) {
      property_type = `${inparsData.rooms}k`;
    } else if (inparsData.rooms >= 4) {
      property_type = '4k+';
    }

    // Определяем тип дома по материалу
    let house_type = '';
    if (inparsData.material) {
      const material = inparsData.material.toLowerCase();
      if (material.includes('кирпич') || material.includes('brick')) {
        house_type = 'brick';
      } else if (material.includes('панель') || material.includes('panel')) {
        house_type = 'panel';
      } else if (material.includes('монолит') || material.includes('monolith')) {
        house_type = 'monolith';
      } else if (material.includes('блок') || material.includes('block')) {
        house_type = 'block';
      }
    }

    // Стандартизируем цену - всегда приводим к числу
    let price = null;
    if (inparsData.cost) {
      if (typeof inparsData.cost === 'string') {
        // Убираем все нечисловые символы и пробелы
        price = parseFloat(inparsData.cost.replace(/[^0-9.]/g, ''));
      } else {
        price = parseFloat(inparsData.cost);
      }
    }

    // Создаем модель объявления
    const listing = new ListingModel({
      // Основные поля
      external_id: String(inparsData.id),
      source: source,
      url: inparsData.url || '',
      
      // Информация об объявлении
      title: inparsData.title || '',
      description: inparsData.text || '',
      address: inparsData.address || '',
      coordinates: {
        lat: inparsData.lat || null,
        lon: inparsData.lng || null
      },
      
      // Характеристики недвижимости
      property_type: property_type,
      area_total: inparsData.sq ? parseFloat(inparsData.sq) : null,
      area_kitchen: inparsData.sqKitchen ? parseFloat(inparsData.sqKitchen) : null,
      floor: inparsData.floor ? parseInt(inparsData.floor) : null,
      floors_total: inparsData.floors ? parseInt(inparsData.floors) : null,
      rooms: inparsData.rooms ? parseInt(inparsData.rooms) : null,
      
      // Дополнительные характеристики
      house_type: house_type,
      year_built: null, // Inpars не предоставляет
      
      // Цена (стандартизированная)
      price: price,
      
      // Фотографии
      photos: Array.isArray(inparsData.images) ? inparsData.images : [],
      photos_count: Array.isArray(inparsData.images) ? inparsData.images.length : 0,
      
      // Контакты
      seller_name: inparsData.name || '',
      seller_type: inparsData.agent ? 'agent' : 'owner',
      phone: Array.isArray(inparsData.phones) && inparsData.phones.length > 0 ? 
             inparsData.phones[0] : '',
      
      // Даты - обрабатываем created и updated из Inpars
      listing_date: inparsData.created ? new Date(inparsData.created) : null,
      last_update_date: inparsData.updated ? new Date(inparsData.updated) : null,
      
      // Статусы - для импорта из Inpars всегда активный статус
      status: 'active',
      processing_status: 'address_needed',
      
      // Дополнительные данные Inpars
      _inpars_data: {
        regionId: inparsData.regionId,
        cityId: inparsData.cityId,
        metroId: inparsData.metroId,
        sectionId: inparsData.sectionId,
        categoryId: inparsData.categoryId,
        typeAd: inparsData.typeAd,
        sourceId: inparsData.sourceId,
        isNew: inparsData.isNew,
        material: inparsData.material,
        rentTime: inparsData.rentTime,
        history: inparsData.history,
        phoneProtected: inparsData.phoneProtected,
        statusId: inparsData.statusId
      }
    });

    // Обработка истории цен из Inpars
    if (Array.isArray(inparsData.history) && inparsData.history.length > 0) {
      listing.price_history = inparsData.history.map(historyItem => {
        // Стандартизируем цену в истории
        let historyPrice = null;
        if (historyItem.price) {
          if (typeof historyItem.price === 'string') {
            historyPrice = parseFloat(historyItem.price.replace(/[^0-9.]/g, ''));
          } else {
            historyPrice = parseFloat(historyItem.price);
          }
        }
        
        return {
          date: new Date(historyItem.date),
          price: historyPrice,
          new_price: historyPrice
        };
      });
    }

    // Вычисляем цену за м2
    if (listing.price && listing.area_total && listing.area_total > 0) {
      listing.price_per_meter = Math.round(listing.price / listing.area_total);
    }

    // Генерируем краткое наименование
    listing.generateName();

    return listing;
  }

  validate() {
    const errors = [];
    
    if (!this.segment_id) {
      errors.push('Не указан сегмент');
    }
    
    if (!this.source || !['avito', 'cian', 'yandex', 'domclick', 'unknown'].includes(this.source)) {
      errors.push('Неверный источник данных');
    }
    
    if (!this.external_id) {
      errors.push('Не указан внешний ID');
    }
    
    if (!this.price || this.price <= 0) {
      errors.push('Неверная цена');
    }
    
    return errors;
  }
}

/**
 * Модель объекта недвижимости (объединенные объявления)
 */

/**
 * Модель отчета
 */
class ReportModel {
  constructor(data = {}) {
    this.id = data.id || null;
    this.segment_id = data.segment_id || null;
    this.name = data.name || '';
    
    // Фильтры отчета
    this.filters = data.filters || {
      date_range: { from: null, to: null },
      property_types: [], // ['studio', '1k', '2k', '3k', '4k+']
      price_range: { min: null, max: null },
      floor_range: { min: null, max: null },
      area_range: { min: null, max: null },
      polygon: [] // [{lat: number, lon: number}]
    };
    
    // Данные для обработки дублей
    this.duplicate_filter = data.duplicate_filter || {
      base_object_id: null, // ID объекта/объявления, для которого создан фильтр
      base_object_type: null, // 'listing' | 'object'
      address: '',
      floor: null,
      property_type: '',
      include_other_floors: false // Показывать ли другие этажи
    };
    
    this.created_at = data.created_at || new Date();
  }

  /**
   * Применение фильтров к списку объявлений/объектов
   */
  applyFilters(items) {
    return items.filter(item => {
      // Фильтр по датам
      if (this.filters.date_range.from || this.filters.date_range.to) {
        const itemDate = new Date(item.created_at);
        if (this.filters.date_range.from && itemDate < new Date(this.filters.date_range.from)) {
          return false;
        }
        if (this.filters.date_range.to && itemDate > new Date(this.filters.date_range.to)) {
          return false;
        }
      }
      
      // Фильтр по типу недвижимости
      if (this.filters.property_types.length > 0) {
        if (!this.filters.property_types.includes(item.property_type)) {
          return false;
        }
      }
      
      // Фильтр по цене
      if (this.filters.price_range.min !== null && item.price < this.filters.price_range.min) {
        return false;
      }
      if (this.filters.price_range.max !== null && item.price > this.filters.price_range.max) {
        return false;
      }
      
      // Фильтр по этажу
      if (this.filters.floor_range.min !== null && item.floor < this.filters.floor_range.min) {
        return false;
      }
      if (this.filters.floor_range.max !== null && item.floor > this.filters.floor_range.max) {
        return false;
      }
      
      // Фильтр по площади
      if (this.filters.area_range.min !== null && item.area_total < this.filters.area_range.min) {
        return false;
      }
      if (this.filters.area_range.max !== null && item.area_total > this.filters.area_range.max) {
        return false;
      }
      
      // Фильтр по полигону (если есть координаты)
      if (this.filters.polygon.length > 0 && item.coordinates.lat && item.coordinates.lon) {
        if (!this.isPointInPolygon(item.coordinates, this.filters.polygon)) {
          return false;
        }
      }
      
      return true;
    });
  }

  /**
   * Проверка, находится ли точка внутри полигона
   */
  isPointInPolygon(point, polygon) {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      if (((polygon[i].lat > point.lat) !== (polygon[j].lat > point.lat)) &&
          (point.lon < (polygon[j].lon - polygon[i].lon) * (point.lat - polygon[i].lat) / (polygon[j].lat - polygon[i].lat) + polygon[i].lon)) {
        inside = !inside;
      }
    }
    return inside;
  }
}

/**
 * Модель категории Inpars
 */
class InparsCategoryModel {
  constructor(data = {}) {
    this.id = data.id || null;
    this.inpars_id = data.inpars_id || data.id || null; // ID от Inpars API
    this.name = data.name || '';
    this.name_en = data.name_en || '';
    this.parent_id = data.parent_id || null; // ID родительской категории
    this.section_id = data.section_id || null; // ID раздела
    this.type_id = data.type_id || null; // ID типа категории
    this.is_active = data.is_active !== undefined ? data.is_active : true;
    this.sort_order = data.sort_order || 0;
    
    // Дополнительные поля от API
    this.description = data.description || '';
    this.level = data.level || 0; // Уровень вложенности
    this.has_children = data.has_children || false;
    
    // Метаданные
    this.imported_at = data.imported_at || new Date();
    this.created_at = data.created_at || new Date();
    this.updated_at = data.updated_at || new Date();
  }

  validate() {
    const errors = [];
    
    if (!this.inpars_id) {
      errors.push('ID категории Inpars обязательно');
    }
    
    if (!this.name.trim()) {
      errors.push('Название категории обязательно');
    }
    
    return errors;
  }

  /**
   * Преобразование данных из API Inpars в модель
   */
  static fromInparsAPI(apiData) {
    return new InparsCategoryModel({
      inpars_id: apiData.id,
      name: apiData.name,
      name_en: apiData.name_en,
      parent_id: apiData.parent_id,
      section_id: apiData.section_id,
      type_id: apiData.type_id || apiData.typeId,
      is_active: apiData.is_active !== undefined ? apiData.is_active : true,
      sort_order: apiData.sort_order || 0,
      description: apiData.description || '',
      level: apiData.level || 0,
      has_children: apiData.has_children || false,
      imported_at: new Date()
    });
  }
}

// Экспорт моделей
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    MapAreaModel,
    WallMaterialModel,
    HouseSeriesModel,
    CeilingMaterialModel,
    AddressModel,
    SegmentModel,
    SubsegmentModel,
    ListingModel,
    RealEstateObjectModel,
    ReportModel,
    InparsCategoryModel
  };
}