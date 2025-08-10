/**
 * Класс для работы со справочниками при импорте данных из Реформы ЖКХ
 */
class ReformaGKHReferenceResolver {
  constructor(databaseManager) {
    this.db = databaseManager;
    this.cache = {
      wall_materials: new Map(),
      ceiling_materials: new Map(),
      house_series: new Map(),
      house_classes: new Map()
    };
    this.loadingPromises = new Map();
    
    // Маппинг для нормализации названий
    this.nameMappings = {
      wall_materials: {
        "Панельные": "Панель",
        "Кирпичные": "Кирпич", 
        "Монолитные": "Монолит",
        "Деревянные": "Дерево",
        "Иные": "Другое",
        "Смешанные": "Смешанные",
        // Дополнительные варианты из GeoJSON
        "Железобетонная панель": "Панель",
        "Блочные": "Блочный"
      },
      ceiling_materials: {
        "Железобетонные": "Железобетон",
        "Деревянные": "Дерево",
        "Смешанные": "Смешанные",
        // Дополнительные варианты
        "Иные": "Другое"
      }
    };
    
    // Правила интеллектуального сопоставления
    this.smartMatching = {
      wall_materials: [
        { patterns: ["панел", "panel"], canonical: "Панельный" },
        { patterns: ["кирпич", "brick"], canonical: "Кирпичный" },
        { patterns: ["монолит", "monolith"], canonical: "Монолитный" },
        { patterns: ["блок", "block"], canonical: "Блочный" },
        { patterns: ["дерев", "wood"], canonical: "Деревянный" },
        { patterns: ["железобетон"], canonical: "Панельный" }, // ЖБ панели = панельный
        { patterns: ["смешан", "mixed"], canonical: "Смешанный" }
      ],
      ceiling_materials: [
        { patterns: ["железобетон", "reinforced", "ж/б", "жб"], canonical: "Железобетонное" },
        { patterns: ["дерев", "wood"], canonical: "Деревянное" },
        { patterns: ["смешан", "mixed"], canonical: "Смешанное" }
      ]
    };
    
    // Цвета по умолчанию для новых записей
    this.defaultColors = {
      wall_materials: ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c'],
      ceiling_materials: ['#34495e', '#95a5a6', '#d35400', '#27ae60'],
      house_series: ['#8e44ad', '#2980b9', '#16a085', '#f1c40f'],
      house_classes: ['#c0392b', '#7f8c8d', '#2c3e50', '#e67e22']
    };
    this.colorIndexes = {
      wall_materials: 0,
      ceiling_materials: 0,
      house_series: 0,
      house_classes: 0
    };
    
    // Статистика сопоставлений
    this.matchStats = {
      wall_materials: { found: 0, created: 0 },
      ceiling_materials: { found: 0, created: 0 },
      house_series: { found: 0, created: 0 },
      house_classes: { found: 0, created: 0 }
    };
  }
  
