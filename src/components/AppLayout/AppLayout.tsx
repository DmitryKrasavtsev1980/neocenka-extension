import React, { useState } from 'react';
import { getCurrentUser, logout } from '@/services/api-service';
import { SearchPage } from '@/pages/search/SearchPage';
import ImportPage from '@/pages/import/ImportPage';
import ModulesPage from '@/components/Modules/ModulesPage';
import ProfilePage from '@/components/Profile/ProfilePage';
import './AppLayout.css';

type ActivePage = 'modules' | 'search' | 'import' | 'profile';

const AppLayout: React.FC = () => {
  const [activePage, setActivePage] = useState<ActivePage>('modules');
  const [importModuleCode, setImportModuleCode] = useState<string | undefined>(undefined);
  const user = getCurrentUser();

  const menuItems: { id: ActivePage; label: string; icon: string }[] = [
    { id: 'modules', label: 'Мои модули', icon: '📦' },
    { id: 'search', label: 'Поиск сделок', icon: '🔍' },
    { id: 'import', label: 'Импорт', icon: '📥' },
    { id: 'profile', label: 'Профиль', icon: '👤' },
  ];

  const handleLogout = async () => {
    await logout();
    window.location.reload();
  };

  const handleModuleOpen = (code: string) => {
    setImportModuleCode(code);
    setActivePage('import');
  };

  const handleNavigate = (page: ActivePage) => {
    if (page !== 'import') {
      setImportModuleCode(undefined);
    }
    setActivePage(page);
  };

  const renderContent = () => {
    switch (activePage) {
      case 'modules':
        return <ModulesPage onModuleOpen={handleModuleOpen} />;
      case 'search':
        return <SearchPage />;
      case 'import':
        return <ImportPage initialModuleCode={importModuleCode} />;
      case 'profile':
        return <ProfilePage />;
      default:
        return <ModulesPage onModuleOpen={handleModuleOpen} />;
    }
  };

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="sidebar-logo">RD</div>
          <div className="sidebar-user">{user?.name || 'Пользователь'}</div>
        </div>

        <nav className="sidebar-nav">
          <div className="sidebar-section">НАВИГАЦИЯ</div>
          {menuItems.map(item => (
            <button
              key={item.id}
              className={`sidebar-item ${activePage === item.id ? 'active' : ''}`}
              onClick={() => handleNavigate(item.id)}
            >
              <span className="sidebar-item-icon">{item.icon}</span>
              <span className="sidebar-item-label">{item.label}</span>
            </button>
          ))}

          <div className="sidebar-divider" />

          <button className="sidebar-item logout" onClick={handleLogout}>
            <span className="sidebar-item-icon">🚪</span>
            <span className="sidebar-item-label">Выход</span>
          </button>
        </nav>
      </aside>

      <main className="main-content">
        {renderContent()}
      </main>
    </div>
  );
};

export default AppLayout;
