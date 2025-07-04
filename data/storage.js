/**
 * Wrapper для Chrome Storage API
 * Предоставляет удобные методы для работы с хранилищем Chrome
 */

class ChromeStorage {
  constructor() {
    this.local = chrome.storage.local;
    this.sync = chrome.storage.sync;
  }

  /**
   * Сохранение данных в локальное хранилище
   */
  async setLocal(key, value) {
    try {
      await this.local.set({ [key]: value });
      return true;
    } catch (error) {
      console.error('Ошибка сохранения в локальное хранилище:', error);
      return false;
    }
  }

  /**
   * Получение данных из локального хранилища
   */
  async getLocal(key) {
    try {
      const result = await this.local.get(key);
      return result[key];
    } catch (error) {
      console.error('Ошибка получения из локального хранилища:', error);
      return null;
    }
  }

  /**
   * Получение нескольких ключей из локального хранилища
   */
  async getLocalMultiple(keys) {
    try {
      return await this.local.get(keys);
    } catch (error) {
      console.error('Ошибка получения множественных данных:', error);
      return {};
    }
  }

  /**
   * Удаление данных из локального хранилища
   */
  async removeLocal(key) {
    try {
      await this.local.remove(key);
      return true;
    } catch (error) {
      console.error('Ошибка удаления из локального хранилища:', error);
      return false;
    }
  }

  /**
   * Очистка локального хранилища
   */
  async clearLocal() {
    try {
      await this.local.clear();
      return true;
    } catch (error) {
      console.error('Ошибка очистки локального хранилища:', error);
      return false;
    }
  }

  /**
   * Сохранение данных в синхронизируемое хранилище
   */
  async setSync(key, value) {
    try {
      await this.sync.set({ [key]: value });
      return true;
    } catch (error) {
      console.error('Ошибка сохранения в синхронизируемое хранилище:', error);
      return false;
    }
  }

  /**
   * Получение данных из синхронизируемого хранилища
   */
  async getSync(key) {
    try {
      const result = await this.sync.get(key);
      return result[key];
    } catch (error) {
      console.error('Ошибка получения из синхронизируемого хранилища:', error);
      return null;
    }
  }

  /**
   * Получение нескольких ключей из синхронизируемого хранилища
   */
  async getSyncMultiple(keys) {
    try {
      return await this.sync.get(keys);
    } catch (error) {
      console.error('Ошибка получения множественных данных из sync:', error);
      return {};
    }
  }

  /**
   * Удаление данных из синхронизируемого хранилища
   */
  async removeSync(key) {
    try {
      await this.sync.remove(key);
      return true;
    } catch (error) {
      console.error('Ошибка удаления из синхронизируемого хранилища:', error);
      return false;
    }
  }

  /**
   * Очистка синхронизируемого хранилища
   */
  async clearSync() {
    try {
      await this.sync.clear();
      return true;
    } catch (error) {
      console.error('Ошибка очистки синхронизируемого хранилища:', error);
      return false;
    }
  }

  /**
   * Получение информации об использовании хранилища
   */
  async getStorageInfo() {
    try {
      const localUsed = await this.local.getBytesInUse();
      const syncUsed = await this.sync.getBytesInUse();
      
      return {
        local: {
          used: localUsed,
          limit: chrome.storage.local.QUOTA_BYTES,
          percentage: (localUsed / chrome.storage.local.QUOTA_BYTES) * 100
        },
        sync: {
          used: syncUsed,
          limit: chrome.storage.sync.QUOTA_BYTES,
          percentage: (syncUsed / chrome.storage.sync.QUOTA_BYTES) * 100
        }
      };
    } catch (error) {
      console.error('Ошибка получения информации о хранилище:', error);
      return null;
    }
  }

  /**
   * Сохранение настроек расширения
   */
  async saveSettings(settings) {
    const settingsKey = 'neocenka_settings';
    return await this.setLocal(settingsKey, settings);
  }

  /**
   * Получение настроек расширения
   */
  async getSettings() {
    const settingsKey = 'neocenka_settings';
    const settings = await this.getLocal(settingsKey);
    
    // Настройки по умолчанию
    const defaultSettings = {
      parsing_delay_avito: 30,
      parsing_delay_cian: 30,
      auto_process_duplicates: false,
      auto_archive_listings: true,
      sync_enabled: false,
      sync_key: '',
      notifications_enabled: true,
      theme: 'light'
    };
    
    return { ...defaultSettings, ...settings };
  }

  /**
   * Обновление конкретной настройки
   */
  async updateSetting(key, value) {
    const settings = await this.getSettings();
    settings[key] = value;
    return await this.saveSettings(settings);
  }

  /**
   * Синхронизация данных между устройствами
   */
  async syncData(syncKey) {
    if (!syncKey) {
      throw new Error('Ключ синхронизации не указан');
    }

    try {
      // Получаем данные из IndexedDB
      const exportData = await db.exportData();
      
      // Сохраняем в синхронизируемое хранилище с ключом
      const syncData = {
        data: exportData,
        timestamp: new Date().toISOString(),
        version: '1.0.0'
      };
      
      await this.setSync(`sync_${syncKey}`, syncData);
      return true;
    } catch (error) {
      console.error('Ошибка синхронизации данных:', error);
      return false;
    }
  }

