/**
 * Database.js - IndexedDB wrapper для Chrome Extension Neocenka
 * Полная версия со всеми методами
 */

class NeocenkaDB {
  constructor() {
    this.dbName = 'NeocenkaDB';
    this.version = 11; // Увеличиваем версию для добавления полей точности определения адреса
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
        // console.log('Database opened successfully');
        
        // Инициализируем справочники по умолчанию с задержкой
        try {
          await this.initDefaultData();
        } catch (error) {
          console.warn('Warning: Could not initialize default data:', error);
        }
        
        resolve();
      };

      request.onupgradeneeded = (event) => {
        // console.log('Database upgrade needed');
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

    // Segments store (принудительное пересоздание)
    if (this.db.objectStoreNames.contains('segments')) {
      this.db.deleteObjectStore('segments');
    }
    const segmentsStore = this.db.createObjectStore('segments', { keyPath: 'id' });
    segmentsStore.createIndex('name', 'name', { unique: false });
    segmentsStore.createIndex('map_area_id', 'map_area_id', { unique: false });
    segmentsStore.createIndex('created_at', 'created_at', { unique: false });

    // Subsegments store
    if (!this.db.objectStoreNames.contains('subsegments')) {
      const subsegmentsStore = this.db.createObjectStore('subsegments', { keyPath: 'id' });
      subsegmentsStore.createIndex('name', 'name', { unique: false });
      subsegmentsStore.createIndex('segment_id', 'segment_id', { unique: false });
      subsegmentsStore.createIndex('property_type', 'property_type', { unique: false });
      subsegmentsStore.createIndex('created_at', 'created_at', { unique: false });
    }

    // Listings store (принудительное пересоздание для новых индексов)
    if (this.db.objectStoreNames.contains('listings')) {
      this.db.deleteObjectStore('listings');
    }
    const listingsStore = this.db.createObjectStore('listings', { keyPath: 'id' });
    listingsStore.createIndex('address_id', 'address_id', { unique: false });
    listingsStore.createIndex('external_id', 'external_id', { unique: false });
    listingsStore.createIndex('source', 'source', { unique: false });
    listingsStore.createIndex('status', 'status', { unique: false });
    listingsStore.createIndex('processing_status', 'processing_status', { unique: false });
    listingsStore.createIndex('created_at', 'created_at', { unique: false });
    listingsStore.createIndex('price', 'price', { unique: false });
    listingsStore.createIndex('property_type', 'property_type', { unique: false });

    // Составной индекс для поиска дублей
    listingsStore.createIndex('source_external', ['source', 'external_id'], { unique: false });

    // Objects store (обновленная структура)
    if (!this.db.objectStoreNames.contains('objects')) {
      const objectsStore = this.db.createObjectStore('objects', { keyPath: 'id' });
      objectsStore.createIndex('address_id', 'address_id', { unique: false });
      objectsStore.createIndex('status', 'status', { unique: false });
      objectsStore.createIndex('property_type', 'property_type', { unique: false });
      objectsStore.createIndex('created_at', 'created_at', { unique: false });
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

    // console.log('Database stores created/updated');
  }

  /**
   * Универсальный метод добавления записи
   */
  async add(storeName, data) {
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
        // console.log(`Added record to ${storeName}:`, data);
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
        // console.log(`Updated record in ${storeName}:`, data);
        resolve(data);
      };

      request.onerror = () => {
        console.error(`Error updating record in ${storeName}:`, request.error);
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
        // console.log(`Deleted record from ${storeName}:`, id);
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
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([storeName], 'readonly');
      const store = transaction.objectStore(storeName);
      const index = store.index(indexName);
      const request = index.getAll(value);

      request.onsuccess = () => {
        resolve(request.result || []);
      };

      request.onerror = () => {
        console.error(`Error getting records by index from ${storeName}:`, request.error);
        reject(request.error);
      };
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
    return this.add('listings', listingData);
  }

  async updateListing(listingData) {
    return this.update('listings', listingData);
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

  async getListingsByAddress(addressId) {
    return this.getByIndex('listings', 'address_id', addressId);
  }

  async getListingsByPropertyType(propertyType) {
    return this.getByIndex('listings', 'property_type', propertyType);
  }

  async getListingsByStatus(status) {
    return this.getByIndex('listings', 'status', status);
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

        // console.log(`Price updated for listing ${listingId}: ${oldPrice} → ${newPrice}`);
      }

      return this.update('listings', listing);
    } catch (error) {
      console.error('Error updating listing price:', error);
      throw error;
    }
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
        // console.log(`Setting updated: ${key} = ${value}`);
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
          // console.log(`Cleared store: ${storeName}`);
          resolve();
        };

        request.onerror = () => {
          console.error(`Error clearing store ${storeName}:`, request.error);
          reject(request.error);
        };
      });
    }

    // console.log('All data cleared');
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

      // console.log('Data imported successfully');
    } catch (error) {
      console.error('Error importing data:', error);
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
      if (!this.db || !this.db.objectStoreNames.contains('wall_materials')) {
        console.log('Database stores not ready yet, skipping default data initialization');
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
        
        console.log('Инициализированы материалы стен по умолчанию');
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
        
        console.log('Инициализированы материалы перекрытий по умолчанию');
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
        console.log('Категории Inpars очищены');
        resolve();
      };

      request.onerror = () => {
        console.error('Ошибка очистки категорий Inpars:', request.error);
        reject(request.error);
      };
    });
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

  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
      // console.log('Database connection closed');
    }
  }
}

// Создаем глобальный экземпляр базы данных
const db = new NeocenkaDB();

// Инициализируем базу данных при загрузке
db.init().then(() => {
  // console.log('Database initialized successfully');
}).catch(error => {
  console.error('Database initialization failed:', error);
});

// Экспортируем для использования в других модулях
if (typeof module !== 'undefined' && module.exports) {
  module.exports = db;
}