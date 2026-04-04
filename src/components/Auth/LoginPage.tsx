import React, { useState } from 'react';
import { login } from '@/services/api-service';
import './Auth.css';

interface LoginPageProps {
  onLoginSuccess: () => void;
  onSwitchToRegister: () => void;
  onSwitchToForgot: () => void;
}

const LoginPage: React.FC<LoginPageProps> = ({ onLoginSuccess, onSwitchToRegister, onSwitchToForgot }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await login(email, password);
      onLoginSuccess();
    } catch (err: any) {
      setError(err.message || 'Ошибка входа');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-logo">Росреestr Deals</div>
        <h2 className="auth-title">Вход</h2>

        <form className="auth-form" onSubmit={handleSubmit}>
          <label>Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="your@email.com"
            required
          />
          <label>Пароль</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Введите пароль"
            required
          />
          <button type="submit" className="auth-btn" disabled={loading}>
            {loading ? 'Вход...' : 'Войти'}
          </button>
        </form>

        {error && <div className="auth-error">{error}</div>}

        <a className="auth-link" onClick={onSwitchToForgot}>
          Забыли пароль?
        </a>
        <a className="auth-link" onClick={onSwitchToRegister}>
          Регистрация
        </a>
      </div>
    </div>
  );
};

export default LoginPage;
