/**
 * Менеджер объектов недвижимости
 * Управляет объединением и разделением объектов недвижимости
 */
class RealEstateObjectManager {
  constructor() {
    this.databaseManager = null;
    this.initialized = false;
  }

  /**
   * Инициализация менеджера
   */
  async init() {
    if (this.initialized) return;
    
    // Получаем экземпляр DatabaseManager (используем глобальный объект db)
    this.databaseManager = window.db;
    if (!this.databaseManager) {
      throw new Error('DatabaseManager не инициализирован');
    }
    
    // Проверяем, что база данных инициализирована
    if (!this.databaseManager.db) {
      await this.databaseManager.init();
    }
    
    this.initialized = true;
  }

  /**
   * Объединяет объявления и/или объекты в новый объект недвижимости
   * @param {Array} items - Массив объектов {type: 'listing'|'object', id: number}
   * @param {number} addressId - ID адреса для нового объекта
   */
  async mergeIntoObject(items, addressId) {
    if (!this.initialized) await this.init();
    
    if (!items || items.length === 0) {
      throw new Error('Список элементов для объединения пуст');
    }

    if (!addressId) {
      throw new Error('Не указан ID адреса');
    }

    try {
      // Собираем все объявления из переданных элементов
      const allListings = [];
      const objectsToDelete = [];

      for (const item of items) {
        if (item.type === 'listing') {
          // Добавляем объявление
          const listing = await this.databaseManager.get('listings', item.id);
          if (listing) {
            allListings.push(listing);
          }
        } else if (item.type === 'object') {
          // Получаем все объявления из объекта
          const objectListings = await this.databaseManager.getByIndex('listings', 'object_id', item.id);
          allListings.push(...objectListings);
          objectsToDelete.push(item.id);
        }
      }

      if (allListings.length === 0) {
        throw new Error('Не найдено ни одного объявления для объединения');
      }

      // Создаем новый объект недвижимости
      const realEstateObject = new RealEstateObjectModel({
        address_id: addressId
      });

      // Пересчитываем характеристики на основе всех объявлений
      await realEstateObject.recalculateFromListings(allListings);

      // Сохраняем новый объект в базу данных
      const savedObject = await this.databaseManager.add('objects', realEstateObject);
      
      // Обновляем все объявления - связываем с новым объектом и меняем статус на "Обработано"
      const updatePromises = allListings.map(async (listing) => {
        listing.object_id = savedObject.id;
        listing.processing_status = 'processed';
        listing.updated_at = new Date();
        return this.databaseManager.updateListing(listing);
      });

      await Promise.all(updatePromises);

      // Удаляем старые объекты
      const deletePromises = objectsToDelete.map(objectId => 
        this.databaseManager.delete('objects', objectId)
      );
      await Promise.all(deletePromises);

      if (objectsToDelete.length > 0) {
      }

      return savedObject;

    } catch (error) {
      console.error('❌ Ошибка объединения в объект недвижимости:', error);
      throw error;
    }
  }

  /**
   * Разбивает объекты на отдельные объявления
   * @param {Array} objectIds - Массив ID объектов для разбивки
   */
  async splitObjectsToListings(objectIds) {
    if (!this.initialized) await this.init();

    if (!objectIds || objectIds.length === 0) {
      throw new Error('Не указаны ID объектов для разбивки');
    }

    try {
      const totalListings = [];

      // Получаем все объявления из всех объектов
      for (const objectId of objectIds) {
        const objectListings = await this.databaseManager.getByIndex('listings', 'object_id', objectId);
        totalListings.push(...objectListings);
        await window.dataCacheManager.invalidate('objects', objectId);
      }

      // Обновляем все объявления - убираем связь с объектом и меняем статус на "Обработать на дубли"
      const updatePromises = totalListings.map(async (listing) => {
        listing.object_id = null;
        listing.processing_status = 'duplicate_check_needed';
        listing.updated_at = new Date();
        await window.dataCacheManager.invalidate('listings', listing.id);
        return this.databaseManager.updateListing(listing);
      });

      await Promise.all(updatePromises);

      // Удаляем все объекты
      const deletePromises = objectIds.map(objectId => 
        this.databaseManager.delete('objects', objectId)
      );
      await Promise.all(deletePromises);


      return {
        deletedObjectsCount: objectIds.length,
        updatedListingsCount: totalListings.length
      };

    } catch (error) {
      console.error('❌ Ошибка разбивки объектов:', error);
      throw error;
    }
  }

