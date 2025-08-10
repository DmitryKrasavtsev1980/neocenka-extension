/**
 * Импорт адресов из GeoJSON файлов "Реформа ЖКХ"
 */
class ReformaGKHImporter {
  constructor(databaseManager) {
    this.db = databaseManager;
    this.referenceResolver = new ReformaGKHReferenceResolver(databaseManager);
    this.options = {
      batchSize: 150,
      skipDuplicates: true,
      updateExisting: false,
      createReferences: true
    };
    this.stats = {
      total: 0,
      processed: 0,
      added: 0,
      updated: 0,
      skipped: 0,
      errors: 0,
      referencesCreated: 0,
      referencesFound: 0
    };
    this.errors = [];
    this.isRunning = false;
    this.isCancelled = false;
  }
  
  /**
   * Установка опций импорта
   */
  setOptions(options) {
    this.options = { ...this.options, ...options };
  }
  
  /**
   * Основной метод импорта
   */
  async importFromFile(file, progressCallback = null) {
    this.isRunning = true;
    this.isCancelled = false;
    this.resetStats();
    
    const debugEnabled = await this.getDebugSetting();
    
    try {
      if (debugEnabled) {
      }
      
      // Инициализируем resolver
      await this.referenceResolver.initialize();
      
      // Читаем и парсим файл
      const geoJsonData = await this.readFile(file);
      this.validateGeoJSON(geoJsonData);
      
      const features = geoJsonData.features;
      this.stats.total = features.length;
      
      if (progressCallback) {
        progressCallback({
          stage: 'processing',
          progress: 0,
          stats: { ...this.stats },
          message: `Начинаем обработку ${features.length} записей...`
        });
      }
      
      // Пакетная обработка
      await this.processBatches(features, progressCallback);
      
      // Финальная статистика
      const resolverStats = this.referenceResolver.getStats();
      this.stats.referencesCreated = Object.values(resolverStats)
        .reduce((sum, stat) => sum + stat.created, 0);
      this.stats.referencesFound = Object.values(resolverStats)
        .reduce((sum, stat) => sum + stat.found, 0);
      
      if (debugEnabled) {
        console.group('✅ Импорт завершен');
        
        // Анализ результатов
        const successRate = ((this.stats.added / this.stats.total) * 100).toFixed(1);
        const duplicateRate = ((this.stats.skipped / this.stats.total) * 100).toFixed(1);
        const errorRate = ((this.stats.errors / this.stats.total) * 100).toFixed(1);
        
        
        if (this.stats.skipped > 0) {
        }
        
        console.groupEnd();
      }
      
      if (progressCallback) {
        progressCallback({
          stage: 'completed',
          progress: 100,
          stats: { ...this.stats },
          message: 'Импорт завершен успешно'
        });
      }
      
      return {
        success: true,
        stats: this.stats,
        errors: this.errors
      };
      
    } catch (error) {
      console.error('❌ Ошибка импорта:', error);
      
      if (progressCallback) {
        progressCallback({
          stage: 'error',
          progress: 0,
          stats: { ...this.stats },
          message: `Ошибка импорта: ${error.message}`
        });
      }
      
      return {
        success: false,
        error: error.message,
        stats: this.stats,
        errors: this.errors
      };
      
    } finally {
      this.isRunning = false;
    }
  }
  
  /**
   * Чтение файла
   */
  async readFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = (event) => {
        try {
          const data = JSON.parse(event.target.result);
          resolve(data);
        } catch (error) {
          reject(new Error(`Ошибка парсинга JSON: ${error.message}`));
        }
      };
      
      reader.onerror = () => {
        reject(new Error('Ошибка чтения файла'));
      };
      
