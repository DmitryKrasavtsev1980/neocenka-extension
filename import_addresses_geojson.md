# План реализации импорта адресов из GeoJSON "Реформа ЖКХ"

## Анализ исходных данных

### Структура файла myhouse-points.geojson
Файл содержит коллекцию точек домов с подробными характеристиками из системы "Реформа ЖКХ":

**Базовая структура:**
```json
{
  "type": "FeatureCollection",
  "name": "myhouse-points",
  "crs": { "type": "name", "properties": { "name": "urn:ogc:def:crs:OGC:1.3:CRS84" } },
  "features": [...]
}
```

**Структура каждого объекта (Feature):**
```json
{
  "type": "Feature",
  "properties": {
    // Основные поля идентификации
    "HOUSE_ID": 6459256,
    "ADDRESS": "обл. Саратовская, г. Саратов, ул. им Хользунова А.И., д. 36 лит. М",
    "LAT": "51.525606",
    "LON": "46.006481",
    "a_date": "20250701",
    
    // Год постройки и эксплуатации
    "YEAR_BLD": null,
    "YEAR_EXPL": "1956",
    
    // Тип дома и конструктив
    "HOUSE_TYPE": "Многоквартирный дом",
    "SERIE": null,
    "FUNDAMENT": "Не заполнено",
    "PEREKRYT": "Не заполнено", // Перекрытия
    "MAT_NES": "Не заполнено",  // Материал несущих конструкций
    
    // Характеристики дома
    "LEVELS": null,     // Этажность
    "DOORS": null,      // Количество подъездов
    "LIFTS": null,      // Количество лифтов
    "AVAR": "Да",       // Аварийность
    
    // Площади и помещения
    "RMC": 11,          // Количество помещений
    "RMC_LIVE": null,   // Количество жилых помещений
    "RMC_NLIVE": null,  // Количество нежилых помещений
    "INHAB": 31,        // Количество жителей
    "AREA": 399,        // Общая площадь
    "AREA_LIVE": "251.3", // Жилая площадь
    "AREA_NLIVE": "0",   // Нежилая площадь
    "AREA_GEN": null,    // Площадь общего имущества
    "AREA_LAND": null,   // Площадь земельного участка
    "AREA_PARK": null,   // Площадь парковок
    
    // Кадастровые данные
    "CADNO": "64:48060229:1390",
    
    // Коммунальные системы
    "TEPLO_TYPE": "Не заполнено",    // Тип отопления
    "GORVODA_TY": "Не заполнено",    // Тип горячего водоснабжения
    "HOLVODA_TY": "Не заполнено",    // Тип холодного водоснабжения
    "VOTV_TYPE": "Не заполнено",     // Тип водоотведения
    "ELECT_TYPE": "Не заполнено",    // Тип электроснабжения
    "GAZ_TYPE": "Автономное",        // Тип газоснабжения
    
    // Дополнительные системы
    "COLD_WATER": null,     // Счетчики холодной воды
    "HOT_WATER": null,      // Счетчики горячей воды
    "ELECT_VVOD": null,     // Электрические вводы
    "VOTV_YAM": null,       // Выгребная яма
    "VSTK_TYPE": "Не заполнено", // Тип водостоков
    
    // Инфраструктура
    "BLAG_PLAY": null,      // Детская площадка
    "BLAG_SPORT": null,     // Спортивная площадка
    "BLAG_OTHER": null,     // Другие элементы благоустройства
    
    // Энергетическая эффективность
    "ENRG_CLASS": "Не заполнено",
    
    // Управление
    "MGMT": null,           // Управляющая организация
    "MGMT_LINK": null,      // Ссылка на УО
    "CAPFOND": "Не заполнено", // Капитальный фонд
    
    // Регион
    "reg": "RU-SAR"
  },
  "geometry": {
    "type": "Point",
    "coordinates": [46.006481, 51.525606]
  }
}
```

## Текущая модель AddressModel

**Поля в модели AddressModel (из /data/models.js:156-210):**
```javascript
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
}
```

