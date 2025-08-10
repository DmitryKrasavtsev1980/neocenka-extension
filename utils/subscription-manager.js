/**
 * Менеджер подписок для отслеживания изменений в сегментах
 */

class SubscriptionManager {
  constructor() {
    this.subscriptions = [];
    this.isRunning = false;
    this.checkInterval = 5 * 60 * 1000; // 5 минут
    this.intervalId = null;
    this.lastCheck = null;
  }

  /**
   * Инициализация менеджера подписок
   */
  async init() {
    try {
      // Загружаем подписки из локального хранилища
      await this.loadSubscriptions();
      
      // Проверяем доступность API
      const healthCheck = await apiClient.checkHealth();
      if (!healthCheck.success) {
        console.warn('API недоступен, подписки работают в автономном режиме');
      }

    } catch (error) {
      console.error('Ошибка инициализации менеджера подписок:', error);
    }
  }

  /**
   * Загружает подписки из локального хранилища
   */
  async loadSubscriptions() {
    try {
      const stored = await this.getFromStorage('subscriptions');
      this.subscriptions = stored || [];
    } catch (error) {
      console.error('Ошибка загрузки подписок:', error);
      this.subscriptions = [];
    }
  }

  /**
   * Сохраняет подписки в локальное хранилище
   */
  async saveSubscriptions() {
    try {
      await this.saveToStorage('subscriptions', this.subscriptions);
    } catch (error) {
      console.error('Ошибка сохранения подписок:', error);
    }
  }

