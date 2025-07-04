/**
 * Сервис для управления подписками и проверки доступа к функциям
 */

class SubscriptionService {
  constructor() {
    this.apiUrl = 'https://neocenka.ru/api/neocenka-extension';
    this.subscription = null;
    this.features = null;
    this.isTestMode = true; // Включаем тестовый режим
  }

  /**
   * Проверяет подписку по API ключу
   */
  async checkSubscription(apiKey) {
    try {
      if (this.isTestMode) {
        // В тестовом режиме возвращаем заглушку
        return this.getTestSubscriptionData();
      }

      const response = await fetch(`${this.apiUrl}/${apiKey}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Neocenka Extension v1.0'
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      
      if (data.status === 'success') {
        this.subscription = data.data.subscription;
        this.features = data.data.subscription.features;
        
        // Сохраняем данные подписки локально
        await this.saveSubscriptionData(apiKey, data.data);
        
        return {
          success: true,
          subscription: this.subscription,
          user: data.data.user
        };
      } else {
        throw new Error(data.message || 'Ошибка проверки подписки');
      }

    } catch (error) {
      console.error('Ошибка проверки подписки:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Возвращает тестовые данные подписки
   */
  getTestSubscriptionData() {
    const testData = {
      subscription: {
        active: true,
        plan: "premium",
        expires_at: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString(), // +15 дней
        days_remaining: 15,
        features: {
          parsing_enabled: true,
          analytics_enabled: true,
          export_enabled: true,
          api_access: true,
          segments_limit: -1,
          listings_limit: -1,
          advanced_filters: true,
          price_tracking: true,
          notifications: true
        },
        usage: {
          segments_count: 3,
          listings_count: 1250,
          api_requests_today: 45,
          api_requests_limit: 1000
        }
      },
      user: {
        id: "test_user_12345",
        email: "test@example.com",
        registered_at: "2023-06-15T10:30:00Z"
      }
    };

    this.subscription = testData.subscription;
    this.features = testData.subscription.features;

    return {
      success: true,
      subscription: this.subscription,
      user: testData.user
    };
  }

  /**
   * Сохраняет данные подписки в локальное хранилище
   */
  async saveSubscriptionData(apiKey, data) {
    try {
      const subscriptionData = {
        api_key: apiKey,
        subscription: data.subscription,
        user: data.user,
        last_check: new Date().toISOString()
      };

      await this.saveToStorage('subscription_data', subscriptionData);
    } catch (error) {
      console.error('Ошибка сохранения данных подписки:', error);
    }
  }

  /**
   * Загружает сохраненные данные подписки
   */
  async loadSubscriptionData() {
    try {
      const data = await this.getFromStorage('subscription_data');
      if (data) {
        this.subscription = data.subscription;
        this.features = data.subscription?.features;
        return data;
      }
      return null;
    } catch (error) {
      console.error('Ошибка загрузки данных подписки:', error);
      return null;
    }
  }

  /**
   * Проверяет, доступна ли функция
   */
  hasFeature(featureName) {
    if (!this.features) {
      return false; // Если подписка не проверена, доступ запрещен
    }

    return this.features[featureName] === true;
  }

  /**
   * Проверяет, активна ли подписка
   */
  isSubscriptionActive() {
    if (!this.subscription) {
      return false;
    }

    return this.subscription.active && this.subscription.days_remaining > 0;
  }

  /**
   * Получает информацию о лимитах
   */
  getLimits() {
    if (!this.subscription) {
      return null;
    }

    return {
      segments: this.subscription.features.segments_limit,
      listings: this.subscription.features.listings_limit,
      api_requests: this.subscription.usage.api_requests_limit
    };
  }

  /**
   * Получает текущее использование
   */
  getUsage() {
    if (!this.subscription) {
      return null;
    }

    return this.subscription.usage;
  }

  /**
   * Проверяет, не превышен ли лимит сегментов
   */
  async canCreateSegment() {
    if (!this.hasFeature('segments_limit')) {
      return false;
    }

    const limits = this.getLimits();
    if (limits.segments === -1) {
      return true; // Безлимитно
    }

    // Подсчитываем текущее количество сегментов
    try {
      const segments = await db.getSegments();
      return segments.length < limits.segments;
    } catch (error) {
      console.error('Ошибка проверки лимита сегментов:', error);
      return false;
    }
  }

  /**
   * Проверяет доступность парсинга
   */
  canUseParsing() {
    return this.hasFeature('parsing_enabled');
  }

  /**
   * Проверяет доступность аналитики
   */
  canUseAnalytics() {
    return this.hasFeature('analytics_enabled');
  }

  /**
   * Проверяет доступность экспорта
   */
  canUseExport() {
    return this.hasFeature('export_enabled');
  }

  /**
   * Проверяет доступность расширенных фильтров
   */
  canUseAdvancedFilters() {
    return this.hasFeature('advanced_filters');
  }

  /**
   * Проверяет доступность отслеживания цен
   */
  canUsePriceTracking() {
    return this.hasFeature('price_tracking');
  }

  /**
   * Проверяет доступность уведомлений
   */
  canUseNotifications() {
    return this.hasFeature('notifications');
  }

  /**
   * Очищает данные подписки
   */
  async clearSubscriptionData() {
    try {
      this.subscription = null;
      this.features = null;
      await this.removeFromStorage('subscription_data');
    } catch (error) {
      console.error('Ошибка очистки данных подписки:', error);
    }
  }

  /**
   * Получает сообщение об ограничении функции
   */
  getFeatureRestrictionMessage(featureName) {
    const messages = {
      parsing_enabled: 'Парсинг данных доступен только для Premium подписки',
      analytics_enabled: 'Расширенная аналитика доступна только для Premium подписки',
      export_enabled: 'Экспорт данных доступен только для Premium подписки',
      advanced_filters: 'Расширенные фильтры доступны только для Premium подписки',
      price_tracking: 'Отслеживание цен доступно только для Premium подписки',
      notifications: 'Уведомления доступны только для Premium подписки'
    };

    return messages[featureName] || 'Эта функция доступна только для Premium подписки';
  }

  /**
   * Отключает тестовый режим и включает реальные API запросы
   */
  disableTestMode() {
    this.isTestMode = false;
  }

  /**
   * Включает тестовый режим
   */
  enableTestMode() {
    this.isTestMode = true;
  }

  /**
   * Обновляет счетчик использования API
   */
  async incrementApiUsage() {
    if (this.subscription && this.subscription.usage) {
      this.subscription.usage.api_requests_today++;
      
      // Сохраняем обновленные данные
      const data = await this.getFromStorage('subscription_data');
      if (data) {
        data.subscription.usage = this.subscription.usage;
        await this.saveToStorage('subscription_data', data);
      }
    }
  }

  /**
   * Проверяет, не превышен ли лимит API запросов
   */
  canMakeApiRequest() {
    if (!this.subscription || !this.subscription.usage) {
      return false;
    }

    const { api_requests_today, api_requests_limit } = this.subscription.usage;
    return api_requests_today < api_requests_limit;
  }

  // Утилиты для работы с localStorage Chrome Extension
  async getFromStorage(key) {
    return new Promise((resolve) => {
      chrome.storage.local.get(key, (result) => {
        resolve(result[key]);
      });
    });
  }

  async saveToStorage(key, value) {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [key]: value }, resolve);
    });
  }

  async removeFromStorage(key) {
    return new Promise((resolve) => {
      chrome.storage.local.remove(key, resolve);
    });
  }
}

// Создаем глобальный экземпляр
const subscriptionService = new SubscriptionService();

// Экспортируем для использования в других модулях
window.SubscriptionService = SubscriptionService;
window.subscriptionService = subscriptionService;