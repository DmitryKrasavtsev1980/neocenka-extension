/**
 * Константы для всего приложения
 * Application-wide constants
 */

// События для EventBus
const EVENTS = {
    // Данные
    DATA_LOADED: 'data:loaded',
    DATA_UPDATED: 'data:updated',
    DATA_CLEARED: 'data:cleared',
    
    // Область
    AREA_LOADED: 'area:loaded',
    AREA_UPDATED: 'area:updated',
    AREA_CHANGED: 'area:changed',
    
    // Адреса
    ADDRESSES_LOADED: 'addresses:loaded',
    ADDRESSES_UPDATED: 'addresses:updated',
    ADDRESS_ADDED: 'address:added',
    ADDRESS_UPDATED: 'address:updated',
    ADDRESS_DELETED: 'address:deleted',
    ADDRESS_EDIT_REQUESTED: 'address:edit:requested',
    
    // Объявления
    LISTINGS_LOADED: 'listings:loaded',
    LISTINGS_UPDATED: 'listings:updated',
    LISTING_ADDED: 'listing:added',
    LISTING_UPDATED: 'listing:updated',
    LISTING_DELETED: 'listing:deleted',
    
    // Парсинг
    PARSING_STARTED: 'parsing:started',
    PARSING_PROGRESS: 'parsing:progress',
    PARSING_COMPLETED: 'parsing:completed',
    PARSING_ERROR: 'parsing:error',
    
    // Дубли
    DUPLICATES_LOADED: 'duplicates:loaded',
    DUPLICATES_PROCESSED: 'duplicates:processed',
    DUPLICATES_MERGED: 'duplicates:merged',
    DUPLICATES_SPLIT: 'duplicates:split',
    
    // Сегменты
    SEGMENTS_LOADED: 'segments:loaded',
    SEGMENTS_UPDATED: 'segments:updated',
    SEGMENT_ADDED: 'segment:added',
    SEGMENT_UPDATED: 'segment:updated',
    SEGMENT_DELETED: 'segment:deleted',
    
    // Карта
    MAP_INITIALIZED: 'map:initialized',
    MAP_UPDATED: 'map:updated',
    MAP_FILTER_CHANGED: 'map:filter_changed',
    
    // UI
    UI_INITIALIZED: 'ui:initialized',
    UI_UPDATED: 'ui:updated',
    UI_STATE_RESET: 'ui:state_reset',
    MODAL_OPENED: 'modal:opened',
    MODAL_CLOSED: 'modal:closed',
    MODAL_OPEN: 'modal:open',
    TABLE_UPDATED: 'table:updated',
    
    // Панели
    PANEL_TOGGLED: 'panel:toggled',
    PANEL_VISIBILITY_CHANGED: 'panel:visibility_changed',
    
    // Уведомления
    NOTIFICATION_SHOW: 'notification:show',
    NOTIFICATION_SHOWN: 'notification:shown',
    NOTIFICATION_HIDDEN: 'notification:hidden',
    
    // Загрузка
    LOADING_STARTED: 'loading:started',
    LOADING_FINISHED: 'loading:finished',
    LOADING_STATE_CHANGED: 'loading:state_changed',
    
    // Дополнительные UI события
    WINDOW_RESIZED: 'window:resized',
    THEME_CHANGED: 'theme:changed',
    SORTABLE_CHANGED: 'sortable:changed',
    GLOBAL_ERROR: 'global:error',
    
    // Прогресс
    PROGRESS_UPDATED: 'progress:updated',
    STATUS_SHOWN: 'status:shown',
    STATUS_HIDDEN: 'status:hidden',
    
    // Сервисы
    SERVICES_INITIALIZED: 'services:initialized',
    SERVICE_ERROR: 'service:error',
    
    // Импорт
    LISTINGS_IMPORTED: 'listings:imported'
};

// Типы недвижимости
const PROPERTY_TYPES = {
    HOUSE: 'house',
    HOUSE_WITH_LAND: 'house_with_land',
    LAND: 'land',
    COMMERCIAL: 'commercial',
    BUILDING: 'building'
};

// Названия типов недвижимости
const PROPERTY_TYPE_NAMES = {
    [PROPERTY_TYPES.HOUSE]: 'Дом',
    [PROPERTY_TYPES.HOUSE_WITH_LAND]: 'Дом с участком',
    [PROPERTY_TYPES.LAND]: 'Участок',
    [PROPERTY_TYPES.COMMERCIAL]: 'Коммерческая',
    [PROPERTY_TYPES.BUILDING]: 'Здание'
};

