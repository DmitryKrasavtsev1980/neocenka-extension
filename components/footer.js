/**
 * Компонент футера для Neocenka
 */

class FooterComponent {
  render() {
    return `
      <footer class="bg-gray-900">
        <div class="mx-auto max-w-7xl px-6 pt-16 pb-8 sm:pt-24 lg:px-8 lg:pt-32">
          <div class="xl:grid xl:grid-cols-3 xl:gap-8">
            <div class="flex items-center">
              <img class="h-9 w-9 mr-3" src="../components/logo-dark.svg" alt="Neocenka" />
              <div>
                <h3 class="text-lg font-semibold text-white">Neocenka</h3>
                <p class="text-sm text-gray-400">Анализ рынка недвижимости</p>
              </div>
            </div>
            <div class="mt-16 grid grid-cols-2 gap-8 xl:col-span-2 xl:mt-0">
              <div class="md:grid md:grid-cols-2 md:gap-8">
                <div>
                  <h3 class="text-sm font-semibold text-white">Функции</h3>
                  <ul role="list" class="mt-6 space-y-4">
                    <li>
                      <a href="main.html" class="text-sm text-gray-400 hover:text-white">Сегменты</a>
                    </li>
                    <li>
                      <a href="reports.html" class="text-sm text-gray-400 hover:text-white">Отчеты</a>
                    </li>
                    <li>
                      <a href="settings.html" class="text-sm text-gray-400 hover:text-white">Настройки</a>
                    </li>
                    <li>
                      <span class="text-sm text-gray-400">Мониторинг цен</span>
                    </li>
                    <li>
                      <span class="text-sm text-gray-400">Анализ рынка</span>
                    </li>
                  </ul>
                </div>
                <div class="mt-10 md:mt-0">
                  <h3 class="text-sm font-semibold text-white">Платформы</h3>
                  <ul role="list" class="mt-6 space-y-4">
                    <li>
                      <a href="https://avito.ru" target="_blank" class="text-sm text-gray-400 hover:text-white">Avito.ru</a>
                    </li>
                    <li>
                      <a href="https://cian.ru" target="_blank" class="text-sm text-gray-400 hover:text-white">Cian.ru</a>
                    </li>
                  </ul>
                </div>
              </div>
              <div class="md:grid md:grid-cols-2 md:gap-8">
                <div>
                  <h3 class="text-sm font-semibold text-white">Возможности</h3>
                  <ul role="list" class="mt-6 space-y-4">
                    <li>
                      <span class="text-sm text-gray-400">Парсинг объявлений</span>
                    </li>
                    <li>
                      <span class="text-sm text-gray-400">Обработка дублей</span>
                    </li>
                    <li>
                      <span class="text-sm text-gray-400">Экспорт данных</span>
                    </li>
                    <li>
                      <span class="text-sm text-gray-400">История изменений</span>
                    </li>
                  </ul>
                </div>
                <div class="mt-10 md:mt-0">
                  <h3 class="text-sm font-semibold text-white">О проекте</h3>
                  <ul role="list" class="mt-6 space-y-4">
                    <li>
                      <span class="text-sm text-gray-400">Версия 1.0.0</span>
                    </li>
                    <li>
                      <span class="text-sm text-gray-400">Chrome Extension</span>
                    </li>
                    <li>
                      <span class="text-sm text-gray-400">Open Source</span>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
          <div class="mt-8 border-t border-white/10 pt-8 md:flex md:items-center md:justify-between">
            <div class="flex gap-x-6 md:order-2">
              <a href="https://github.com/neocenka" target="_blank" class="text-gray-400 hover:text-white">
                <span class="sr-only">GitHub</span>
                <svg class="h-6 w-6" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path fill-rule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clip-rule="evenodd" />
                </svg>
              </a>
            </div>
            <p class="mt-8 text-sm text-gray-400 md:order-1 md:mt-0">&copy; 2024 Neocenka. Все права защищены.</p>
          </div>
        </div>
      </footer>
    `;
  }
}