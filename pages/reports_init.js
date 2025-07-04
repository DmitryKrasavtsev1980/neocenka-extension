// Инициализация компонентов для страницы отчетов
document.addEventListener('DOMContentLoaded', () => {
    // Навигация
    const navigation = new NavigationComponent();
    document.getElementById('navigation-container').innerHTML = navigation.render();
    navigation.init();
    navigation.setPageTitle('Отчеты');
    
    // Перемещаем контент в основной контейнер
    const pageContent = document.getElementById('page-content');
    const reportsContent = document.getElementById('reports-content');
    
    if (pageContent && reportsContent) {
        // Добавляем breadcrumbs
        const breadcrumbs = BreadcrumbsComponent.forPage('reports');
        const breadcrumbsContainer = document.createElement('div');
        breadcrumbsContainer.innerHTML = breadcrumbs.render();
        pageContent.appendChild(breadcrumbsContainer);
        
        // Добавляем заголовок
        const header = document.createElement('div');
        header.className = 'mb-8';
        header.innerHTML = `
            <div class="flex-1 min-w-0">
                <h2 class="text-2xl font-bold leading-7 text-gray-900 sm:text-3xl">
                    Отчеты и аналитика
                </h2>
                <p class="mt-1 text-sm text-gray-500">
                    Анализ данных по объявлениям недвижимости
                </p>
            </div>
        `;
        
        pageContent.appendChild(header);
        
        // Перемещаем все дочерние элементы
        while (reportsContent.firstChild) {
            pageContent.appendChild(reportsContent.firstChild);
        }
        
        // Убираем класс hidden с контента
        reportsContent.classList.remove('hidden');
    }
    
    // Футер
    const footer = new FooterComponent();
    document.getElementById('footer-container').innerHTML = footer.render();
    
    // Инициализируем ReportsPage после того, как DOM полностью готов
    if (window.ReportsPage) {
        const reportsPage = new ReportsPage();
        reportsPage.init();
    }
});