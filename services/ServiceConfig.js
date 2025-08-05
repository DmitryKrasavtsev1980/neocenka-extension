/**
 * Конфигурация всех сервисов приложения
 * Центральное место для настройки архитектуры сервисов
 */

/**
 * Загрузка настроек из хранилища
 */
async function loadServiceSettings() {
    try {
        // Используем IndexedDB через объект db, если он доступен
        if (typeof db !== 'undefined' && db.getSetting) {
            // console.log('📋 Loading settings from IndexedDB...');
            
            const inparsToken = await db.getSetting('inpars_api_token') || '';
            const inparsSourceAvito = await db.getSetting('inpars_source_avito');
            const inparsSourceCian = await db.getSetting('inpars_source_cian');
            const avitoDelay = await db.getSetting('parsing_delay_avito') || 30;
            const cianDelay = await db.getSetting('parsing_delay_cian') || 30;
            
            // Формируем список включенных источников
            const enabledSources = [];
            if (inparsSourceAvito !== false) enabledSources.push('avito'); // по умолчанию true
            if (inparsSourceCian !== false) enabledSources.push('cian'); // по умолчанию true
            
            // console.log('🔑 Loaded inpars token:', inparsToken ? '***set***' : 'not set');
            // console.log('📡 Enabled sources:', enabledSources);
            
            return {
                inparsToken,
                inparsEnabledSources: enabledSources,
                avitoDelay,
                cianDelay
            };
        } 
        else if (typeof chrome !== 'undefined' && chrome.storage) {
            // Fallback к chrome.storage для других контекстов
            // console.log('📋 Loading settings from chrome.storage...');
            const result = await chrome.storage.local.get([
                'inpars_api_token',
                'inpars_enabled_sources',
                'parsing_delay_avito',
                'parsing_delay_cian'
            ]);
            
            // console.log('🔍 Debug chrome.storage result:', result);
            
            return {
                inparsToken: result.inpars_api_token || '',
                inparsEnabledSources: result.inpars_enabled_sources || ['avito', 'cian'],
                avitoDelay: result.parsing_delay_avito || 30,
                cianDelay: result.parsing_delay_cian || 30
            };
        } else {
            // Fallback для тестирования
            // console.log('📋 Using fallback settings...');
            return {
                inparsToken: '',
                inparsEnabledSources: ['avito', 'cian'],
                avitoDelay: 30,
                cianDelay: 30
            };
        }
    } catch (error) {
        console.error('Failed to load service settings:', error);
        return {
            inparsToken: '',
            inparsEnabledSources: ['avito', 'cian'],
            avitoDelay: 30,
            cianDelay: 30
        };
    }
}

/**
 * Создание конфигурации сервисов
 */
async function createServiceConfig() {
    const settings = await loadServiceSettings();
    
    // console.log('🔍 Debug service config creation:', { inparsToken: settings.inparsToken ? '***set***' : 'empty', inparsEnabledSources: settings.inparsEnabledSources });

    return {
        // Внешние API сервисы
        inpars: {
            service: InparsService,
            token: settings.inparsToken,
            enabledSources: settings.inparsEnabledSources,
            rateLimit: {
                requests: 10,
                window: 60000 // 1 минута
            }
        },
        
        // Внутренние сервисы (пока заглушки)
        neocenkaAPI: {
            service: class NeocenkaAPIService extends BaseAPIService {
                constructor(config) {
                    super({
                        name: 'NeocenkaAPIService',
                        baseURL: 'https://neocenka.ru/api',
                        ...config
                    });
                }
            }
        },
        
        // Парсеры (будут добавлены позже)
        avitoParser: {
            service: class AvitoParserService extends BaseAPIService {
                constructor(config) {
                    super({
                        name: 'AvitoParserService',
                        delay: settings.avitoDelay * 1000,
                        ...config
                    });
                }
            }
        },
        
        cianParser: {
            service: class CianParserService extends BaseAPIService {
                constructor(config) {
                    super({
                        name: 'CianParserService',
                        delay: settings.cianDelay * 1000,
                        ...config
                    });
                }
            }
        }
    };
}

/**
 * Инициализация глобального ServiceManager
 */
