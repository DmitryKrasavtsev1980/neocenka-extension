import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { loadAuth, onUnauthorized } from '@/services/api-service';
import { ThemeProvider } from '@/components/ThemeProvider';
import LoginPage from '@/components/Auth/LoginPage';
import RegisterPage from '@/components/Auth/RegisterPage';
import ForgotPasswordPage from '@/components/Auth/ForgotPasswordPage';
import AppLayout from '@/components/AppLayout/AppLayout';
import '@/styles/tailwind.css';

type Page = 'login' | 'register' | 'forgot-password' | 'app';

const App: React.FC = () => {
  const [page, setPage] = useState<Page>('login');
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    onUnauthorized(() => setPage('login'));

    loadAuth().then(({ token }) => {
      if (token) {
        setPage('app');
      }
      setAuthChecked(true);
    }).catch(() => {
      setPage('login');
      setAuthChecked(true);
    });
  }, []);

  if (!authChecked) {
    return (
      <div className="flex items-center justify-center h-screen text-zinc-500">
        Загрузка...
      </div>
    );
  }

  const handleLoginSuccess = () => {
    setPage('app');
  };

  const renderPage = () => {
    switch (page) {
      case 'login':
        return <LoginPage onLoginSuccess={handleLoginSuccess} onSwitchToRegister={() => setPage('register')} onSwitchToForgot={() => setPage('forgot-password')} />;
      case 'register':
        return <RegisterPage onSwitchToLogin={() => setPage('login')} onRegisterSuccess={handleLoginSuccess} />;
      case 'forgot-password':
        return <ForgotPasswordPage onSwitchToLogin={() => setPage('login')} />;
      case 'app':
        return <AppLayout />;
      default:
        return <LoginPage onLoginSuccess={handleLoginSuccess} onSwitchToRegister={() => setPage('register')} onSwitchToForgot={() => setPage('forgot-password')} />;
    }
  };

  return (
    <ThemeProvider>
      {renderPage()}
    </ThemeProvider>
  );
};

const container = document.getElementById('root');
if (container) {
  createRoot(container).render(<App />);
}
