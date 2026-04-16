import React, { useState, useEffect } from 'react';
import { getFeedbackLinks, type FeedbackLink } from '@/services/api-service';
import { Heading } from '@/components/catalyst/heading';

const FeedbackPage: React.FC = () => {
  const [links, setLinks] = useState<FeedbackLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadLinks();
  }, []);

  const loadLinks = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getFeedbackLinks();
      setLinks(data.links);
    } catch {
      setError('Не удалось загрузить контакты');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="p-8 text-center text-sm text-zinc-500 dark:text-zinc-400">
        Загрузка...
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 text-center text-sm text-red-500 dark:text-red-400">
        {error}
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto p-6">
      <Heading level={2} className="text-lg font-semibold mb-2 text-gray-800 dark:text-white">
        Обратная связь
      </Heading>
      <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mb-6">
        Свяжитесь с нами удобным для вас способом
      </p>

      {links.length === 0 ? (
        <div className="text-sm text-zinc-400 dark:text-zinc-500 text-center py-8">
          Пока нет доступных контактов
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
          {links.map((link) => (
            <a
              key={link.id}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 px-4 py-3.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 text-sm font-medium transition-all hover:border-blue-400 hover:shadow-[0_2px_8px_rgba(59,130,246,0.12)] dark:hover:border-blue-500"
            >
              <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-zinc-400 dark:text-zinc-500 shrink-0">
                <path d="M12.232 4.232a2.5 2.5 0 0 1 3.536 3.536l-7.071 7.071a2.5 2.5 0 0 1-3.536-3.536l7.07-7.07Zm-1.06 1.06L5.101 11.367a1 1 0 0 0-.227.325l-1.74 3.874 3.874-1.74a1 1 0 0 0 .325-.228l6.06-6.06a1.5 1.5 0 0 0-2.122-2.121Z" />
                <path d="M10.607 5.043a.75.75 0 0 1 .449.962l-1.5 4.5a.75.75 0 1 1-1.423-.474l1.5-4.5a.75.75 0 0 1 .974-.488ZM13.25 2.5a.75.75 0 0 1 .75.75v1.25h1.25a.75.75 0 0 1 0 1.5H14v1.25a.75.75 0 0 1-1.5 0V6h-1.25a.75.75 0 0 1 0-1.5H12.5V3.25a.75.75 0 0 1 .75-.75Z" />
              </svg>
              {link.label}
            </a>
          ))}
        </div>
      )}
    </div>
  );
};

export default FeedbackPage;
