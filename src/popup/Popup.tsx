import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { getDatabaseStats, importsRepository } from '@/db';
import { DealsStats, ImportRecord } from '@/types';
import './Popup.css';

const Popup: React.FC = () => {
  const [stats, setStats] = useState<DealsStats | null>(null);
  const [recentImports, setRecentImports] = useState<ImportRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [dbStats, imports] = await Promise.all([
        getDatabaseStats(),
        importsRepository.getAll(),
      ]);
      setStats(dbStats);
      setRecentImports(imports.slice(0, 5));
    } catch (error) {
      console.error('Ошибка загрузки данных:', error);
    } finally {
      setLoading(false);
    }
  };

  const openSearchPage = () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('src/pages/search/search.html') });
  };

  const openImportPage = () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('src/pages/import/import.html') });
  };

  const formatNumber = (num: number): string => {
    return new Intl.NumberFormat('ru-RU').format(num);
  };

  const formatDate = (date: Date): string => {
    return new Intl.DateTimeFormat('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(date));
  };

  if (loading) {
    return (
      <div className="popup">
        <div className="loading">Загрузка...</div>
      </div>
    );
  }

  return (
    <div className="popup">
      <header className="popup-header">
        <h1>🏠 Сделки Росреестр</h1>
      </header>

      <div className="stats">
        <div className="stat-item">
          <span className="stat-value">{stats ? formatNumber(stats.totalDeals) : 0}</span>
          <span className="stat-label">Сделок в базе</span>
        </div>
        <div className="stat-item">
          <span className="stat-value">{stats?.totalImports || 0}</span>
          <span className="stat-label">Импортов</span>
        </div>
      </div>

      <div className="actions">
        <button className="btn btn-primary" onClick={openSearchPage}>
          🔍 Поиск сделок
        </button>
        <button className="btn btn-secondary" onClick={openImportPage}>
          📥 Импорт данных
        </button>
      </div>

      {recentImports.length > 0 && (
        <div className="recent-imports">
          <h3>Последние импорты</h3>
          <ul>
            {recentImports.map((imp) => (
              <li key={imp.id}>
                <span className="import-filename">{imp.filename}</span>
                <span className="import-meta">
                  {imp.year}-Q{imp.quarter} • {formatNumber(imp.records_count)} записей
                </span>
                <span className="import-date">{formatDate(imp.imported_at)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {stats && stats.years.length > 0 && (
        <div className="available-data">
          <h3>Доступные данные</h3>
          <div className="years-list">
            {stats.years.map((year) => (
              <span key={year} className="year-badge">
                {year}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

const container = document.getElementById('root');
if (container) {
  createRoot(container).render(<Popup />);
}
