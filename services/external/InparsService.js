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
                this.emit('subscription:invalid', { error: 'Нет активных подписок' });
                return {
                    success: false,
                    active: false,
                    error: 'Нет активных подписок'
                };
            }
            
            const subscription = response.data.find(sub => sub.api === true);
            if (!subscription) {
                this.emit('subscription:invalid', { error: 'API подписка не найдена' });
                return {
                    success: false,
                    active: false,
                    error: 'API подписка не найдена'
                };
            }
            
            const endDate = new Date(subscription.endTime);
            if (endDate < new Date()) {
                this.emit('subscription:invalid', { error: 'API подписка истекла' });
                return {
                    success: false,
                    active: false,
                    error: 'API подписка истекла'
                };
            }
            
            this.emit('subscription:valid', { subscription });
            return {
                success: true,
                active: true,
                subscription: subscription
            };
            
        } catch (error) {
            this.emit('subscription:invalid', { error });
            return {
                success: false,
                active: false,
                error: error.message
            };
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
            // console.log(`🔍 InparsService: Получено ${response.data.length} категорий от API`);

            this.categories.clear();
            let totalFiltered = 0;
            let excludedBySection = 0;
            let excludedByRooms = 0;

            for (const category of response.data) {
                // console.log(`📋 Категория: "${category.title}", sectionId=${category.sectionId}, typeId=${category.typeId}`);

                // Фильтруем все категории продажи (исключаем аренду: 6,7,8,10)
                if (![6, 7, 8, 10].includes(category.sectionId)) {
                    totalFiltered++;
                    // Исключаем категорию "Комната" как указано в требованиях
                    if (category.title && !category.title.toLowerCase().includes('комната')) {
                        // console.log(`✅ Добавлена категория: "${category.title}"`);
                        this.categories.set(category.id, {
                            id: category.id,
                            title: category.title,
                            typeId: category.typeId,
                            sectionId: category.sectionId
                        });
                    } else {
                        excludedByRooms++;
                        // console.log(`❌ Исключена категория (комнаты): "${category.title}"`);
                    }
                } else {
                    excludedBySection++;
                    // console.log(`❌ Исключена категория (не продажа): "${category.title}", sectionId=${category.sectionId}`);
                }
            }

            // console.log(`📊 Статистика фильтрации:
            //     Всего получено: ${response.data.length}
            //     Прошло sectionId=1: ${totalFiltered}
            //     Исключено по секции: ${excludedBySection}
            //     Исключено комнаты: ${excludedByRooms}
            //     Итого добавлено: ${this.categories.size}`);

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
            isNew: 0,
            sellerType: '1,2,3', // Все типы: 1=собственник, 2=агент, 3=застройщик (заменяет устаревший withAgent)
            expand: 'region,city,type,section,category,metro,material,rentTime,isNew,rooms,history,phoneProtected,parseId,isApartments,house'
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
        
        // Добавляем временные фильтры (timeStart уже должен быть Unix timestamp в секундах)
        if (timeStart) {
            // Если передан Date объект, конвертируем в timestamp
            params.timeStart = timeStart instanceof Date ? Math.floor(timeStart.getTime() / 1000) : timeStart;
        }
        if (timeEnd) {
            params.timeEnd = timeEnd instanceof Date ? Math.floor(timeEnd.getTime() / 1000) : timeEnd;
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
            
            // Отладка: проверяем параметры запроса
            
            // Отладка: проверяем первые 3 объявления на наличие истории
            for (let i = 0; i < Math.min(3, response.data.length); i++) {
                const rawListing = response.data[i];
                if (rawListing.history) {
                }
            }

            const listings = response.data.map(listing => 
                this.transformListing(listing)
            );
            
            // Отладка: проверяем результат преобразования
            for (let i = 0; i < Math.min(3, listings.length); i++) {
                const transformedListing = listings[i];
                if (transformedListing.price_history) {
                }
            }
            
            this.emit('listings:loaded', { 
                count: listings.length,
                total: response.meta?.totalCount || listings.length 
            });
            
            return {
                listings,
                rawData: response.data, // Сохраняем исходные данные для пагинации
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
            // Унифицированные даты (версия 14)
            created_at: new Date(), // Дата добавления в базу
            updated_at: new Date(), // Дата последнего обновления в базе
            created: listing.created ? new Date(listing.created) : null, // Дата создания на источнике
            updated: listing.updated ? new Date(listing.updated) : null // Дата обновления на источнике
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
     * Загрузка объявлений для InparsPanel с поддержкой пагинации
     */
    async loadListings(options = {}) {
        const {
            polygon = [],
            categories = [],
            startDate = null, // Новый параметр для стартовой даты
            onProgress = null
        } = options;
        
        try {
            if (onProgress) onProgress({ message: 'Начинаем загрузку объявлений...', percentage: 5 });
            
            let allListings = [];
            let pageNumber = 1;
            let hasMore = true;

            // Используем переданную дату или дату по умолчанию (7 дней назад)
            let timeStart = startDate ?
                Math.floor(startDate.getTime() / 1000) :
                this.getDefaultStartDate();
            
            while (hasMore) {
                if (onProgress) {
                    const percentage = Math.min(85, 10 + (pageNumber * 15));
                    onProgress({ 
                        message: `Загружаем страницу ${pageNumber}... (получено: ${allListings.length})`, 
                        percentage: percentage 
                    });
                }

                const result = await this.getListingsByPolygon(polygon, {
                    categoryIds: categories,
                    limit: 500,
                    timeStart: timeStart || null,
                    sortBy: 'updated_asc' // Важно для правильной пагинации
                });
                
                if (!result.listings || result.listings.length === 0) {
                    break;
                }
                
                allListings = allListings.concat(result.listings);
                
                // Проверяем, нужно ли загружать следующую страницу
                hasMore = result.listings.length >= 500;
                
                if (hasMore && result.listings.length > 0) {
                    // Получаем значение поля updated из последнего исходного объявления
                    const lastRawListing = result.rawData[result.rawData.length - 1];
                    
                    // Ищем поле updated в исходных данных Inpars API
                    let nextTimeStart = null;
                    
                    if (lastRawListing.updated) {
                        nextTimeStart = lastRawListing.updated;
                    } else if (lastRawListing.dateUpdate) {
                        nextTimeStart = lastRawListing.dateUpdate;
                    } else if (lastRawListing.dateUpdated) {
                        nextTimeStart = lastRawListing.dateUpdated;
                    }
                    
                    if (nextTimeStart) {
                        // Конвертируем в timestamp для следующего запроса
                        if (typeof nextTimeStart === 'string') {
                            timeStart = Math.floor(new Date(nextTimeStart).getTime() / 1000);
                        } else if (nextTimeStart instanceof Date) {
                            timeStart = Math.floor(nextTimeStart.getTime() / 1000);
                        } else {
                            timeStart = nextTimeStart;
                        }
                        
                    } else {
                        hasMore = false;
                    }
                } else {
                }
                
                pageNumber++;
                
                // Небольшая задержка между запросами (rate limiting уже есть в BaseAPIService)
                if (hasMore) {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }
            
            if (onProgress) onProgress({ message: 'Обработка данных...', percentage: 90 });
            
            // Сохранение в БД происходит в area_services_integration.js
            // через processImportedListings() для правильной обработки map_area_id
            
            if (onProgress) onProgress({ message: `Загрузка завершена! Получено ${allListings.length} объявлений за ${pageNumber - 1} страниц`, percentage: 100 });
            
            
            return {
                success: true,
                count: allListings.length,
                listings: allListings,
                totalPages: pageNumber - 1
            };
            
        } catch (error) {
            console.error('❌ Error loading listings:', error);
            throw error;
        }
    }

    /**
     * Получить стартовую дату по умолчанию (7 дней назад от текущей)
     */
    getDefaultStartDate() {
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        return Math.floor(sevenDaysAgo.getTime() / 1000); // Возвращаем timestamp в секундах
    }

    /**
     * Получить стартовую дату (год назад от текущей) - DEPRECATED, для обратной совместимости
     */
    getStartDate() {
        return this.getDefaultStartDate();
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