async function initializeServices() {
    try {
        // Проверяем доступность зависимостей
        if (typeof BaseAPIService === 'undefined') {
            throw new Error('BaseAPIService is not available');
        }
        
        if (typeof ServiceManager === 'undefined') {
            throw new Error('ServiceManager is not available');
        }
        
        // Создаем конфигурацию
        const config = await createServiceConfig();
        
        // Создаем менеджер сервисов
        const manager = ServiceManager.fromConfig(config);
        
        // Настраиваем глобальные обработчики событий
        setupGlobalEventHandlers(manager);
        
        // Инициализируем сервисы
        await manager.initialize();
        
        // Устанавливаем как глобальный экземпляр
        setServiceManager(manager);
        
        // console.log('✅ Services initialized successfully');
        return manager;
        
    } catch (error) {
        console.error('❌ Failed to initialize services:', error);
        throw error;
    }
}

/**
 * Настройка глобальных обработчиков событий
 */
function setupGlobalEventHandlers(manager) {
    // Общие события
    manager.on('manager:initialized', () => {
        // console.log('🚀 ServiceManager initialized');
        dispatchGlobalEvent('services:ready', { manager });
    });
    
    manager.on('service:error', ({ service, error }) => {
        console.error(`❌ Service '${service}' error:`, error);
        dispatchGlobalEvent('service:error', { service, error });
    });
    
    // События Inpars сервиса
    manager.on('service:initialized', ({ name }) => {
        if (name === 'inpars') {
            // console.log('✅ Inpars service initialized');
            dispatchGlobalEvent('inpars:ready');
        }
    });
    
    // Rate limiting события
    manager.on('service:request:start', ({ service, url }) => {
        if (service === 'inpars') {
            dispatchGlobalEvent('inpars:request:start', { url });
        }
    });
    
    manager.on('service:request:success', ({ service, data }) => {
        if (service === 'inpars') {
            dispatchGlobalEvent('inpars:request:success', { data });
        }
    });
}

/**
 * Отправка глобального события
 */
function dispatchGlobalEvent(eventName, detail = {}) {
    if (typeof window !== 'undefined' && window.document) {
        const event = new CustomEvent(eventName, { detail });
        window.document.dispatchEvent(event);
    }
}

/**
 * Получение экземпляра сервиса (удобная функция)
 */
function getService(name) {
    try {
        const manager = getServiceManager();
        return manager.getService(name);
    } catch (error) {
        console.error(`Failed to get service '${name}':`, error);
        return null;
    }
}

/**
 * Проверка готовности сервисов
 */
function waitForServices(timeout = 10000) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            reject(new Error('Services initialization timeout'));
        }, timeout);
        
        function checkServices() {
            try {
                const manager = getServiceManager();
                if (manager && manager.isInitialized) {
                    clearTimeout(timer);
                    resolve(manager);
                } else {
                    setTimeout(checkServices, 100);
                }
            } catch (error) {
                setTimeout(checkServices, 100);
            }
        }
        
        checkServices();
    });
}

/**
 * Обновление настроек сервиса
 */
async function updateServiceSettings(serviceName, settings) {
    try {
        const manager = getServiceManager();
        const service = manager.getService(serviceName);
        
        if (serviceName === 'inpars' && service) {
            if (settings.token) {
                service.setToken(settings.token);
            }
            if (settings.enabledSources) {
                service.setEnabledSources(settings.enabledSources);
            }
        }
        
        // Сохраняем настройки в хранилище
        if (typeof chrome !== 'undefined' && chrome.storage) {
            const storageData = {};
            
            if (serviceName === 'inpars') {
                if (settings.token) storageData.inpars_api_token = settings.token;
                if (settings.enabledSources) storageData.inpars_enabled_sources = settings.enabledSources;
            }
            
            await chrome.storage.local.set(storageData);
        }
        
        // console.log(`✅ Updated settings for service '${serviceName}'`);
        
    } catch (error) {
        console.error(`❌ Failed to update settings for service '${serviceName}':`, error);
        throw error;
    }
}

// Экспорт функций
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        createServiceConfig,
        initializeServices,
        getService,
        waitForServices,
        updateServiceSettings,
        loadServiceSettings
    };
} else {
    // Для браузера добавляем в глобальную область
    window.ServiceConfig = {
        createServiceConfig,
        initializeServices,
        getService,
        waitForServices,
        updateServiceSettings,
        loadServiceSettings
    };
    
    // Автоинициализация отключена - сервисы инициализируются вручную после готовности БД
}