## Справочники в системе

**Существующие справочники (из database.js):**
1. `wall_materials` - Материалы стен (WallMaterialModel)
2. `house_classes` - Классы домов (HouseClassModel) 
3. `house_series` - Серии домов (HouseSeriesModel)
4. `ceiling_materials` - Материалы перекрытий (CeilingMaterialModel)
5. `house_problems` - Проблемы домов (добавлен в версии 19)

**Структура справочных моделей:**
```javascript
// Пример WallMaterialModel
{
  id: null,
  name: '',
  color: '#3b82f6', // Цвет маркера
  created_at: new Date(),
  updated_at: new Date()
}
```

## Матчинг полей GeoJSON → AddressModel

### Прямое соответствие полей:

| GeoJSON поле | AddressModel поле | Обработка | Примечание |
|--------------|-------------------|-----------|------------|
| `ADDRESS` | `address` | Прямое копирование | Полный адрес |
| `LAT`, `LON` | `coordinates.lat`, `coordinates.lng` | Преобразование строк в числа | Координаты |
| `YEAR_EXPL` или `YEAR_BLD` | `build_year` | parseInt(), приоритет YEAR_EXPL | Год постройки |
| `LEVELS` | `floors_count` | parseInt() | Этажность |
| `DOORS` | `entrances_count` | parseInt() | Количество подъездов |
| `RMC_LIVE` | `living_spaces_count` | parseInt() | Жилые помещения |
| `BLAG_PLAY` | `has_playground` | Булево преобразование | Детская площадка |
| `BLAG_SPORT` | `has_sports_area` | Булево преобразование | Спортивная площадка |

### Поля требующие обработки через справочники:

| GeoJSON поле | Справочник | Логика обработки |
|--------------|------------|------------------|
| `MAT_NES` | `wall_materials` | Поиск по названию или создание нового |
| `PEREKRYT` | `ceiling_materials` | Поиск по названию или создание нового |
| `SERIE` | `house_series` | Поиск по названию или создание нового |

### Специальная обработка:

| GeoJSON поле | AddressModel поле | Логика |
|--------------|-------------------|--------|
| `GAZ_TYPE` | `gas_supply` | "Центральное" → true, "Автономное" → true, "Не заполнено" → null |
| `TEPLO_TYPE` | `individual_heating` | "Индивидуальное" → true, "Центральное" → false |
| `type` | `type` | Всегда значение "Дом" (есть в справочнике) |

### Поля не требующие обработки:

**Поля из GeoJSON, которые будут проигнорированы при импорте:**
- `HOUSE_TYPE` - тип дома (не используется, всегда подставляется "Дом")
- `AREA`, `AREA_LIVE`, `AREA_NLIVE`, `AREA_GEN`, `AREA_LAND` - площади (нет соответствующих полей в модели)
- `INHAB`, `RMC`, `RMC_NLIVE` - количество жителей и помещений (нет соответствующих полей в модели)
- `CADNO` - кадастровый номер (нет соответствующего поля в модели)
- `TEPLO_TYPE`, `GORVODA_TY`, `HOLVODA_TY`, `VOTV_TYPE`, `ELECT_TYPE` - детальные типы коммунальных систем (нет соответствующих полей в модели)
- `AVAR`, `FUNDAMENT`, `ENRG_CLASS` - состояние и характеристики дома (нет соответствующих полей в модели)
- `MGMT`, `MGMT_LINK`, `CAPFOND` - управление домом (нет соответствующих полей в модели)
- `LIFTS`, `VSTK_TYPE` - техническая информация (нет соответствующих полей в модели)
- `HOUSE_ID`, `a_date`, `reg` - метаданные (нет соответствующих полей в модели)

**Примечание:** Расширение модели AddressModel дополнительными полями не планируется. Импорт будет работать только с существующими полями модели.

## План реализации

### Этап 1: Подготовка инфраструктуры

