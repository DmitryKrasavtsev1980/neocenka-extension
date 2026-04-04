import React, { useState } from 'react';
import { forgotPassword } from '@/services/api-service';
import './Auth.css';

interface ForgotPasswordPageProps {
  onSwitchToLogin: () => void;
}

const ForgotPasswordPage: React.FC<ForgotPasswordPageProps> = ({ onSwitchToLogin }) => {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      await forgotPassword(email);
      setSuccess('Ссылка для сброса пароля отправлена на ваш email');
    } catch (err: any) {
      setError(err.message || 'Ошибка отправки');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-logo">Rosreestr Deals</div>
        <h2 className="auth-title">Восстановление пароля</h2>

        <form className="auth-form" onSubmit={handleSubmit}>
          <label>Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="your@email.com"
            required
          />
          <button type="submit" className="auth-btn" disabled={loading}>
            {loading ? 'Отправка...' : 'Отправить ссылку'}
          </button>
        </form>

        {error && <div className="auth-error">{error}</div>}
        {success && <div className="auth-success">{success}</div>}

        <a className="auth-link" onClick={onSwitchToLogin}>
          Вернуться к входу
        </a>
      </div>
    </div>
  );
};

export default ForgotPasswordPage;
