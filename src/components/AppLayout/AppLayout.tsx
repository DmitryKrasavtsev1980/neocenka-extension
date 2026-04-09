import React, { useState } from 'react';
import { getCurrentUser, logout } from '@/services/api-service';
import { useTheme } from '@/components/ThemeProvider';
import { SearchPage } from '@/pages/search/SearchPage';
import ImportPage from '@/pages/import/ImportPage';
import ModulesPage from '@/components/Modules/ModulesPage';
import ProfilePage from '@/components/Profile/ProfilePage';
import {
  Sidebar,
  SidebarBody,
  SidebarFooter,
  SidebarHeader,
  SidebarItem,
  SidebarLabel,
  SidebarSection,
  SidebarSpacer,
} from '@/components/catalyst/sidebar';
import {
  CubeIcon,
  MagnifyingGlassIcon,
  ArrowDownTrayIcon,
  UserIcon,
  ArrowLeftOnRectangleIcon,
  SunIcon,
  MoonIcon,
} from '@heroicons/react/20/solid';

type ActivePage = 'modules' | 'search' | 'import' | 'profile';

const AppLayout: React.FC = () => {
  const [activePage, setActivePage] = useState<ActivePage>('modules');
  const [importModuleCode, setImportModuleCode] = useState<string | undefined>(undefined);
  const user = getCurrentUser();
  const { theme, toggleTheme } = useTheme();

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
        return <SearchPage onNavigate={handleNavigate} />;
      case 'import':
        return <ImportPage initialModuleCode={importModuleCode} onNavigate={handleNavigate} />;
      case 'profile':
        return <ProfilePage />;
      default:
        return <ModulesPage onModuleOpen={handleModuleOpen} />;
    }
  };

  return (
    <div className="flex h-screen bg-zinc-100 dark:bg-zinc-950">
      {/* Sidebar */}
      <div className="hidden lg:flex w-64 flex-col border-r border-zinc-950/10 bg-white dark:border-white/10 dark:bg-zinc-900">
        <Sidebar>
          <SidebarHeader className="flex-row items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-sm font-bold text-white">
              RD
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-semibold text-zinc-950 dark:text-white">
                Rosreestr Deals
              </span>
              <span className="text-xs text-zinc-500 dark:text-zinc-400 truncate max-w-[160px]">
                {user?.name || 'Пользователь'}
              </span>
            </div>
          </SidebarHeader>

          <SidebarBody>
            <SidebarSection>
              <SidebarItem current={activePage === 'modules'} onClick={() => handleNavigate('modules')}>
                <CubeIcon data-slot="icon" />
                <SidebarLabel>Мои модули</SidebarLabel>
              </SidebarItem>
              <SidebarItem current={activePage === 'search'} onClick={() => handleNavigate('search')}>
                <MagnifyingGlassIcon data-slot="icon" />
                <SidebarLabel>Поиск сделок</SidebarLabel>
              </SidebarItem>
              <SidebarItem current={activePage === 'import'} onClick={() => handleNavigate('import')}>
                <ArrowDownTrayIcon data-slot="icon" />
                <SidebarLabel>Импорт</SidebarLabel>
              </SidebarItem>
              <SidebarItem current={activePage === 'profile'} onClick={() => handleNavigate('profile')}>
                <UserIcon data-slot="icon" />
                <SidebarLabel>Профиль</SidebarLabel>
              </SidebarItem>
            </SidebarSection>

            <SidebarSpacer />

            <SidebarSection>
              <SidebarItem onClick={toggleTheme}>
                {theme === 'light' ? (
                  <MoonIcon data-slot="icon" />
                ) : (
                  <SunIcon data-slot="icon" />
                )}
                <SidebarLabel>{theme === 'light' ? 'Тёмная тема' : 'Светлая тема'}</SidebarLabel>
              </SidebarItem>
              <SidebarItem onClick={handleLogout}>
                <ArrowLeftOnRectangleIcon data-slot="icon" className="fill-red-500 dark:fill-red-400" />
                <SidebarLabel className="text-red-500 dark:text-red-400">Выход</SidebarLabel>
              </SidebarItem>
            </SidebarSection>
          </SidebarBody>
        </Sidebar>
      </div>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        {renderContent()}
      </main>
    </div>
  );
};

export default AppLayout;
