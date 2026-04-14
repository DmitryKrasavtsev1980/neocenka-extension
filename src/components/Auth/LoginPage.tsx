import React, { useState } from 'react';
import { login } from '@/services/api-service';
import { Button } from '@/components/catalyst/button';
import { Input } from '@/components/catalyst/input';
import { Heading } from '@/components/catalyst/heading';
import { Field, Label } from '@/components/catalyst/fieldset';
import { TextLink } from '@/components/catalyst/text';
import { ThemeProvider } from '@/components/ThemeProvider';
import '@/styles/tailwind.css';

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
    <ThemeProvider>
      <div className="flex min-h-screen items-center justify-center bg-zinc-100 px-4 dark:bg-zinc-950">
        <div className="w-full max-w-sm">
          <div className="rounded-xl bg-white p-8 shadow-sm dark:bg-zinc-900">
            <div className="mb-8 text-center">
              <div className="mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600 text-sm font-bold text-white">
                Н
              </div>
              <Heading level={1} className="text-center">
                Вход
              </Heading>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
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
                  placeholder="Введите пароль"
                  required
                />
              </Field>

              <Button type="submit" color="blue" className="w-full" disabled={loading}>
                {loading ? 'Вход...' : 'Войти'}
              </Button>
            </form>

            {error && (
              <p className="mt-4 text-center text-sm text-red-500">{error}</p>
            )}

            <div className="mt-6 flex flex-col items-center gap-2">
              <TextLink onClick={onSwitchToForgot}>Забыли пароль?</TextLink>
              <TextLink onClick={onSwitchToRegister}>Регистрация</TextLink>
            </div>
          </div>
        </div>
      </div>
    </ThemeProvider>
  );
};

export default LoginPage;
