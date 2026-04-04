import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { importFromUrl, type S3ImportParams } from '@/services/csv-parser';
import { getModules, getManifest, logImport, type ModuleInfo, type ManifestFile } from '@/services/api-service';
import { importsRepository, clearDatabase } from '@/db';
import { ImportRecord } from '@/types';
import './ImportPage.css';

interface ImportPageProps {
  initialModuleCode?: string;
}

interface FileProgress {
  fileId: number;
  regionName: string;
  status: 'pending' | 'downloading' | 'done' | 'error' | 'skipped';
  recordsCount: number;
  error?: string;
}

const ImportPage: React.FC<ImportPageProps> = ({ initialModuleCode }) => {
  const [modules, setModules] = useState<ModuleInfo[]>([]);
  const [selectedModuleCode, setSelectedModuleCode] = useState<string>(initialModuleCode || '');
  const [manifestFiles, setManifestFiles] = useState<ManifestFile[]>([]);
  const [selectedFileIds, setSelectedFileIds] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const [manifestLoading, setManifestLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [fileProgress, setFileProgress] = useState<FileProgress[]>([]);
  const [totalProgress, setTotalProgress] = useState(0);
  const [importHistory, setImportHistory] = useState<ImportRecord[]>([]);
  const [regionSearch, setRegionSearch] = useState('');

  useEffect(() => {
    loadModules();
    loadHistory();
  }, []);

  useEffect(() => {
    if (selectedModuleCode) {
      loadManifest(selectedModuleCode);
    } else {
      setManifestFiles([]);
      setSelectedFileIds(new Set());
    }
  }, [selectedModuleCode]);

  const loadModules = async () => {
    setLoading(true);
    try {
      const data = await getModules();
      setModules(data.modules);
      if (initialModuleCode && !selectedModuleCode) {
        setSelectedModuleCode(initialModuleCode);
      }
    } catch {
      setError('Не удалось загрузить модули');
    } finally {
      setLoading(false);
    }
  };

  const loadManifest = async (moduleCode: string) => {
    setManifestLoading(true);
    setError(null);
    setSelectedFileIds(new Set());
    try {
      const data = await getManifest(moduleCode);
      setManifestFiles(data.files);
    } catch (err: any) {
      setError(err?.error || err?.message || 'Не удалось загрузить список файлов');
      setManifestFiles([]);
    } finally {
      setManifestLoading(false);
    }
  };

  const loadHistory = async () => {
    const history = await importsRepository.getAll();
    setImportHistory(history);
  };

  // Группировка файлов по годам и кварталам
  const groupedFiles = useMemo(() => {
    const groups: Record<number, Record<number, ManifestFile[]>> = {};
    for (const f of manifestFiles) {
      if (!groups[f.year]) groups[f.year] = {};
      if (!groups[f.year][f.quarter]) groups[f.year][f.quarter] = [];
      groups[f.year][f.quarter].push(f);
    }
    // Сортируем регионы внутри каждой группы
    for (const year of Object.keys(groups)) {
      for (const quarter of Object.keys(groups[Number(year)])) {
        groups[Number(year)][Number(quarter)].sort((a, b) =>
          a.region_code.localeCompare(b.region_code)
        );
      }
    }
    return groups;
  }, [manifestFiles]);

  const years = useMemo(() => Object.keys(groupedFiles).map(Number).sort((a, b) => b - a), [groupedFiles]);

  const filteredGroupedFiles = useMemo(() => {
    if (!regionSearch.trim()) return groupedFiles;
    const search = regionSearch.toLowerCase();
    const result: Record<number, Record<number, ManifestFile[]>> = {};
    for (const year of Object.keys(groupedFiles)) {
      for (const quarter of Object.keys(groupedFiles[Number(year)])) {
        const files = groupedFiles[Number(year)][Number(quarter)].filter(
          (f) =>
            f.region_name.toLowerCase().includes(search) ||
            f.region_code.includes(search)
        );
        if (files.length > 0) {
          if (!result[Number(year)]) result[Number(year)] = {};
          result[Number(year)][Number(quarter)] = files;
        }
      }
    }
    return result;
  }, [groupedFiles, regionSearch]);

  const toggleFile = (fileId: number) => {
    setSelectedFileIds((prev) => {
      const next = new Set(prev);
      if (next.has(fileId)) {
        next.delete(fileId);
      } else {
        next.add(fileId);
      }
      return next;
    });
  };

  const selectAll = () => {
    setSelectedFileIds(new Set(manifestFiles.map((f) => f.id)));
  };

  const selectNone = () => {
    setSelectedFileIds(new Set());
  };

  const selectedFiles = useMemo(
    () => manifestFiles.filter((f) => selectedFileIds.has(f.id)),
    [manifestFiles, selectedFileIds]
  );

  const totalSelectedRecords = useMemo(
    () => selectedFiles.reduce((sum, f) => sum + f.records, 0),
    [selectedFiles]
  );

  const totalSelectedSize = useMemo(
    () => selectedFiles.reduce((sum, f) => sum + f.size, 0),
    [selectedFiles]
  );

  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' Б';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' КБ';
    return (bytes / 1024 / 1024).toFixed(1) + ' МБ';
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

  const handleImport = async () => {
    if (selectedFiles.length === 0) return;

    setImporting(true);
    setError(null);

    const progress: FileProgress[] = selectedFiles.map((f) => ({
      fileId: f.id,
      regionName: `${f.region_name} (${f.region_code})`,
      status: 'pending',
      recordsCount: 0,
    }));
    setFileProgress(progress);
    setTotalProgress(0);

    let completed = 0;

    for (let i = 0; i < selectedFiles.length; i++) {
      const file = selectedFiles[i];

      // Обновляем статус текущего файла
      setFileProgress((prev) =>
        prev.map((p) => (p.fileId === file.id ? { ...p, status: 'downloading' } : p))
      );

      try {
        const result = await importFromUrl({
          fileId: file.id,
          regionCode: file.region_code,
          regionName: file.region_name,
          year: file.year,
          quarter: file.quarter,
          expectedRecords: file.records,
        });

        completed++;

        setFileProgress((prev) =>
          prev.map((p) =>
            p.fileId === file.id
              ? { ...p, status: 'done', recordsCount: result.recordsCount }
              : p
          )
        );

        // Логируем скачивание на бэкенде
        try {
          await logImport(file.id);
        } catch {
          // Не критично если лог не записался
        }
      } catch (err: any) {
        completed++;

        if (err.message === 'already_imported') {
          setFileProgress((prev) =>
            prev.map((p) =>
              p.fileId === file.id ? { ...p, status: 'skipped' } : p
            )
          );
        } else {
          setFileProgress((prev) =>
            prev.map((p) =>
              p.fileId === file.id
                ? { ...p, status: 'error', error: err.message || 'Ошибка' }
                : p
            )
          );
        }
      }

      setTotalProgress(Math.round((completed / selectedFiles.length) * 100));
    }

    setImporting(false);
    await loadHistory();
  };

  const handleDeleteImport = async (importId: number) => {
    if (confirm('Удалить этот импорт и все связанные данные?')) {
      await importsRepository.delete(importId);
      await loadHistory();
    }
  };

  const handleClearAll = async () => {
    if (confirm('Удалить ВСЕ данные из базы? Это действие нельзя отменить.')) {
      await clearDatabase();
      await loadHistory();
    }
  };

  const activeModules = modules.filter((m) => m.access?.status === 'active');

  if (loading) {
    return <div className="import-page"><div className="loading">Загрузка...</div></div>;
  }

  return (
    <div className="import-page">
      <header className="page-header">
        <h1>Импорт данных</h1>
        <a href="../search/search.html" className="nav-link">
          Перейти к поиску
        </a>
      </header>

      <div className="import-container">
        {/* Выбор модуля */}
        <div className="module-select-card">
          <label className="module-label">Модуль</label>
          {activeModules.length === 0 ? (
            <div className="no-modules">
              У вас нет активных модулей. Купите подписку на странице «Мои модули».
            </div>
          ) : (
            <select
              value={selectedModuleCode}
              onChange={(e) => setSelectedModuleCode(e.target.value)}
              className="module-select"
              disabled={importing}
            >
              <option value="">Выберите модуль</option>
              {activeModules.map((m) => (
                <option key={m.id} value={m.code}>
                  {m.icon} {m.name}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Список файлов */}
        {selectedModuleCode && manifestLoading && (
          <div className="loading">Загрузка списка файлов...</div>
        )}

        {selectedModuleCode && !manifestLoading && manifestFiles.length > 0 && (
          <div className="files-card">
            <div className="files-header">
              <h3>Доступные файлы</h3>
              <div className="files-actions">
                <button className="btn-link" onClick={selectAll} disabled={importing}>
                  Выбрать все
                </button>
                <button className="btn-link" onClick={selectNone} disabled={importing}>
                  Убрать все
                </button>
              </div>
            </div>

            <input
              type="text"
              placeholder="Поиск региона..."
              value={regionSearch}
              onChange={(e) => setRegionSearch(e.target.value)}
              className="region-search"
              disabled={importing}
            />

            <div className="files-tree">
              {years.map((year) => (
                <div key={year} className="year-group">
                  <div className="year-header">{year}</div>
                  {Object.keys(filteredGroupedFiles[year] || {})
                    .map(Number)
                    .sort((a, b) => b - a)
                    .map((quarter) => (
                      <div key={quarter} className="quarter-group">
                        <div className="quarter-header">Q{quarter}</div>
                        <div className="files-list">
                          {(filteredGroupedFiles[year]?.[quarter] || []).map((file) => (
                            <label key={file.id} className="file-checkbox">
                              <input
                                type="checkbox"
                                checked={selectedFileIds.has(file.id)}
                                onChange={() => toggleFile(file.id)}
                                disabled={importing}
                              />
                              <span className="file-region">
                                {file.region_code} — {file.region_name}
                              </span>
                              <span className="file-meta">
                                {formatNumber(file.records)} зап., {formatSize(file.size)}
                              </span>
                            </label>
                          ))}
                        </div>
                      </div>
                    ))}
                </div>
              ))}
            </div>

            {/* Итого */}
            {selectedFileIds.size > 0 && (
              <div className="selection-summary">
                Выбрано: {selectedFileIds.size} файлов,{' '}
                {formatNumber(totalSelectedRecords)} записей,{' '}
                {formatSize(totalSelectedSize)}
              </div>
            )}

            {error && <div className="error-message">{error}</div>}

            <button
              className="btn btn-primary btn-large"
              onClick={handleImport}
              disabled={importing || selectedFileIds.size === 0}
            >
              {importing ? 'Загрузка...' : `Скачать выбранное (${selectedFileIds.size})`}
            </button>
          </div>
        )}

        {selectedModuleCode && !manifestLoading && manifestFiles.length === 0 && !error && (
          <div className="no-files">Нет доступных файлов для этого модуля</div>
        )}

        {/* Прогресс */}
        {fileProgress.length > 0 && (
          <div className="progress-card">
            <div className="progress-bar">
              <div
                className="progress-fill"
                style={{ width: `${totalProgress}%` }}
              />
            </div>
            <div className="progress-label">
              {totalProgress}% ({fileProgress.filter((p) => p.status === 'done' || p.status === 'skipped').length} / {fileProgress.length} файлов)
            </div>

            <div className="file-progress-list">
              {fileProgress.map((fp) => (
                <div key={fp.fileId} className={`file-progress-item ${fp.status}`}>
                  <span className="fp-status-icon">
                    {fp.status === 'pending' && '...'}
                    {fp.status === 'downloading' && '⏳'}
                    {fp.status === 'done' && '✓'}
                    {fp.status === 'skipped' && '⊘'}
                    {fp.status === 'error' && '✕'}
                  </span>
                  <span className="fp-name">{fp.regionName}</span>
                  <span className="fp-detail">
                    {fp.status === 'done' && `${formatNumber(fp.recordsCount)} зап.`}
                    {fp.status === 'skipped' && 'Уже загружен'}
                    {fp.status === 'error' && fp.error}
                    {fp.status === 'downloading' && 'Скачивание...'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* История импортов */}
        <div className="import-history">
          <div className="history-header">
            <h3>История импортов</h3>
            {importHistory.length > 0 && (
              <button
                className="btn btn-danger btn-small"
                onClick={handleClearAll}
                disabled={importing}
              >
                Очистить всё
              </button>
            )}
          </div>

          {importHistory.length === 0 ? (
            <p className="no-data">Нет импортированных данных</p>
          ) : (
            <table className="history-table">
              <thead>
                <tr>
                  <th>Файл</th>
                  <th>Период</th>
                  <th>Записей</th>
                  <th>Дата</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {importHistory.map((imp) => (
                  <tr key={imp.id}>
                    <td className="filename">{imp.filename}</td>
                    <td>{imp.year}-Q{imp.quarter}</td>
                    <td>{formatNumber(imp.records_count)}</td>
                    <td>{formatDate(imp.imported_at)}</td>
                    <td>
                      <button
                        className="btn-icon"
                        onClick={() => handleDeleteImport(imp.id!)}
                        title="Удалить"
                        disabled={importing}
                      >
                        🗑️
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};

export default ImportPage;
