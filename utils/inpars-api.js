/**
 * API клиент для работы с сервисом Inpars.ru
 */

class InparsAPI {
    constructor() {
        this.baseURL = 'https://inpars.ru/api/v2';
        this.token = null;
        this.requestCount = 0;
        this.lastRequestTime = 0;
        this.requestQueue = [];
        this.isProcessingQueue = false;
        
        // Ограничения API: 10 запросов в минуту
        this.maxRequestsPerMinute = 10;
        this.minRequestInterval = 6000; // 60000ms / 10 requests = 6000ms между запросами
    }

    /**
     * Установка токена API
     */
    setToken(token) {
        this.token = token;
    }

    /**
     * Получение токена из базы данных
     */
    async loadToken() {
        try {
            if (typeof db !== 'undefined' && db) {
                const token = await db.getSetting('inpars_api_token');
                if (token) {
                    this.token = token;
                    return token;
                }
            }
            return null;
        } catch (error) {
            console.error('Ошибка загрузки токена Inpars:', error);
            return null;
        }
    }

    /**
     * Сохранение токена в базу данных
     */
    async saveToken(token) {
        try {
            if (typeof db !== 'undefined' && db) {
                await db.setSetting('inpars_api_token', token);
                this.token = token;
                return true;
            }
            return false;
        } catch (error) {
            console.error('Ошибка сохранения токена Inpars:', error);
            return false;
        }
    }

    /**
     * Управление очередью запросов для соблюдения лимитов API
     */
    async queueRequest(requestFn) {
        return new Promise((resolve, reject) => {
            this.requestQueue.push({ requestFn, resolve, reject });
            this.processQueue();
        });
    }

    /**
     * Обработка очереди запросов
     */
    async processQueue() {
        if (this.isProcessingQueue || this.requestQueue.length === 0) {
            return;
        }

        this.isProcessingQueue = true;

        while (this.requestQueue.length > 0) {
            const now = Date.now();
            const timeSinceLastRequest = now - this.lastRequestTime;

            // Ждем, если прошло меньше минимального интервала
            if (timeSinceLastRequest < this.minRequestInterval) {
                const waitTime = this.minRequestInterval - timeSinceLastRequest;
                console.log(`⏱️ Inpars API: Ожидание ${waitTime}ms перед следующим запросом`);
                await new Promise(resolve => setTimeout(resolve, waitTime));
            }

            const { requestFn, resolve, reject } = this.requestQueue.shift();
            
            try {
                this.lastRequestTime = Date.now();
                this.requestCount++;
                const result = await requestFn();
                resolve(result);
            } catch (error) {
                reject(error);
            }
        }

        this.isProcessingQueue = false;
    }

    /**
     * Базовый метод для выполнения HTTP запросов (правильный алгоритм)
     */
    async makeRequest(endpoint, bodyParams = {}, method = 'POST') {
        if (!this.token) {
            await this.loadToken();
            if (!this.token) {
                throw new Error('Токен API Inpars не установлен');
            }
        }

        const url = new URL(endpoint, this.baseURL);
        
        // Basic Auth как в рабочем PHP коде
        const authString = btoa(this.token + ':');

        const requestOptions = {
            method: method,
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'Authorization': `Basic ${authString}`
            }
        };

        // Для POST запросов добавляем body
        if (method === 'POST' && Object.keys(bodyParams).length > 0) {
            requestOptions.body = JSON.stringify(bodyParams);
        }

        console.log(`📡 Inpars API: ${requestOptions.method} ${url.toString()}`);
        console.log(`🔑 Auth: Basic ${authString.substring(0, 20)}...`);
        if (method === 'POST') {
            console.log(`📦 Body:`, JSON.stringify(bodyParams, null, 2));
        }

        const response = await fetch(url.toString(), requestOptions);

