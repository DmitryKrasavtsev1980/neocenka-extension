/**
 * Компонент навигации для Neocenka
 */

class NavigationComponent {
  constructor() {
    this.currentPage = this.getCurrentPage();
    this.mobileMenuOpen = false;
  }

  getCurrentPage() {
    const path = window.location.pathname;
    if (path.includes('main.html')) return 'main';
    if (path.includes('settings.html')) return 'settings';
    return 'main';
  }

  render() {
    return `
      <nav class="border-b border-gray-200 bg-white">
        <div class="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div class="flex h-16 justify-between">
            <div class="flex">
              <div class="flex shrink-0 items-center">
                <img class="h-8 w-auto" src="../components/logo.svg" alt="Neocenka" />
              </div>
              <div class="sm:flex sm:-my-px sm:ml-6 sm:space-x-8">
                <a href="main.html" class="inline-flex items-center border-b-2 ${this.currentPage === 'main' ? 'border-sky-500 text-gray-900' : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'} px-1 pt-1 text-sm font-medium" ${this.currentPage === 'main' ? 'aria-current="page"' : ''}>
                  Главная
                </a>
                <a href="settings.html" class="inline-flex items-center border-b-2 ${this.currentPage === 'settings' ? 'border-sky-500 text-gray-900' : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'} px-1 pt-1 text-sm font-medium" ${this.currentPage === 'settings' ? 'aria-current="page"' : ''}>
                  Настройки
                </a>
              </div>
            </div>
          </div>
        </div>
      </nav>
      
      <div class="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <main>
          <div id="page-content">
            <!-- Контент страницы будет здесь -->
          </div>
        </main>
      </div>
    `;
  }

  init() {
    // Добавляем обработчик для мобильного меню
    document.addEventListener('click', (e) => {
      if (e.target.closest('#mobile-menu-button')) {
        this.toggleMobileMenu();
      }
    });
  }

  toggleMobileMenu() {
    this.mobileMenuOpen = !this.mobileMenuOpen;
    const mobileMenu = document.getElementById('mobile-menu');
    const button = document.getElementById('mobile-menu-button');

    if (this.mobileMenuOpen) {
      mobileMenu.classList.remove('hidden');
      button.setAttribute('aria-expanded', 'true');
    } else {
      mobileMenu.classList.add('hidden');
      button.setAttribute('aria-expanded', 'false');
    }

    // Переключаем иконки
    const icons = button.querySelectorAll('svg');
    icons.forEach(icon => icon.classList.toggle('hidden'));
  }

  setPageTitle(title) {
    const titleElement = document.getElementById('page-title');
    if (titleElement) {
      titleElement.textContent = title;
    }
  }

  updateDateTime() {
    const now = new Date();
    const options = { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    };
    const dateTimeElement = document.getElementById('currentDateTime');
    if (dateTimeElement) {
      dateTimeElement.textContent = now.toLocaleDateString('ru-RU', options);
    }
  }
}