**1.1. Создание интерфейса импорта**
- Добавить новую вкладку "Импорт из GeoJson Реформа ЖКХ" в блок "Импорт/экспорт адресов"
- Создать UI с выбором файла, прогресс-баром и настройками импорта
- Добавить возможность предварительного просмотра данных

**1.2. Обновление модели AddressModel**
- Добавить специальный конструктор fromReformaGKH() для создания адреса из GeoJSON
- Обеспечить корректную обработку существующих полей модели

**1.3. Обновление схемы базы данных**
- Схема базы данных остается без изменений
- Используются только существующие поля модели AddressModel

### Этап 2: Обработка больших файлов

**2.1. Пакетная обработка**
- Размер пакета: 100-200 записей за раз
- Использование setTimeout() для избежания блокировки UI
- Показ прогресса обработки пользователю

**2.2. Стратегия чтения файла**
```javascript
// Псевдокод
async function processLargeGeoJSON(file) {
  const BATCH_SIZE = 150;
  const reader = new FileReader();
  
  // Читаем файл частями или целиком (если позволяет память)
  const data = JSON.parse(await readFile(file));
  const features = data.features;
  const totalCount = features.length;
  
  for (let i = 0; i < totalCount; i += BATCH_SIZE) {
    const batch = features.slice(i, i + BATCH_SIZE);
    await processBatch(batch);
    updateProgress((i + batch.length) / totalCount * 100);
    
    // Пауза для обновления UI
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}
```

### Этап 3: Обработка справочников

**3.1. Стратегия создания/поиска записей в справочниках**
```javascript
async function getOrCreateMaterial(materialName, referenceType) {
  if (!materialName || materialName === "Не заполнено") {
    return null;
  }
  
  // Нормализация названия
  const normalizedName = normalizeReferenceName(materialName);
  
  // Поиск существующего
  const existing = await findInReference(referenceType, normalizedName);
  if (existing) {
    return existing.id;
  }
  
  // Создание нового
  const newItem = new ReferenceModel({
    name: normalizedName,
    color: getDefaultColor(referenceType),
    source: 'reforma_gkh_import'
  });
  
  const saved = await DatabaseManager.save(referenceType, newItem);
  return saved.id;
}
```

**3.2. Нормализация справочных данных**
```javascript
const REFERENCE_MAPPING = {
  // Материалы стен
  wall_materials: {
    "Панельные": "Панель",
    "Кирпичные": "Кирпич", 
    "Монолитные": "Монолит",
    "Деревянные": "Дерево",
    "Иные": "Другое"
  },
  
  // Материалы перекрытий
  ceiling_materials: {
    "Железобетонные": "Железобетон",
    "Деревянные": "Дерево",
    "Смешанные": "Смешанные"
  },
  
  // Примечание: HOUSE_TYPE не обрабатывается через справочники
  // Поле type всегда устанавливается в значение "Дом"
};
```

### Этап 4: Валидация и проверки

**4.1. Проверка дублей адресов**
- Поиск по точному совпадению адреса
- Поиск по координатам (в радиусе 50 метров)
- Интерактивное разрешение конфликтов

**4.2. Валидация данных**
```javascript
function validateGeoJSONFeature(feature) {
  const errors = [];
  
  // Обязательные поля
  if (!feature.properties.ADDRESS?.trim()) {
    errors.push('Отсутствует адрес');
  }
  
  if (!feature.properties.LAT || !feature.properties.LON) {
    errors.push('Отсутствуют координаты');
  }
  
  // Валидация координат для региона
  const lat = parseFloat(feature.properties.LAT);
  const lon = parseFloat(feature.properties.LON);
  
  if (lat < 40 || lat > 70 || lon < 20 || lon > 180) {
    errors.push('Координаты вне допустимого диапазона для России');
  }
  
  return errors;
}
```

### Этап 5: Пользовательский интерфейс

