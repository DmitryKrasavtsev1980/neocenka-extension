/**
 * Service Worker для Chrome Extension
 */

// Установка расширения
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('Расширение установлено');
  } else if (details.reason === 'update') {
    console.log('Расширение обновлено до версии', chrome.runtime.getManifest().version);
  }
});

// Обработка сообщений от popup и страниц
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_STATS') {
    // Возвращаем статистику
    getDatabaseStats()
      .then((stats) => sendResponse({ success: true, stats }))
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true; // Указываем, что ответ будет асинхронным
  }

  return false;
});

// Импорт функций для работы с БД
async function getDatabaseStats() {
  // База данных доступна только в контексте страниц, не в service worker
  // Поэтому возвращаем заглушку
  return {
    totalDeals: 0,
    totalImports: 0,
    years: [],
    regions: [],
  };
}

export {};
