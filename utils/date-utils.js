/**
 * Утилиты для работы с датами
 * Neocenka Extension
 */

class DateUtils {
  /**
   * Форматирует дату в читаемый вид
   */
  static formatDate(date, options = {}) {
    if (!date) return '-';

    const dateObj = typeof date === 'string' ? new Date(date) : date;

    const defaultOptions = {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    };

    const formatOptions = { ...defaultOptions, ...options };

    return dateObj.toLocaleDateString('ru-RU', formatOptions);
  }

  /**
   * Форматирует дату для filename
   */
  static formatDateForFilename(date) {
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    return dateObj.toISOString().slice(0, 19).replace(/:/g, '-');
  }

  /**
   * Получает начало дня
   */
  static getStartOfDay(date) {
    const dateObj = new Date(date);
    dateObj.setHours(0, 0, 0, 0);
    return dateObj;
  }

  /**
   * Получает конец дня
   */
  static getEndOfDay(date) {
    const dateObj = new Date(date);
    dateObj.setHours(23, 59, 59, 999);
    return dateObj;
  }

  /**
   * Получает дату N дней назад
   */
  static getDaysAgo(days) {
    const date = new Date();
    date.setDate(date.getDate() - days);
    return date;
  }

  /**
   * Проверяет является ли дата сегодняшней
   */
  static isToday(date) {
    const today = new Date();
    const checkDate = new Date(date);
    return checkDate.toDateString() === today.toDateString();
  }

  /**
   * Возвращает относительное время (X дней назад)
   */
  static getRelativeTime(date) {
    const now = new Date();
    const past = new Date(date);
    const diffTime = Math.abs(now - past);
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    const diffHours = Math.floor(diffTime / (1000 * 60 * 60));
    const diffMinutes = Math.floor(diffTime / (1000 * 60));

    if (diffDays > 0) {
      return `${diffDays} ${diffDays === 1 ? 'день' : diffDays < 5 ? 'дня' : 'дней'} назад`;
    } else if (diffHours > 0) {
      return `${diffHours} ${diffHours === 1 ? 'час' : diffHours < 5 ? 'часа' : 'часов'} назад`;
    } else if (diffMinutes > 0) {
      return `${diffMinutes} ${diffMinutes === 1 ? 'минуту' : diffMinutes < 5 ? 'минуты' : 'минут'} назад`;
    } else {
      return 'только что';
    }
  }
}

// Экспортируем для использования
if (typeof window !== 'undefined') {
  window.DateUtils = DateUtils;
}