  /**
   * Исключает объявления из объекта недвижимости
   * @param {number} objectId - ID объекта недвижимости
   * @param {Array} listingIds - Массив ID объявлений для исключения
   */
  async excludeListingsFromObject(objectId, listingIds) {
    if (!this.initialized) await this.init();

    if (!objectId || !listingIds || listingIds.length === 0) {
      throw new Error('Не указаны ID объекта или список объявлений');
    }

    try {
      // Получаем объект недвижимости
      const realEstateObject = await this.databaseManager.get('objects', objectId);
      if (!realEstateObject) {
        throw new Error(`Объект недвижимости с ID ${objectId} не найден`);
      }

      // Удаляем связи с объектом у выбранных объявлений и меняем статус на "Обработать на дубли"
      const updatePromises = listingIds.map(async (listingId) => {
        const listing = await this.databaseManager.get('listings', listingId);
        if (listing) {
          listing.object_id = null;
          listing.processing_status = 'duplicate_check_needed';
          listing.updated_at = new Date();
          return this.databaseManager.updateListing(listing);
        }
      });

      await Promise.all(updatePromises);

      // Получаем оставшиеся объявления
      const remainingListings = await this.databaseManager.getByIndex('listings', 'object_id', objectId);

      if (remainingListings.length === 0) {
        // Если объявлений не осталось, удаляем объект
        await this.databaseManager.delete('objects', objectId);
        return { objectDeleted: true, remainingListings: 0 };
      } else {
        // Пересчитываем характеристики объекта
        const updatedObject = new RealEstateObjectModel(realEstateObject);
        await updatedObject.recalculateFromListings(remainingListings);
        await this.databaseManager.update('objects', updatedObject);
        return { objectDeleted: false, remainingListings: remainingListings.length };
      }

    } catch (error) {
      console.error('❌ Ошибка исключения объявлений из объекта:', error);
      throw error;
    }
  }

  /**
   * Обновляет объект недвижимости при изменении связанного объявления
   * @param {number} listingId - ID измененного объявления
   * @param {Object} oldListing - Старые данные объявления
   * @param {Object} newListing - Новые данные объявления
   */
  async updateObjectOnListingChange(listingId, oldListing, newListing) {
    if (!this.initialized) await this.init();

    try {
      // Определяем ID объекта недвижимости
      const objectId = (newListing && newListing.object_id) || (oldListing && oldListing.object_id);
      if (!objectId) {
        // Объявление не связано с объектом
        return;
      }

      // Получаем объект недвижимости
      const realEstateObject = await this.databaseManager.get('objects', objectId);
      if (!realEstateObject) {
        console.warn(`⚠️ Объект недвижимости с ID ${objectId} не найден`);
        return;
      }

      // Получаем все связанные объявления
      const relatedListings = await this.databaseManager.getByIndex('listings', 'object_id', objectId);
      
      if (relatedListings.length === 0) {
        // Если объявлений не осталось, удаляем объект
        await this.databaseManager.delete('objects', objectId);
        return;
      }

      // Пересчитываем характеристики объекта
      const updatedObject = new RealEstateObjectModel(realEstateObject);
      await updatedObject.recalculateFromListings(relatedListings);
      await this.databaseManager.update('objects', updatedObject);


    } catch (error) {
      console.error('❌ Ошибка обновления объекта недвижимости:', error);
    }
  }

