/**
 * Сервис интеграции с Inpars.ru API
 * Извлечен из area.js для лучшей архитектуры
 */
class InparsService extends BaseAPIService {
    constructor(config = {}) {
        super({
            name: 'InparsService',
            baseURL: 'https://inpars.ru/api/v2',
            timeout: 30000,
            rateLimit: {
                requests: 10,
                window: 60000 // 1 минута
            },
            ...config
        });
        
        this.token = config.token || null;
        this.enabledSources = config.enabledSources || ['avito', 'cian'];
        
        // Статус сервиса
        this.status = 'initializing';
        this.lastError = null;
        this.categories = new Map();
        this.regions = new Map();
        
        // Настройка аутентификации
        if (this.token) {
            this.auth = {
                type: 'basic',
                username: this.token
            };
        }
        
        // Настройка interceptors
        this.setupInterceptors();
    }

    /**
     * Инициализация сервиса
     */
    async onInitialize() {
        if (!this.token) {
            console.log('⚠️ Inpars API token not configured. Service will be available in limited mode.');
            this.status = 'no_token';
            return;
        }
        
        try {
            // Проверяем статус подписки
            await this.checkSubscription();
            
            // Загружаем справочники
            await this.loadReferenceTables();
            
            this.status = 'ready';
        } catch (error) {
            console.error('❌ Failed to initialize Inpars service:', error);
            this.status = 'error';
            this.lastError = error.message;
        }
    }

    /**
     * Настройка interceptors
     */
    setupInterceptors() {
        // Request interceptor для добавления access-token в query params
        this.addRequestInterceptor((config) => {
            if (this.token && config.method === 'GET') {
                const url = new URL(config.url || 'http://dummy.com');
                url.searchParams.set('access-token', this.token);
                config.url = url.toString();
            }
            return config;
        });
        
        // Response interceptor для обработки rate limiting
        this.addResponseInterceptor((data, response) => {
            // Обрабатываем заголовки rate limiting
            const rateLimit = parseInt(response.headers.get('X-Rate-Limit-Limit')) || 10;
            const rateRemaining = parseInt(response.headers.get('X-Rate-Limit-Remaining')) || 0;
            const rateReset = parseInt(response.headers.get('X-Rate-Limit-Reset')) || 60;
            
            this.emit('rate-limit:update', {
                limit: rateLimit,
                remaining: rateRemaining,
                reset: rateReset
            });
            
            return data;
        });
    }

    /**
     * Проверка статуса подписки
     */
    async checkSubscription() {
        try {
            const response = await this.request('user/subscribe');
            
            if (!response.data || response.data.length === 0) {
                throw new Error('Нет активных подписок');
            }
            
            const subscription = response.data.find(sub => sub.api === true);
            if (!subscription) {
                throw new Error('API подписка не найдена');
            }
            
            const endDate = new Date(subscription.endTime);
            if (endDate < new Date()) {
                throw new Error('API подписка истекла');
            }
            
            this.emit('subscription:valid', { subscription });
            return subscription;
            
        } catch (error) {
            this.emit('subscription:invalid', { error });
            throw error;
        }
    }

    /**
     * Загрузка справочных таблиц
     */
    async loadReferenceTables() {
        try {
            // Загружаем категории недвижимости
            await this.loadCategories();
            
            // Загружаем регионы
            await this.loadRegions();
            
            this.emit('references:loaded');
            
        } catch (error) {
            this.emit('references:error', { error });
            throw error;
        }
    }

    /**
     * Загрузка категорий недвижимости
     */
    async loadCategories() {
        const response = await this.request('estate/category');
        
        if (response.data) {
            this.categories.clear();
            
            for (const category of response.data) {
                // Фильтруем только категории с sectionId=1 и typeId=2
                if (category.sectionId === 1 && category.typeId === 2) {
                    // Исключаем категорию "Комната" как указано в требованиях
                    if (category.title && !category.title.toLowerCase().includes('комната')) {
                        this.categories.set(category.id, {
                            id: category.id,
                            title: category.title,
                            typeId: category.typeId,
                            sectionId: category.sectionId
                        });
                    }
                }
            }
            
            this.emit('categories:loaded', { 
                count: this.categories.size,
                excluded: response.data.length - this.categories.size 
            });
        }
        
        return Array.from(this.categories.values());
    }

    /**
     * Загрузка регионов
     */
    async loadRegions() {
        const response = await this.request('region');
        
        if (response.data) {
            this.regions.clear();
            
            for (const region of response.data) {
                this.regions.set(region.id, {
                    id: region.id,
                    title: region.title
                });
            }
            
            this.emit('regions:loaded', { count: this.regions.size });
        }
        
        return Array.from(this.regions.values());
    }