// Статусы обработки
const PROCESSING_STATUS = {
    PENDING: 'pending',
    IN_PROGRESS: 'in_progress',
    COMPLETED: 'completed',
    ERROR: 'error',
    ADDRESS_NEEDED: 'address_needed',
    DUPLICATE_CHECK_NEEDED: 'duplicate_check_needed',
    NEEDS_UPDATE: 'needs_update'
};

// Статусы объявлений
const LISTING_STATUS = {
    ACTIVE: 'active',
    INACTIVE: 'inactive',
    SOLD: 'sold',
    REMOVED: 'removed',
    ARCHIVED: 'archived'
};

// Источники данных
const DATA_SOURCES = {
    MANUAL: 'manual',
    AVITO: 'avito',
    CIAN: 'cian',
    OSM: 'osm',
    INPARS: 'inpars'
};

// Названия источников
const DATA_SOURCE_NAMES = {
    [DATA_SOURCES.MANUAL]: 'Ручной ввод',
    [DATA_SOURCES.AVITO]: 'Avito',
    [DATA_SOURCES.CIAN]: 'Cian',
    [DATA_SOURCES.OSM]: 'OpenStreetMap',
    [DATA_SOURCES.INPARS]: 'Inpars'
};

// Цвета для источников данных
const DATA_SOURCE_COLORS = {
    [DATA_SOURCES.MANUAL]: '#6B7280',
    [DATA_SOURCES.AVITO]: '#FF6B00',
    [DATA_SOURCES.CIAN]: '#E31E24',
    [DATA_SOURCES.OSM]: '#7EBD01',
    [DATA_SOURCES.INPARS]: '#3B82F6'
};

// Конфигурация карты
const MAP_CONFIG = {
    DEFAULT_CENTER: [55.7558, 37.6176], // Москва
    DEFAULT_ZOOM: 12,
    MIN_ZOOM: 5,
    MAX_ZOOM: 18,
    CLUSTER_MAX_ZOOM: 15,
    POLYGON_COLOR: '#3B82F6',
    POLYGON_OPACITY: 0.7,
    POLYGON_FILL_OPACITY: 0.1,
    FIT_BOUNDS_OPTIONS: {
        padding: [20, 20], // Отступы в пикселях
        maxZoom: 16 // Максимальный зум при fitBounds
    }
};

// Конфигурация таблиц
const TABLE_CONFIG = {
    DEFAULT_PAGE_LENGTH: 25,
    LANGUAGE_URL: '../libs/datatables/ru.json',
    RESPONSIVE: true,
    ORDERING: true,
    SEARCHING: true,
    PAGING: true,
    INFO: true
};

// Конфигурация прогресс-баров
const PROGRESS_CONFIG = {
    PARSING: {
        COLOR: 'blue',
        ANIMATED: true,
        SHOW_PERCENTAGE: true,
        SHOW_MESSAGE: true
    },
    UPDATING: {
        COLOR: 'green',
        ANIMATED: true,
        SHOW_PERCENTAGE: true,
        SHOW_MESSAGE: true
    },
    DUPLICATES: {
        COLOR: 'orange',
        ANIMATED: true,
        SHOW_PERCENTAGE: true,
        SHOW_MESSAGE: true
    }
};

// Типы статусных сообщений
const STATUS_TYPES = {
    SUCCESS: 'success',
    ERROR: 'error',
    WARNING: 'warning',
    INFO: 'info'
};

// Длительности статусных сообщений
const STATUS_DURATIONS = {
    SHORT: 3000,
    MEDIUM: 5000,
    LONG: 7000,
    PERMANENT: 0
};

// Конфигурация фильтров
const FILTER_CONFIG = {
    FLOORS: {
        MIN: 1,
        MAX: 100
    },
    BUILD_YEAR: {
        MIN: 1800,
        MAX: new Date().getFullYear()
    },
    PRICE: {
        MIN: 0,
        MAX: 1000000000
    }
};

// Типы модальных окон
const MODAL_TYPES = {
    AREA_EDIT: 'area_edit',
    ADDRESS_EDIT: 'address_edit',
    SEGMENT_EDIT: 'segment_edit',
    LISTING_DETAIL: 'listing_detail',
    OBJECT_DETAIL: 'object_detail'
};

