/**
 * Database.js - IndexedDB wrapper для Chrome Extension Neocenka
 * Полная версия со всеми методами
 */

// Проверяем, не был ли класс уже объявлен
if (typeof NeocenkaDB === 'undefined') {

class NeocenkaDB {
  constructor() {
    this.dbName = 'NeocenkaDB';
    this.version = 26; // Версия 26: добавлены таблицы custom_parameters и object_custom_values для дополнительных параметров объектов
    this.db = null;
  }

  /**
   * Инициализация базы данных
   */
  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);

      request.onerror = () => {
        console.error('Database error:', request.error);
        reject(request.error);
      };

      request.onsuccess = async () => {
        this.db = request.result;
        
        // Запускаем миграцию данных к версии 14 (если необходимо)
        try {
          const migrationFlag = await this.getSetting('migration_v14_completed');
          if (!migrationFlag) {
            await this.migrateListingsToV14();
            await this.setSetting('migration_v14_completed', true);
          }
        } catch (error) {
          console.warn('Warning: Could not migrate data to version 14:', error);
        }
        
        // Запускаем миграцию данных к версии 19 (добавление поля house_problem_id в addresses)
        try {
          const migrationV19Flag = await this.getSetting('migration_v19_completed');
          if (!migrationV19Flag) {
            await this.migrateAddressesToV19();
            await this.setSetting('migration_v19_completed', true);
          }
        } catch (error) {
          console.warn('Warning: Could not migrate addresses to version 19:', error);
        }
        
        // Запускаем миграцию данных к версии 20 (добавление новых полей и изменение чекбоксов)
        try {
          const migrationV20Flag = await this.getSetting('migration_v20_completed');
          if (!migrationV20Flag) {
            await this.migrateAddressesToV20();
            await this.setSetting('migration_v20_completed', true);
          }
        } catch (error) {
          console.warn('Warning: Could not migrate addresses to version 20:', error);
        }
        
        // Запускаем миграцию данных к версии 21 (добавление полей commercial_spaces, ceiling_height, comment)
        try {
          const migrationV21Flag = await this.getSetting('migration_v21_completed');
          if (!migrationV21Flag) {
            await this.migrateAddressesToV21();
            await this.setSetting('migration_v21_completed', true);
          }
        } catch (error) {
          console.warn('Warning: Could not migrate addresses to version 21:', error);
        }
        
        // Инициализируем справочники по умолчанию с задержкой
        try {
          await this.initDefaultData();
        } catch (error) {
          console.warn('Warning: Could not initialize default data:', error);
        }
        
        resolve();
      };

      request.onupgradeneeded = (event) => {
        this.db = event.target.result;
        this.createStores();
      };
    });
  }

  /**
   * Создание хранилищ данных
   */
  createStores() {
    // Map Areas store
    if (!this.db.objectStoreNames.contains('map_areas')) {
      const mapAreasStore = this.db.createObjectStore('map_areas', { keyPath: 'id' });
      mapAreasStore.createIndex('name', 'name', { unique: false });
      mapAreasStore.createIndex('created_at', 'created_at', { unique: false });
    }

    // Addresses store
    if (!this.db.objectStoreNames.contains('addresses')) {
      const addressesStore = this.db.createObjectStore('addresses', { keyPath: 'id' });
      addressesStore.createIndex('address', 'address', { unique: false });
      addressesStore.createIndex('type', 'type', { unique: false });
      addressesStore.createIndex('coordinates', ['coordinates.lat', 'coordinates.lng'], { unique: false });
      addressesStore.createIndex('created_at', 'created_at', { unique: false });
    }

    // Segments store
    if (!this.db.objectStoreNames.contains('segments')) {
      const segmentsStore = this.db.createObjectStore('segments', { keyPath: 'id' });
      segmentsStore.createIndex('name', 'name', { unique: false });
      segmentsStore.createIndex('map_area_id', 'map_area_id', { unique: false });
      segmentsStore.createIndex('created_at', 'created_at', { unique: false });
    }

    // Subsegments store
    if (!this.db.objectStoreNames.contains('subsegments')) {
      const subsegmentsStore = this.db.createObjectStore('subsegments', { keyPath: 'id' });
      subsegmentsStore.createIndex('name', 'name', { unique: false });
      subsegmentsStore.createIndex('segment_id', 'segment_id', { unique: false });
      subsegmentsStore.createIndex('property_type', 'property_type', { unique: false });
      subsegmentsStore.createIndex('created_at', 'created_at', { unique: false });
    }

    // Listings store (версия 14: добавлены индексы для дат объявлений)
    if (!this.db.objectStoreNames.contains('listings')) {
      const listingsStore = this.db.createObjectStore('listings', { keyPath: 'id' });
    
    // Основные индексы (совместимость с версией 11)
    listingsStore.createIndex('address_id', 'address_id', { unique: false });
    listingsStore.createIndex('external_id', 'external_id', { unique: false });
    listingsStore.createIndex('source', 'source', { unique: false });
    listingsStore.createIndex('status', 'status', { unique: false });
    listingsStore.createIndex('processing_status', 'processing_status', { unique: false });
    listingsStore.createIndex('created_at', 'created_at', { unique: false });
    listingsStore.createIndex('price', 'price', { unique: false });
    listingsStore.createIndex('property_type', 'property_type', { unique: false });
    listingsStore.createIndex('object_id', 'object_id', { unique: false });

    // Новые индексы для полей версии 12
    listingsStore.createIndex('region_id', 'region_id', { unique: false });
    listingsStore.createIndex('city_id', 'city_id', { unique: false });
    listingsStore.createIndex('metro_id', 'metro_id', { unique: false });
    listingsStore.createIndex('operation_type', 'operation_type', { unique: false });
    listingsStore.createIndex('section_id', 'section_id', { unique: false });
    listingsStore.createIndex('category_id', 'category_id', { unique: false });
    listingsStore.createIndex('original_source_id', 'original_source_id', { unique: false });
    listingsStore.createIndex('is_new_building', 'is_new_building', { unique: false });
    listingsStore.createIndex('is_apartments', 'is_apartments', { unique: false });
    listingsStore.createIndex('parsed_at', 'parsed_at', { unique: false });

    // Составные индексы для эффективного поиска
    listingsStore.createIndex('source_external', ['source', 'external_id'], { unique: false });
    listingsStore.createIndex('operation_property', ['operation_type', 'property_type'], { unique: false });
    listingsStore.createIndex('region_city', ['region_id', 'city_id'], { unique: false });
    listingsStore.createIndex('source_metadata_original', ['source_metadata.original_source'], { unique: false });
    
    // Индекс для поиска дублей по URL (уникальный идентификатор объявления)
    listingsStore.createIndex('url', 'url', { unique: false });
    
    // Индексы для дат объявлений из внешних источников (версия 14)
    listingsStore.createIndex('created', 'created', { unique: false });
    listingsStore.createIndex('updated', 'updated', { unique: false });
    
    // Составные индексы для анализа по датам
    listingsStore.createIndex('source_created', ['source', 'created'], { unique: false });
    listingsStore.createIndex('source_updated', ['source', 'updated'], { unique: false });
    }

    // Objects store (обновленная структура для объектов недвижимости)
    if (!this.db.objectStoreNames.contains('objects')) {
      const objectsStore = this.db.createObjectStore('objects', { keyPath: 'id' });
      
      // Основные индексы
      objectsStore.createIndex('address_id', 'address_id', { unique: false });
      objectsStore.createIndex('status', 'status', { unique: false });
      objectsStore.createIndex('property_type', 'property_type', { unique: false });
      objectsStore.createIndex('created_at', 'created_at', { unique: false });
      
      // Новые индексы для RealEstateObjectModel
      objectsStore.createIndex('current_price', 'current_price', { unique: false });
      objectsStore.createIndex('price_per_meter', 'price_per_meter', { unique: false });
      objectsStore.createIndex('area_total', 'area_total', { unique: false });
      objectsStore.createIndex('floor', 'floor', { unique: false });
      objectsStore.createIndex('floors_total', 'floors_total', { unique: false });
      objectsStore.createIndex('listings_count', 'listings_count', { unique: false });
      objectsStore.createIndex('active_listings_count', 'active_listings_count', { unique: false });
      objectsStore.createIndex('rooms', 'rooms', { unique: false });
      objectsStore.createIndex('owner_status', 'owner_status', { unique: false });
      
      // Индексы для временных меток
      objectsStore.createIndex('created', 'created', { unique: false });
      objectsStore.createIndex('updated', 'updated', { unique: false });
      objectsStore.createIndex('last_recalculated_at', 'last_recalculated_at', { unique: false });
      
      // Составные индексы для эффективного поиска
      objectsStore.createIndex('address_status', ['address_id', 'status'], { unique: false });
      objectsStore.createIndex('property_price', ['property_type', 'current_price'], { unique: false });
      objectsStore.createIndex('property_status', ['property_type', 'status'], { unique: false });
      objectsStore.createIndex('status_active_count', ['status', 'active_listings_count'], { unique: false });
      objectsStore.createIndex('price_area', ['current_price', 'area_total'], { unique: false });
    }

    // Reports store
    if (!this.db.objectStoreNames.contains('reports')) {
      const reportsStore = this.db.createObjectStore('reports', { keyPath: 'id' });
      reportsStore.createIndex('segment_id', 'segment_id', { unique: false });
      reportsStore.createIndex('created_at', 'created_at', { unique: false });
    }

    // Wall materials store (справочник материалов стен)
    if (!this.db.objectStoreNames.contains('wall_materials')) {
      const wallMaterialsStore = this.db.createObjectStore('wall_materials', { keyPath: 'id' });
      wallMaterialsStore.createIndex('name', 'name', { unique: true });
      wallMaterialsStore.createIndex('created_at', 'created_at', { unique: false });
    }

    // House classes store (справочник классов домов)
    if (!this.db.objectStoreNames.contains('house_classes')) {
      const houseClassesStore = this.db.createObjectStore('house_classes', { keyPath: 'id' });
      houseClassesStore.createIndex('name', 'name', { unique: true });
      houseClassesStore.createIndex('created_at', 'created_at', { unique: false });
    }

    // House series store (справочник серий домов)
    if (!this.db.objectStoreNames.contains('house_series')) {
      const houseSeriesStore = this.db.createObjectStore('house_series', { keyPath: 'id' });
      houseSeriesStore.createIndex('name', 'name', { unique: true });
      houseSeriesStore.createIndex('created_at', 'created_at', { unique: false });
    }

    // Ceiling materials store (справочник материалов перекрытий)
    if (!this.db.objectStoreNames.contains('ceiling_materials')) {
      const ceilingMaterialsStore = this.db.createObjectStore('ceiling_materials', { keyPath: 'id' });
      ceilingMaterialsStore.createIndex('name', 'name', { unique: true });
      ceilingMaterialsStore.createIndex('created_at', 'created_at', { unique: false });
    }

    // House problems store (справочник проблем домов)
    if (!this.db.objectStoreNames.contains('house_problems')) {
      const houseProblemsStore = this.db.createObjectStore('house_problems', { keyPath: 'id' });
      houseProblemsStore.createIndex('name', 'name', { unique: true });
      houseProblemsStore.createIndex('created_at', 'created_at', { unique: false });
    }

    // Inpars categories store (справочник категорий Inpars)
    if (!this.db.objectStoreNames.contains('inpars_categories')) {
      const inparsCategoriesStore = this.db.createObjectStore('inpars_categories', { keyPath: 'id' });
      inparsCategoriesStore.createIndex('inpars_id', 'inpars_id', { unique: true });
      inparsCategoriesStore.createIndex('name', 'name', { unique: false });
      inparsCategoriesStore.createIndex('parent_id', 'parent_id', { unique: false });
      inparsCategoriesStore.createIndex('section_id', 'section_id', { unique: false });
      inparsCategoriesStore.createIndex('type_id', 'type_id', { unique: false });
      inparsCategoriesStore.createIndex('is_active', 'is_active', { unique: false });
      inparsCategoriesStore.createIndex('imported_at', 'imported_at', { unique: false });
      inparsCategoriesStore.createIndex('created_at', 'created_at', { unique: false });
    }

    // Settings store
    if (!this.db.objectStoreNames.contains('settings')) {
      this.db.createObjectStore('settings', { keyPath: 'key' });
    }

    // Saved Reports store (версия 22: сохранённые отчёты с фильтрами и сравнительным анализом)
    if (!this.db.objectStoreNames.contains('saved_reports')) {
      const savedReportsStore = this.db.createObjectStore('saved_reports', { keyPath: 'id' });
      savedReportsStore.createIndex('name', 'name', { unique: false });
      savedReportsStore.createIndex('area_id', 'area_id', { unique: false });
      savedReportsStore.createIndex('created_at', 'created_at', { unique: false });
    }

    // Custom Parameters store (версия 26: справочник дополнительных параметров)
    if (!this.db.objectStoreNames.contains('custom_parameters')) {
      const customParametersStore = this.db.createObjectStore('custom_parameters', { keyPath: 'id' });
      customParametersStore.createIndex('name', 'name', { unique: false });
      customParametersStore.createIndex('type', 'type', { unique: false });
      customParametersStore.createIndex('is_active', 'is_active', { unique: false });
      customParametersStore.createIndex('display_order', 'display_order', { unique: false });
      customParametersStore.createIndex('created_at', 'created_at', { unique: false });
    }

    // Object Custom Values store (версия 26: значения дополнительных параметров для объектов)
    if (!this.db.objectStoreNames.contains('object_custom_values')) {
      const objectCustomValuesStore = this.db.createObjectStore('object_custom_values', { keyPath: 'id' });
      objectCustomValuesStore.createIndex('object_id', 'object_id', { unique: false });
      objectCustomValuesStore.createIndex('parameter_id', 'parameter_id', { unique: false });
      objectCustomValuesStore.createIndex('object_parameter', ['object_id', 'parameter_id'], { unique: true });
      objectCustomValuesStore.createIndex('created_at', 'created_at', { unique: false });
    }

  }

  /**
   * Миграция данных объявлений к версии 14
   */
  async migrateListingsToV14() {
    try {
      const existingListings = await this.getAll('listings');
      if (existingListings.length === 0) return;

      let migratedCount = 0;
      let skippedCount = 0;

      for (const listing of existingListings) {
        try {
          // Проверяем, нужна ли миграция (если новые поля уже есть, пропускаем)
          if (listing.source_metadata && listing.source_metadata.original_source) {
            skippedCount++;
            continue;
          }

          // Создаем новые поля для объявления
          const migratedListing = { ...listing };

          // Нормализуем координаты к стандарту GeoJSON
          if (listing.coordinates && listing.coordinates.lon !== undefined) {
            migratedListing.coordinates = {
              lat: listing.coordinates.lat,
              lng: listing.coordinates.lon // lon -> lng
            };
          }

          // Добавляем новые поля с дефолтными значениями
          migratedListing.region_id = null;
          migratedListing.city_id = null;
          migratedListing.metro_id = null;
          migratedListing.operation_type = 'sale'; // По умолчанию продажа
          migratedListing.section_id = null;
          migratedListing.category_id = null;
          migratedListing.original_source_id = listing.external_id;
          migratedListing.phone_protected = null;
          migratedListing.is_new_building = null;
          migratedListing.is_apartments = null;

          // Создаем house_details из существующих данных
          migratedListing.house_details = {
            build_year: listing.year_built || null,
            cargo_lifts: null,
            passenger_lifts: null,
            material: listing.house_type || null
          };

          // Добавляем поля специфичные для Avito
          migratedListing.renovation_type = listing.condition || null;
          migratedListing.bathroom_details = listing.bathroom_type || null;
          migratedListing.balcony_details = listing.has_balcony || null;
          migratedListing.parsed_at = listing.created_at;

          // Создаем унифицированную информацию о продавце
          migratedListing.seller_info = {
            name: listing.seller_name || null,
            type: this.normalizeLegacySellerType(listing.seller_type),
            is_agent: this.isLegacySellerAgent(listing.seller_type),
            phone: listing.phone || null,
            phone_protected: null
          };

          // Создаем метаданные источника
          migratedListing.source_metadata = {
            original_source: listing.source || 'unknown',
            source_method: 'parser', // Большинство существующих данных от парсера
            original_id: listing.external_id,
            source_internal_id: null,
            import_date: listing.created_at || new Date(),
            last_sync_date: null,
            sync_errors: []
          };

          // Обновляем запись в БД
          await this.update('listings', migratedListing);
          migratedCount++;

        } catch (error) {
          console.warn(`Failed to migrate listing ${listing.id}:`, error);
        }
      }

      
    } catch (error) {
      console.error('Failed to migrate listings to version 14:', error);
    }
  }

  /**
   * Миграция адресов к версии 19 (добавление поля house_problem_id)
   */
  async migrateAddressesToV19() {
    try {
      const existingAddresses = await this.getAll('addresses');
      if (existingAddresses.length === 0) return;

      let migratedCount = 0;
      let skippedCount = 0;

      for (const address of existingAddresses) {
        try {
          // Проверяем, нужна ли миграция (если поле уже есть, пропускаем)
          if (address.house_problem_id !== undefined) {
            skippedCount++;
            continue;
          }

          // Создаем обновленный адрес с новым полем
          const migratedAddress = { 
            ...address,
            house_problem_id: null // По умолчанию нет проблемы
          };

          // Обновляем запись в БД
          await this.update('addresses', migratedAddress);
          migratedCount++;

        } catch (error) {
          console.warn(`Failed to migrate address ${address.id}:`, error);
        }
      }

      
    } catch (error) {
      console.error('Failed to migrate addresses to version 19:', error);
    }
  }

  /**
   * Миграция адресов к версии 20
   * Добавляет новые поля: closed_territory, underground_parking
   * Конвертирует playground и sports_ground из boolean в select (0-не указано, 1-да, 2-нет)
   */
  async migrateAddressesToV20() {
    try {
      const existingAddresses = await this.getAll('addresses');
      if (existingAddresses.length === 0) return;

      let migratedCount = 0;
      let skippedCount = 0;

      for (const address of existingAddresses) {
        try {
          // Проверяем, нужна ли миграция (если новые поля уже есть, пропускаем)
          if (address.closed_territory !== undefined && address.underground_parking !== undefined) {
            skippedCount++;
            continue;
          }

          // Конвертируем playground и sports_ground из boolean в select
          let playground = 0; // По умолчанию "Не указано"
          if (address.playground === true) {
            playground = 1; // "Да"
          } else if (address.playground === false) {
            playground = 2; // "Нет"
          }

          let sportsGround = 0; // По умолчанию "Не указано"
          if (address.sports_ground === true) {
            sportsGround = 1; // "Да"
          } else if (address.sports_ground === false) {
            sportsGround = 2; // "Нет"
          }

          // Создаем обновленный адрес с новыми полями
          const migratedAddress = { 
            ...address,
            closed_territory: 0, // По умолчанию "Не указано"
            underground_parking: 0, // По умолчанию "Не указано"
            playground: playground,
            sports_ground: sportsGround
          };

          // Обновляем запись в БД
          await this.update('addresses', migratedAddress);
          migratedCount++;

        } catch (error) {
          console.warn(`Failed to migrate address ${address.id}:`, error);
        }
      }

      
    } catch (error) {
      console.error('Failed to migrate addresses to version 20:', error);
    }
  }

  /**
   * Миграция адресов к версии 21 (добавление полей commercial_spaces, ceiling_height, comment)
   */
  async migrateAddressesToV21() {
    try {
      const existingAddresses = await this.getAll('addresses');
      
      if (existingAddresses.length === 0) {
        return;
      }


      let migratedCount = 0;
      let skippedCount = 0;

      for (const address of existingAddresses) {
        // Проверяем, нужно ли мигрировать этот адрес
        if (address.commercial_spaces !== undefined && 
            address.ceiling_height !== undefined && 
            address.comment !== undefined) {
          skippedCount++;
          continue;
        }

        const updatedAddress = {
          ...address,
          commercial_spaces: address.commercial_spaces !== undefined ? address.commercial_spaces : 0, // 0 = "Не указано"
          ceiling_height: address.ceiling_height || null, // Текстовое поле
          comment: address.comment || '' // Пустая строка по умолчанию
        };

        await this.update('addresses', updatedAddress);
        migratedCount++;
      }

      
    } catch (error) {
      console.error('Failed to migrate addresses to version 21:', error);
      throw error;
    }
  }

  /**
   * Нормализация устаревших типов продавцов
   */
  normalizeLegacySellerType(legacyType) {
    if (!legacyType) return 'unknown';
    
    const type = legacyType.toLowerCase();
    if (type === 'частное лицо' || type === 'owner') {
      return 'owner';
    } else if (type.includes('агент') || type === 'agent') {
      return 'agent';
    } else if (type.includes('агентство') || type === 'agency') {
      return 'agency';
    }
    return 'agent'; // По умолчанию агент
  }

  /**
   * Определение является ли продавец агентом по устаревшему типу
   */
  isLegacySellerAgent(legacyType) {
    if (!legacyType) return true;
    
    const type = legacyType.toLowerCase();
    return !(type === 'частное лицо' || type === 'owner');
  }

  /**
   * Универсальный метод добавления записи
   */
  async add(storeName, data) {
    if (!this.db) {
      console.warn(`База данных не инициализирована для операции add(${storeName})`);
      return null;
    }
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);

      if (!data.id) {
        data.id = this.generateId();
      }

      if (!data.created_at) {
        data.created_at = new Date();
      }
      data.updated_at = new Date();

      const request = store.add(data);

      request.onsuccess = () => {
        resolve(data);
      };

      request.onerror = () => {
        console.error(`Error adding record to ${storeName}:`, request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Метод обновления записи
   */
  async update(storeName, data) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);

      data.updated_at = new Date();

      const request = store.put(data);

      request.onsuccess = () => {
        resolve(data);
      };

      request.onerror = () => {
        console.error(`Error updating record in ${storeName}:`, request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Метод добавления или обновления записи (upsert)
   * Используется для импорта данных, чтобы избежать конфликтов
   */
  async put(storeName, data) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);

      // Если нет ID, генерируем новый
      if (!data.id) {
        data.id = this.generateId();
      }

      if (!data.created_at) {
        data.created_at = new Date();
      }
      data.updated_at = new Date();

      const request = store.put(data);

      request.onsuccess = () => {
        resolve(data);
      };

      request.onerror = () => {
        console.error(`❌ Ошибка добавления/обновления записи в ${storeName}:`, request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Получение записи по ID
   */
  async get(storeName, id) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([storeName], 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.get(id);

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onerror = () => {
        console.error(`Error getting record from ${storeName}:`, request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Получение всех записей из хранилища
   */
  async getAll(storeName) {
    if (!this.db) {
      console.warn(`База данных не инициализирована для операции getAll(${storeName})`);
      return [];
    }
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([storeName], 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.getAll();

      request.onsuccess = () => {
        resolve(request.result || []);
      };

      request.onerror = () => {
        console.error(`Error getting all records from ${storeName}:`, request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Удаление записи
   */
  async delete(storeName, id) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.delete(id);

      request.onsuccess = () => {
        resolve();
      };

      request.onerror = () => {
        console.error(`Error deleting record from ${storeName}:`, request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Поиск записей по индексу
   */
  async getByIndex(storeName, indexName, value) {
    if (!this.db) {
      console.error(`❌ Database.getByIndex: База данных не инициализирована для операции getByIndex(${storeName})`);
      return [];
    }

    if (storeName === 'custom_parameters' && indexName === 'is_active') {
      console.log(`🔍 Database.getByIndex: Поиск в ${storeName} по индексу ${indexName} = ${value} (type: ${typeof value})`);
    }

    return new Promise((resolve, reject) => {
      try {
        const transaction = this.db.transaction([storeName], 'readonly');
        const store = transaction.objectStore(storeName);
        const index = store.index(indexName);
        const request = index.getAll(value);

      request.onsuccess = () => {
        if (storeName === 'custom_parameters' && indexName === 'is_active') {
          console.log(`🔍 Database.getByIndex: Найдено ${request.result?.length || 0} записей`, request.result);
        }
        resolve(request.result || []);
      };

        request.onerror = () => {
          console.error(`Error getting records by index from ${storeName}:`, request.error);
          reject(request.error);
        };
      } catch (error) {
        console.error(`❌ Database.getByIndex: Ошибка транзакции для ${storeName}:`, error);
        reject(error);
      }
    });
  }

  // ===== МЕТОДЫ ДЛЯ ОБЛАСТЕЙ НА КАРТЕ =====

  async getMapAreas() {
    return this.getAll('map_areas');
  }

  async addMapArea(mapAreaData) {
    return this.add('map_areas', mapAreaData);
  }

  async updateMapArea(mapAreaData) {
    return this.update('map_areas', mapAreaData);
  }

  async getMapArea(mapAreaId) {
    return this.get('map_areas', mapAreaId);
  }

  async deleteMapArea(mapAreaId) {
    return this.delete('map_areas', mapAreaId);
  }

  // ===== МЕТОДЫ ДЛЯ АДРЕСОВ =====

  async getAddresses() {
    return this.getAll('addresses');
  }

  async addAddress(addressData) {
    return this.add('addresses', addressData);
  }

  async updateAddress(addressData) {
    return this.update('addresses', addressData);
  }

  async getAddress(addressId) {
    return this.get('addresses', addressId);
  }

  async deleteAddress(addressId) {
    return this.delete('addresses', addressId);
  }

  async getAddressesByType(type) {
    return this.getByIndex('addresses', 'type', type);
  }

  // ===== МЕТОДЫ ДЛЯ СЕГМЕНТОВ =====

  async getSegments() {
    return this.getAll('segments');
  }

  async addSegment(segmentData) {
    return this.add('segments', segmentData);
  }

  async updateSegment(segmentData) {
    return this.update('segments', segmentData);
  }

  async getSegment(segmentId) {
    return this.get('segments', segmentId);
  }

  async deleteSegment(segmentId) {
    return this.delete('segments', segmentId);
  }

  async getSegmentsByMapArea(mapAreaId) {
    try {
      return await this.getByIndex('segments', 'map_area_id', mapAreaId);
    } catch (error) {
      if (error.name === 'NotFoundError') {
        console.warn('Index map_area_id not found, filtering manually');
        // Если индекс не найден, делаем ручную фильтрацию
        const allSegments = await this.getSegments();
        return allSegments.filter(segment => segment.map_area_id === mapAreaId);
      }
      throw error;
    }
  }

  // ===== МЕТОДЫ ДЛЯ ПОДСЕГМЕНТОВ =====

  async getSubsegments() {
    return this.getAll('subsegments');
  }

  async addSubsegment(subsegmentData) {
    return this.add('subsegments', subsegmentData);
  }

  async updateSubsegment(subsegmentData) {
    return this.update('subsegments', subsegmentData);
  }

  async getSubsegment(subsegmentId) {
    return this.get('subsegments', subsegmentId);
  }

  async deleteSubsegment(subsegmentId) {
    return this.delete('subsegments', subsegmentId);
  }

  async getSubsegmentsBySegment(segmentId) {
    return this.getByIndex('subsegments', 'segment_id', segmentId);
  }

  // ===== МЕТОДЫ ДЛЯ ОБЪЯВЛЕНИЙ =====

  async getListings() {
    return this.getAll('listings');
  }

  async addListing(listingData) {
    const result = await this.add('listings', listingData);

    // Инвалидируем кэш объявлений
    if (window.dataCacheManager) {
      await window.dataCacheManager.invalidate('listings', result.id || listingData.id);
      // Если объявление связано с объектом, инвалидируем кэш объектов
      if (listingData.object_id) {
        await window.dataCacheManager.invalidate('objects', listingData.object_id);
      }
    }

    return result;
  }

  async updateListing(listingData) {
    const result = await this.update('listings', listingData);

    // Инвалидируем кэш объявлений
    if (window.dataCacheManager) {
      await window.dataCacheManager.invalidate('listings', listingData.id);
      // Если объявление связано с объектом, инвалидируем кэш объектов
      if (listingData.object_id) {
        await window.dataCacheManager.invalidate('objects', listingData.object_id);
      }
    }

    return result;
  }

  async getListing(listingId) {
    return this.get('listings', listingId);
  }

  async deleteListing(listingId) {
    return this.delete('listings', listingId);
  }

  /**
   * Поиск объявления по external_id и source
   */
  async getListingByExternalId(source, externalId) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['listings'], 'readonly');
      const store = transaction.objectStore('listings');
      const index = store.index('source_external');
      const searchKey = [source, externalId];
      
      const request = index.get(searchKey);

      request.onsuccess = () => {
        const result = request.result || null;
        resolve(result);
      };

      request.onerror = () => {
        console.error('❌ Database: Ошибка поиска объявления:', request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Поиск объявления по URL (более надежный способ для избежания дублей)
   */
  async getListingByUrl(url) {
    return new Promise((resolve, reject) => {
      try {
        const transaction = this.db.transaction(['listings'], 'readonly');
        const store = transaction.objectStore('listings');
        
        // Проверяем существование индекса
        if (!store.indexNames.contains('url')) {
          console.warn('⚠️ URL index not found, falling back to getListingByExternalId');
          // Фолбек: ищем по всем записям (медленно, но работает)
          const getAllRequest = store.getAll();
          getAllRequest.onsuccess = () => {
            const allListings = getAllRequest.result || [];
            const foundListing = allListings.find(listing => listing.url === url);
            resolve(foundListing || null);
          };
          getAllRequest.onerror = () => {
            console.error('❌ Database: Ошибка получения всех объявлений:', getAllRequest.error);
            reject(getAllRequest.error);
          };
          return;
        }
        
        const index = store.index('url');
        const request = index.get(url);

        request.onsuccess = () => {
          const result = request.result || null;
          resolve(result);
        };

        request.onerror = () => {
          console.error('❌ Database: Ошибка поиска объявления по URL:', request.error);
          reject(request.error);
        };
      } catch (error) {
        console.error('❌ Database: Критическая ошибка в getListingByUrl:', error);
        reject(error);
      }
    });
  }

  async getListingsByAddress(addressId) {
    return this.getByIndex('listings', 'address_id', addressId);
  }

  async getListingsByPropertyType(propertyType) {
    return this.getByIndex('listings', 'property_type', propertyType);
  }

  async getListingsByStatus(status) {
    return this.getByIndex('listings', 'status', status);
  }

  async getListingsBySegment(segmentId) {
    // Получаем все адреса в сегменте через область
    const segment = await this.getSegment(segmentId);
    if (!segment) return [];
    
    // Получаем все адреса в области сегмента
    const addresses = await this.getAddressesInMapArea(segment.map_area_id);
    if (addresses.length === 0) return [];
    
    // Получаем все объявления для этих адресов
    const listings = [];
    for (const address of addresses) {
      const addressListings = await this.getListingsByAddress(address.id);
      listings.push(...addressListings);
    }
    
    return listings;
  }

  /**
   * Обновление цены объявления с добавлением в историю
   */
  async updateListingPrice(listingId, newPrice) {
    try {
      const listing = await this.get('listings', listingId);
      if (!listing) {
        throw new Error('Listing not found');
      }

      const oldPrice = listing.price;

      listing.price = newPrice;
      listing.updated_at = new Date();
      listing.last_seen = new Date();

      if (oldPrice !== newPrice) {
        if (!listing.price_history) {
          listing.price_history = [];
        }

        listing.price_history.push({
          date: new Date(),
          old_price: oldPrice,
          new_price: newPrice
        });

      }

      const result = await this.update('listings', listing);

      // Инвалидируем кэш объявлений
      if (window.dataCacheManager) {
        await window.dataCacheManager.invalidate('listings', listingId);
        if (listing.object_id) {
          await window.dataCacheManager.invalidate('objects', listing.object_id);
        }
      }

      return result;
    } catch (error) {
      console.error('Error updating listing price:', error);
      throw error;
    }
  }

  /**
   * Массовое сохранение объявлений с проверкой дублей по URL
   */
  async saveListings(listings) {
    if (!Array.isArray(listings) || listings.length === 0) {
      return { added: 0, updated: 0, skipped: 0 };
    }

    let added = 0;
    let updated = 0;
    let skipped = 0;
    
    
    for (const listing of listings) {
      try {
        if (!listing.url) {
          console.warn('Skipping listing without URL:', listing.external_id);
          skipped++;
          continue;
        }

        // Ищем существующее объявление по URL (более надежно, чем по external_id)
        const existingListing = await this.getListingByUrl(listing.url);
        
        if (existingListing) {
          // Обновляем существующее объявление
          const oldPrice = existingListing.price;
          const newPrice = listing.price;

          // Обновляем основные поля (БЕЗ прямого изменения price)
          existingListing.updated_at = new Date();
          existingListing.last_seen = new Date();
          
          // Объединяем данные из разных источников
          if (listing.source === 'inpars') {
            // Добавляем Inpars-специфичные поля
            existingListing.region_id = listing.region_id || existingListing.region_id;
            existingListing.city_id = listing.city_id || existingListing.city_id;
            existingListing.metro_id = listing.metro_id || existingListing.metro_id;
            existingListing.operation_type = listing.operation_type || existingListing.operation_type;
            existingListing.section_id = listing.section_id || existingListing.section_id;
            existingListing.category_id = listing.category_id || existingListing.category_id;
            
            // ВАЖНО: Сохраняем source_metadata, особенно original_source
            if (listing.source_metadata) {
              if (!existingListing.source_metadata) {
                existingListing.source_metadata = {};
              }
              // Сохраняем original_source только если он еще не установлен
              // НЕ перезаписываем если уже есть конкретный источник (avito.ru, cian.ru и т.д.)
              if (!existingListing.source_metadata.original_source) {
                existingListing.source_metadata.original_source = listing.source_metadata.original_source;
              }
              existingListing.source_metadata.source_method = listing.source_metadata.source_method;
              existingListing.source_metadata.import_date = listing.source_metadata.import_date;
            }
          }
          
          // Объединяем историю цен (КЛЮЧЕВАЯ ЧАСТЬ)
          if (listing.price_history && listing.price_history.length > 0) {
            if (!existingListing.price_history) {
              existingListing.price_history = [];
            }
            
            // Добавляем новые записи истории, избегая дублей по дате
            for (const historyItem of listing.price_history) {
              const existingHistoryItem = existingListing.price_history.find(
                existing => existing.date === historyItem.date
              );
              if (!existingHistoryItem) {
                existingListing.price_history.push(historyItem);
              }
            }
            
            // Сортируем историю по дате (новые записи в конце)
            existingListing.price_history.sort((a, b) => new Date(a.date) - new Date(b.date));
          }
          
          // Добавляем запись в историю цен при изменении цены
          if (oldPrice !== newPrice && newPrice) {
            if (!existingListing.price_history) {
              existingListing.price_history = [];
            }
            
            existingListing.price_history.push({
              date: new Date().toISOString(),
              price: newPrice,
              change_amount: oldPrice ? (newPrice - oldPrice) : null,
              change_type: oldPrice ? (newPrice > oldPrice ? 'increase' : 'decrease') : null,
              is_publication: false,
              source_data: {
                updated_from: listing.source,
                old_price: oldPrice,
                update_timestamp: new Date().toISOString()
              }
            });
          }

          // ПРАВИЛЬНЫЙ ПОДХОД: Обновляем текущую цену из истории цен
          this.updateCurrentPriceFromHistory(existingListing);

          await this.updateListing(existingListing);
          updated++;
          
        } else {
          // Добавляем новое объявление со всей историей цен
          await this.addListing(listing);
          added++;
          
        }
      } catch (error) {
        console.error(`Error saving listing ${listing.external_id}:`, error);
        skipped++;
      }
    }
    
    const result = { added, updated, skipped };
    return result;
  }


  // ===== МЕТОДЫ ДЛЯ ОТЧЕТОВ =====

  async getReports() {
    return this.getAll('reports');
  }

  async addReport(reportData) {
    return this.add('reports', reportData);
  }

  async updateReport(reportData) {
    return this.update('reports', reportData);
  }

  async deleteReport(reportId) {
    return this.delete('reports', reportId);
  }

  async getReportsBySegment(segmentId) {
    return this.getByIndex('reports', 'segment_id', segmentId);
  }

  // ===== МЕТОДЫ ДЛЯ НАСТРОЕК =====

  async getSetting(key) {
    const setting = await this.get('settings', key);
    return setting ? setting.value : null;
  }

  async setSetting(key, value) {
    const settingData = {
      key: key,
      value: value,
      updated_at: new Date()
    };

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['settings'], 'readwrite');
      const store = transaction.objectStore('settings');
      const request = store.put(settingData);

      request.onsuccess = () => {
        resolve(settingData);
      };

      request.onerror = () => {
        console.error(`Error updating setting ${key}:`, request.error);
        reject(request.error);
      };
    });
  }

  async getAllSettings() {
    const settings = await this.getAll('settings');
    const result = {};
    settings.forEach(setting => {
      result[setting.key] = setting.value;
    });
    return result;
  }

  // ===== МЕТОДЫ ДЛЯ СОХРАНЁННЫХ ОТЧЁТОВ =====

  /**
   * Сохранение отчёта или шаблона фильтра
   */
  async saveSavedReport(reportData) {
    const reportWithId = {
      id: reportData.id || Date.now().toString(),
      name: reportData.name,
      area_id: reportData.area_id,
      type: reportData.type || 'full_report', // 'full_report' или 'filter_template'
      filter_template_id: reportData.filter_template_id || null, // ID связанного шаблона для отчётов
      filters: reportData.filters || {},
      comparative_analysis: reportData.comparative_analysis || null,
      charts_data: reportData.charts_data || null,
      flipping_data: reportData.flipping_data || null, // ✅ ДОБАВЛЕНО: Данные флиппинг отчёта
      duplicates_data: reportData.duplicates_data || null, // ✅ ДОБАВЛЕНО: Данные дублей
      created_at: reportData.created_at || new Date().toISOString()
    };

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['saved_reports'], 'readwrite');
      const store = transaction.objectStore('saved_reports');
      const request = store.put(reportWithId);

      request.onsuccess = () => {
        resolve(reportWithId);
      };

      request.onerror = () => {
        console.error('Error saving report:', request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Получение всех сохранённых отчётов для области
   */
  async getSavedReportsByArea(areaId) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['saved_reports'], 'readonly');
      const store = transaction.objectStore('saved_reports');
      const index = store.index('area_id');
      const request = index.getAll(areaId);

      request.onsuccess = () => {
        // Сортируем по дате создания (новые сверху)
        const reports = request.result.sort((a, b) => 
          new Date(b.created_at) - new Date(a.created_at)
        );
        resolve(reports);
      };

      request.onerror = () => {
        console.error('Error getting reports by area:', request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Получение отчёта по ID
   */
  async getSavedReport(reportId) {
    return this.get('saved_reports', reportId);
  }

  /**
   * Удаление отчёта
   */
  async deleteSavedReport(reportId) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['saved_reports'], 'readwrite');
      const store = transaction.objectStore('saved_reports');
      const request = store.delete(reportId);

      request.onsuccess = () => {
        resolve();
      };

      request.onerror = () => {
        console.error('Error deleting report:', request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Получение всех сохранённых отчётов
   */
  async getAllSavedReports() {
    return this.getAll('saved_reports');
  }

  /**
   * Получение шаблонов фильтров для области
   */
  async getFilterTemplatesByArea(areaId) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['saved_reports'], 'readonly');
      const store = transaction.objectStore('saved_reports');
      const index = store.index('area_id');
      const request = index.getAll(areaId);

      request.onsuccess = () => {
        // Фильтруем только шаблоны фильтров и сортируем по дате создания
        const filterTemplates = request.result
          .filter(item => item.type === 'filter_template')
          .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        resolve(filterTemplates);
      };

      request.onerror = () => {
        console.error('Error getting filter templates by area:', request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Получение полных отчётов для области
   */
  async getFullReportsByArea(areaId) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['saved_reports'], 'readonly');
      const store = transaction.objectStore('saved_reports');
      const index = store.index('area_id');
      const request = index.getAll(areaId);

      request.onsuccess = () => {
        // Фильтруем только полные отчёты и сортируем по дате создания
        const fullReports = request.result
          .filter(item => item.type === 'full_report' || !item.type) // для совместимости со старыми записями
          .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        resolve(fullReports);
      };

      request.onerror = () => {
        console.error('Error getting full reports by area:', request.error);
        reject(request.error);
      };
    });
  }


  // ===== СТАТИСТИЧЕСКИЕ МЕТОДЫ =====

  async getSegmentStats(segmentId) {
    try {
      const listings = await this.getListingsBySegment(segmentId);
      const objects = await this.getObjectsBySegment(segmentId);

      const activeListings = listings.filter(l => l.status === 'active');
      const archivedListings = listings.filter(l => l.status === 'archived');
      const needsProcessing = listings.filter(l => l.status === 'needs_processing');

      const prices = activeListings.map(l => l.price).filter(p => p > 0);
      const avgPrice = prices.length > 0 ? prices.reduce((a, b) => a + b, 0) / prices.length : 0;
      const minPrice = prices.length > 0 ? Math.min(...prices) : 0;
      const maxPrice = prices.length > 0 ? Math.max(...prices) : 0;

      return {
        totalListings: listings.length,
        activeListings: activeListings.length,
        archivedListings: archivedListings.length,
        needsProcessing: needsProcessing.length,
        totalObjects: objects.length,
        avgPrice: Math.round(avgPrice),
        minPrice: minPrice,
        maxPrice: maxPrice,
        priceRange: maxPrice - minPrice
      };
    } catch (error) {
      console.error('Error getting segment stats:', error);
      throw error;
    }
  }

  async getOverallStats() {
    try {
      const segments = await this.getSegments();
      const listings = await this.getListings();
      const objects = await this.getObjects();

      const activeListings = listings.filter(l => l.status === 'active');
      const archivedListings = listings.filter(l => l.status === 'archived');

      return {
        totalSegments: segments.length,
        totalListings: listings.length,
        activeListings: activeListings.length,
        archivedListings: archivedListings.length,
        totalObjects: objects.length
      };
    } catch (error) {
      console.error('Error getting overall stats:', error);
      throw error;
    }
  }

  // ===== МЕТОДЫ ОЧИСТКИ И ЭКСПОРТА =====

  async clearAllData() {
    const stores = ['map_areas', 'addresses', 'segments', 'subsegments', 'listings', 'objects', 'reports'];

    for (const storeName of stores) {
      await new Promise((resolve, reject) => {
        const transaction = this.db.transaction([storeName], 'readwrite');
        const store = transaction.objectStore(storeName);
        const request = store.clear();

        request.onsuccess = () => {
          resolve();
        };

        request.onerror = () => {
          console.error(`Error clearing store ${storeName}:`, request.error);
          reject(request.error);
        };
      });
    }

  }

  /**
   * Очистка конкретной таблицы
   */
  async clear(storeName) {
    return new Promise((resolve, reject) => {
      try {
        const transaction = this.db.transaction([storeName], 'readwrite');
        const store = transaction.objectStore(storeName);
        const request = store.clear();

        request.onsuccess = () => {
          resolve();
        };

        request.onerror = () => {
          console.error(`❌ Ошибка очистки таблицы ${storeName}:`, request.error);
          reject(request.error);
        };
      } catch (error) {
        console.error(`❌ Критическая ошибка в clear(${storeName}):`, error);
        reject(error);
      }
    });
  }

  async exportData() {
    try {
      const data = {
        timestamp: new Date().toISOString(),
        map_areas: await this.getMapAreas(),
        addresses: await this.getAddresses(),
        segments: await this.getSegments(),
        subsegments: await this.getSubsegments(),
        listings: await this.getListings(),
        objects: await this.getObjects(),
        reports: await this.getReports(),
        settings: await this.getAllSettings()
      };

      return data;
    } catch (error) {
      console.error('Error exporting data:', error);
      throw error;
    }
  }

  /**
   * Полный экспорт всех данных в JSON строку
   */
  async fullExportData() {
    try {
      const data = {
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        application: 'Neocenka Extension',
        description: 'Полный экспорт базы данных: области с полигонами, адреса, настройки',
        map_areas: await this.getMapAreas(),
        addresses: await this.getAddresses(),
        segments: await this.getSegments(),
        subsegments: await this.getSubsegments(),
        listings: await this.getListings(),
        objects: await this.getObjects(),
        reports: await this.getReports(),
        settings: await this.getAllSettings(),
        
        // Справочники
        wall_materials: await this.getAll('wall_materials'),
        ceiling_materials: await this.getAll('ceiling_materials'),
        house_series: await this.getAll('house_series'),
        house_classes: await this.getAll('house_classes'),
        house_problems: await this.getAll('house_problems'),
        
        statistics: {
          total_map_areas: (await this.getMapAreas()).length,
          total_addresses: (await this.getAddresses()).length,
          total_segments: (await this.getSegments()).length,
          total_listings: (await this.getListings()).length,
          total_objects: (await this.getObjects()).length,
          total_reports: (await this.getReports()).length
        }
      };

      return JSON.stringify(data, null, 2);
    } catch (error) {
      console.error('Ошибка полного экспорта данных:', error);
      throw error;
    }
  }

  /**
   * Выборочный экспорт данных в JSON строку
   * @param {Object} options - Опции экспорта с флагами для каждого блока
   */
  async selectiveExportData(options = {}) {
    try {
      
      const data = {
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        application: 'Neocenka Extension',
        description: 'Выборочный экспорт данных Neocenka Extension',
        exportOptions: options,
        statistics: {}
      };

      // Экспортируем области с полигонами, если выбрано
      if (options.map_areas) {
        data.map_areas = await this.getMapAreas();
        data.statistics.total_map_areas = data.map_areas.length;
      }

      // Экспортируем адреса, если выбрано
      if (options.addresses) {
        data.addresses = await this.getAddresses();
        data.statistics.total_addresses = data.addresses.length;
      }

      // Экспортируем сегменты, если выбрано
      if (options.segments) {
        data.segments = await this.getSegments();
        data.subsegments = await this.getSubsegments();
        data.statistics.total_segments = data.segments.length;
        data.statistics.total_subsegments = data.subsegments.length;
      }

      // Экспортируем объявления и объекты, если выбрано
      if (options.listings) {
        data.listings = await this.getListings();
        data.objects = await this.getObjects();
        data.statistics.total_listings = data.listings.length;
        data.statistics.total_objects = data.objects.length;
      }

      // Экспортируем отчёты, если выбрано
      if (options.reports) {
        data.reports = await this.getReports();
        data.statistics.total_reports = data.reports.length;
      }

      // Экспортируем справочники, если выбрано
      if (options.references) {
        data.wall_materials = await this.getAll('wall_materials');
        data.ceiling_materials = await this.getAll('ceiling_materials');
        data.house_series = await this.getAll('house_series');
        data.house_classes = await this.getAll('house_classes');
        data.house_problems = await this.getAll('house_problems');
        
        data.statistics.total_wall_materials = data.wall_materials.length;
        data.statistics.total_ceiling_materials = data.ceiling_materials.length;
        data.statistics.total_house_series = data.house_series.length;
        data.statistics.total_house_classes = data.house_classes.length;
        data.statistics.total_house_problems = data.house_problems.length;
        
        const totalReferences = data.statistics.total_wall_materials + 
                              data.statistics.total_ceiling_materials + 
                              data.statistics.total_house_series + 
                              data.statistics.total_house_classes + 
                              data.statistics.total_house_problems;
      }

      // Экспортируем настройки, если выбрано
      if (options.settings) {
        data.settings = await this.getAllSettings();
        data.statistics.total_settings = Object.keys(data.settings).length;
      }

      return JSON.stringify(data, null, 2);
    } catch (error) {
      console.error('Ошибка выборочного экспорта данных:', error);
      throw error;
    }
  }

  async importData(data) {
    try {
      await this.clearAllData();

      if (data.map_areas) {
        for (const mapArea of data.map_areas) {
          await this.add('map_areas', mapArea);
        }
      }

      if (data.addresses) {
        for (const address of data.addresses) {
          await this.add('addresses', address);
        }
      }

      if (data.segments) {
        for (const segment of data.segments) {
          await this.add('segments', segment);
        }
      }

      if (data.subsegments) {
        for (const subsegment of data.subsegments) {
          await this.add('subsegments', subsegment);
        }
      }

      if (data.listings) {
        for (const listing of data.listings) {
          await this.add('listings', listing);
        }
      }

      if (data.objects) {
        for (const object of data.objects) {
          await this.add('objects', object);
        }
      }

      if (data.reports) {
        for (const report of data.reports) {
          await this.add('reports', report);
        }
      }

      if (data.settings) {
        for (const [key, value] of Object.entries(data.settings)) {
          await this.setSetting(key, value);
        }
      }

    } catch (error) {
      console.error('Error importing data:', error);
      throw error;
    }
  }

  /**
   * Полный импорт данных из JSON строки
   */
  async fullImportData(jsonString) {
    try {
      
      // Парсим JSON
      let data;
      try {
        data = JSON.parse(jsonString);
      } catch (parseError) {
        throw new Error('Некорректный формат JSON файла: ' + parseError.message);
      }

      // Валидация структуры данных
      if (!data.version || !data.application) {
        throw new Error('Файл не является экспортом Neocenka Extension');
      }

      if (data.application !== 'Neocenka Extension') {
        throw new Error('Файл создан другим приложением: ' + data.application);
      }

      // Получаем статистику до импорта
      const oldStats = {
        map_areas: (await this.getMapAreas()).length,
        addresses: (await this.getAddresses()).length,
        segments: (await this.getSegments()).length,
        listings: (await this.getListings()).length,
        objects: (await this.getObjects()).length,
        reports: (await this.getReports()).length
      };


      // Очищаем только те таблицы, которые будут импортированы
      if (data.wall_materials) {
        await this.clear('wall_materials');
      }
      if (data.ceiling_materials) {
        await this.clear('ceiling_materials');
      }
      if (data.house_series) {
        await this.clear('house_series');
      }
      if (data.house_classes) {
        await this.clear('house_classes');
      }
      if (data.house_problems) {
        await this.clear('house_problems');
      }
      if (data.map_areas) {
        await this.clear('map_areas');
      }
      if (data.addresses) {
        await this.clear('addresses');
      }
      if (data.segments) {
        await this.clear('segments');
      }
      if (data.subsegments) {
        await this.clear('subsegments');
      }
      if (data.listings) {
        await this.clear('listings');
      }
      if (data.objects) {
        await this.clear('objects');
      }
      if (data.reports) {
        await this.clear('reports');
      }

      let importStats = {
        map_areas: 0,
        addresses: 0,
        segments: 0,
        subsegments: 0,
        listings: 0,
        objects: 0,
        reports: 0,
        wall_materials: 0,
        ceiling_materials: 0,
        house_series: 0,
        house_classes: 0,
        house_problems: 0,
        settings: 0
      };

      // Импортируем справочники первыми
      if (data.wall_materials) {
        for (const item of data.wall_materials) {
          await this.put('wall_materials', item);
          importStats.wall_materials++;
        }
      }

      if (data.ceiling_materials) {
        for (const item of data.ceiling_materials) {
          await this.put('ceiling_materials', item);
          importStats.ceiling_materials++;
        }
      }

      if (data.house_series) {
        for (const item of data.house_series) {
          await this.put('house_series', item);
          importStats.house_series++;
        }
      }

      if (data.house_classes) {
        for (const item of data.house_classes) {
          await this.put('house_classes', item);
          importStats.house_classes++;
        }
      }

      if (data.house_problems) {
        for (const item of data.house_problems) {
          await this.put('house_problems', item);
          importStats.house_problems++;
        }
      }

      // Импортируем области с полигонами
      if (data.map_areas && Array.isArray(data.map_areas)) {
        for (const mapArea of data.map_areas) {
          await this.put('map_areas', mapArea);
          importStats.map_areas++;
        }
      }

      // Импортируем адреса
      if (data.addresses && Array.isArray(data.addresses)) {
        for (const address of data.addresses) {
          await this.put('addresses', address);
          importStats.addresses++;
        }
      }

      // Импортируем сегменты
      if (data.segments && Array.isArray(data.segments)) {
        for (const segment of data.segments) {
          await this.put('segments', segment);
          importStats.segments++;
        }
      }

      if (data.subsegments && Array.isArray(data.subsegments)) {
        for (const subsegment of data.subsegments) {
          await this.put('subsegments', subsegment);
          importStats.subsegments++;
        }
      }

      // Импортируем объявления и объекты
      if (data.listings && Array.isArray(data.listings)) {
        for (const listing of data.listings) {
          await this.put('listings', listing);
          importStats.listings++;
        }
      }

      if (data.objects && Array.isArray(data.objects)) {
        for (const object of data.objects) {
          await this.put('objects', object);
          importStats.objects++;
        }
      }

      // Импортируем отчёты
      if (data.reports && Array.isArray(data.reports)) {
        for (const report of data.reports) {
          await this.put('reports', report);
          importStats.reports++;
        }
      }

      // Импортируем настройки
      if (data.settings && typeof data.settings === 'object') {
        for (const [key, value] of Object.entries(data.settings)) {
          await this.setSetting(key, value);
          importStats.settings++;
        }
      }


      return {
        success: true,
        statistics: importStats,
        timestamp: data.timestamp,
        oldStats: oldStats
      };

    } catch (error) {
      console.error('❌ Ошибка полного импорта данных:', error);
      throw error;
    }
  }

  // ===== ВСПОМОГАТЕЛЬНЫЕ МЕТОДЫ =====

  generateId() {
    return 'id_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  async getDatabaseInfo() {
    try {
      const stats = await this.getOverallStats();
      const settings = await this.getAllSettings();

      return {
        dbName: this.dbName,
        version: this.version,
        isConnected: !!this.db,
        stats: stats,
        settings: settings,
        storeNames: Array.from(this.db.objectStoreNames)
      };
    } catch (error) {
      console.error('Error getting database info:', error);
      return {
        dbName: this.dbName,
        version: this.version,
        isConnected: false,
        error: error.message
      };
    }
  }

  /**
   * Инициализация справочников по умолчанию
   */
  async initDefaultData() {
    try {
      // Проверяем, что база данных инициализирована и stores созданы
      if (!this.db || !this.db.objectStoreNames.contains('wall_materials') || !this.db.objectStoreNames.contains('house_classes') || !this.db.objectStoreNames.contains('house_problems')) {
        return;
      }

      // Проверяем, есть ли уже материалы стен
      const existingMaterials = await this.getAll('wall_materials');
      
      if (existingMaterials.length === 0) {
        // Добавляем материалы стен по умолчанию
        const defaultMaterials = [
          {
            id: 'brick',
            name: 'Кирпичный',
            color: '#8B4513' // Коричневый
          },
          {
            id: 'panel',
            name: 'Панельный', 
            color: '#808080' // Серый
          },
          {
            id: 'monolith',
            name: 'Монолитный',
            color: '#cbcbc8' // Серый-бежевый
          },
          {
            id: 'blocky',
            name: 'Блочный',
            color: '#F5F5DC' // Бежевый
          }
        ];

        for (const material of defaultMaterials) {
          await this.add('wall_materials', material);
        }
        
      }

      // Проверяем и инициализируем классы домов
      const existingHouseClasses = await this.getAll('house_classes');
      
      if (existingHouseClasses.length === 0) {
        // Добавляем классы домов по умолчанию
        const defaultHouseClasses = [
          {
            id: 'id_0000001',
            name: 'Стандарт',
            color: '#6B7280' // Серый
          },
          {
            id: 'id_0000002',
            name: 'Комфорт', 
            color: '#3B82F6' // Синий
          },
          {
            id: 'id_0000003',
            name: 'Бизнес',
            color: '#059669' // Зеленый
          },
          {
            id: 'id_0000004',
            name: 'Элит',
            color: '#DC2626' // Красный
          }
        ];

        for (const houseClass of defaultHouseClasses) {
          await this.add('house_classes', houseClass);
        }
        
      }

      // Проверяем и инициализируем материалы перекрытий
      const existingCeilingMaterials = await this.getAll('ceiling_materials');
      
      if (existingCeilingMaterials.length === 0) {
        const defaultCeilingMaterials = [
          {
            id: 'reinforced_concrete',
            name: 'Железобетонное'
          },
          {
            id: 'wooden',
            name: 'Деревянное'
          }
        ];

        for (const material of defaultCeilingMaterials) {
          await this.add('ceiling_materials', material);
        }
        
      }

      // Проверяем и инициализируем проблемы домов
      const existingHouseProblems = await this.getAll('house_problems');
      
      if (existingHouseProblems.length === 0) {
        const defaultHouseProblems = [
          {
            id: 'id_0000001',
            name: 'Аварийный',
            color: '#DC2626' // Красный
          },
          {
            id: 'id_0000002',
            name: 'На стяжках',
            color: '#EA580C' // Оранжевый
          },
          {
            id: 'id_0000003',
            name: 'Под реновацию',
            color: '#CA8A04' // Желтый
          },
          {
            id: 'id_0000004',
            name: 'Плохое состояние подъездов',
            color: '#A3A3A3' // Бежевый (серый)
          }
        ];

        for (const problem of defaultHouseProblems) {
          await this.add('house_problems', problem);
        }
        
      }
      
    } catch (error) {
      console.error('Ошибка инициализации справочников:', error);
    }
  }

  // ===== МЕТОДЫ ДЛЯ КАТЕГОРИЙ INPARS =====

  /**
   * Получение всех категорий Inpars
   */
  async getInparsCategories() {
    return this.getAll('inpars_categories');
  }

  /**
   * Добавление категории Inpars
   */
  async addInparsCategory(categoryData) {
    return this.add('inpars_categories', categoryData);
  }

  /**
   * Обновление категории Inpars
   */
  async updateInparsCategory(categoryData) {
    return this.update('inpars_categories', categoryData);
  }

  /**
   * Получение категории Inpars по ID
   */
  async getInparsCategory(categoryId) {
    return this.get('inpars_categories', categoryId);
  }

  /**
   * Получение категории Inpars по Inpars ID
   */
  async getInparsCategoryByInparsId(inparsId) {
    const categories = await this.getByIndex('inpars_categories', 'inpars_id', inparsId);
    return categories.length > 0 ? categories[0] : null;
  }

  /**
   * Получение активных категорий Inpars
   */
  async getActiveInparsCategories() {
    return this.getByIndex('inpars_categories', 'is_active', true);
  }

  /**
   * Получение дочерних категорий
   */
  async getInparsCategoriesByParent(parentId) {
    if (parentId === null || parentId === undefined) {
      // Получаем корневые категории (без родителя)
      const allCategories = await this.getInparsCategories();
      return allCategories.filter(cat => !cat.parent_id);
    }
    return this.getByIndex('inpars_categories', 'parent_id', parentId);
  }

  /**
   * Получение категорий по разделу
   */
  async getInparsCategoriesBySection(sectionId) {
    return this.getByIndex('inpars_categories', 'section_id', sectionId);
  }

  /**
   * Получение категорий по типу
   */
  async getInparsCategoriesByType(typeId) {
    return this.getByIndex('inpars_categories', 'type_id', typeId);
  }

  /**
   * Получение категорий по разделу и типу
   */
  async getInparsCategoriesBySectionAndType(sectionId, typeId) {
    try {
      const allCategories = await this.getAll('inpars_categories');
      return allCategories.filter(category => {
        // Поддерживаем и snake_case и camelCase поля
        const catSectionId = category.section_id || category.sectionId;
        const catTypeId = category.type_id || category.typeId;
        return catSectionId === sectionId && catTypeId === typeId;
      });
    } catch (error) {
      console.error('Error getting categories by section and type:', error);
      return [];
    }
  }

  /**
   * Массовое сохранение категорий Inpars (для импорта)
   */
  async importInparsCategories(categoriesData) {
    try {
      const imported = [];
      const updated = [];
      const errors = [];

      for (const categoryData of categoriesData) {
        try {
          // Проверяем, существует ли категория
          const existingCategory = await this.getInparsCategoryByInparsId(categoryData.inpars_id || categoryData.id);
          
          if (existingCategory) {
            // Обновляем существующую категорию
            const updatedData = {
              ...existingCategory,
              ...categoryData,
              id: existingCategory.id, // Сохраняем внутренний ID
              inpars_id: categoryData.inpars_id || categoryData.id,
              updated_at: new Date(),
              imported_at: new Date()
            };
            
            await this.updateInparsCategory(updatedData);
            updated.push(updatedData);
          } else {
            // Создаем новую категорию
            const newCategoryData = {
              ...categoryData,
              inpars_id: categoryData.inpars_id || categoryData.id,
              imported_at: new Date()
            };
            
            const newCategory = await this.addInparsCategory(newCategoryData);
            imported.push(newCategory);
          }
        } catch (error) {
          console.error(`Ошибка импорта категории ${categoryData.name}:`, error);
          errors.push({
            category: categoryData.name,
            error: error.message
          });
        }
      }

      return {
        success: true,
        imported: imported.length,
        updated: updated.length,
        errors: errors.length,
        details: { imported, updated, errors }
      };

    } catch (error) {
      console.error('Ошибка массового импорта категорий Inpars:', error);
      return {
        success: false,
        error: error.message,
        imported: 0,
        updated: 0,
        errors: 1
      };
    }
  }

  /**
   * Удаление категории Inpars
   */
  async deleteInparsCategory(categoryId) {
    return this.delete('inpars_categories', categoryId);
  }

  /**
   * Очистка всех категорий Inpars
   */
  async clearInparsCategories() {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['inpars_categories'], 'readwrite');
      const store = transaction.objectStore('inpars_categories');
      const request = store.clear();

      request.onsuccess = () => {
        resolve();
      };

      request.onerror = () => {
        console.error('Ошибка очистки категорий Inpars:', request.error);
        reject(request.error);
      };
    });
  }

  // ===== МЕТОДЫ ДЛЯ ОБЪЕКТОВ НЕДВИЖИМОСТИ =====

  async getObjects() {
    return this.getAll('objects');
  }

  async addObject(objectData) {
    const result = await this.add('objects', objectData);

    // Инвалидируем кэш объектов
    if (window.dataCacheManager) {
      await window.dataCacheManager.invalidate('objects', result.id || objectData.id);
      // Также инвалидируем кэш объявлений, так как могут быть связанные объявления
      await window.dataCacheManager.invalidate('listings');
    }

    return result;
  }

  async updateObject(objectData) {
    const result = await this.update('objects', objectData);

    // Инвалидируем кэш объектов
    if (window.dataCacheManager) {
      await window.dataCacheManager.invalidate('objects', objectData.id);
      // Также инвалидируем кэш объявлений, так как могут быть связанные объявления
      await window.dataCacheManager.invalidate('listings');
    }

    return result;
  }

  async getObject(objectId) {
    return this.get('objects', objectId);
  }

  async deleteObject(objectId) {
    const result = await this.delete('objects', objectId);

    // Инвалидируем кэш объектов
    if (window.dataCacheManager) {
      await window.dataCacheManager.invalidate('objects', objectId);
      // Также инвалидируем кэш объявлений, так как могут быть связанные объявления
      await window.dataCacheManager.invalidate('listings');
    }

    return result;
  }

  async getObjectsByAddress(addressId) {
    return this.getByIndex('objects', 'address_id', addressId);
  }

  async getObjectsBySegment(segmentId) {
    // Получаем все адреса в сегменте через область
    const segment = await this.getSegment(segmentId);
    if (!segment) return [];
    
    // Получаем все адреса в области сегмента
    const addresses = await this.getAddressesInMapArea(segment.map_area_id);
    if (addresses.length === 0) return [];
    
    // Получаем все объекты для этих адресов
    const objects = [];
    for (const address of addresses) {
      const addressObjects = await this.getObjectsByAddress(address.id);
      objects.push(...addressObjects);
    }
    
    return objects;
  }

  async getObjectsByPropertyType(propertyType) {
    return this.getByIndex('objects', 'property_type', propertyType);
  }

  async getObjectsByStatus(status) {
    return this.getByIndex('objects', 'status', status);
  }

  async getActiveObjects() {
    return this.getObjectsByStatus('active');
  }

  async getArchivedObjects() {
    return this.getObjectsByStatus('archive');
  }

  /**
   * Получение адресов в области карты
   */
  async getAddressesInMapArea(mapAreaId) {
    try {
      const mapArea = await this.getMapArea(mapAreaId);
      if (!mapArea || !mapArea.polygon || mapArea.polygon.length === 0) {
        return [];
      }

      const allAddresses = await this.getAddresses();
      
      // Фильтруем адреса, которые попадают в полигон области
      return allAddresses.filter(address => {
        if (!address.coordinates || !address.coordinates.lat || !address.coordinates.lng) {
          return false;
        }
        
        return this.isPointInPolygon(address.coordinates, mapArea.polygon);
      });
    } catch (error) {
      console.error('Ошибка получения адресов в области:', error);
      return [];
    }
  }

  /**
   * Проверка, находится ли точка внутри полигона
   */
  isPointInPolygon(point, polygon) {
    if (!polygon || polygon.length < 3) return false;
    
    let inside = false;
    const lat = point.lat;
    const lng = point.lng;
    
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      if (((polygon[i].lat > lat) !== (polygon[j].lat > lat)) &&
          (lng < (polygon[j].lng - polygon[i].lng) * (lat - polygon[i].lat) / (polygon[j].lat - polygon[i].lat) + polygon[i].lng)) {
        inside = !inside;
      }
    }
    return inside;
  }

  /**
   * Получение статистики категорий Inpars
   */
  async getInparsCategoriesStats() {
    try {
      const allCategories = await this.getInparsCategories();
      const activeCategories = allCategories.filter(cat => cat.is_active);
      const rootCategories = allCategories.filter(cat => !cat.parent_id);
      
      // Группировка по разделам
      const sectionStats = {};
      allCategories.forEach(cat => {
        const sectionId = cat.section_id || 'unknown';
        if (!sectionStats[sectionId]) {
          sectionStats[sectionId] = 0;
        }
        sectionStats[sectionId]++;
      });

      return {
        total: allCategories.length,
        active: activeCategories.length,
        inactive: allCategories.length - activeCategories.length,
        root: rootCategories.length,
        sections: Object.keys(sectionStats).length,
        sectionStats: sectionStats,
        lastImport: allCategories.length > 0 ? 
          Math.max(...allCategories.map(cat => new Date(cat.imported_at).getTime())) : null
      };
    } catch (error) {
      console.error('Ошибка получения статистики категорий Inpars:', error);
      return {
        total: 0,
        active: 0,
        inactive: 0,
        root: 0,
        sections: 0,
        error: error.message
      };
    }
  }

  /**
   * Обновляет текущую цену объявления на основе истории цен
   * ПРАВИЛЬНЫЙ ПОДХОД: цена всегда рассчитывается из истории
   */
  updateCurrentPriceFromHistory(listing) {
    if (!listing.price_history || !Array.isArray(listing.price_history) || listing.price_history.length === 0) {
      // Если истории цен нет, оставляем текущую цену как есть
      return;
    }

    // Сортируем историю по дате (от старых к новым)
    const sortedHistory = [...listing.price_history].sort((a, b) => new Date(a.date) - new Date(b.date));

    // Берем последнюю запись как текущую цену
    const latestEntry = sortedHistory[sortedHistory.length - 1];
    const newCurrentPrice = latestEntry.price || latestEntry.new_price;

    if (newCurrentPrice && !isNaN(newCurrentPrice)) {
      listing.price = parseFloat(newCurrentPrice);

      // Пересчитываем цену за м2 если есть площадь
      if (listing.area_total && listing.area_total > 0) {
        listing.price_per_meter = Math.round(listing.price / listing.area_total);
      }
    }
  }

  // ===== МЕТОДЫ ДЛЯ ДОПОЛНИТЕЛЬНЫХ ПАРАМЕТРОВ (версия 26) =====

  /**
   * Получение всех дополнительных параметров
   */
  async getCustomParameters() {
    return this.getAll('custom_parameters');
  }

  /**
   * Получение активных дополнительных параметров
   */
  async getActiveCustomParameters() {
    try {
      // Используем альтернативный способ - получаем все параметры и фильтруем
      const allParameters = await this.getAll('custom_parameters');
      const activeParameters = allParameters.filter(param => param.is_active === true);
      console.log(`🔍 Database: getActiveCustomParameters() результат:`, activeParameters?.length || 0, activeParameters);
      return activeParameters;
    } catch (error) {
      console.error('❌ Database: Ошибка получения активных параметров:', error);
      return [];
    }
  }

  /**
   * Добавление дополнительного параметра
   */
  async addCustomParameter(parameterData) {
    // Генерируем ID если он отсутствует
    if (!parameterData.id) {
      parameterData.id = 'param_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    // Устанавливаем временные метки
    parameterData.created_at = parameterData.created_at || new Date();
    parameterData.updated_at = new Date();

    return this.add('custom_parameters', parameterData);
  }

  /**
   * Обновление дополнительного параметра
   */
  async updateCustomParameter(parameterData) {
    return this.update('custom_parameters', parameterData);
  }

  /**
   * Получение параметра по ID
   */
  async getCustomParameter(parameterId) {
    return this.get('custom_parameters', parameterId);
  }

  /**
   * Удаление дополнительного параметра
   */
  async deleteCustomParameter(parameterId) {
    // Сначала удаляем все значения этого параметра
    await this.deleteCustomValuesByParameter(parameterId);
    // Затем удаляем сам параметр
    return this.delete('custom_parameters', parameterId);
  }

  /**
   * Получение параметров по типу
   */
  async getCustomParametersByType(type) {
    return this.getByIndex('custom_parameters', 'type', type);
  }

  /**
   * Получение всех значений дополнительных параметров для объекта
   */
  async getObjectCustomValues(objectId) {
    return this.getByIndex('object_custom_values', 'object_id', objectId);
  }

  /**
   * Получение конкретного значения параметра для объекта
   */
  async getObjectCustomValue(objectId, parameterId) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['object_custom_values'], 'readonly');
      const store = transaction.objectStore('object_custom_values');
      const index = store.index('object_parameter');
      const request = index.get([objectId, parameterId]);

      request.onsuccess = () => {
        resolve(request.result || null);
      };

      request.onerror = () => {
        console.error('Error getting object custom value:', request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Установка значения дополнительного параметра для объекта
   */
  async setObjectCustomValue(objectId, parameterId, value) {
    try {
      // Проверяем, существует ли уже значение
      const existingValue = await this.getObjectCustomValue(objectId, parameterId);

      const valueData = {
        object_id: objectId,
        parameter_id: parameterId,
        value: value,
        updated_at: new Date()
      };

      if (existingValue) {
        // Обновляем существующее значение
        valueData.id = existingValue.id;
        valueData.created_at = existingValue.created_at;
        return this.update('object_custom_values', valueData);
      } else {
        // Создаем новое значение
        valueData.id = 'value_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        valueData.created_at = new Date();
        return this.add('object_custom_values', valueData);
      }
    } catch (error) {
      console.error('Error setting object custom value:', error);
      throw error;
    }
  }

  /**
   * Массовая установка значений параметров для объекта
   */
  async setObjectCustomValues(objectId, values) {
    const results = [];
    for (const [parameterId, value] of Object.entries(values)) {
      try {
        const result = await this.setObjectCustomValue(objectId, parameterId, value);
        results.push(result);
      } catch (error) {
        console.error(`Error setting value for parameter ${parameterId}:`, error);
      }
    }
    return results;
  }

  /**
   * Удаление значения дополнительного параметра для объекта
   */
  async deleteObjectCustomValue(objectId, parameterId) {
    try {
      const existingValue = await this.getObjectCustomValue(objectId, parameterId);
      if (existingValue) {
        return this.delete('object_custom_values', existingValue.id);
      }
      return null;
    } catch (error) {
      console.error('Error deleting object custom value:', error);
      throw error;
    }
  }

  /**
   * Удаление всех значений дополнительных параметров для объекта
   */
  async deleteAllObjectCustomValues(objectId) {
    try {
      const values = await this.getObjectCustomValues(objectId);
      const results = [];
      for (const value of values) {
        const result = await this.delete('object_custom_values', value.id);
        results.push(result);
      }
      return results;
    } catch (error) {
      console.error('Error deleting all object custom values:', error);
      throw error;
    }
  }

  /**
   * Удаление всех значений конкретного параметра
   */
  async deleteCustomValuesByParameter(parameterId) {
    try {
      const values = await this.getByIndex('object_custom_values', 'parameter_id', parameterId);
      const results = [];
      for (const value of values) {
        const result = await this.delete('object_custom_values', value.id);
        results.push(result);
      }
      return results;
    } catch (error) {
      console.error('Error deleting custom values by parameter:', error);
      throw error;
    }
  }

  /**
   * Получение всех значений конкретного параметра
   */
  async getValuesByCustomParameter(parameterId) {
    return this.getByIndex('object_custom_values', 'parameter_id', parameterId);
  }

  /**
   * Получение статистики использования дополнительных параметров
   */
  async getCustomParametersStats() {
    try {
      const parameters = await this.getCustomParameters();
      const stats = {
        total: parameters.length,
        active: 0,
        byType: {}
      };

      for (const parameter of parameters) {
        if (parameter.is_active) {
          stats.active++;
        }

        if (!stats.byType[parameter.type]) {
          stats.byType[parameter.type] = 0;
        }
        stats.byType[parameter.type]++;
      }

      return stats;
    } catch (error) {
      console.error('Error getting custom parameters stats:', error);
      return { total: 0, active: 0, byType: {} };
    }
  }

  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}

// Создаем глобальный экземпляр базы данных
let db = null;

if (typeof window !== 'undefined') {
  // В браузерном контексте (content scripts, popup, pages)
  if (typeof window.db === 'undefined') {
    db = new NeocenkaDB();
    window.db = db;
    
    // Инициализируем базу данных при загрузке
    db.init().then(() => {
      // console.log('✅ База данных инициализирована успешно');
      window.dbReady = true;
    }).catch(error => {
      console.error('❌ Database initialization failed:', error);
      window.dbReady = false;
    });
  }
}

// Экспортируем для использования в других модулях
if (typeof module !== 'undefined' && module.exports) {
  module.exports = db;
}

} // Закрываем проверку typeof NeocenkaDB