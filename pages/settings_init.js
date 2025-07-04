/**
 * Инициализация страницы настроек
 */

// Инициализация компонентов
document.addEventListener('DOMContentLoaded', () => {
    // Навигация
    const navigation = new NavigationComponent();
    document.getElementById('navigation-container').innerHTML = navigation.render();
    navigation.init();
    navigation.setPageTitle('Настройки');
    
    // Перемещаем контент настроек в основной контейнер
    const pageContent = document.getElementById('page-content');
    const settingsContent = document.getElementById('settings-content');
    
    if (pageContent && settingsContent) {
        // Добавляем breadcrumbs
        const breadcrumbs = BreadcrumbsComponent.forPage('settings');
        const breadcrumbsContainer = document.createElement('div');
        breadcrumbsContainer.innerHTML = breadcrumbs.render();
        pageContent.appendChild(breadcrumbsContainer);
        
        // Перемещаем все дочерние элементы
        settingsContent.classList.remove('hidden');
        while (settingsContent.firstChild) {
            pageContent.appendChild(settingsContent.firstChild);
        }
    }
    
    // Футер
    const footer = new FooterComponent();
    document.getElementById('footer-container').innerHTML = footer.render();
});