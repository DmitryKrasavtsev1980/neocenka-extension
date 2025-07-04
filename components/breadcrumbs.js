/**
 * Компонент breadcrumbs для Neocenka
 */

class BreadcrumbsComponent {
  constructor(items = []) {
    this.items = items;
  }

  render() {
    if (!this.items || this.items.length === 0) {
      return '';
    }

    return `
      <nav class="sm:flex mb-6" aria-label="Breadcrumb">
        <ol role="list" class="flex items-center space-x-4">
          ${this.items.map((item, index) => {
            const isLast = index === this.items.length - 1;
            
            if (index === 0) {
              return `
                <li>
                  <div class="flex">
                    <a href="${item.href || '#'}" class="text-sm font-medium text-gray-500 hover:text-gray-700">
                      ${item.label}
                    </a>
                  </div>
                </li>
              `;
            } else {
              return `
                <li>
                  <div class="flex items-center">
                    <svg class="size-5 shrink-0 text-gray-400" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" data-slot="icon">
                      <path fill-rule="evenodd" d="M8.22 5.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L11.94 10 8.22 6.28a.75.75 0 0 1 0-1.06Z" clip-rule="evenodd" />
                    </svg>
                    ${isLast ? 
                      `<span aria-current="page" class="ml-4 text-sm font-medium text-gray-500">${item.label}</span>` :
                      `<a href="${item.href || '#'}" class="ml-4 text-sm font-medium text-gray-500 hover:text-gray-700">${item.label}</a>`
                    }
                  </div>
                </li>
              `;
            }
          }).join('')}
        </ol>
      </nav>
    `;
  }

  // Статические методы для создания breadcrumbs для разных страниц
  static forPage(pageName) {
    const breadcrumbsMap = {
      'main': [
        { label: 'Главная', href: 'main.html' },
        { label: 'Области и Сегменты' }
      ],
      'area': [
        { label: 'Главная', href: 'main.html' },
        { label: 'Управление областью' }
      ],
      'segment': [
        { label: 'Главная', href: 'main.html' },
        { label: 'Анализ сегмента' }
      ],
      'reports': [
        { label: 'Главная', href: 'main.html' },
        { label: 'Отчеты и аналитика' }
      ],
      'settings': [
        { label: 'Главная', href: 'main.html' },
        { label: 'Настройки' }
      ]
    };

    return new BreadcrumbsComponent(breadcrumbsMap[pageName] || []);
  }
}