  /**
   * Инициализация - загрузка всех справочников в кэш
   */
  async initialize() {
    const debugEnabled = await this.getDebugSetting();
    
    try {
      if (debugEnabled) {
      }
      
      await Promise.all([
        this.loadReferenceToCache('wall_materials'),
        this.loadReferenceToCache('ceiling_materials'),
        this.loadReferenceToCache('house_series'),
        this.loadReferenceToCache('house_classes')
      ]);
      
      if (debugEnabled) {
          wall_materials: this.cache.wall_materials.size,
          ceiling_materials: this.cache.ceiling_materials.size,
          house_series: this.cache.house_series.size,
          house_classes: this.cache.house_classes.size
        });
      }
      
    } catch (error) {
      console.error('❌ Ошибка при инициализации справочников:', error);
      throw error;
    }
  }
  
  /**
   * Загрузка справочника в кэш
   */
  async loadReferenceToCache(referenceType) {
    try {
      const items = await this.db.getAll(referenceType);
      const cache = this.cache[referenceType];
      
      items.forEach(item => {
        const normalizedName = this.normalizeName(item.name);
        cache.set(normalizedName, item);
      });
      
    } catch (error) {
      console.warn(`Предупреждение: не удалось загрузить справочник ${referenceType}:`, error);
    }
  }
  
  /**
   * Получить или создать запись в справочнике
   */
  async getOrCreate(referenceType, originalName) {
    if (!originalName || originalName.trim() === "" || originalName === "Не заполнено") {
      return null;
    }
    
    // Сначала пробуем найти существующую запись через интеллектуальное сопоставление
    const existingMatch = this.findSmartMatch(referenceType, originalName);
    if (existingMatch) {
      this.matchStats[referenceType].found++;
      return existingMatch.id;
    }
    
    const normalizedName = this.normalizeReferenceName(originalName, referenceType);
    const cacheKey = this.normalizeName(normalizedName);
    
    // Проверяем кэш
    const cached = this.cache[referenceType].get(cacheKey);
    if (cached) {
      return cached.id;
    }
    
    // Проверяем, не создаем ли мы уже эту запись
    const loadingKey = `${referenceType}:${cacheKey}`;
    if (this.loadingPromises.has(loadingKey)) {
      const result = await this.loadingPromises.get(loadingKey);
      return result.id;
    }
    
    // Создаем новую запись
    const createPromise = this.createNewReference(referenceType, normalizedName);
    this.loadingPromises.set(loadingKey, createPromise);
    
    try {
      const newItem = await createPromise;
      
      // Добавляем в кэш
      this.cache[referenceType].set(cacheKey, newItem);
      
      // Обновляем статистику
      this.matchStats[referenceType].created++;
      
      this.loadingPromises.delete(loadingKey);
      return newItem.id;
      
    } catch (error) {
      this.loadingPromises.delete(loadingKey);
      console.error(`Ошибка при создании записи в справочнике ${referenceType}:`, error);
      return null;
    }
  }
  
  /**
   * Создание новой записи в справочнике
   */
  async createNewReference(referenceType, name) {
    const ModelClass = this.getModelClass(referenceType);
    const color = this.getNextColor(referenceType);
    
    const newItem = new ModelClass({
      name: name,
      color: color,
      created_at: new Date(),
      updated_at: new Date()
    });
    
    // Генерируем ID в правильном формате (оставляем null, чтобы база данных сама сгенерировала)
    newItem.id = null;
    
    // Сохраняем в базу
    const saved = await this.db.add(referenceType, newItem);
    
    const debugEnabled = await this.getDebugSetting();
    if (debugEnabled) {
    }
    
    return saved;
  }
  
  /**
   * Интеллектуальный поиск существующей записи
   */
  findSmartMatch(referenceType, originalName) {
    const smartRules = this.smartMatching[referenceType];
    if (!smartRules) return null;
    
    const normalizedInput = originalName.toLowerCase().trim();
    
    // Ищем по паттернам
    for (const rule of smartRules) {
      for (const pattern of rule.patterns) {
        if (normalizedInput.includes(pattern.toLowerCase())) {
          // Ищем каноническое название в кэше
          const canonicalKey = this.normalizeName(rule.canonical);
          const cached = this.cache[referenceType].get(canonicalKey);
          if (cached) {
            const debugEnabled = this.getDebugSettingSync();
            if (debugEnabled) {
            }
            return cached;
          }
        }
      }
    }
    
    return null;
  }

  /**
   * Нормализация названия для справочников
   */
  normalizeReferenceName(originalName, referenceType) {
    const mapping = this.nameMappings[referenceType];
    if (mapping && mapping[originalName]) {
      return mapping[originalName];
    }
    
    // Общая нормализация
    return originalName.trim()
      .replace(/\s+/g, ' ')  // Множественные пробелы в один
      .replace(/^([а-я])/i, (match) => match.toUpperCase()); // Первая буква заглавная
  }
  
  /**
   * Нормализация для поиска в кэше (приведение к нижнему регистру)
   */
  normalizeName(name) {
    return name.toLowerCase().trim();
  }
  
  /**
   * Получение класса модели по типу справочника
   */
  getModelClass(referenceType) {
    const classes = {
      'wall_materials': WallMaterialModel,
      'ceiling_materials': CeilingMaterialModel,
      'house_series': HouseSeriesModel,
      'house_classes': HouseClassModel
    };
    
    return classes[referenceType] || WallMaterialModel;
  }
  
  /**
   * Получение следующего цвета для нового элемента справочника
   */
  getNextColor(referenceType) {
    const colors = this.defaultColors[referenceType] || this.defaultColors.wall_materials;
    const index = this.colorIndexes[referenceType] || 0;
    
    const color = colors[index % colors.length];
    this.colorIndexes[referenceType] = index + 1;
    
    return color;
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
   * Синхронное получение настройки отладки (используется кэш)
   */
  getDebugSettingSync() {
    // Используем простую проверку в localStorage если доступно
    if (typeof localStorage !== 'undefined') {
      try {
        return localStorage.getItem('debug_enabled') === 'true';
      } catch {
        return false;
      }
    }
    return false;
  }
  
  /**
   * Получение статистики созданных записей
   */
  getStats() {
    const stats = {};
    
    Object.keys(this.cache).forEach(referenceType => {
      stats[referenceType] = {
        cached: this.cache[referenceType].size,
        found: this.matchStats[referenceType].found,
        created: this.matchStats[referenceType].created
      };
    });
    
    return stats;
  }
  
  /**
   * Очистка кэша
   */
  clearCache() {
    Object.keys(this.cache).forEach(key => {
      this.cache[key].clear();
    });
    this.loadingPromises.clear();
    
    // Сбрасываем статистику
    Object.keys(this.matchStats).forEach(key => {
      this.matchStats[key] = { found: 0, created: 0 };
    });
  }
}

// Экспорт класса
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ReformaGKHReferenceResolver;
} else if (typeof window !== 'undefined') {
  window.ReformaGKHReferenceResolver = ReformaGKHReferenceResolver;
}