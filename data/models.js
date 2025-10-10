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
 * Модель класса дома (справочник)
 */
class HouseClassModel {
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
      errors.push('Название класса дома обязательно');
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
    this.house_class_id = data.house_class_id || null; // ID из справочника классов домов
    this.ceiling_material_id = data.ceiling_material_id || null; // ID из справочника материалов перекрытий
    this.wall_material_id = data.wall_material_id || null; // ID из справочника материалов стен
    this.floors_count = data.floors_count || null;
    this.build_year = data.build_year || null;
    this.entrances_count = data.entrances_count || null;
    this.living_spaces_count = data.living_spaces_count || null;
    this.gas_supply = data.gas_supply || null; // Газоснабжение: true/false
    this.individual_heating = data.individual_heating || null; // Индивидуальное отопление: true/false
    
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
    
    if (!['house', 'house_with_land', 'land', 'commercial', 'building'].includes(this.type)) {
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

  /**
   * Создание адреса из данных GeoJSON "Реформа ЖКХ"
   */
  static async fromReformaGKH(geoJsonFeature, referenceResolver = null) {
    const props = geoJsonFeature.properties;
    const geometry = geoJsonFeature.geometry;
    
    // Основные данные
    const addressData = {
      address: props.ADDRESS || '',
      coordinates: {
        lat: parseFloat(props.LAT) || null,
        lng: parseFloat(props.LON) || null
      },
      type: 'building', // Всегда "building" согласно справочнику типов
      
      // Год постройки - приоритет YEAR_EXPL, потом YEAR_BLD
      build_year: null,
      
      // Характеристики дома
      floors_count: props.LEVELS ? parseInt(props.LEVELS) : null,
      entrances_count: props.DOORS ? parseInt(props.DOORS) : null,
      living_spaces_count: props.RMC_LIVE ? parseInt(props.RMC_LIVE) : null,
      
      // Инфраструктура - преобразование в булево
      has_playground: AddressModel.parseBoolean(props.BLAG_PLAY),
      has_sports_area: AddressModel.parseBoolean(props.BLAG_SPORT),
      
      // Коммунальные системы
      gas_supply: AddressModel.parseGasSupply(props.GAZ_TYPE),
      individual_heating: AddressModel.parseHeatingType(props.TEPLO_TYPE),
      
      // Справочники - будут заполнены через referenceResolver
      wall_material_id: null,
      ceiling_material_id: null,
      house_series_id: null,
      house_class_id: null
    };
    
    // Определение года постройки
    if (props.YEAR_EXPL) {
      addressData.build_year = parseInt(props.YEAR_EXPL);
    } else if (props.YEAR_BLD) {
      addressData.build_year = parseInt(props.YEAR_BLD);
    }
    
    // Обработка справочников через resolver
    if (referenceResolver) {
      try {
        if (props.MAT_NES && props.MAT_NES !== "Не заполнено") {
          addressData.wall_material_id = await referenceResolver.getOrCreate('wall_materials', props.MAT_NES);
        }
        
        if (props.PEREKRYT && props.PEREKRYT !== "Не заполнено") {
          addressData.ceiling_material_id = await referenceResolver.getOrCreate('ceiling_materials', props.PEREKRYT);
        }
        
        if (props.SERIE && props.SERIE !== "Не заполнено") {
          addressData.house_series_id = await referenceResolver.getOrCreate('house_series', props.SERIE);
        }
      } catch (error) {
        console.warn('Ошибка при обработке справочников для адреса:', addressData.address, error);
      }
    }
    
    return new AddressModel(addressData);
  }
  
  /**
   * Преобразование значения в булево для полей инфраструктуры
   */
  static parseBoolean(value) {
    if (!value) return false;
    const str = String(value).toLowerCase().trim();
    return str === 'да' || str === 'есть' || str === 'имеется' || str === 'true' || str === '1';
  }
  
  /**
   * Преобразование типа газоснабжения
   */
  static parseGasSupply(value) {
    if (!value || value === "Не заполнено") return null;
    const str = String(value).toLowerCase().trim();
    return str.includes('центральное') || str.includes('автономное') || str.includes('сетевое');
  }
  
  /**
   * Преобразование типа отопления
   */
  static parseHeatingType(value) {
    if (!value || value === "Не заполнено") return null;
    const str = String(value).toLowerCase().trim();
    if (str.includes('индивидуальное') || str.includes('автономное')) {
      return true;
    } else if (str.includes('центральное')) {
      return false;
    }
    return null;
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
    this.coordinates = data.coordinates || { lat: null, lng: null }; // Стандарт GeoJSON
    
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
    // Унифицированные даты (версия 14)
    this.created_at = data.created_at || new Date(); // Дата добавления в базу
    this.updated_at = data.updated_at || new Date(); // Дата последнего обновления в базе
    this.created = data.created || null; // Дата создания объявления на источнике
    this.updated = data.updated || null; // Дата последнего обновления на источнике
    
    // Дополнительные данные
    this.views_count = data.views_count || null; // Количество просмотров (если доступно)
    this.is_premium = data.is_premium || false; // Премиальное размещение
    this.parsing_errors = data.parsing_errors || []; // Ошибки парсинга
    
    // Новые поля для поддержки всех источников данных (версия 12)
    
    // Географические идентификаторы (Inpars)
    this.region_id = data.region_id || null; // ID региона
    this.city_id = data.city_id || null; // ID города
    this.metro_id = data.metro_id || null; // ID станции метро
    this.operation_type = data.operation_type || null; // 'rent' | 'sale'
    this.section_id = data.section_id || null; // ID раздела недвижимости
    this.category_id = data.category_id || null; // ID категории недвижимости
    this.original_source_id = data.original_source_id || null; // parseId от Inpars
    this.phone_protected = data.phone_protected || null; // Защищенность телефона
    this.is_new_building = data.is_new_building || null; // Новостройка/вторичка
    this.is_apartments = data.is_apartments || null; // Апартаменты
    
    // Детали дома (объединение данных от всех источников)
    this.house_details = data.house_details || {
      build_year: null, // Год постройки (из разных источников)
      cargo_lifts: null, // Количество грузовых лифтов
      passenger_lifts: null, // Количество пассажирских лифтов
      material: null // Материал дома (объединение house_type и material)
    };
    
    // Поля специфичные для Avito
    this.renovation_type = data.renovation_type || null; // Тип ремонта (вместо condition)
    this.bathroom_details = data.bathroom_details || null; // Детали санузла
    this.balcony_details = data.balcony_details || null; // Детали балкона/лоджии
    this.parsed_at = data.parsed_at || null; // Время парсинга
    
    // Унифицированная информация о продавце
    this.seller_info = data.seller_info || {
      name: null,
      type: null, // 'owner' | 'agent' | 'agency'
      is_agent: false, // boolean для обратной совместимости
      phone: null,
      phone_protected: null
    };
    
    // Метаданные источника данных
    this.source_metadata = data.source_metadata || {
      original_source: null, // 'avito.ru' | 'cian.ru' | 'inpars'
      source_method: null, // 'parser' | 'api' | 'manual'
      original_id: null, // ID на источнике
      source_internal_id: null, // внутренний ID источника (sourceId)
      import_date: new Date(),
      last_sync_date: null,
      sync_errors: []
    };
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
   * Создание объявления из данных Inpars API (обновленная версия)
   */
  static fromInparsAPI(inparsData, mapAreaId = null) {
    // Определяем источник по URL
    let source = 'inpars';
    let originalSource = 'inpars';
    if (inparsData.url?.includes('avito.ru')) {
      originalSource = 'avito.ru';
    } else if (inparsData.url?.includes('cian.ru')) {
      originalSource = 'cian.ru';
    } else if (inparsData.url?.includes('realty.yandex.ru')) {
      originalSource = 'yandex.ru';
    } else if (inparsData.url?.includes('domclick.ru')) {
      originalSource = 'domclick.ru';
    } else if (inparsData.source) {
      originalSource = inparsData.source.toLowerCase();
    }

    // Определяем тип операции
    let operation_type = null;
    if (inparsData.typeAd === 1 || inparsData.typeAd === 3) {
      operation_type = 'rent'; // сдам или сниму
    } else if (inparsData.typeAd === 2 || inparsData.typeAd === 4) {
      operation_type = 'sale'; // продам или куплю
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

    // Стандартизируем цену - всегда приводим к числу
    let price = null;
    if (inparsData.cost) {
      if (typeof inparsData.cost === 'string') {
        price = parseFloat(inparsData.cost.replace(/[^0-9.]/g, ''));
      } else {
        price = parseFloat(inparsData.cost);
      }
    }

    // Нормализуем координаты
    const coordinates = ListingModel.normalizeCoordinates({
      lat: inparsData.lat,
      lng: inparsData.lng
    });

    // Нормализуем информацию о продавце
    const seller_info = ListingModel.normalizeSeller(inparsData, 'inpars');

    // Создаем детали дома
    const house_details = {
      build_year: inparsData.house?.buildYear || null,
      cargo_lifts: inparsData.house?.cargoLifts || null,
      passenger_lifts: inparsData.house?.passengerLifts || null,
      material: inparsData.material || null
    };

    // Создаем метаданные источника
    const source_metadata = ListingModel.createSourceMetadata(inparsData, 'inpars', 'api');
    source_metadata.original_source = originalSource;

    // Создаем модель объявления с новыми полями
    const listing = new ListingModel({
      // Основные поля
      external_id: String(inparsData.id),
      source: source,
      url: inparsData.url || '',
      
      // Информация об объявлении
      title: inparsData.title || '',
      description: inparsData.text || '',
      address: inparsData.address || '',
      coordinates: coordinates,
      
      // Характеристики недвижимости
      property_type: property_type,
      area_total: inparsData.sq ? parseFloat(inparsData.sq) : null,
      area_living: inparsData.sqLiving ? parseFloat(inparsData.sqLiving) : null,
      area_kitchen: inparsData.sqKitchen ? parseFloat(inparsData.sqKitchen) : null,
      floor: inparsData.floor ? parseInt(inparsData.floor) : null,
      floors_total: inparsData.floors ? parseInt(inparsData.floors) : null,
      rooms: inparsData.rooms ? parseInt(inparsData.rooms) : null,
      
      // Дополнительные характеристики (обратная совместимость)
      house_type: inparsData.material || '',
      year_built: inparsData.house?.buildYear || null,
      
      // Цена (стандартизированная)
      price: price,
      
      // Фотографии
      photos: Array.isArray(inparsData.images) ? inparsData.images : [],
      photos_count: Array.isArray(inparsData.images) ? inparsData.images.length : 0,
      
      // Контакты (обратная совместимость)
      seller_name: inparsData.name || '',
      seller_type: inparsData.agent === 0 ? 'owner' :
                   inparsData.agent === 1 ? 'agent' :
                   inparsData.agent === 2 ? 'developer' :
                   'owner', // По умолчанию собственник
      phone: Array.isArray(inparsData.phones) && inparsData.phones.length > 0 ?
             inparsData.phones[0] : '',
      
      // Даты (версия 14 - унифицированные)
      created: inparsData.created ? new Date(inparsData.created) : null,
      updated: inparsData.updated ? new Date(inparsData.updated) : null,
      
      // Статусы
      status: 'active',
      processing_status: 'address_needed',
      
      // Новые поля для Inpars
      region_id: inparsData.regionId || null,
      city_id: inparsData.cityId || null,
      metro_id: inparsData.metroId || null,
      operation_type: operation_type,
      section_id: inparsData.sectionId || null,
      category_id: inparsData.categoryId || null,
      original_source_id: inparsData.parseId || String(inparsData.id),
      phone_protected: inparsData.phoneProtected || null,
      is_new_building: inparsData.isNew || null,
      is_apartments: inparsData.isApartments || null,
      
      // Детали дома
      house_details: house_details,
      
      // Унифицированная информация о продавце
      seller_info: seller_info,
      
      // Метаданные источника
      source_metadata: source_metadata
    });

    // Обработка истории цен из Inpars с нормализацией
    if (Array.isArray(inparsData.history) && inparsData.history.length > 0) {
      listing.price_history = ListingModel.normalizeInparsPriceHistory(inparsData.history);
    } else {
      // Если история цен пустая, создаем базовую запись с текущей ценой в дату создания
      listing.price_history = [{
        date: listing.created ? listing.created.toISOString() : new Date().toISOString(),
        price: listing.price || 0
      }];
    }

    // Вычисляем цену за м2
    if (listing.price && listing.area_total && listing.area_total > 0) {
      listing.price_per_meter = Math.round(listing.price / listing.area_total);
    }

    // Генерируем краткое наименование
    listing.generateName();

    return listing;
  }

  /**
   * Создание объявления из данных Avito парсера
   */
  static fromAvitoParser(avitoData) {
    // Нормализуем координаты
    const coordinates = ListingModel.normalizeCoordinates(avitoData.coordinates);

    // Нормализуем информацию о продавце
    const seller_info = ListingModel.normalizeSeller(avitoData, 'avito');

    // Создаем детали дома
    const house_details = {
      build_year: avitoData.construction_year || avitoData.year_built || null,
      cargo_lifts: null, // Avito не предоставляет
      passenger_lifts: null, // Avito не предоставляет
      material: avitoData.house_type || null
    };

    // Создаем метаданные источника
    const source_metadata = ListingModel.createSourceMetadata(avitoData, 'avito', 'parser');

    // Создаем модель объявления
    const listing = new ListingModel({
      // Основные поля
      external_id: String(avitoData.external_id),
      source: 'avito',
      url: avitoData.url || '',
      
      // Информация об объявлении
      title: avitoData.title || '',
      description: avitoData.description || '',
      address: avitoData.address || '',
      coordinates: coordinates,
      
      // Характеристики недвижимости
      property_type: avitoData.property_type || '',
      area_total: avitoData.area_total || null,
      area_living: avitoData.area_living || null,
      area_kitchen: avitoData.area_kitchen || null,
      floor: avitoData.floor || null,
      floors_total: avitoData.total_floors || avitoData.floors_total || null,
      rooms: avitoData.rooms || null,
      
      // Дополнительные характеристики
      house_type: avitoData.house_type || '',
      condition: avitoData.renovation || '',
      year_built: avitoData.construction_year || null,
      has_balcony: avitoData.balcony || null,
      bathroom_type: avitoData.bathroom || '',
      ceiling_height: avitoData.ceiling_height || null,
      
      // Цена
      price: avitoData.price || null,
      
      // Фотографии
      photos: Array.isArray(avitoData.photos) ? avitoData.photos : [],
      photos_count: avitoData.photos_count || (Array.isArray(avitoData.photos) ? avitoData.photos.length : 0),
      
      // Контакты (обратная совместимость)
      seller_name: avitoData.seller_name || '',
      seller_type: avitoData.seller_type || '',
      phone: avitoData.phone || '',
      
      // Даты
      listing_date: avitoData.listing_date ? new Date(avitoData.listing_date) : null,
      last_update_date: avitoData.last_update_date ? new Date(avitoData.last_update_date) : null,
      
      // Статусы
      status: avitoData.status || 'active',
      processing_status: 'address_needed',
      
      // Дополнительные данные
      views_count: avitoData.views_count || null,
      is_premium: avitoData.is_premium || false,
      
      // Новые поля специфичные для Avito
      renovation_type: avitoData.renovation || null,
      bathroom_details: avitoData.bathroom || null,
      balcony_details: avitoData.balcony || null,
      parsed_at: avitoData.parsed_at ? new Date(avitoData.parsed_at) : new Date(),
      
      // Детали дома
      house_details: house_details,
      
      // Унифицированная информация о продавце
      seller_info: seller_info,
      
      // Метаданные источника
      source_metadata: source_metadata
    });

    // Обработка истории цен из Avito с нормализацией
    if (Array.isArray(avitoData.price_history) && avitoData.price_history.length > 0) {
      listing.price_history = ListingModel.normalizeAvitoPriceHistory(avitoData.price_history);
    }

    // Вычисляем цену за м2
    if (listing.price && listing.area_total && listing.area_total > 0) {
      listing.price_per_meter = Math.round(listing.price / listing.area_total);
    }

    // Генерируем краткое наименование
    listing.generateName();

    return listing;
  }

  /**
   * Нормализация координат к стандарту GeoJSON
   */
  static normalizeCoordinates(coords) {
    if (!coords) return { lat: null, lng: null };
    
    return {
      lat: coords.lat || coords.latitude || null,
      lng: coords.lng || coords.lon || coords.longitude || null
    };
  }

  /**
   * Нормализация истории цен от Inpars
   */
  static normalizeInparsPriceHistory(inparsHistory) {
    if (!Array.isArray(inparsHistory)) return [];
    
    return inparsHistory.map(item => ({
      date: new Date(item.date).toISOString(),
      price: parseFloat(item.cost) || 0,
      change_amount: null,
      change_type: null,
      is_publication: false,
      source_data: {
        raw_data: item,
        phones: item.phones || [],
        phone_protected: item.phoneProtected || false
      }
    }));
  }

  /**
   * Нормализация истории цен от Avito
   */
  static normalizeAvitoPriceHistory(avitoHistory) {
    if (!Array.isArray(avitoHistory)) return [];
    
    return avitoHistory.map(item => ({
      date: new Date(item.timestamp || item.fullDate).toISOString(),
      price: parseFloat((item.price || '').replace(/[^0-9]/g, '')) || 0,
      change_amount: item.change ? parseFloat((item.change || '').replace(/[^0-9]/g, '')) : null,
      change_type: item.changeType || null,
      is_publication: item.isPublication || false,
      source_data: {
        raw_price: item.price,
        raw_date: item.date,
        full_date: item.fullDate,
        timestamp: item.timestamp
      }
    }));
  }

  /**
   * Нормализация информации о продавце
   */
  static normalizeSeller(sellerData, source) {
    const result = {
      name: sellerData.name || sellerData.seller_name || null,
      type: null,
      is_agent: false,
      phone: sellerData.phone || (sellerData.phones && sellerData.phones[0]) || null,
      phone_protected: sellerData.phoneProtected || sellerData.phone_protected || null
    };
    
    if (source === 'inpars') {
      // Поле agent теперь имеет значения: 0 - собственник, 1 - агент, 2 - застройщик
      result.type = sellerData.agent === 0 ? 'owner' :
                   sellerData.agent === 1 ? 'agent' :
                   sellerData.agent === 2 ? 'developer' : 'owner';
      result.is_agent = sellerData.agent === 1 || sellerData.agent === 2;
    } else if (source === 'avito' || source === 'cian') {
      const type = (sellerData.seller_type || '').toLowerCase();
      if (type === 'частное лицо' || type === 'owner') {
        result.type = 'owner';
        result.is_agent = false;
      } else if (type.includes('агент') || type === 'agent') {
        result.type = 'agent';
        result.is_agent = true;
      } else if (type.includes('агентство') || type === 'agency') {
        result.type = 'agency';
        result.is_agent = true;
      } else {
        result.type = 'agent'; // По умолчанию агент для неизвестных типов
        result.is_agent = true;
      }
    }
    
    return result;
  }

  /**
   * Универсальный маппинг полей между источниками
   */
  static mapField(sourceData, fieldName, source) {
    const FIELD_MAPPING = {
      'floors_total': {
        'inpars': 'floors',
        'avito': 'total_floors',
        'cian': 'floors_total',
        'default': 'floors_total'
      },
      'area_total': {
        'inpars': 'sq',
        'avito': 'area_total',
        'cian': 'area_total',
        'default': 'area_total'
      },
      'year_built': {
        'inpars': 'house.buildYear',
        'avito': 'construction_year',
        'cian': 'year_built',
        'default': 'year_built'
      },
      'coordinates.lng': {
        'inpars': 'lng',
        'avito': 'lng',
        'cian': 'lng',
        'default': 'lng'
      }
    };

    const mapping = FIELD_MAPPING[fieldName];
    if (!mapping) return sourceData[fieldName];
    
    const sourceField = mapping[source] || mapping.default;
    
    // Поддержка nested полей (house.buildYear)
    if (sourceField.includes('.')) {
      return sourceField.split('.').reduce((obj, key) => obj && obj[key], sourceData);
    }
    
    return sourceData[sourceField];
  }

  /**
   * Создание метаданных источника
   */
  static createSourceMetadata(sourceData, source, method = 'unknown') {
    return {
      original_source: source,
      source_method: method,
      original_id: sourceData.external_id || sourceData.parseId || sourceData.id,
      source_internal_id: sourceData.sourceId || null,
      import_date: new Date(),
      last_sync_date: null,
      sync_errors: []
    };
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
class RealEstateObjectModel {
  constructor(data = {}) {
    // Основные поля
    this.id = data.id || null;
    this.address_id = data.address_id || null; // Связь с адресом
    
    // Агрегированные характеристики
    this.property_type = data.property_type || null; // Преобладающий тип
    this.area_total = data.area_total || null; // Минимальная площадь
    this.area_living = data.area_living || null; // Минимальная жилая
    this.area_kitchen = data.area_kitchen || null; // Минимальная кухня
    this.floor = data.floor || null; // Преобладающий этаж
    this.floors_total = data.floors_total || null; // Из адреса
    this.rooms = data.rooms || null; // Из типа недвижимости
    
    // Статус объекта
    this.status = data.status || 'active'; // 'active' | 'archive'
    
    // Ценовая информация
    this.current_price = data.current_price || null; // Текущая цена
    this.price_per_meter = data.price_per_meter || null; // Цена за м²
    
    // Объединенная история цен
    this.price_history = data.price_history || [];
    
    // Количество объявлений
    this.listings_count = data.listings_count || 0;
    this.active_listings_count = data.active_listings_count || 0;
    
    // Статус наличия объявлений от собственника
    this.owner_status = data.owner_status || 'только от агентов'; // 'есть от собственника' | 'было от собственника' | 'только от агентов'
    
    // Временные метки (от первого и последнего объявления)
    this.created = data.created || null; // Дата создания первого объявления
    this.updated = data.updated || null; // Дата обновления последнего обновления
    
    // Метаданные
    this.last_recalculated_at = data.last_recalculated_at || null;
    this.calculation_errors = data.calculation_errors || [];
    
    // Служебные поля
    this.created_at = data.created_at || new Date(); // Дата создания записи в БД
    this.updated_at = data.updated_at || new Date(); // Дата обновления записи в БД
  }

  /**
   * Пересчитывает характеристики объекта на основе связанных объявлений
   */
  async recalculateFromListings(listings) {
    if (!listings || listings.length === 0) return;
    
    try {
      // 1. Определяем преобладающий тип недвижимости
      this.property_type = this.calculateDominantPropertyType(listings);
      
      // 2. Выбираем минимальные площади
      this.area_total = this.calculateMinArea(listings, 'area_total');
      this.area_living = this.calculateMinArea(listings, 'area_living');
      this.area_kitchen = this.calculateMinArea(listings, 'area_kitchen');
      
      // 3. Определяем преобладающий этаж
      this.floor = this.calculateDominantFloor(listings);
      
      // 4. Определяем этажность из адреса (берем из первого объявления)
      this.floors_total = listings[0].floors_total || null;
      
      // 5. Определяем количество комнат из типа недвижимости
      this.rooms = this.getRoomsFromPropertyType(this.property_type);
      
      // 6. Обновляем временные метки (created = самая ранняя, updated = самая поздняя)
      this.updateTimestamps(listings);
      
      // 7. Объединяем историю цен из всех объявлений (включая текущие цены)
      this.mergePriceHistory(listings);
      
      // 8. Устанавливаем последнюю цену как current_price объекта
      this.updatePrices(listings);
      
      // 9. Обновляем счетчики
      this.updateCounters(listings);
      
      // 10. Определяем статус
      this.updateStatus(listings);
      
      // 11. Определяем статус собственника
      this.updateOwnerStatus(listings);
      
      this.last_recalculated_at = new Date();
      this.updated_at = new Date();
      this.calculation_errors = [];
      
    } catch (error) {
      this.calculation_errors.push({
        date: new Date(),
        error: error.message,
        listings_count: listings.length
      });
      console.error('Ошибка при пересчете характеристик объекта:', error);
    }
  }

  /**
   * Определяет преобладающий тип недвижимости
   */
  calculateDominantPropertyType(listings) {
    const typeCounts = {};
    
    listings.forEach(listing => {
      if (listing.property_type) {
        typeCounts[listing.property_type] = (typeCounts[listing.property_type] || 0) + 1;
      }
    });
    
    if (Object.keys(typeCounts).length === 0) return null;
    
    return Object.keys(typeCounts).reduce((a, b) => 
      typeCounts[a] > typeCounts[b] ? a : b
    );
  }

  /**
   * Вычисляет минимальную площадь по указанному полю
   */
  calculateMinArea(listings, areaField) {
    const areas = listings
      .map(listing => listing[areaField])
      .filter(area => area && area > 0);
    
    return areas.length > 0 ? Math.min(...areas) : null;
  }

  /**
   * Определяет преобладающий этаж (с предпочтением минимального при равенстве)
   */
  calculateDominantFloor(listings) {
    const floorCounts = {};
    
    listings.forEach(listing => {
      if (listing.floor && listing.floor > 0) {
        floorCounts[listing.floor] = (floorCounts[listing.floor] || 0) + 1;
      }
    });
    
    if (Object.keys(floorCounts).length === 0) return null;
    
    const maxCount = Math.max(...Object.values(floorCounts));
    const dominantFloors = Object.keys(floorCounts)
      .filter(floor => floorCounts[floor] === maxCount)
      .map(floor => parseInt(floor));
    
    return Math.min(...dominantFloors);
  }

  /**
   * Определяет количество комнат из типа недвижимости
   */
  getRoomsFromPropertyType(propertyType) {
    if (!propertyType) return null;
    
    const roomsMap = {
      'studio': 0,
      '1k': 1,
      '2k': 2,
      '3k': 3,
      '4k+': 4
    };
    
    return roomsMap[propertyType] || null;
  }

  /**
   * Обновляет временные метки на основе объявлений
   */
  updateTimestamps(listings) {
    const createdDates = listings
      .map(listing => listing.created) // ТОЛЬКО логические даты
      .filter(date => date)
      .map(date => new Date(date))
      .sort((a, b) => a - b);
    
    const updatedDates = listings
      .map(listing => listing.updated) // ТОЛЬКО логические даты
      .filter(date => date)
      .map(date => new Date(date))
      .sort((a, b) => b - a);
    
    // При пересборке объекта всегда пересчитываем дату создания из оставшихся объявлений
    this.created = createdDates.length > 0 ? createdDates[0] : null;
    
    // Дата обновления всегда обновляется до самой последней
    this.updated = updatedDates.length > 0 ? updatedDates[0] : null;
  }

  /**
   * Обновляет ценовую информацию
   * История уже должна быть построена методом mergePriceHistory
   */
  updatePrices(listings) {
    // current_price должна быть последней ценой из объединенной истории
    if (this.price_history && this.price_history.length > 0) {
      // История уже отсортирована по дате в mergePriceHistory, берем последний элемент
      const latestEntry = this.price_history[this.price_history.length - 1];
      this.current_price = latestEntry.price;
    } else {
      // Fallback: если истории цен нет, берем любую доступную цену
      const activeListings = listings.filter(l => l.status === 'active');
      const listingsWithPrice = activeListings.length > 0 ? activeListings : listings;
      
      let fallbackPrice = null;
      for (const listing of listingsWithPrice) {
        if (listing.price && listing.price > 0) {
          fallbackPrice = listing.price;
          break;
        }
      }
      
      this.current_price = fallbackPrice;
    }
    
    // Пересчитываем цену за м²
    if (this.current_price && this.area_total && this.area_total > 0) {
      this.price_per_meter = Math.round(this.current_price / this.area_total);
    }
  }

  /**
   * Объединяет историю цен из всех объявлений
   * Алгоритм: берем историю изменения цен всех объявлений, объединяем её, 
   * удаляем дубли, устанавливаем последнюю цену ценой объекта
   */
  mergePriceHistory(listings) {
    const allPriceHistory = [];
    
    // Шаг 1: Собираем ВСЮ ценовую информацию
    listings.forEach(listing => {
      // 1.1. Добавляем реальную историю цен из объявлений
      if (listing.price_history && listing.price_history.length > 0) {
        listing.price_history.forEach(priceEntry => {
          allPriceHistory.push({
            date: new Date(priceEntry.date),
            price: priceEntry.price,
            listing_id: listing.id,
            listing_external_id: listing.external_id,
            listing_source: listing.source,
            change_type: priceEntry.change_type || 'change'
          });
        });
      }
      
      // 1.2. Добавляем текущие цены как исторические записи
      if (listing.price && listing.price > 0) {
        // Используем ТОЛЬКО логические даты (updated или created), НЕ технические (_at)
        const priceDate = listing.updated || listing.created;
        
        if (priceDate) {
          allPriceHistory.push({
            date: new Date(priceDate),
            price: listing.price,
            listing_id: listing.id,
            listing_external_id: listing.external_id,
            listing_source: listing.source,
            change_type: 'current'
          });
        }
      }
    });
    
    // Шаг 2: Сортируем по дате
    allPriceHistory.sort((a, b) => a.date - b.date);
    
    // Шаг 3: Удаляем дубликаты (одинаковая цена в тот же день от того же объявления)
    const uniqueHistory = [];
    const seenEntries = new Set();
    
    allPriceHistory.forEach(entry => {
      // Создаем ключ для дедупликации: дата (до дня) + цена + listing_id
      const dateKey = entry.date.toISOString().split('T')[0]; // Только дата без времени
      const key = `${dateKey}-${entry.price}-${entry.listing_id}`;
      
      if (!seenEntries.has(key)) {
        seenEntries.add(key);
        uniqueHistory.push(entry);
      }
    });
    
    // Шаг 4: Финальная сортировка по дате
    uniqueHistory.sort((a, b) => a.date - b.date);
    
    this.price_history = uniqueHistory;
  }

  /**
   * Обновляет счетчики объявлений
   */
  updateCounters(listings) {
    this.listings_count = listings.length;
    this.active_listings_count = listings.filter(l => l.status === 'active').length;
  }

  /**
   * Обновляет статус объекта на основе статусов объявлений
   */
  updateStatus(listings) {
    const activeListings = listings.filter(l => l.status === 'active');
    
    if (activeListings.length > 0) {
      this.status = 'active';
    } else {
      this.status = 'archive';
    }
  }

  /**
   * Обновляет статус наличия объявлений от собственника
   */
  updateOwnerStatus(listings) {
    // Находим объявления от собственника
    const ownerListings = listings.filter(listing => {
      // Проверяем различные варианты определения собственника
      return (listing.seller_type === 'owner' || 
              listing.seller_type === 'Частное лицо' ||
              (listing.seller_info && listing.seller_info.type === 'owner') ||
              (listing.seller_info && !listing.seller_info.is_agent));
    });
    
    if (ownerListings.length === 0) {
      this.owner_status = 'только от агентов';
    } else {
      // Проверяем есть ли активные объявления от собственника
      const activeOwnerListings = ownerListings.filter(l => l.status === 'active');
      
      if (activeOwnerListings.length > 0) {
        this.owner_status = 'есть от собственника';
      } else {
        this.owner_status = 'было от собственника';
      }
    }
  }

  /**
   * Объединяет объявления в объект недвижимости
   */
  static async mergeListingsIntoObject(listings, addressId) {
    if (!listings || listings.length === 0) return null;
    
    // Создаем новый объект недвижимости
    const realEstateObject = new RealEstateObjectModel({
      address_id: addressId
    });
    
    // Пересчитываем характеристики
    await realEstateObject.recalculateFromListings(listings);
    
    // Сохраняем объект
    const savedObject = await DatabaseManager.save('objects', realEstateObject);

    // Обновляем объявления - связываем с объектом
    for (const listing of listings) {
      listing.object_id = savedObject.id;
      listing.processing_status = 'processed';
      listing.updated_at = new Date();
      await DatabaseManager.save('listings', listing);
    }

    // Инвалидируем кеш после создания объекта и обновления объявлений
    if (window.dataCacheManager) {
      await window.dataCacheManager.invalidate('objects', savedObject.id);
      await window.dataCacheManager.invalidate('listings');
    }

    return savedObject;
  }

  /**
   * Разделяет объявления из объекта недвижимости
   */
  static async splitListingsFromObject(objectId, listingIds) {
    // Получаем объект
    const realEstateObject = await DatabaseManager.getById('objects', objectId);
    if (!realEstateObject) return;
    
    // Удаляем связи с объектом у выбранных объявлений
    for (const listingId of listingIds) {
      const listing = await DatabaseManager.getById('listings', listingId);
      if (listing) {
        listing.object_id = null;
        listing.processing_status = 'duplicate_check_needed';
        listing.updated_at = new Date();
        await DatabaseManager.save('listings', listing);
      }
    }
    
    // Получаем оставшиеся объявления
    const remainingListings = await DatabaseManager.getByIndex('listings', 'object_id', objectId);
    
    if (remainingListings.length === 0) {
      // Если объявлений не осталось, удаляем объект
      await DatabaseManager.delete('objects', objectId);
    } else {
      // Пересчитываем характеристики объекта
      await realEstateObject.recalculateFromListings(remainingListings);
      await DatabaseManager.save('objects', realEstateObject);
    }

    // Инвалидируем кеш после разделения объявлений из объекта
    if (window.dataCacheManager) {
      await window.dataCacheManager.invalidate('objects', objectId);
      await window.dataCacheManager.invalidate('listings');
    }
  }

  /**
   * Обновляет объект при изменении связанного объявления
   */
  static async updateObjectOnListingChange(listingId, oldListing, newListing) {
    // Находим объект недвижимости
    const objectId = newListing.object_id || oldListing.object_id;
    if (!objectId) return;
    
    const realEstateObject = await DatabaseManager.getById('objects', objectId);
    if (!realEstateObject) return;
    
    // Получаем все связанные объявления
    const relatedListings = await DatabaseManager.getByIndex('listings', 'object_id', objectId);
    
    // Пересчитываем характеристики
    await realEstateObject.recalculateFromListings(relatedListings);
    
    // Сохраняем обновленный объект
    await DatabaseManager.save('objects', realEstateObject);

    // Инвалидируем кеш после обновления объекта
    if (window.dataCacheManager) {
      await window.dataCacheManager.invalidate('objects', listingId);
      await window.dataCacheManager.invalidate('listings');
    }
  }

  /**
   * Получает объекты недвижимости с возможностью фильтрации
   */
  static async getObjectsWithFilters(filters = {}) {
    const objects = await DatabaseManager.getAll('objects');
    
    return objects.filter(obj => {
      // Фильтр по статусу
      if (filters.status && obj.status !== filters.status) return false;
      
      // Фильтр по типу недвижимости
      if (filters.property_type && obj.property_type !== filters.property_type) return false;
      
      // Фильтр по адресу
      if (filters.address_id && obj.address_id !== filters.address_id) return false;
      
      // Фильтр по ценовому диапазону
      if (filters.price_min && obj.current_price < filters.price_min) return false;
      if (filters.price_max && obj.current_price > filters.price_max) return false;
      
      // Фильтр по количеству активных объявлений
      if (filters.min_active_listings && obj.active_listings_count < filters.min_active_listings) return false;
      
      return true;
    });
  }

  validate() {
    const errors = [];
    
    if (!this.address_id) {
      errors.push('Не указан адрес');
    }
    
    if (!this.property_type) {
      errors.push('Не определен тип недвижимости');
    }
    
    if (!this.current_price || this.current_price <= 0) {
      errors.push('Неверная цена');
    }
    
    if (this.listings_count <= 0) {
      errors.push('Объект должен содержать хотя бы одно объявление');
    }
    
    return errors;
  }
}

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

/**
 * Типы дополнительных параметров
 */
const PARAMETER_TYPES = {
  // Базовые типы
  'string': 'Строка',
  'textarea': 'Многострочный текст',
  'number': 'Число',
  'boolean': 'Да/Нет',

  // Выбор из вариантов
  'select': 'Выбор из списка',
  'multiselect': 'Множественный выбор',

  // Специальные типы
  'currency': 'Денежная сумма',
  'percentage': 'Проценты',
  'date': 'Дата',
  'rating': 'Рейтинг (1-5)',
  'range': 'Диапазон значений',

  // Расширенные типы
  'url': 'Ссылка',
  'coordinates': 'Координаты',
  'file': 'Файл/Документ'
};

/**
 * Модель дополнительного параметра
 */
class CustomParameterModel {
  constructor(data = {}) {
    this.id = data.id || null;
    this.name = data.name || '';
    this.type = data.type || 'string';
    this.options = data.options || []; // Для select/multiselect
    this.validation = data.validation || {
      required: false,
      min: null,
      max: null,
      pattern: null,
      fileTypes: []
    };
    this.display_order = data.display_order || 0;
    this.is_active = data.is_active !== undefined ? data.is_active : true;
    this.created_at = data.created_at || new Date();
    this.updated_at = data.updated_at || new Date();
  }

  validate() {
    const errors = [];

    if (!this.name.trim()) {
      errors.push('Название параметра обязательно');
    }

    if (!Object.keys(PARAMETER_TYPES).includes(this.type)) {
      errors.push('Неверный тип параметра');
    }

    // Для select/multiselect нужны опции
    if (['select', 'multiselect'].includes(this.type) && (!this.options || this.options.length === 0)) {
      errors.push('Для типа "выбор" необходимы варианты ответов');
    }

    // Валидация правил валидации
    if (this.validation) {
      if (['number', 'currency', 'percentage', 'rating'].includes(this.type)) {
        if (this.validation.min !== null && this.validation.max !== null && this.validation.min > this.validation.max) {
          errors.push('Минимальное значение не может быть больше максимального');
        }
      }

      if (this.type === 'rating' && (this.validation.min < 1 || this.validation.max > 5)) {
        errors.push('Рейтинг должен быть в диапазоне от 1 до 5');
      }
    }

    return errors;
  }

  /**
   * Получить конфигурацию типа параметра
   */
  getTypeConfig() {
    const config = {
      name: PARAMETER_TYPES[this.type] || this.type,
      supportsOptions: ['select', 'multiselect'].includes(this.type),
      supportsValidation: true,
      supportsMinMax: ['number', 'currency', 'percentage', 'rating', 'range'].includes(this.type),
      supportsPattern: ['string', 'textarea', 'url'].includes(this.type),
      supportsFileTypes: this.type === 'file',
      inputType: this.getInputType()
    };

    return config;
  }

  /**
   * Получить тип HTML input для параметра
   */
  getInputType() {
    const inputTypes = {
      'string': 'text',
      'textarea': 'textarea',
      'number': 'number',
      'currency': 'number',
      'percentage': 'number',
      'boolean': 'checkbox',
      'select': 'select',
      'multiselect': 'select',
      'date': 'date',
      'rating': 'range',
      'range': 'text', // специальный компонент
      'url': 'url',
      'coordinates': 'text', // специальный компонент
      'file': 'file'
    };

    return inputTypes[this.type] || 'text';
  }
}

/**
 * Модель значения дополнительного параметра объекта
 */
class ObjectCustomValueModel {
  constructor(data = {}) {
    this.id = data.id || null;
    this.object_id = data.object_id || null;
    this.parameter_id = data.parameter_id || null;
    this.value = data.value;
    this.created_at = data.created_at || new Date();
    this.updated_at = data.updated_at || new Date();
  }

  validate(parameter = null) {
    const errors = [];

    if (!this.object_id) {
      errors.push('ID объекта обязателен');
    }

    if (!this.parameter_id) {
      errors.push('ID параметра обязателен');
    }

    // Валидация значения по типу параметра
    if (parameter) {
      const valueErrors = this.validateValueByType(parameter);
      errors.push(...valueErrors);
    }

    return errors;
  }

  /**
   * Валидация значения по типу параметра
   */
  validateValueByType(parameter) {
    const errors = [];
    const { type, validation, options } = parameter;

    // Проверка обязательности
    if (validation && validation.required && this.isEmptyValue()) {
      errors.push(`Параметр "${parameter.name}" обязателен для заполнения`);
      return errors; // Если поле обязательно, но пусто, дальше не проверяем
    }

    // Если значение пустое и поле не обязательно, пропускаем валидацию
    if (this.isEmptyValue()) {
      return errors;
    }

    switch (type) {
      case 'string':
      case 'textarea':
        if (typeof this.value !== 'string') {
          errors.push('Значение должно быть строкой');
        } else if (validation && validation.pattern) {
          const regex = new RegExp(validation.pattern);
          if (!regex.test(this.value)) {
            errors.push('Значение не соответствует требуемому формату');
          }
        }
        break;

      case 'number':
      case 'currency':
      case 'percentage':
        const numValue = Number(this.value);
        if (isNaN(numValue)) {
          errors.push('Значение должно быть числом');
        } else {
          if (validation && validation.min !== null && numValue < validation.min) {
            errors.push(`Значение не может быть меньше ${validation.min}`);
          }
          if (validation && validation.max !== null && numValue > validation.max) {
            errors.push(`Значение не может быть больше ${validation.max}`);
          }
        }
        break;

      case 'boolean':
        if (typeof this.value !== 'boolean') {
          errors.push('Значение должно быть true или false');
        }
        break;

      case 'select':
        if (!options || !options.includes(this.value)) {
          errors.push('Выберите одно из предложенных значений');
        }
        break;

      case 'multiselect':
        if (!Array.isArray(this.value)) {
          errors.push('Значение должно быть массивом');
        } else {
          for (const val of this.value) {
            if (!options || !options.includes(val)) {
              errors.push(`Значение "${val}" не входит в список допустимых`);
              break;
            }
          }
        }
        break;

      case 'date':
        const dateValue = new Date(this.value);
        if (isNaN(dateValue.getTime())) {
          errors.push('Неверный формат даты');
        }
        break;

      case 'rating':
        const ratingValue = Number(this.value);
        if (isNaN(ratingValue) || ratingValue < 1 || ratingValue > 5) {
          errors.push('Рейтинг должен быть числом от 1 до 5');
        }
        break;

      case 'range':
        if (typeof this.value === 'object' && this.value.min !== undefined && this.value.max !== undefined) {
          const min = Number(this.value.min);
          const max = Number(this.value.max);
          if (isNaN(min) || isNaN(max)) {
            errors.push('Диапазон должен содержать числовые значения');
          } else if (min > max) {
            errors.push('Минимальное значение не может быть больше максимального');
          }
        } else {
          errors.push('Диапазон должен содержать минимальное и максимальное значения');
        }
        break;

      case 'url':
        try {
          new URL(this.value);
        } catch {
          errors.push('Неверный формат URL');
        }
        break;

      case 'coordinates':
        if (typeof this.value === 'object' && this.value.lat !== undefined && this.value.lng !== undefined) {
          const lat = Number(this.value.lat);
          const lng = Number(this.value.lng);
          if (isNaN(lat) || isNaN(lng)) {
            errors.push('Координаты должны быть числами');
          } else if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
            errors.push('Неверные координаты');
          }
        } else {
          errors.push('Координаты должны содержать широту и долготу');
        }
        break;

      case 'file':
        if (typeof this.value !== 'object' || !this.value.name) {
          errors.push('Неверный формат файла');
        } else if (validation && validation.fileTypes && validation.fileTypes.length > 0) {
          const fileExtension = this.value.name.split('.').pop().toLowerCase();
          if (!validation.fileTypes.includes(fileExtension)) {
            errors.push(`Допустимые типы файлов: ${validation.fileTypes.join(', ')}`);
          }
        }
        break;
    }

    return errors;
  }

  /**
   * Проверка на пустое значение
   */
  isEmptyValue() {
    if (this.value === null || this.value === undefined) {
      return true;
    }

    if (typeof this.value === 'string' && this.value.trim() === '') {
      return true;
    }

    if (Array.isArray(this.value) && this.value.length === 0) {
      return true;
    }

    return false;
  }

  /**
   * Форматирование значения для отображения
   */
  formatDisplayValue(parameter = null) {
    if (this.isEmptyValue()) {
      return '';
    }

    if (!parameter) {
      return String(this.value);
    }

    switch (parameter.type) {
      case 'boolean':
        return this.value ? 'Да' : 'Нет';

      case 'currency':
        return new Intl.NumberFormat('ru-RU', {
          style: 'currency',
          currency: 'RUB'
        }).format(this.value);

      case 'percentage':
        return `${this.value}%`;

      case 'date':
        return new Date(this.value).toLocaleDateString('ru-RU');

      case 'rating':
        return '★'.repeat(this.value) + '☆'.repeat(5 - this.value);

      case 'range':
        return `${this.value.min} - ${this.value.max}`;

      case 'multiselect':
        return Array.isArray(this.value) ? this.value.join(', ') : this.value;

      case 'coordinates':
        return `${this.value.lat}, ${this.value.lng}`;

      case 'file':
        return this.value.name || 'Файл';

      default:
        return String(this.value);
    }
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
    InparsCategoryModel,
    CustomParameterModel,
    ObjectCustomValueModel,
    PARAMETER_TYPES
  };
}

// Экспорт в window для доступа из других скриптов
if (typeof window !== 'undefined') {
  window.MapAreaModel = MapAreaModel;
  window.AddressModel = AddressModel;
  window.SegmentModel = SegmentModel;
  window.ListingModel = ListingModel;
  window.RealEstateObjectModel = RealEstateObjectModel;
  window.CustomParameterModel = CustomParameterModel;
  window.ObjectCustomValueModel = ObjectCustomValueModel;
  window.PARAMETER_TYPES = PARAMETER_TYPES;
}