// Ключи для localStorage
const STORAGE_KEYS = {
    AREA_PROGRESS: 'neocenka_area_progress_',
    SETTINGS: 'neocenka_settings',
    FILTERS: 'neocenka_filters_',
    TABLE_STATE: 'neocenka_table_state_',
    PANEL_STATE: 'neocenka_panel_state_'
};

// Регулярные выражения
const REGEX = {
    ID_PATTERN: /^id_\d+_[a-z0-9]+$/,
    PHONE: /^(?:\+7|8)[\s\-]?\(?(\d{3})\)?[\s\-]?(\d{3})[\s\-]?(\d{2})[\s\-]?(\d{2})$/,
    EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    URL: /^https?:\/\/[^\s]+$/,
    COORDINATE: /^-?\d+\.?\d*$/
};

// Лимиты
const LIMITS = {
    MAX_ADDRESSES: 10000,
    MAX_LISTINGS: 50000,
    MAX_SEGMENTS: 1000,
    MAX_SUBSEGMENTS: 5000,
    MAX_HISTORY_SIZE: 1000,
    MAX_CACHE_SIZE: 100,
    MAX_LISTENERS: 100,
    PARSING_BATCH_SIZE: 100,
    PROCESSING_BATCH_SIZE: 50
};

// Интервалы обновления (в миллисекундах)
const UPDATE_INTERVALS = {
    LISTINGS: 3600000, // 1 час
    ADDRESSES: 86400000, // 1 день
    SEGMENTS: 300000, // 5 минут
    STATUS_CHECK: 30000, // 30 секунд
    HEARTBEAT: 60000 // 1 минута
};

// Timeout'ы (в миллисекундах)
const TIMEOUTS = {
    API_REQUEST: 30000,
    PARSING_TIMEOUT: 300000,
    MAP_LOAD: 10000,
    MODAL_ANIMATION: 300,
    DEBOUNCE_SEARCH: 500,
    DEBOUNCE_FILTER: 300
};

// Сообщения об ошибках
const ERROR_MESSAGES = {
    NETWORK_ERROR: 'Ошибка сетевого соединения',
    PARSING_ERROR: 'Ошибка парсинга данных',
    VALIDATION_ERROR: 'Ошибка валидации данных',
    DATABASE_ERROR: 'Ошибка базы данных',
    PERMISSION_ERROR: 'Недостаточно прав доступа',
    TIMEOUT_ERROR: 'Превышено время ожидания',
    UNKNOWN_ERROR: 'Неизвестная ошибка'
};

// Сообщения об успехе
const SUCCESS_MESSAGES = {
    DATA_SAVED: 'Данные успешно сохранены',
    DATA_LOADED: 'Данные успешно загружены',
    PARSING_COMPLETED: 'Парсинг завершен успешно',
    DUPLICATES_PROCESSED: 'Дубли успешно обработаны',
    EXPORT_COMPLETED: 'Экспорт завершен успешно',
    IMPORT_COMPLETED: 'Импорт завершен успешно'
};

// Экспорт констант
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        EVENTS,
        PROPERTY_TYPES,
        PROPERTY_TYPE_NAMES,
        PROCESSING_STATUS,
        LISTING_STATUS,
        DATA_SOURCES,
        DATA_SOURCE_NAMES,
        DATA_SOURCE_COLORS,
        MAP_CONFIG,
        TABLE_CONFIG,
        PROGRESS_CONFIG,
        STATUS_TYPES,
        STATUS_DURATIONS,
        FILTER_CONFIG,
        MODAL_TYPES,
        STORAGE_KEYS,
        REGEX,
        LIMITS,
        UPDATE_INTERVALS,
        TIMEOUTS,
        ERROR_MESSAGES,
        SUCCESS_MESSAGES
    };
} else {
    window.CONSTANTS = {
        EVENTS,
        PROPERTY_TYPES,
        PROPERTY_TYPE_NAMES,
        PROCESSING_STATUS,
        LISTING_STATUS,
        DATA_SOURCES,
        DATA_SOURCE_NAMES,
        DATA_SOURCE_COLORS,
        MAP_CONFIG,
        TABLE_CONFIG,
        PROGRESS_CONFIG,
        STATUS_TYPES,
        STATUS_DURATIONS,
        FILTER_CONFIG,
        MODAL_TYPES,
        STORAGE_KEYS,
        REGEX,
        LIMITS,
        UPDATE_INTERVALS,
        TIMEOUTS,
        ERROR_MESSAGES,
        SUCCESS_MESSAGES
    };
}