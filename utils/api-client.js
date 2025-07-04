/**
 * API клиент для работы с внешними сервисами
 */

class APIClient {
  constructor() {
    this.baseURL = 'https://api.neocenka.ru'; // Базовый URL API
    this.timeout = 30000; // 30 секунд
    this.retryAttempts = 3;
    this.retryDelay = 1000; // 1 секунда
  }

  /**
   * Выполняет HTTP запрос с повторными попытками
   */
  async request(endpoint, options = {}) {
    const url = `${this.baseURL}${endpoint}`;
    const defaultOptions = {
      timeout: this.timeout,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Neocenka Extension v1.0'
      }
    };

    const requestOptions = {
      ...defaultOptions,
      ...options,
      headers: {
        ...defaultOptions.headers,
        ...options.headers
      }
    };

    for (let attempt = 1; attempt <= this.retryAttempts; attempt++) {
      try {
        const response = await this.fetchWithTimeout(url, requestOptions);
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        return data;

      } catch (error) {
        console.warn(`API запрос (попытка ${attempt}/${this.retryAttempts}) неудачен:`, error.message);
        
        if (attempt === this.retryAttempts) {
          throw new Error(`API запрос не выполнен после ${this.retryAttempts} попыток: ${error.message}`);
        }

        // Ждем перед повторной попыткой
        await this.sleep(this.retryDelay * attempt);
      }
    }
  }

  /**
   * Fetch с таймаутом
   */
  async fetchWithTimeout(url, options) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), options.timeout);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      });
      return response;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Пауза
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // === МЕТОДЫ ДЛЯ РАБОТЫ С АДРЕСАМИ ===

  /**
   * Получает координаты по адресу
   */
  async geocodeAddress(address) {
    try {
      const response = await this.request('/geocode', {
        method: 'POST',
        body: JSON.stringify({ address })
      });

      return {
        success: true,
        coordinates: response.coordinates,
        formatted_address: response.formatted_address
      };
    } catch (error) {
      console.error('Ошибка геокодирования:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Получает информацию о здании по адресу
   */
  async getBuildingInfo(address) {
    try {
      const response = await this.request('/building-info', {
        method: 'POST',
        body: JSON.stringify({ address })
      });

      return {
        success: true,
        building_info: response.building_info
      };
    } catch (error) {
      console.error('Ошибка получения информации о здании:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Ищет адреса в области по полигону
   */
  async findAddressesInArea(polygon) {
    try {
      const response = await this.request('/addresses/search', {
        method: 'POST',
        body: JSON.stringify({ polygon })
      });

      return {
        success: true,
        addresses: response.addresses
      };
    } catch (error) {
      console.error('Ошибка поиска адресов:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // === МЕТОДЫ ДЛЯ РАБОТЫ С ОБЪЯВЛЕНИЯМИ ===

  /**
   * Получает объявления с Avito по URL фильтра
   */
  async getAvitoListings(filterUrl, limit = 100) {
    try {
      const response = await this.request('/parse/avito', {
        method: 'POST',
        body: JSON.stringify({ 
          filter_url: filterUrl,
          limit 
        })
      });

      return {
        success: true,
        listings: response.listings,
        total_found: response.total_found
      };
    } catch (error) {
      console.error('Ошибка получения объявлений Avito:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Получает объявления с Cian по URL фильтра
   */
  async getCianListings(filterUrl, limit = 100) {
    try {
      const response = await this.request('/parse/cian', {
        method: 'POST',
        body: JSON.stringify({ 
          filter_url: filterUrl,
          limit 
        })
      });

      return {
        success: true,
        listings: response.listings,
        total_found: response.total_found
      };
    } catch (error) {
      console.error('Ошибка получения объявлений Cian:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Получает детальную информацию об объявлении
   */
  async getListingDetails(source, listingId) {
    try {
      const response = await this.request(`/parse/${source}/${listingId}`, {
        method: 'GET'
      });

      return {
        success: true,
        listing: response.listing
      };
    } catch (error) {
      console.error('Ошибка получения деталей объявления:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // === МЕТОДЫ ДЛЯ АНАЛИТИКИ ===

  /**
   * Получает рыночную аналитику по сегменту
   */
  async getMarketAnalytics(segmentId, period = '6months') {
    try {
      const response = await this.request(`/analytics/market/${segmentId}`, {
        method: 'GET',
        headers: {
          'X-Period': period
        }
      });

      return {
        success: true,
        analytics: response.analytics
      };
    } catch (error) {
      console.error('Ошибка получения аналитики:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Получает ценовые тренды
   */
  async getPriceTrends(mapAreaId, filters = {}) {
    try {
      const response = await this.request('/analytics/price-trends', {
        method: 'POST',
        body: JSON.stringify({
          map_area_id: mapAreaId,
          filters
        })
      });

      return {
        success: true,
        trends: response.trends
      };
    } catch (error) {
      console.error('Ошибка получения ценовых трендов:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // === МЕТОДЫ ДЛЯ ПОДПИСОК ===

  /**
   * Создает подписку на обновления сегмента
   */
  async createSubscription(segmentId, options = {}) {
    try {
      const response = await this.request('/subscriptions', {
        method: 'POST',
        body: JSON.stringify({
          segment_id: segmentId,
          frequency: options.frequency || 'daily',
          notification_types: options.notification_types || ['new_listings', 'price_changes'],
          webhook_url: options.webhook_url
        })
      });

      return {
        success: true,
        subscription: response.subscription
      };
    } catch (error) {
      console.error('Ошибка создания подписки:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Получает список активных подписок
   */
  async getSubscriptions() {
    try {
      const response = await this.request('/subscriptions', {
        method: 'GET'
      });

      return {
        success: true,
        subscriptions: response.subscriptions
      };
    } catch (error) {
      console.error('Ошибка получения подписок:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Обновляет подписку
   */
  async updateSubscription(subscriptionId, updates) {
    try {
      const response = await this.request(`/subscriptions/${subscriptionId}`, {
        method: 'PATCH',
        body: JSON.stringify(updates)
      });

      return {
        success: true,
        subscription: response.subscription
      };
    } catch (error) {
      console.error('Ошибка обновления подписки:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Удаляет подписку
   */
  async deleteSubscription(subscriptionId) {
    try {
      await this.request(`/subscriptions/${subscriptionId}`, {
        method: 'DELETE'
      });

      return {
        success: true
      };
    } catch (error) {
      console.error('Ошибка удаления подписки:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // === МЕТОДЫ ДЛЯ ОБРАБОТКИ ДАННЫХ ===

  /**
   * Запускает обработку дубликатов
   */
  async processDuplicates(segmentId) {
    try {
      const response = await this.request('/data/process-duplicates', {
        method: 'POST',
        body: JSON.stringify({ segment_id: segmentId })
      });

      return {
        success: true,
        job_id: response.job_id,
        status: response.status
      };
    } catch (error) {
      console.error('Ошибка запуска обработки дубликатов:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Получает статус задачи обработки
   */
  async getJobStatus(jobId) {
    try {
      const response = await this.request(`/jobs/${jobId}`, {
        method: 'GET'
      });

      return {
        success: true,
        job: response.job
      };
    } catch (error) {
      console.error('Ошибка получения статуса задачи:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // === УТИЛИТЫ ===

  /**
   * Проверяет доступность API
   */
  async checkHealth() {
    try {
      const response = await this.request('/health', {
        method: 'GET'
      });

      return {
        success: true,
        status: response.status,
        version: response.version
      };
    } catch (error) {
      console.error('API недоступен:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Устанавливает токен авторизации
   */
  setAuthToken(token) {
    this.authToken = token;
  }

  /**
   * Получает заголовки с авторизацией
   */
  getAuthHeaders() {
    if (this.authToken) {
      return {
        'Authorization': `Bearer ${this.authToken}`
      };
    }
    return {};
  }
}

// Создаем глобальный экземпляр
const apiClient = new APIClient();

// Экспортируем для использования в других модулях
window.APIClient = APIClient;
window.apiClient = apiClient;