  /**
   * Получение синхронизированных данных
   */
  async getSyncedData(syncKey) {
    if (!syncKey) {
      throw new Error('Ключ синхронизации не указан');
    }

    try {
      const syncData = await this.getSync(`sync_${syncKey}`);
      return syncData;
    } catch (error) {
      console.error('Ошибка получения синхронизированных данных:', error);
      return null;
    }
  }

  /**
   * Кэширование временных данных
   */
  async cacheData(key, data, ttl = 3600000) { // TTL по умолчанию 1 час
    const cacheItem = {
      data: data,
      timestamp: Date.now(),
      ttl: ttl
    };
    
    return await this.setLocal(`cache_${key}`, cacheItem);
  }

  /**
   * Получение данных из кэша
   */
  async getCachedData(key) {
    try {
      const cacheItem = await this.getLocal(`cache_${key}`);
      
      if (!cacheItem) {
        return null;
      }
      
      // Проверяем срок действия
      if (Date.now() - cacheItem.timestamp > cacheItem.ttl) {
        // Кэш устарел, удаляем его
        await this.removeLocal(`cache_${key}`);
        return null;
      }
      
      return cacheItem.data;
    } catch (error) {
      console.error('Ошибка получения данных из кэша:', error);
      return null;
    }
  }

  /**
   * Очистка устаревшего кэша
   */
  async cleanupCache() {
    try {
      const allData = await this.local.get();
      const cacheKeys = Object.keys(allData).filter(key => key.startsWith('cache_'));
      
      for (const key of cacheKeys) {
        const cacheItem = allData[key];
        if (cacheItem && Date.now() - cacheItem.timestamp > cacheItem.ttl) {
          await this.removeLocal(key);
        }
      }
    } catch (error) {
      console.error('Ошибка очистки кэша:', error);
    }
  }

  /**
   * Сохранение состояния парсинга
   */
  async saveParsingState(segmentId, state) {
    const key = `parsing_state_${segmentId}`;
    return await this.setLocal(key, {
      ...state,
      timestamp: Date.now()
    });
  }

  /**
   * Получение состояния парсинга
   */
  async getParsingState(segmentId) {
    const key = `parsing_state_${segmentId}`;
    return await this.getLocal(key);
  }

  /**
   * Сохранение статистики использования
   */
  async saveUsageStats(stats) {
    const currentStats = await this.getLocal('usage_stats') || {};
    const updatedStats = {
      ...currentStats,
      ...stats,
      lastUpdated: Date.now()
    };
    
    return await this.setLocal('usage_stats', updatedStats);
  }

  /**
   * Получение статистики использования
   */
  async getUsageStats() {
    return await this.getLocal('usage_stats') || {};
  }

  /**
   * Добавление события в лог
   */
  async logEvent(event) {
    const logs = await this.getLocal('event_logs') || [];
    logs.push({
      ...event,
      timestamp: Date.now()
    });
    
    // Ограничиваем размер лога (последние 1000 событий)
    if (logs.length > 1000) {
      logs.splice(0, logs.length - 1000);
    }
    
    return await this.setLocal('event_logs', logs);
  }

  /**
   * Получение логов событий
   */
  async getEventLogs(limit = 100) {
    const logs = await this.getLocal('event_logs') || [];
    return logs.slice(-limit);
  }

  /**
   * Очистка старых логов
   */
  async clearOldLogs(maxAge = 7 * 24 * 60 * 60 * 1000) { // 7 дней по умолчанию
    const logs = await this.getLocal('event_logs') || [];
    const cutoffTime = Date.now() - maxAge;
    
    const filteredLogs = logs.filter(log => log.timestamp > cutoffTime);
    return await this.setLocal('event_logs', filteredLogs);
  }

  /**
   * Слушатель изменений в хранилище
   */
  onStorageChanged(callback) {
    chrome.storage.onChanged.addListener((changes, namespace) => {
      callback(changes, namespace);
    });
  }

  /**
   * Экспорт всех данных хранилища
   */
  async exportStorageData() {
    try {
      const localData = await this.local.get();
      const syncData = await this.sync.get();
      
      return {
        local: localData,
        sync: syncData,
        exportedAt: new Date().toISOString()
      };
    } catch (error) {
      console.error('Ошибка экспорта данных хранилища:', error);
      return null;
    }
  }

  /**
   * Импорт данных в хранилище
   */
  async importStorageData(data) {
    try {
      if (data.local) {
        await this.local.set(data.local);
      }
      
      if (data.sync) {
        await this.sync.set(data.sync);
      }
      
      return true;
    } catch (error) {
      console.error('Ошибка импорта данных хранилища:', error);
      return false;
    }
  }
}

// Создаем единственный экземпляр
const storage = new ChromeStorage();

// Экспорт для использования в других модулях
if (typeof module !== 'undefined' && module.exports) {
  module.exports = storage;
} else if (typeof window !== 'undefined') {
  window.storage = storage;
}