      reader.readAsText(file, 'UTF-8');
    });
  }
  
  /**
   * Валидация GeoJSON структуры
   */
  validateGeoJSON(data) {
    if (!data || typeof data !== 'object') {
      throw new Error('Неверный формат файла');
    }
    
    if (data.type !== 'FeatureCollection') {
      throw new Error('Файл должен содержать FeatureCollection');
    }
    
    if (!Array.isArray(data.features)) {
      throw new Error('Отсутствует массив features');
    }
    
    if (data.features.length === 0) {
      throw new Error('Файл не содержит данных');
    }
  }
  
  /**
   * Обработка пакетами
   */
  async processBatches(features, progressCallback) {
    const batchCount = Math.ceil(features.length / this.options.batchSize);
    
    for (let i = 0; i < batchCount && !this.isCancelled; i++) {
      const startIndex = i * this.options.batchSize;
      const batch = features.slice(startIndex, startIndex + this.options.batchSize);
      
      await this.processBatch(batch, i + 1, batchCount);
      
      // Обновляем прогресс
      if (progressCallback) {
        const progress = Math.round((this.stats.processed / features.length) * 100);
        progressCallback({
          stage: 'processing',
          progress: progress,
          stats: { ...this.stats },
          message: `Обработано пакетов: ${i + 1} из ${batchCount}`
        });
      }
      
      // Пауза для обновления UI
      await this.sleep(10);
    }
  }
  
  /**
   * Обработка одного пакета
   */
  async processBatch(features, batchNumber, totalBatches) {
    const debugEnabled = await this.getDebugSetting();
    
    if (debugEnabled) {
    }
    
    for (const feature of features) {
      if (this.isCancelled) break;
      
      try {
        await this.processFeature(feature);
      } catch (error) {
        this.stats.errors++;
        this.errors.push({
          address: feature.properties?.ADDRESS || 'Неизвестный адрес',
          error: error.message,
          timestamp: new Date()
        });
        
        if (debugEnabled) {
          console.group('⚠️ Ошибка обработки записи');
          console.warn('📍 Адрес:', feature.properties?.ADDRESS || 'Неизвестный адрес');
          console.warn('❌ Причина:', error.message);
          console.warn('📄 Объект записи:', feature);
          console.warn('🏠 Свойства:', feature.properties);
          console.groupEnd();
        }
      }
      
      this.stats.processed++;
    }
  }
  
  /**
   * Обработка одной записи
   */
  async processFeature(feature) {
    const debugEnabled = await this.getDebugSetting();
    
    // Валидация записи
    const validationErrors = this.validateFeature(feature);
    if (validationErrors.length > 0) {
      throw new Error(`Валидация: ${validationErrors.join(', ')}`);
    }
    
    // Создаем модель адреса
    const addressModel = await AddressModel.fromReformaGKH(
      feature, 
      this.options.createReferences ? this.referenceResolver : null
    );
    
    // Всегда проверяем на строгие дубли (точное совпадение адреса И координат)
    const duplicate = await this.findDuplicate(addressModel);
    if (duplicate) {
      // Если найден строгий дубль - пропускаем импорт
      this.stats.skipped++;
      
      // Всегда логируем дубли для анализа (независимо от настроек отладки)
      console.group(`⏭️ Дубль #${this.stats.skipped}: Пропущен строгий дубликат`);
      console.log('Дублируемый адрес:', {
        id: duplicate.id,
        address: duplicate.address,
        coordinates: duplicate.coordinates,
        created_at: duplicate.created_at,
        source: duplicate.source || 'unknown'
      });
      console.log('Новый адрес (пропущен):', {
        address: addressModel.address,
        coordinates: addressModel.coordinates,
        properties: feature.properties,
        geometry: feature.geometry
      });
      
      // Вычисляем расстояние для демонстрации
      const distance = this.calculateDistance(
        addressModel.coordinates.lat,
        addressModel.coordinates.lng,
        duplicate.coordinates.lat,
        duplicate.coordinates.lng
      );
      console.groupEnd();
      return;
    }
    
    // Сохраняем новый адрес (ID будет автоматически сгенерирован базой данных)
    addressModel.id = null; // Позволяем базе данных самой сгенерировать ID
    await this.db.add('addresses', addressModel);
    this.stats.added++;
    
    if (debugEnabled) {
      console.group('✅ Добавлен новый адрес');
      console.groupEnd();
    }
  }
  
  /**
   * Валидация одной записи
   */
  validateFeature(feature) {
    const errors = [];
    const props = feature.properties;
    
    if (!props.ADDRESS?.trim()) {
      errors.push('Отсутствует адрес');
    }
    
    if (!props.LAT || !props.LON) {
      errors.push('Отсутствуют координаты');
    }
    
    // Валидация координат
    const lat = parseFloat(props.LAT);
    const lon = parseFloat(props.LON);
    
    if (isNaN(lat) || isNaN(lon)) {
      errors.push('Некорректные координаты');
    } else if (lat < 40 || lat > 70 || lon < 20 || lon > 180) {
      errors.push('Координаты вне допустимого диапазона для России');
    }
    
    return errors;
  }
  
  /**
   * Поиск дублей по СТРОГОМУ совпадению адреса И координат
   */
  async findDuplicate(addressModel) {
    const debugEnabled = await this.getDebugSetting();
    
    if (!addressModel.address || !addressModel.coordinates?.lat || !addressModel.coordinates?.lng) {
      if (debugEnabled) {
      }
      return null;
    }
    
    // Получаем все адреса с таким же адресом
    const addressMatches = await this.db.getByIndex('addresses', 'address', addressModel.address);
    
    if (addressMatches.length === 0) {
      if (debugEnabled) {
      }
      return null;
    }
    
    // Среди найденных по адресу ищем точное совпадение координат (в радиусе 10 метров)
    for (const existing of addressMatches) {
      if (existing.coordinates?.lat && existing.coordinates?.lng) {
        const distance = this.calculateDistance(
          addressModel.coordinates.lat,
          addressModel.coordinates.lng,
          existing.coordinates.lat,
          existing.coordinates.lng
        );
        
        if (distance < 10) { // Очень строгий радиус - 10 метров
          // Всегда логируем найденные дубли
          console.group(`🎯 Найден точный дубль`);
          console.groupEnd();
          return existing;
        } else if (debugEnabled) {
        }
      }
    }
    
    if (debugEnabled) {
    }
    
    return null;
  }
  
  /**
   * Вычисление расстояния между координатами в метрах
   */
  calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371000; // Радиус Земли в метрах
    const dLat = this.toRadians(lat2 - lat1);
    const dLon = this.toRadians(lon2 - lon1);
    
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(this.toRadians(lat1)) * Math.cos(this.toRadians(lat2)) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }
  
  toRadians(degrees) {
    return degrees * (Math.PI / 180);
  }
  
  /**
   * Обновление существующего адреса
   */
  async updateAddress(existing, newData) {
    // Обновляем только пустые поля
    const fieldsToUpdate = [
      'build_year', 'floors_count', 'entrances_count', 'living_spaces_count',
      'wall_material_id', 'ceiling_material_id', 'house_series_id',
      'gas_supply', 'individual_heating', 'has_playground', 'has_sports_area'
    ];
    
    let hasChanges = false;
    
    fieldsToUpdate.forEach(field => {
      if ((existing[field] === null || existing[field] === undefined) && 
          (newData[field] !== null && newData[field] !== undefined)) {
        existing[field] = newData[field];
        hasChanges = true;
      }
    });
    
    if (hasChanges) {
      existing.updated_at = new Date();
      await this.db.save('addresses', existing);
    }
  }
  
  /**
   * Сброс статистики
   */
  resetStats() {
    this.stats = {
      total: 0,
      processed: 0,
      added: 0,
      updated: 0,
      skipped: 0,
      errors: 0,
      referencesCreated: 0,
      referencesFound: 0
    };
    this.errors = [];
  }
  
  /**
   * Отмена импорта
   */
  cancel() {
    this.isCancelled = true;
  }
  
  /**
   * Получение настройки отладки
   */
  async getDebugSetting() {
    try {
      const settings = await this.db.getSettings();
      const debugSetting = settings.find(s => s.key === 'debug_enabled');
      return debugSetting ? debugSetting.value : false;
    } catch {
      return false;
    }
  }
  
  /**
   * Пауза
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Экспорт класса
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ReformaGKHImporter;
} else if (typeof window !== 'undefined') {
  window.ReformaGKHImporter = ReformaGKHImporter;
}