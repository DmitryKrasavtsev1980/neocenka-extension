import React, { useState } from 'react';
import { register } from '@/services/api-service';
import { Button } from '@/components/catalyst/button';
import { Input } from '@/components/catalyst/input';
import { Heading } from '@/components/catalyst/heading';
import { Field, Label } from '@/components/catalyst/fieldset';
import { TextLink } from '@/components/catalyst/text';
import { ThemeProvider } from '@/components/ThemeProvider';
import '@/styles/tailwind.css';

interface RegisterPageProps {
  onRegisterSuccess: () => void;
  onSwitchToLogin: () => void;
}

const RegisterPage: React.FC<RegisterPageProps> = ({ onRegisterSuccess, onSwitchToLogin }) => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirmation, setPasswordConfirmation] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password !== passwordConfirmation) {
      setError('Пароли не совпадают');
      return;
    }

    setLoading(true);
    try {
      await register(name, email, password, passwordConfirmation);
      onRegisterSuccess();
    } catch (err: any) {
      setError(err.message || 'Ошибка регистрации');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ThemeProvider>
      <div className="flex min-h-screen items-center justify-center bg-zinc-100 px-4 dark:bg-zinc-950">
        <div className="w-full max-w-sm">
          <div className="rounded-xl bg-white p-8 shadow-sm dark:bg-zinc-900">
            <div className="mb-8 text-center">
              <div className="mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600 text-sm font-bold text-white">
                Н
              </div>
              <Heading level={1} className="text-center">
                Регистрация
              </Heading>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <Field>
                <Label>Имя</Label>
                <Input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ваше имя"
                  required
                />
              </Field>

              <Field>
                <Label>Email</Label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  required
                />
              </Field>

              <Field>
                <Label>Пароль</Label>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Минимум 6 символов"
                  required
                  minLength={6}
                />
              </Field>

              <Field>
                <Label>Подтверждение пароля</Label>
                <Input
                  type="password"
                  value={passwordConfirmation}
                  onChange={(e) => setPasswordConfirmation(e.target.value)}
                  placeholder="Повторите пароль"
                  required
                />
              </Field>

              <Button type="submit" color="blue" className="w-full" disabled={loading}>
                {loading ? 'Регистрация...' : 'Зарегистрироваться'}
              </Button>
            </form>

            {error && (
              <p className="mt-4 text-center text-sm text-red-500">{error}</p>
            )}

            <div className="mt-6 text-center">
              <TextLink onClick={onSwitchToLogin}>Уже есть аккаунт? Войти</TextLink>
            </div>
          </div>
        </div>
      </div>
    </ThemeProvider>
  );
};

export default RegisterPage;
