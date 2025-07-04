// Инициализация компонентов для главной страницы
document.addEventListener('DOMContentLoaded', () => {
    // Навигация
    const navigation = new NavigationComponent();
    document.getElementById('navigation-container').innerHTML = navigation.render();
    navigation.init();
    
    // Перемещаем контент в основной контейнер
    const pageContent = document.getElementById('page-content');
    const mainContent = document.getElementById('main-content');
    
    if (pageContent && mainContent) {
        // Добавляем breadcrumbs
        const breadcrumbs = BreadcrumbsComponent.forPage('main');
        const breadcrumbsContainer = document.createElement('div');
        breadcrumbsContainer.innerHTML = breadcrumbs.render();
        pageContent.appendChild(breadcrumbsContainer);
        
        // Перемещаем все дочерние элементы
        mainContent.classList.remove('hidden');
        while (mainContent.firstChild) {
            pageContent.appendChild(mainContent.firstChild);
        }
    }
    
    // Футер
    const footer = new FooterComponent();
    document.getElementById('footer-container').innerHTML = footer.render();
    
    // Инициализируем MainPage после того, как DOM полностью готов
    if (window.MainPage) {
        const mainPage = new MainPage();
        // Инициализируем после следующего тика событийного цикла
        Promise.resolve().then(() => {
            debugLogger.log('Запускаем MainPage.init()...');
            mainPage.init().catch(error => {
                debugLogger.error('Ошибка инициализации MainPage:', error);
            });
        });
    } else {
        debugLogger.error('MainPage класс не найден!');
    }
});