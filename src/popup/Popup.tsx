import React from 'react';
import { createRoot } from 'react-dom/client';
import '@/styles/tailwind.css';

const Popup: React.FC = () => {
  const openMainPage = () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('src/pages/search/search.html') });
  };

  return (
    <div className="w-[280px] p-5 bg-white dark:bg-zinc-900">
      {/* Logo */}
      <div className="flex items-center gap-3 mb-5 pb-4 border-b border-zinc-200 dark:border-zinc-700">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-xs font-bold text-white">
          Н
        </div>
        <div>
          <div className="text-sm font-semibold text-zinc-950 dark:text-white">
            Неоценка
          </div>
          <div className="text-[11px] text-zinc-400 dark:text-zinc-500">
            Анализ сделок с недвижимостью
          </div>
        </div>
      </div>

      {/* Main action */}
      <button
        onClick={openMainPage}
        className="w-full flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 cursor-pointer border-none"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
          <path d="M10.75 14.69v3.06a.75.75 0 0 1-1.5 0v-3.06l-1.22 1.22a.75.75 0 1 1-1.06-1.06l2.5-2.5a.75.75 0 0 1 1.06 0l2.5 2.5a.75.75 0 1 1-1.06 1.06l-1.22-1.22ZM10.75 5.31V2.25a.75.75 0 0 0-1.5 0v3.06L8.03 4.09a.75.75 0 0 0-1.06 1.06l2.5 2.5a.75.75 0 0 0 1.06 0l2.5-2.5a.75.75 0 0 0-1.06-1.06l-1.22 1.22Z" />
        </svg>
        Открыть расширение
      </button>

      <div className="mt-4 text-center text-[11px] text-zinc-400 dark:text-zinc-500">
        Анализ сделок с недвижимостью
      </div>
    </div>
  );
};

const container = document.getElementById('root');
if (container) {
  createRoot(container).render(<Popup />);
}