  /**
   * Создает новую подписку
   */
  async createSubscription(segmentId, options = {}) {
    try {
      // Проверяем, что сегмент существует
      const segment = await db.getSegment(segmentId);
      if (!segment) {
        throw new Error('Сегмент не найден');
      }

      // Проверяем, что подписка еще не существует
      const existing = this.subscriptions.find(s => s.segment_id === segmentId);
      if (existing) {
        throw new Error('Подписка на этот сегмент уже существует');
      }

      const subscription = {
        id: this.generateId(),
        segment_id: segmentId,
        segment_name: segment.name,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        active: true,
        frequency: options.frequency || 'hourly', // hourly, daily, weekly
        notification_types: options.notification_types || [
          'new_listings',
          'price_changes',
          'listing_removed'
        ],
        filters: options.filters || {},
        last_check: null,
        last_notification: null,
        statistics: {
          total_notifications: 0,
          last_listings_count: 0,
          last_avg_price: 0
        }
      };

      // Пытаемся создать подписку через API
      if (apiClient) {
        try {
          const apiResult = await apiClient.createSubscription(segmentId, options);
          if (apiResult.success) {
            subscription.api_id = apiResult.subscription.id;
            subscription.api_synced = true;
          }
        } catch (error) {
          console.warn('Не удалось создать подписку через API, работаем локально:', error);
          subscription.api_synced = false;
        }
      }

      this.subscriptions.push(subscription);
      await this.saveSubscriptions();

      // Сразу выполняем первоначальную проверку
      await this.checkSubscription(subscription);

      return {
        success: true,
        subscription
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
   * Получает все подписки
   */
  getSubscriptions() {
    return this.subscriptions;
  }

  /**
   * Получает подписку по ID
   */
  getSubscription(id) {
    return this.subscriptions.find(s => s.id === id);
  }

  /**
   * Обновляет подписку
   */
  async updateSubscription(id, updates) {
    try {
      const subscription = this.subscriptions.find(s => s.id === id);
      if (!subscription) {
        throw new Error('Подписка не найдена');
      }

      // Обновляем локальные данные
      Object.assign(subscription, updates);
      subscription.updated_at = new Date().toISOString();

      // Пытаемся обновить через API
      if (subscription.api_id && apiClient) {
        try {
          await apiClient.updateSubscription(subscription.api_id, updates);
          subscription.api_synced = true;
        } catch (error) {
          console.warn('Не удалось обновить подписку через API:', error);
          subscription.api_synced = false;
        }
      }

      await this.saveSubscriptions();

      return {
        success: true,
        subscription
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
  async deleteSubscription(id) {
    try {
      const subscriptionIndex = this.subscriptions.findIndex(s => s.id === id);
      if (subscriptionIndex === -1) {
        throw new Error('Подписка не найдена');
      }

      const subscription = this.subscriptions[subscriptionIndex];

      // Пытаемся удалить через API
      if (subscription.api_id && apiClient) {
        try {
          await apiClient.deleteSubscription(subscription.api_id);
        } catch (error) {
          console.warn('Не удалось удалить подписку через API:', error);
        }
      }

      // Удаляем локально
      this.subscriptions.splice(subscriptionIndex, 1);
      await this.saveSubscriptions();

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

  /**
   * Запускает автоматическую проверку подписок
   */
  start() {
    if (this.isRunning) {
      console.warn('Менеджер подписок уже запущен');
      return;
    }

    this.isRunning = true;
    this.intervalId = setInterval(() => {
      this.checkAllSubscriptions();
    }, this.checkInterval);

  }

  /**
   * Останавливает автоматическую проверку
   */
  stop() {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

  }

  /**
   * Проверяет все активные подписки
   */
  async checkAllSubscriptions() {
    try {
      const activeSubscriptions = this.subscriptions.filter(s => s.active);
      
      for (const subscription of activeSubscriptions) {
        try {
          await this.checkSubscription(subscription);
        } catch (error) {
          console.error(`Ошибка проверки подписки ${subscription.id}:`, error);
        }
      }

      this.lastCheck = new Date().toISOString();
      await this.saveSubscriptions();

    } catch (error) {
      console.error('Ошибка проверки подписок:', error);
    }
  }

  /**
   * Проверяет конкретную подписку
   */
  async checkSubscription(subscription) {
    try {
      // Проверяем, нужно ли выполнять проверку по расписанию
      if (!this.shouldCheck(subscription)) {
        return;
      }

      // Загружаем текущее состояние сегмента
      const segment = await db.getSegment(subscription.segment_id);
      if (!segment) {
        console.warn(`Сегмент ${subscription.segment_id} не найден`);
        return;
      }

      // Получаем область сегмента
      const mapArea = await db.getMapArea(segment.map_area_id);
      if (!mapArea) {
        console.warn(`Область сегмента ${subscription.segment_id} не найдена`);
        return;
      }

      // Получаем адреса в области
      const allAddresses = await db.getAddresses();
      const areaAddresses = GeometryUtils ? 
        GeometryUtils.getAddressesInMapArea(allAddresses, mapArea) : [];

      // Фильтруем адреса по сегменту
      const segmentAddresses = GeometryUtils ? 
        GeometryUtils.getAddressesForSegment(areaAddresses, segment) : [];

      // Получаем объекты и объявления
      let objects = [];
      let listings = [];

      for (const address of segmentAddresses) {
        const addressObjects = await db.getObjectsByAddress(address.id);
        objects.push(...addressObjects);
      }

      for (const obj of objects) {
        const objectListings = await db.getListingsByObject(obj.id);
        listings.push(...objectListings);
      }

      // Применяем фильтры подписки
      if (subscription.filters) {
        listings = this.applyFilters(listings, objects, subscription.filters);
      }

      // Анализируем изменения
      const changes = this.analyzeChanges(subscription, listings, objects);

      // Обновляем статистику подписки
      subscription.statistics.last_listings_count = listings.length;
      if (objects.length > 0) {
        const validPrices = objects.filter(obj => obj.price).map(obj => obj.price);
        subscription.statistics.last_avg_price = validPrices.length > 0 ?
          Math.round(validPrices.reduce((sum, price) => sum + price, 0) / validPrices.length) : 0;
      }

      subscription.last_check = new Date().toISOString();

      // Отправляем уведомления при наличии изменений
      if (changes.hasChanges) {
        await this.sendNotification(subscription, changes);
        subscription.last_notification = new Date().toISOString();
        subscription.statistics.total_notifications++;
      }

    } catch (error) {
      console.error(`Ошибка проверки подписки ${subscription.id}:`, error);
    }
  }

  /**
   * Определяет, нужно ли проверять подписку
   */
  shouldCheck(subscription) {
    if (!subscription.last_check) {
      return true; // Первая проверка
    }

    const lastCheck = new Date(subscription.last_check);
    const now = new Date();
    const timeDiff = now - lastCheck;

    switch (subscription.frequency) {
      case 'hourly':
        return timeDiff >= 60 * 60 * 1000; // 1 час
      case 'daily':
        return timeDiff >= 24 * 60 * 60 * 1000; // 1 день
      case 'weekly':
        return timeDiff >= 7 * 24 * 60 * 60 * 1000; // 1 неделя
      default:
        return timeDiff >= 60 * 60 * 1000; // По умолчанию 1 час
    }
  }

  /**
   * Применяет фильтры к объявлениям
   */
  applyFilters(listings, objects, filters) {
    return listings.filter(listing => {
      const obj = objects.find(o => o.id === listing.object_id);
      if (!obj) return false;

      // Фильтр по типу недвижимости
      if (filters.property_type && obj.property_type !== filters.property_type) {
        return false;
      }

      // Фильтр по цене
      if (filters.price_min && listing.price < filters.price_min) {
        return false;
      }
      if (filters.price_max && listing.price > filters.price_max) {
        return false;
      }

      // Фильтр по площади
      if (filters.area_min && obj.area < filters.area_min) {
        return false;
      }
      if (filters.area_max && obj.area > filters.area_max) {
        return false;
      }

      return true;
    });
  }

  /**
   * Анализирует изменения в данных
   */
  analyzeChanges(subscription, currentListings, currentObjects) {
    const changes = {
      hasChanges: false,
      new_listings: [],
      removed_listings: [],
      price_changes: [],
      summary: {
        listings_count_change: 0,
        avg_price_change: 0
      }
    };

    // Сравниваем количество объявлений
    const currentCount = currentListings.length;
    const previousCount = subscription.statistics.last_listings_count || 0;
    changes.summary.listings_count_change = currentCount - previousCount;

    // Сравниваем среднюю цену
    const validPrices = currentObjects.filter(obj => obj.price).map(obj => obj.price);
    const currentAvgPrice = validPrices.length > 0 ?
      Math.round(validPrices.reduce((sum, price) => sum + price, 0) / validPrices.length) : 0;
    const previousAvgPrice = subscription.statistics.last_avg_price || 0;
    changes.summary.avg_price_change = currentAvgPrice - previousAvgPrice;

    // Определяем наличие значимых изменений
    if (Math.abs(changes.summary.listings_count_change) > 0) {
      changes.hasChanges = true;
    }

    if (Math.abs(changes.summary.avg_price_change) > 10000) { // Изменение больше 10к рублей
      changes.hasChanges = true;
    }

    return changes;
  }

  /**
   * Отправляет уведомление о изменениях
   */
  async sendNotification(subscription, changes) {
    try {
      const message = this.formatNotificationMessage(subscription, changes);
      
      // Показываем браузерное уведомление
      if ('Notification' in window) {
        if (Notification.permission === 'granted') {
          new Notification('Neocenka: Обновление сегмента', {
            body: message,
            icon: '../assets/icons/icon-48.png'
          });
        } else if (Notification.permission !== 'denied') {
          await Notification.requestPermission();
        }
      }

      // Сохраняем уведомление в локальной истории
      await this.saveNotificationToHistory(subscription, changes, message);


    } catch (error) {
      console.error('Ошибка отправки уведомления:', error);
    }
  }

  /**
   * Форматирует сообщение уведомления
   */
  formatNotificationMessage(subscription, changes) {
    const messages = [];

    if (changes.summary.listings_count_change > 0) {
      messages.push(`+${changes.summary.listings_count_change} новых объявлений`);
    } else if (changes.summary.listings_count_change < 0) {
      messages.push(`${changes.summary.listings_count_change} объявлений удалено`);
    }

    if (Math.abs(changes.summary.avg_price_change) > 10000) {
      const direction = changes.summary.avg_price_change > 0 ? 'выросла' : 'упала';
      const amount = Math.abs(changes.summary.avg_price_change);
      messages.push(`средняя цена ${direction} на ${this.formatPrice(amount)}`);
    }

    return `${subscription.segment_name}: ${messages.join(', ')}`;
  }

  /**
   * Сохраняет уведомление в историю
   */
  async saveNotificationToHistory(subscription, changes, message) {
    try {
      const history = await this.getFromStorage('notification_history') || [];
      
      history.unshift({
        id: this.generateId(),
        subscription_id: subscription.id,
        segment_name: subscription.segment_name,
        message,
        changes,
        created_at: new Date().toISOString(),
        read: false
      });

      // Ограничиваем историю 100 записями
      if (history.length > 100) {
        history.splice(100);
      }

      await this.saveToStorage('notification_history', history);
    } catch (error) {
      console.error('Ошибка сохранения уведомления в историю:', error);
    }
  }

  /**
   * Получает историю уведомлений
   */
  async getNotificationHistory() {
    try {
      return await this.getFromStorage('notification_history') || [];
    } catch (error) {
      console.error('Ошибка получения истории уведомлений:', error);
      return [];
    }
  }

  /**
   * Помечает уведомление как прочитанное
   */
  async markNotificationAsRead(notificationId) {
    try {
      const history = await this.getNotificationHistory();
      const notification = history.find(n => n.id === notificationId);
      
      if (notification) {
        notification.read = true;
        await this.saveToStorage('notification_history', history);
      }
    } catch (error) {
      console.error('Ошибка обновления уведомления:', error);
    }
  }

  // === УТИЛИТЫ ===

  generateId() {
    return Date.now().toString() + Math.random().toString(36).substr(2, 9);
  }

  formatPrice(price) {
    return new Intl.NumberFormat('ru-RU', {
      style: 'currency',
      currency: 'RUB',
      minimumFractionDigits: 0
    }).format(price);
  }

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
}

// Создаем глобальный экземпляр
const subscriptionManager = new SubscriptionManager();

// Экспортируем для использования в других модулях
window.SubscriptionManager = SubscriptionManager;
window.subscriptionManager = subscriptionManager;