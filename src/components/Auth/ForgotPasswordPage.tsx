import React, { useState } from 'react';
import { forgotPassword } from '@/services/api-service';
import { Button } from '@/components/catalyst/button';
import { Input } from '@/components/catalyst/input';
import { Heading } from '@/components/catalyst/heading';
import { Field, Label } from '@/components/catalyst/fieldset';
import { TextLink } from '@/components/catalyst/text';
import { ThemeProvider } from '@/components/ThemeProvider';
import '@/styles/tailwind.css';

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
    <ThemeProvider>
      <div className="flex min-h-screen items-center justify-center bg-zinc-100 px-4 dark:bg-zinc-950">
        <div className="w-full max-w-sm">
          <div className="rounded-xl bg-white p-8 shadow-sm dark:bg-zinc-900">
            <div className="mb-8 text-center">
              <div className="mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600 text-sm font-bold text-white">
                Н
              </div>
              <Heading level={1} className="text-center">
                Восстановление пароля
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

              <Button type="submit" color="blue" className="w-full" disabled={loading}>
                {loading ? 'Отправка...' : 'Отправить ссылку'}
              </Button>
            </form>

            {error && (
              <p className="mt-4 text-center text-sm text-red-500">{error}</p>
            )}
            {success && (
              <p className="mt-4 text-center text-sm text-green-600 dark:text-green-400">{success}</p>
            )}

            <div className="mt-6 text-center">
              <TextLink onClick={onSwitchToLogin}>Вернуться к входу</TextLink>
            </div>
          </div>
        </div>
      </div>
    </ThemeProvider>
  );
};

export default ForgotPasswordPage;