**5.1. Форма импорта**
```html
<div class="tab-pane" id="geojson-import">
  <div class="card">
    <div class="card-header">
      <h5>Импорт из GeoJSON Реформа ЖКХ</h5>
    </div>
    <div class="card-body">
      <div class="form-group">
        <label>Выберите GeoJSON файл:</label>
        <input type="file" id="geojson-file" accept=".geojson,.json" class="form-control">
      </div>
      
      <div class="form-group">
        <div class="form-check">
          <input type="checkbox" id="skip-duplicates" class="form-check-input" checked>
          <label class="form-check-label">Пропускать дубли по адресу</label>
        </div>
        <div class="form-check">
          <input type="checkbox" id="update-existing" class="form-check-input">
          <label class="form-check-label">Обновлять существующие записи</label>
        </div>
        <div class="form-check">
          <input type="checkbox" id="create-references" class="form-check-input" checked>
          <label class="form-check-label">Создавать новые записи в справочниках</label>
        </div>
      </div>
      
      <div class="form-group">
        <label>Фильтр по региону:</label>
        <select id="region-filter" class="form-control">
          <option value="">Все регионы</option>
          <option value="RU-SAR">Саратовская область</option>
          <!-- другие регионы -->
        </select>
      </div>
      
      <button id="start-import" class="btn btn-primary">Начать импорт</button>
      
      <div id="import-progress" class="mt-3" style="display: none;">
        <div class="progress">
          <div class="progress-bar" role="progressbar" style="width: 0%"></div>
        </div>
        <div class="mt-2">
          <small id="progress-text">Инициализация...</small>
        </div>
      </div>
      
      <div id="import-results" class="mt-3" style="display: none;">
        <!-- Результаты импорта -->
      </div>
    </div>
  </div>
</div>
```

**5.2. Показ результатов**
```javascript
function showImportResults(results) {
  const resultsDiv = document.getElementById('import-results');
  resultsDiv.innerHTML = `
    <div class="alert alert-success">
      <h6>Импорт завершен</h6>
      <ul class="mb-0">
        <li>Обработано записей: ${results.total}</li>
        <li>Добавлено новых адресов: ${results.added}</li>
        <li>Обновлено существующих: ${results.updated}</li>
        <li>Пропущено дублей: ${results.skipped}</li>
        <li>Ошибок валидации: ${results.errors}</li>
        <li>Создано записей в справочниках: ${results.referencesCreated}</li>
      </ul>
    </div>
  `;
  resultsDiv.style.display = 'block';
}
```

## Технические детали реализации

### Оптимизация производительности
1. **Индексирование**: Создать составные индексы по координатам и адресу
2. **Кэширование справочников**: Загружать все справочники в память перед импортом
3. **Batch transactions**: Группировать операции записи в транзакции по 50-100 записей

### Обработка ошибок
1. **Логирование**: Детальные логи всех ошибок импорта
2. **Откат изменений**: Возможность отката импорта при критических ошибках
3. **Пропуск проблемных записей**: Продолжение импорта при локальных ошибках

### Мониторинг ресурсов
1. **Контроль памяти**: Мониторинг использования RAM при обработке больших файлов
2. **Прогресс импорта**: Детальная индикация прогресса и времени выполнения
3. **Статистика**: Сбор статистики по типам импортированных данных

## Временные затраты
- **Этап 1**: 3-4 часа (UI + конструктор модели)
- **Этап 2**: 6-8 часов (пакетная обработка + чтение файлов)
- **Этап 3**: 6-8 часов (работа со справочниками + нормализация)
- **Этап 4**: 4-6 часов (валидация + проверка дублей)
- **Этап 5**: 6-8 часов (UI + тестирование)

**Общее время**: 25-34 часа разработки (уменьшено за счет отказа от расширения модели)

## Риски и ограничения
1. **Размер файлов**: Файлы больше 100MB могут вызвать проблемы с памятью
2. **Качество данных**: Множество пустых и некорректных полей в исходных данных
3. **Дубли**: Сложность автоматического определения дублей адресов
4. **Производительность**: Обработка больших объемов может занимать длительное время
5. **Совместимость**: Различия в структуре данных между регионами
6. **Ограниченность данных**: Большая часть полей GeoJSON не будет импортирована из-за отсутствия соответствующих полей в модели AddressModel