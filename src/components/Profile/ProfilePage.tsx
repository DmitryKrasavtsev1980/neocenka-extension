import React, { useState } from 'react';
import { getCurrentUser, unlinkDevice } from '@/services/api-service';
import { getDeviceId } from '@/services/device-service';
import { Button } from '@/components/catalyst/button';
import { Heading, Subheading } from '@/components/catalyst/heading';
import { Field, Label } from '@/components/catalyst/fieldset';

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
    <div className="max-w-[600px]">
      <Heading level={2} className="mb-5 text-xl font-semibold text-gray-800 dark:text-white">
        Профиль
      </Heading>

      <div className="rounded-xl bg-white p-5 shadow-sm dark:bg-white/5 dark:ring-1 dark:ring-white/10">
        <Field>
          <div className="flex justify-between border-b border-gray-100 py-3 last:border-b-0 dark:border-white/5">
            <Label className="text-[13px] text-gray-500 dark:text-zinc-400">Имя</Label>
            <span className="text-sm font-medium text-gray-800 dark:text-white">{user.name}</span>
          </div>
        </Field>
        <Field>
          <div className="flex justify-between border-b border-gray-100 py-3 last:border-b-0 dark:border-white/5">
            <Label className="text-[13px] text-gray-500 dark:text-zinc-400">Email</Label>
            <span className="text-sm font-medium text-gray-800 dark:text-white">{user.email}</span>
          </div>
        </Field>
        <Field>
          <div className="flex justify-between border-b border-gray-100 py-3 last:border-b-0 dark:border-white/5">
            <Label className="text-[13px] text-gray-500 dark:text-zinc-400">Статус</Label>
            <span className="text-sm font-medium text-gray-800 dark:text-white">
              {user.status === 'active' ? 'Активен' : 'Заблокирован'}
            </span>
          </div>
        </Field>
        <Field>
          <div className="flex justify-between py-3">
            <Label className="text-[13px] text-gray-500 dark:text-zinc-400">Дата регистрации</Label>
            <span className="text-sm font-medium text-gray-800 dark:text-white">
              {new Date(user.created_at).toLocaleDateString('ru-RU')}
            </span>
          </div>
        </Field>
      </div>

      <Subheading
        level={3}
        className="mt-6 mb-2 text-base font-semibold text-gray-800 dark:text-white"
      >
        Устройства
      </Subheading>
      <p className="mb-3 text-[13px] text-gray-500 dark:text-zinc-400">
        Это устройство привязано к вашему аккаунту. Отвязка удалит все данные из расширения.
      </p>
      <Button color="red" onClick={handleUnlink}>
        Отвязать это устройство
      </Button>

      {message && (
        <div className="mt-3 rounded-lg bg-blue-50 px-3 py-2 text-[13px] text-blue-800 dark:bg-blue-900/20 dark:text-blue-300">
          {message}
        </div>
      )}
    </div>
  );
};

export default ProfilePage;