    /**
     * Получение объявлений по полигону
     */
    async getListingsByPolygon(polygon, options = {}) {
        const {
            categoryIds = [],
            limit = 500,
            timeStart = null,
            timeEnd = null,
            sortBy = 'updated_desc'
        } = options;
        
        // Конвертируем полигон в строку координат для API
        const polygonString = polygon.map(point => `${point.lat},${point.lng}`).join(',');
        
        // Подготавливаем параметры запроса
        const params = {
            polygon: polygonString,
            limit,
            sortBy,
            withAgent: 1, // Включаем агентов и собственников
            expandnew: 'region,city,type,section,category,metro,material,rentTime,isNew,rooms,history,phoneProtected,parseId,isApartments,house'
        };
        
        // Добавляем фильтры по категориям
        if (categoryIds.length > 0) {
            params.categoryId = categoryIds.join(',');
        }
        
        // Добавляем фильтры по источникам данных
        if (this.enabledSources.length > 0) {
            const sourceIds = this.getSourceIds(this.enabledSources);
            if (sourceIds.length > 0) {
                params.sourceId = sourceIds.join(',');
            }
        }
        
        // Добавляем временные фильтры
        if (timeStart) {
            params.timeStart = Math.floor(timeStart.getTime() / 1000);
        }
        if (timeEnd) {
            params.timeEnd = Math.floor(timeEnd.getTime() / 1000);
        }
        
        try {
            this.emit('listings:request:start', { params });
            
            const response = await this.request('estate', {
                method: 'POST',
                data: params
            });
            
            if (!response.data) {
                throw new Error('Нет данных в ответе API');
            }
            
            const listings = response.data.map(listing => 
                this.transformListing(listing)
            );
            
            this.emit('listings:loaded', { 
                count: listings.length,
                total: response.meta?.totalCount || listings.length 
            });
            
            return {
                listings,
                meta: response.meta || {}
            };
            
        } catch (error) {
            this.emit('listings:error', { error, params });
            throw error;
        }
    }

    /**
     * Преобразование объявления из формата Inpars в unified структуру
     */
    transformListing(inparsListing) {
        try {
            // Используем существующий метод из ListingModel
            if (typeof ListingModel !== 'undefined' && ListingModel.fromInparsAPI) {
                return ListingModel.fromInparsAPI(inparsListing);
            }
            
            // Fallback если ListingModel недоступен
            return this.basicTransformListing(inparsListing);
            
        } catch (error) {
            this.emit('listing:transform:error', { error, listing: inparsListing });
            throw error;
        }
    }

    /**
     * Базовое преобразование без ListingModel (fallback)
     */
    basicTransformListing(listing) {
        return {
            external_id: String(listing.id),
            source: 'inpars',
            title: listing.title || '',
            address: listing.address || '',
            price: listing.cost || null,
            coordinates: {
                lat: parseFloat(listing.lat) || null,
                lng: parseFloat(listing.lng) || null
            },
            area_total: listing.sq || null,
            floor: listing.floor || null,
            floors_total: listing.floors || null,
            url: listing.url || '',
            created_at: listing.created ? new Date(listing.created) : new Date(),
            updated_at: listing.updated ? new Date(listing.updated) : new Date()
        };
    }

    /**
     * Получение ID источников по их названиям
     */
    getSourceIds(sourceNames) {
        const sourceMapping = {
            'avito': 1,
            'cian': 2,
            'youla': 5,
            'sob': 7,
            'bazarpnz': 9,
            'move': 11,
            'yandex': 13,
            'gipernn': 19,
            'orsk': 21,
            'domclick': 22
        };
        
        return sourceNames
            .filter(name => sourceMapping[name.toLowerCase()])
            .map(name => sourceMapping[name.toLowerCase()]);
    }

    /**
     * Получение категорий
     */
    getCategories() {
        return Array.from(this.categories.values());
    }

    /**
     * Получение регионов
     */
    getRegions() {
        return Array.from(this.regions.values());
    }

    /**
     * Установка токена API
     */
    setToken(token) {
        this.token = token;
        this.auth = {
            type: 'basic',
            username: token
        };
        this.emit('token:updated', { token });
    }

    /**
     * Установка включенных источников
     */
    setEnabledSources(sources) {
        this.enabledSources = sources;
        this.emit('sources:updated', { sources });
    }

    /**
     * Получение статуса сервиса
     */
    getStatus() {
        const baseStatus = super.getStatus();
        
        return {
            ...baseStatus,
            token: this.token ? '***set***' : 'not set',
            enabledSources: this.enabledSources,
            categoriesLoaded: this.categories.size,
            regionsLoaded: this.regions.size
        };
    }

    /**
     * Загрузка объявлений для InparsPanel
     */
    async loadListings(options = {}) {
        const {
            polygon = [],
            categories = [],
            onProgress = null
        } = options;
        
        try {
            if (onProgress) onProgress({ message: 'Начинаем загрузку объявлений...', percentage: 10 });
            
            const result = await this.getListingsByPolygon(polygon, {
                categoryIds: categories,
                limit: 500
            });
            
            if (onProgress) onProgress({ message: 'Обработка данных...', percentage: 50 });
            
            // Здесь можно добавить сохранение в базу данных
            if (typeof db !== 'undefined' && db.saveListings) {
                await db.saveListings(result.listings);
                if (onProgress) onProgress({ message: 'Сохранение в базу данных...', percentage: 90 });
            }
            
            if (onProgress) onProgress({ message: 'Загрузка завершена', percentage: 100 });
            
            return {
                success: true,
                count: result.listings.length,
                listings: result.listings
            };
            
        } catch (error) {
            console.error('❌ Error loading listings:', error);
            throw error;
        }
    }

    /**
     * Очистка ресурсов
     */
    async destroy() {
        this.categories.clear();
        this.regions.clear();
        super.destroy();
    }
}

// Экспорт
if (typeof module !== 'undefined' && module.exports) {
    module.exports = InparsService;
}