  /**
   * Получает объекты недвижимости с фильтрацией
   * @param {Object} filters - Фильтры для поиска
   */
  async getObjectsWithFilters(filters = {}) {
    if (!this.initialized) await this.init();

    try {
      const objects = await this.databaseManager.getAll('objects');
      
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
        
        return true;
      });

    } catch (error) {
      console.error('❌ Ошибка получения объектов недвижимости:', error);
      throw error;
    }
  }

  /**
   * Получает объект недвижимости с связанными объявлениями
   * @param {number} objectId - ID объекта
   */
  async getObjectWithListings(objectId) {
    if (!this.initialized) await this.init();

    try {
      const realEstateObject = await this.databaseManager.get('objects', objectId);
      if (!realEstateObject) {
        throw new Error(`Объект недвижимости с ID ${objectId} не найден`);
      }

      // Получаем связанные объявления
      const listings = await this.databaseManager.getByIndex('listings', 'object_id', objectId);
      
      // Получаем адрес
      let address = null;
      if (realEstateObject.address_id) {
        address = await this.databaseManager.get('addresses', realEstateObject.address_id);
      }

      return {
        object: realEstateObject,
        listings: listings,
        address: address
      };

    } catch (error) {
      console.error('❌ Ошибка получения объекта с объявлениями:', error);
      throw error;
    }
  }

  /**
   * Проверяет, можно ли объединить элементы по адресу
   * @param {Array} items - Массив объектов {type: 'listing'|'object', id: number}
   */
  async validateMergeByAddress(items) {
    if (!this.initialized) await this.init();

    try {
      const addresses = new Set();
      
      for (const item of items) {
        if (item.type === 'listing') {
          const listing = await this.databaseManager.get('listings', item.id);
          if (listing && listing.address_id) {
            addresses.add(listing.address_id);
          }
        } else if (item.type === 'object') {
          const object = await this.databaseManager.get('objects', item.id);
          if (object && object.address_id) {
            addresses.add(object.address_id);
          }
        }
      }

      return {
        canMerge: addresses.size <= 1,
        addressCount: addresses.size,
        addresses: Array.from(addresses)
      };

    } catch (error) {
      console.error('❌ Ошибка валидации объединения по адресу:', error);
      throw error;
    }
  }

  /**
   * Добавляет новые объявления к существующему объекту недвижимости
   * @param {number} existingObjectId - ID существующего объекта недвижимости
   * @param {Array} newListingIds - Массив ID новых объявлений для добавления
   * @returns {Promise<Object>} Обновленный объект недвижимости
   */
  async addListingsToExistingObject(existingObjectId, newListingIds) {
    if (!this.initialized) await this.init();
    
    if (!existingObjectId || !newListingIds || newListingIds.length === 0) {
      throw new Error('Не указан ID объекта или список новых объявлений');
    }

    try {
      // ИСПРАВЛЕНО: Проверяем что ID является валидным (строка или число)
      if (!existingObjectId || (typeof existingObjectId !== 'number' && typeof existingObjectId !== 'string')) {
        throw new Error(`Неверный ID объекта: ${existingObjectId} (тип: ${typeof existingObjectId})`);
      }

      // Для строковых ID проверяем что это не пустая строка
      if (typeof existingObjectId === 'string' && existingObjectId.trim() === '') {
        throw new Error(`Пустой строковый ID объекта`);
      }

      // Получаем существующий объект
      const existingObject = await this.databaseManager.get('objects', existingObjectId);
      if (!existingObject) {
        throw new Error(`Объект недвижимости с ID ${existingObjectId} не найден`);
      }

      // Получаем все существующие объявления этого объекта
      const existingListings = await this.databaseManager.getByIndex('listings', 'object_id', existingObjectId);
      
      // Получаем новые объявления для добавления
      const newListings = [];
      for (const listingId of newListingIds) {
        const listing = await this.databaseManager.get('listings', listingId);
        if (listing) {
          newListings.push(listing);
        }
      }

      if (newListings.length === 0) {
        throw new Error('Не найдено ни одного нового объявления для добавления');
      }

      // Объединяем все объявления (существующие + новые)
      const allListings = [...existingListings, ...newListings];

      // Обновляем объект на основе всех объявлений
      const objectModel = new RealEstateObjectModel(existingObject);
      await objectModel.recalculateFromListings(allListings);

      // Сохраняем обновленный объект
      objectModel.updated_at = new Date();
      const updatedObject = await this.databaseManager.update('objects', objectModel);
      
      // Привязываем новые объявления к объекту и меняем их статус
      const updatePromises = newListings.map(async (listing) => {
        listing.object_id = existingObjectId;
        listing.processing_status = 'processed';
        listing.updated_at = new Date();
        return this.databaseManager.updateListing(listing);
      });

      await Promise.all(updatePromises);

      console.log(`✅ Добавлено ${newListings.length} объявлений к объекту ${existingObjectId}`);

      return updatedObject;

    } catch (error) {
      console.error(`❌ Ошибка добавления объявлений к объекту ${existingObjectId}:`, error);
      throw error;
    }
  }
}

// Создаем глобальный экземпляр
window.realEstateObjectManager = new RealEstateObjectManager();