        // Обработка превышения лимитов
        if (response.status === 429) {
            const retryAfter = response.headers.get('Retry-After') || 60;
            console.warn(`⚠️ Inpars API: Превышен лимит запросов. Повтор через ${retryAfter} сек.`);
            
            await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
            return this.makeRequest(endpoint, bodyParams, method);
        }

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`❌ Inpars API Error ${response.status}:`, errorText);
            throw new Error(`Inpars API Error ${response.status}: ${errorText}`);
        }

        const data = await response.json();
        console.log(`✅ Inpars API: Получен ответ, записей: ${data.data?.length || 'N/A'}`);
        
        return data;
    }

    /**
     * Проверка статуса подписки (как в PHP коде)
     */
    async checkSubscription() {
        return this.queueRequest(async () => {
            try {
                if (!this.token) {
                    await this.loadToken();
                    if (!this.token) {
                        throw new Error('Токен API Inpars не установлен');
                    }
                }

                // GET запрос с токеном в query параметрах (как в PHP)
                const url = `${this.baseURL}/user/subscribe?access-token=${this.token}`;
                
                console.log(`📡 Inpars API: GET ${url}`);

                const response = await fetch(url, {
                    method: 'GET',
                    headers: {
                        'Accept': 'application/json'
                    }
                });

                console.log(`📊 Subscription check status: ${response.status}`);

                // В PHP коде проверяется статус 200 или 402
                if (response.status === 200) {
                    const data = await response.json();
                    
                    // Если есть данные подписки, проверяем активные
                    if (data.data && data.data.length > 0) {
                        const activeSubscriptions = data.data.filter(sub => {
                            // В Inpars API поле называется endTime, а не dateEnd
                            const endDate = new Date(sub.endTime || sub.dateEnd);
                            return endDate > new Date();
                        });

                        return {
                            success: true,
                            status: 200,
                            active: activeSubscriptions.length > 0,
                            subscriptions: data.data,
                            activeSubscriptions: activeSubscriptions
                        };
                    } else {
                        return {
                            success: true,
                            status: 200,
                            active: false,
                            subscriptions: [],
                            activeSubscriptions: []
                        };
                    }
                } else if (response.status === 402) {
                    // Код 402 - требуется оплата
                    return {
                        success: true,
                        status: 402,
                        active: false,
                        message: 'Требуется оплата подписки'
                    };
                } else {
                    // Другие коды ошибок
                    const errorText = await response.text();
                    throw new Error(`HTTP ${response.status}: ${errorText}`);
                }

            } catch (error) {
                console.error('Ошибка проверки подписки Inpars:', error);
                return {
                    success: false,
                    status: null,
                    active: false,
                    error: error.message
                };
            }
        });
    }

    /**
     * Получение списка категорий недвижимости (как в PHP коде)
     */
    async getCategories() {
        return this.queueRequest(async () => {
            try {
                if (!this.token) {
                    await this.loadToken();
                    if (!this.token) {
                        throw new Error('Токен API Inpars не установлен');
                    }
                }

                // GET запрос с токеном в query параметрах (как в PHP)
                const url = `${this.baseURL}/estate/category?access-token=${this.token}`;
                
                console.log(`📡 Inpars API: GET ${url}`);

                const response = await fetch(url, {
                    method: 'GET',
                    headers: {
                        'Accept': 'application/json'
                    }
                });

                console.log(`📊 Categories check status: ${response.status}`);

                if (response.status === 200) {
                    const data = await response.json();
                    
                    if (data.data) {
                        console.log(`✅ Получено ${data.data.length} категорий`);
                        return {
                            success: true,
                            categories: data.data,
                            meta: data.meta
                        };
                    } else {
                        throw new Error('Нет данных в ответе API');
                    }
                } else {
                    const errorText = await response.text();
                    throw new Error(`HTTP ${response.status}: ${errorText}`);
                }

            } catch (error) {
                console.error('Ошибка получения категорий Inpars:', error);
                return {
                    success: false,
                    error: error.message
                };
            }
        });
    }

    /**
     * Получение списка объявлений с поддержкой полигонов
     */
    async getListings(params = {}) {
        return this.queueRequest(async () => {
            try {
                const endpoint = '/estate';
                const url = new URL(endpoint, this.baseURL);
                
                // Добавляем параметры фильтрации
                Object.keys(params).forEach(key => {
                    if (params[key] !== undefined && params[key] !== null) {
                        if (Array.isArray(params[key])) {
                            params[key].forEach(value => {
                                url.searchParams.append(key + '[]', value);
                            });
                        } else {
                            url.searchParams.append(key, params[key]);
                        }
                    }
                });

                const response = await this.makeRequest(url.pathname + url.search);
                
                if (response.data) {
                    return {
                        success: true,
                        listings: response.data,
                        meta: response.meta
                    };
                } else {
                    throw new Error('Нет данных в ответе API');
                }
            } catch (error) {
                console.error('Ошибка получения объявлений Inpars:', error);
                return {
                    success: false,
                    error: error.message
                };
            }
        });
    }

    /**
     * Получение объявлений по полигону области с правильной пагинацией
     */
    async getListingsByPolygon(polygon, categories = [], sources = [], timeStart = null, onProgress = null) {
        return this.queueRequest(async () => {
            try {
                if (!this.token) {
                    await this.loadToken();
                    if (!this.token) {
                        throw new Error('Токен API Inpars не установлен');
                    }
                }
                
                if (!polygon || polygon.length < 3) {
                    throw new Error('Полигон должен содержать минимум 3 точки');
                }

                // Формируем полигон в правильном формате (как в PHP коде)
                const polygonString = polygon.map(point => `${point.lat},${point.lng}`).join(',');

                // Формируем параметры запроса согласно рабочему PHP коду
                const params = {
                    limit: 500,
                    polygon: polygonString,
                    expand: 'region,city,type,section,category,metro,material,rentTime,isNew,rooms,history,phoneProtected',
                    typeAd: 2, // Продажа
                    sourceId: '1,2,13,22', // Источники как в PHP
                    isNew: 0,
                    withAgent: 1,
                    sortBy: 'updated_asc'
                };

                // Добавляем временную метку если указана
                if (timeStart) {
                    // Конвертируем в timestamp если это строка
                    if (typeof timeStart === 'string') {
                        params.timeStart = Math.floor(new Date(timeStart).getTime() / 1000);
                    } else {
                        params.timeStart = timeStart;
                    }
                } else {
                    // Стартовая дата как в PHP коде
                    params.timeStart = Math.floor(new Date('2021-01-01T00:00:00+03:00').getTime() / 1000);
                }

                // Добавляем категории если указаны
                if (categories && categories.length > 0) {
                    params.categoryId = categories.join(',');
                }

                console.log(`📍 Inpars API: Поиск объявлений по полигону (${polygon.length} точек), timeStart: ${new Date(params.timeStart * 1000).toISOString()}`);

                // GET запрос с токеном в query параметрах (как в checkSubscription и getCategories)
                const url = new URL('/api/v2/estate', this.baseURL);
                
                // Добавляем токен
                url.searchParams.append('access-token', this.token);
                
                // Добавляем все параметры
                Object.keys(params).forEach(key => {
                    if (params[key] !== undefined && params[key] !== null) {
                        url.searchParams.append(key, params[key]);
                    }
                });

                console.log(`📡 Inpars API: GET ${url.toString()}`);

                const response = await fetch(url.toString(), {
                    method: 'GET',
                    headers: {
                        'Accept': 'application/json'
                    }
                });

                console.log(`📊 Estate search status: ${response.status}`);

                if (!response.ok) {
                    const errorText = await response.text();
                    console.error(`❌ Inpars API Error ${response.status}:`, errorText);
                    throw new Error(`Inpars API Error ${response.status}: ${errorText}`);
                }

                const responseData = await response.json();
                console.log(`✅ Inpars API: Получен ответ, записей: ${responseData.data?.length || 'N/A'}`);
                
                if (responseData.data) {
                    let listings = responseData.data;

                    // Фильтрация по источникам на клиенте если нужно
                    if (sources && sources.length > 0) {
                        listings = listings.filter(listing => {
                            const source = this.detectListingSource(listing);
                            return sources.includes(source);
                        });
                    }

                    // Получаем updated из последнего объявления для следующего запроса
                    const nextTimeStart = listings.length > 0 ? listings[listings.length - 1].updated : null;
                    const hasMore = listings.length >= 500;

                    console.log(`✅ Inpars API: Получено ${listings.length} объявлений, есть еще: ${hasMore}`);

                    return {
                        success: true,
                        listings: listings,
                        meta: responseData.meta,
                        pagination: {
                            hasMore: hasMore,
                            nextTimeStart: nextTimeStart,
                            currentCount: listings.length
                        },
                        filteredBy: {
                            polygon: polygon.length,
                            categories: categories.length,
                            sources: sources.length
                        }
                    };
                } else {
                    throw new Error('Нет данных в ответе API');
                }
            } catch (error) {
                console.error('Ошибка получения объявлений по полигону Inpars:', error);
                return {
                    success: false,
                    error: error.message
                };
            }
        });
    }

    /**
     * Полный импорт всех объявлений по полигону с пагинацией
     */
    async importAllListingsByPolygon(polygon, categories = [], sources = [], onProgress = null) {
        try {
            console.log(`🚀 Начинаем полный импорт объявлений по полигону`);
            
            let allListings = [];
            let currentTimeStart = null;
            let pageNumber = 1;
            let hasMore = true;

            while (hasMore) {
                if (onProgress) {
                    onProgress({
                        status: 'loading',
                        page: pageNumber,
                        totalLoaded: allListings.length,
                        message: `Загружаем страницу ${pageNumber}...`
                    });
                }

                const result = await this.getListingsByPolygon(
                    polygon, 
                    categories, 
                    sources, 
                    currentTimeStart
                );

                if (!result.success) {
                    throw new Error(result.error);
                }

                allListings = allListings.concat(result.listings);
                hasMore = result.pagination.hasMore;
                currentTimeStart = result.pagination.nextTimeStart;
                pageNumber++;

                console.log(`📄 Страница ${pageNumber - 1}: получено ${result.listings.length} объявлений, всего: ${allListings.length}`);

                // Задержка между запросами для соблюдения лимитов
                if (hasMore) {
                    await new Promise(resolve => setTimeout(resolve, this.minRequestInterval));
                }
            }

            if (onProgress) {
                onProgress({
                    status: 'completed',
                    page: pageNumber - 1,
                    totalLoaded: allListings.length,
                    message: `Импорт завершен! Загружено ${allListings.length} объявлений`
                });
            }

            console.log(`🎉 Полный импорт завершен! Получено ${allListings.length} объявлений за ${pageNumber - 1} страниц`);

            return {
                success: true,
                listings: allListings,
                totalPages: pageNumber - 1,
                totalCount: allListings.length
            };

        } catch (error) {
            console.error('Ошибка полного импорта объявлений:', error);
            
            if (onProgress) {
                onProgress({
                    status: 'error',
                    message: `Ошибка импорта: ${error.message}`
                });
            }

            return {
                success: false,
                error: error.message
            };
        }
    }


    /**
     * Определение источника объявления по данным
     */
    detectListingSource(listing) {
        // Анализируем данные объявления для определения источника
        if (listing.url) {
            if (listing.url.includes('avito.ru')) {
                return 'avito';
            } else if (listing.url.includes('cian.ru')) {
                return 'cian';
            }
        }
        
        // Если есть поле source в данных
        if (listing.source) {
            return listing.source.toLowerCase();
        }

        // Попытка определить по другим полям
        if (listing.site || listing.platform) {
            const platform = (listing.site || listing.platform).toLowerCase();
            if (platform.includes('avito')) return 'avito';
            if (platform.includes('cian')) return 'cian';
        }

        return 'unknown';
    }

    /**
     * Преобразование полигона из формата расширения в формат API
     */
    static formatPolygonForAPI(polygon) {
        if (!polygon || !Array.isArray(polygon)) {
            throw new Error('Полигон должен быть массивом координат');
        }

        return polygon.map(point => {
            // Поддерживаем разные форматы координат
            const lat = point.lat || point.latitude || point[0];
            const lng = point.lng || point.longitude || point.lon || point[1];
            
            if (typeof lat !== 'number' || typeof lng !== 'number') {
                throw new Error('Неверный формат координат в полигоне');
            }

            return { lat, lng };
        });
    }

    /**
     * Получение списка регионов
     */
    async getRegions() {
        return this.queueRequest(async () => {
            try {
                const response = await this.makeRequest('/region');
                
                if (response.data) {
                    return {
                        success: true,
                        regions: response.data,
                        meta: response.meta
                    };
                } else {
                    throw new Error('Нет данных в ответе API');
                }
            } catch (error) {
                console.error('Ошибка получения регионов Inpars:', error);
                return {
                    success: false,
                    error: error.message
                };
            }
        });
    }

    /**
     * Получение списка городов
     */
    async getCities(regionId = null) {
        return this.queueRequest(async () => {
            try {
                let endpoint = '/city';
                if (regionId) {
                    endpoint += `?regionId=${regionId}`;
                }
                
                const response = await this.makeRequest(endpoint);
                
                if (response.data) {
                    return {
                        success: true,
                        cities: response.data,
                        meta: response.meta
                    };
                } else {
                    throw new Error('Нет данных в ответе API');
                }
            } catch (error) {
                console.error('Ошибка получения городов Inpars:', error);
                return {
                    success: false,
                    error: error.message
                };
            }
        });
    }

    /**
     * Получение статистики API
     */
    getStats() {
        return {
            requestCount: this.requestCount,
            queueLength: this.requestQueue.length,
            isProcessing: this.isProcessingQueue,
            lastRequestTime: this.lastRequestTime,
            hasToken: !!this.token
        };
    }

    /**
     * Очистка очереди запросов
     */
    clearQueue() {
        this.requestQueue.forEach(({ reject }) => {
            reject(new Error('Очередь запросов очищена'));
        });
        this.requestQueue = [];
        this.isProcessingQueue = false;
    }
}

// Создаем глобальный экземпляр API клиента
const inparsAPI = new InparsAPI();

// Экспортируем для использования в других модулях
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { InparsAPI, inparsAPI };
}

// Делаем доступным глобально для использования в расширении
if (typeof window !== 'undefined') {
    window.inparsAPI = inparsAPI;
    window.InparsAPI = InparsAPI;
}