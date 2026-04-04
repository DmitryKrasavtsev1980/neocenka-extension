import React, { useState } from 'react';
import { getCurrentUser, unlinkDevice } from '@/services/api-service';
import { getDeviceId } from '@/services/device-service';
import './Profile.css';

const ProfilePage: React.FC = () => {
  const user = getCurrentUser();
  const [message, setMessage] = useState('');

  const handleUnlink = async () => {
    const deviceId = await getDeviceId();
    try {
      await unlinkDevice(deviceId);
      setMessage('Устройство отвязано. Все данные будут удалены при следующем входе.');
    } catch {
      setMessage('Ошибка при отвязке устройства');
    }
  };

  if (!user) return null;

  return (
    <div className="profile-page">
      <h2 className="profile-title">Профиль</h2>

      <div className="profile-card">
        <div className="profile-row">
          <span className="profile-label">Имя</span>
          <span className="profile-value">{user.name}</span>
        </div>
        <div className="profile-row">
          <span className="profile-label">Email</span>
          <span className="profile-value">{user.email}</span>
        </div>
        <div className="profile-row">
          <span className="profile-label">Статус</span>
          <span className="profile-value">{user.status === 'active' ? 'Активен' : 'Заблокирован'}</span>
        </div>
        <div className="profile-row">
          <span className="profile-label">Дата регистрации</span>
          <span className="profile-value">{new Date(user.created_at).toLocaleDateString('ru-RU')}</span>
        </div>
      </div>

      <h3 className="profile-section-title">Устройства</h3>
      <p className="profile-hint">
        Это устройство привязано к вашему аккаунту. Отвязка удалит все данные из расширения.
      </p>
      <button className="profile-unlink-btn" onClick={handleUnlink}>
        Отвязать это устройство
      </button>

      {message && <div className="profile-message">{message}</div>}
    </div>
  );
};

export default ProfilePage;
