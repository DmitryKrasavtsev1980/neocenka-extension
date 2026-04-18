import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { importFromUrl, type S3ImportParams } from '@/services/csv-parser';
import { getModules, getManifest, logImport, type ModuleInfo, type ManifestFile } from '@/services/api-service';
import { importsRepository, clearDatabase, cadastralRepository } from '@/db';
import { ImportRecord } from '@/types';
import { downloadCadastralData, CadastralDownloadProgress } from '@/services/cadastral.service';
import { REGION_CENTERS } from '@/constants/regions';
import '@/styles/tailwind.css';

import { Button } from '@/components/catalyst/button';
import { Heading } from '@/components/catalyst/heading';
import { Badge } from '@/components/catalyst/badge';
import { Input } from '@/components/catalyst/input';
import { Field } from '@/components/catalyst/fieldset';

interface ImportPageProps {
  initialModuleCode?: string;
  onNavigate?: (page: 'modules' | 'search' | 'import' | 'profile') => void;
}

interface FileProgress {
  fileId: number;
  regionName: string;
  status: 'pending' | 'downloading' | 'done' | 'error' | 'skipped';
  recordsCount: number;
  error?: string;
}

const ImportPage: React.FC<ImportPageProps> = ({ initialModuleCode, onNavigate }) => {
  const [modules, setModules] = useState<ModuleInfo[]>([]);
  const [selectedModuleCode, setSelectedModuleCode] = useState<string>(initialModuleCode || '');
  const [manifestFiles, setManifestFiles] = useState<ManifestFile[]>([]);
  const [selectedFileIds, setSelectedFileIds] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const [manifestLoading, setManifestLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [fileProgress, setFileProgress] = useState<FileProgress[]>([]);
  const [totalProgress, setTotalProgress] = useState(0);
  const [importHistory, setImportHistory] = useState<ImportRecord[]>([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [regionSearch, setRegionSearch] = useState('');
  const [cadastralSearch, setCadastralSearch] = useState('');

  // Кадастровые кварталы
  const [selectedCadastralRegions, setSelectedCadastralRegions] = useState<Set<string>>(new Set());
  const [cadastralDownloading, setCadastralDownloading] = useState(false);
  const [cadastralProgress, setCadastralProgress] = useState<CadastralDownloadProgress | null>(null);
  const [cadastralRegionStats, setCadastralRegionStats] = useState<Record<string, number>>({});
  const [cadastralStatsLoaded, setCadastralStatsLoaded] = useState(false);

  useEffect(() => {
    loadModules();
    loadHistory();
    loadCadastralStats();
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
    setHistoryLoaded(true);
  };

  const loadCadastralStats = async () => {
    try {
      const stats = await cadastralRepository.getRegionStats();
      setCadastralRegionStats(stats);
    } catch {
      // Не критично
    } finally {
      setCadastralStatsLoaded(true);
    }
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

  // Уникальные регионы для кадастровых кварталов
  const availableRegions = useMemo(() => {
    const map = new Map<string, string>();
    for (const f of manifestFiles) {
      if (!map.has(f.region_code)) {
        map.set(f.region_code, f.region_name);
      }
    }
    return Array.from(map.entries())
      .map(([code, name]) => ({ code, name }))
      .sort((a, b) => a.code.localeCompare(b.code));
  }, [manifestFiles]);

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

  const selectNone = () => {
    setSelectedFileIds(new Set());
  };

  const toggleCadastralRegion = (code: string) => {
    setSelectedCadastralRegions((prev) => {
      const next = new Set(prev);
      if (next.has(code)) {
        next.delete(code);
      } else {
        next.add(code);
      }
      return next;
    });
  };

  const selectNoneCadastralRegions = () => {
    setSelectedCadastralRegions(new Set());
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

  const handleDownloadCadastral = async () => {
    if (selectedCadastralRegions.size === 0 || !selectedModuleCode) return;
    setCadastralDownloading(true);
    setCadastralProgress(null);
    try {
      await downloadCadastralData(
        selectedModuleCode,
        setCadastralProgress,
        Array.from(selectedCadastralRegions)
      );
      await loadCadastralStats();
    } catch (err: any) {
      console.error('Ошибка загрузки кадастровых данных:', err);
      setError(err?.message || 'Ошибка загрузки кадастровых данных');
    }
    setCadastralProgress(null);
    setCadastralDownloading(false);
  };

  const handleDeleteImport = async (importId: number) => {
    if (confirm('Удалить этот импорт и все связанные данные?')) {
      setDeleting(true);
      try {
        await importsRepository.delete(importId);
        await loadHistory();
      } finally {
        setDeleting(false);
      }
    }
  };

  const handleClearAll = async () => {
    if (confirm('Удалить ВСЕ данные из базы? Это действие нельзя отменить.')) {
      setDeleting(true);
      try {
        await clearDatabase();
        await loadHistory();
        await loadCadastralStats();
        setSelectedCadastralRegions(new Set());
      } finally {
        setDeleting(false);
      }
    }
  };

  const handleDeleteCadastralRegion = async (regionCode: string) => {
    const regionName = REGION_CENTERS[regionCode]?.name || regionCode;
    if (confirm(`Удалить все кадастровые кварталы региона ${regionName}?`)) {
      setDeleting(true);
      try {
        await cadastralRepository.deleteByRegion(regionCode);
        await loadCadastralStats();
      } finally {
        setDeleting(false);
      }
    }
  };

  const handleClearCadastral = async () => {
    if (confirm('Удалить ВСЕ кадастровые кварталы? Это действие нельзя отменить.')) {
      setDeleting(true);
      try {
        await cadastralRepository.clear();
        await loadCadastralStats();
      } finally {
        setDeleting(false);
      }
    }
  };

  const activeModules = modules.filter((m) => m.access?.status === 'active');

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto p-6">
        <div className="text-center py-6 text-zinc-500 dark:text-zinc-400">Загрузка...</div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto p-6">
      {/* Заголовок */}
      <header className="flex justify-between items-center mb-6">
        <Heading level={1}>Импорт данных</Heading>
        <button
          onClick={() => onNavigate?.('search')}
          className="text-blue-600 hover:underline text-sm bg-transparent border-none cursor-pointer dark:text-blue-400"
        >
          Перейти к поиску
        </button>
      </header>

      <div className="flex flex-col gap-6">
        {/* Выбор модуля */}
        <div className="bg-white rounded-xl p-5 shadow-sm dark:bg-zinc-900">
          <label className="block text-xs font-medium text-zinc-500 mb-2 uppercase tracking-wide dark:text-zinc-400">
            Модуль
          </label>
          {activeModules.length === 0 ? (
            <div className="p-4 bg-amber-50 rounded-lg text-amber-700 text-sm text-center dark:bg-amber-900/20 dark:text-amber-400">
              У вас нет активных модулей. Купите подписку на странице «Мои модули».
            </div>
          ) : (
            <select
              value={selectedModuleCode}
              onChange={(e) => setSelectedModuleCode(e.target.value)}
              className="w-full px-3.5 py-3 border border-zinc-200 rounded-lg text-sm text-zinc-900 bg-white cursor-pointer focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:opacity-50 dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-100"
              disabled={importing}
            >
              <option value="">Выберите модуль</option>
              {activeModules.map((m) => (
                <option key={m.id} value={m.code}>
                  {m.name}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Список файлов */}
        {selectedModuleCode && manifestLoading && (
          <div className="text-center py-6 text-zinc-500 dark:text-zinc-400">
            Загрузка списка файлов...
          </div>
        )}

        {selectedModuleCode && !manifestLoading && manifestFiles.length > 0 && (
          <div className="bg-white rounded-xl p-6 shadow-sm dark:bg-zinc-900">
            <div className="flex justify-between items-center mb-4">
              <Heading level={3} className="text-base font-semibold text-zinc-900 m-0 dark:text-white">
                Доступные файлы
              </Heading>
              <div className="flex gap-2">
                <button
                  className="bg-transparent border-none text-blue-600 cursor-pointer text-xs px-2 py-1 hover:underline disabled:text-zinc-300 disabled:cursor-not-allowed disabled:no-underline dark:text-blue-400 dark:disabled:text-zinc-600"
                  onClick={selectNone}
                  disabled={importing}
                >
                  Убрать все
                </button>
              </div>
            </div>

            <Field>
              <Input
                type="text"
                placeholder="Поиск региона..."
                value={regionSearch}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRegionSearch(e.target.value)}
                disabled={importing}
                className="mb-4"
              />
            </Field>

            <div className="max-h-[400px] overflow-y-auto mb-4 border border-zinc-200 rounded-lg dark:border-zinc-700">
              {years.map((year) => (
                <div key={year} className="border-b border-zinc-200 last:border-b-0 dark:border-zinc-700">
                  <div className="py-2.5 px-4 font-semibold text-sm text-zinc-900 bg-zinc-50 sticky top-0 z-10 dark:bg-zinc-800 dark:text-zinc-100">
                    {year}
                  </div>
                  {Object.keys(filteredGroupedFiles[year] || {})
                    .map(Number)
                    .sort((a, b) => b - a)
                    .map((quarter) => (
                      <div key={quarter} className="border-t border-zinc-100 dark:border-zinc-800">
                        <div className="py-1.5 px-4 pl-6 font-medium text-xs text-zinc-500 bg-zinc-50/50 dark:bg-zinc-800/50 dark:text-zinc-400">
                          Q{quarter}
                        </div>
                        <div className="p-1 px-2">
                          {(filteredGroupedFiles[year]?.[quarter] || []).map((file) => (
                            <label
                              key={file.id}
                              className="flex items-center gap-2.5 px-3 py-1.5 cursor-pointer rounded-md hover:bg-zinc-100 transition-colors duration-150 dark:hover:bg-zinc-800"
                            >
                              <input
                                type="checkbox"
                                checked={selectedFileIds.has(file.id)}
                                onChange={() => toggleFile(file.id)}
                                disabled={importing}
                                className="w-4 h-4 shrink-0 cursor-pointer"
                              />
                              <span className="flex-1 text-xs text-zinc-900 dark:text-zinc-100">
                                {file.region_code} — {file.region_name}
                              </span>
                              <span className="text-[11px] text-zinc-400 whitespace-nowrap dark:text-zinc-500">
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
              <div className="py-3 px-4 bg-blue-50 rounded-lg text-sm text-blue-700 mb-4 font-medium dark:bg-blue-900/20 dark:text-blue-300">
                Выбрано: {selectedFileIds.size} файлов,{' '}
                {formatNumber(totalSelectedRecords)} записей,{' '}
                {formatSize(totalSelectedSize)}
              </div>
            )}

            {error && (
              <div className="py-3 px-4 bg-red-50 text-red-600 rounded-md mb-4 text-sm dark:bg-red-900/20 dark:text-red-400">
                {error}
              </div>
            )}

            <Button
              color="blue"
              className="w-full py-3.5 text-base"
              onClick={handleImport}
              disabled={importing || selectedFileIds.size === 0}
            >
              {importing ? 'Загрузка...' : `Скачать выбранное (${selectedFileIds.size})`}
            </Button>
          </div>
        )}

        {selectedModuleCode && !manifestLoading && manifestFiles.length === 0 && !error && (
          <div className="text-center py-6 text-zinc-500 bg-white rounded-xl shadow-sm dark:bg-zinc-900 dark:text-zinc-400">
            Нет доступных файлов для этого модуля
          </div>
        )}

        {/* Секция: Кадастровые кварталы */}
        {selectedModuleCode && !manifestLoading && availableRegions.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-zinc-200 p-5 dark:bg-zinc-900 dark:border-zinc-700">
            <div className="flex items-center justify-between mb-2">
              <Heading level={3} className="m-0 text-base font-semibold text-zinc-900 dark:text-white">
                Кадастровые кварталы
              </Heading>
              <div className="flex gap-2">
                <button
                  className="bg-transparent border-none text-blue-600 cursor-pointer text-xs px-2 py-1 hover:underline disabled:text-zinc-300 disabled:cursor-not-allowed disabled:no-underline dark:text-blue-400 dark:disabled:text-zinc-600"
                  onClick={selectNoneCadastralRegions}
                  disabled={cadastralDownloading}
                >
                  Убрать все
                </button>
              </div>
            </div>
            <p className="text-xs text-zinc-500 mb-4 dark:text-zinc-400">
              Выберите регионы для загрузки границ кадастровых кварталов. Позволит отображать кварталы на карте.
              Повторная загрузка региона пропустит уже загруженные кварталы.
            </p>
            <Field>
              <Input
                type="text"
                placeholder="Поиск региона..."
                value={cadastralSearch}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCadastralSearch(e.target.value)}
                disabled={cadastralDownloading}
                className="mb-4"
              />
            </Field>
            <div className="flex flex-col gap-1.5 mb-3 max-h-[300px] overflow-y-auto border border-zinc-200 rounded-lg p-2 dark:border-zinc-700">
              {availableRegions
                .filter((region) => {
                  if (!cadastralSearch.trim()) return true;
                  const s = cadastralSearch.toLowerCase();
                  return region.code.includes(s) || region.name.toLowerCase().includes(s);
                })
                .map((region) => {
                const loaded = cadastralRegionStats[region.code] || 0;
                return (
                  <label
                    key={region.code}
                    className="flex items-center gap-2 px-2 py-1 rounded cursor-pointer text-xs hover:bg-zinc-100 dark:hover:bg-zinc-800"
                  >
                    <input
                      type="checkbox"
                      checked={selectedCadastralRegions.has(region.code)}
                      onChange={() => toggleCadastralRegion(region.code)}
                      disabled={cadastralDownloading}
                      className="w-4 h-4 cursor-pointer"
                    />
                    <span className="flex-1 whitespace-nowrap text-zinc-900 dark:text-zinc-100">
                      {region.code} — {region.name}
                    </span>
                    {loaded > 0 ? (
                      <Badge color="green" className="text-[10px] font-semibold">
                        {formatNumber(loaded)} загружено
                      </Badge>
                    ) : (
                      <Badge color="amber" className="text-[10px]">
                        не загружен
                      </Badge>
                    )}
                  </label>
                );
              })}
            </div>

            {selectedCadastralRegions.size > 0 && (
              <div className="py-3 px-4 bg-blue-50 rounded-lg text-sm text-blue-700 mb-4 font-medium dark:bg-blue-900/20 dark:text-blue-300">
                Выбрано регионов: {selectedCadastralRegions.size}
              </div>
            )}

            {cadastralProgress && (
              <div className="bg-white rounded-xl p-6 shadow-sm mb-4 dark:bg-zinc-900">
                <div className="h-2 bg-zinc-200 rounded-full overflow-hidden mb-2 dark:bg-zinc-700">
                  <div
                    className="h-full bg-blue-600 transition-[width] duration-300 ease-in-out dark:bg-blue-500"
                    style={{ width: `${cadastralProgress.percent}%` }}
                  />
                </div>
                <div className="text-sm font-medium text-zinc-900 mb-4 dark:text-zinc-100">
                  {cadastralProgress.stage === 'manifest' && 'Загрузка манифеста...'}
                  {cadastralProgress.stage === 'downloading' &&
                    `Скачивание: ${cadastralProgress.downloaded} / ${cadastralProgress.total}`}
                  {cadastralProgress.stage === 'done' && 'Готово'}
                  {cadastralProgress.stage === 'error' && 'Ошибка'}
                </div>
              </div>
            )}

            <Button
              color="blue"
              className="w-full py-3.5 text-base"
              onClick={handleDownloadCadastral}
              disabled={cadastralDownloading || selectedCadastralRegions.size === 0}
            >
              {cadastralDownloading
                ? 'Загрузка...'
                : `Скачать кадастровые кварталы (${selectedCadastralRegions.size} регион.)`}
            </Button>
          </div>
        )}

        {/* Прогресс */}
        {fileProgress.length > 0 && (
          <div className="bg-white rounded-xl p-6 shadow-sm dark:bg-zinc-900">
            <div className="h-2 bg-zinc-200 rounded-full overflow-hidden mb-2 dark:bg-zinc-700">
              <div
                className="h-full bg-blue-600 transition-[width] duration-300 ease-in-out dark:bg-blue-500"
                style={{ width: `${totalProgress}%` }}
              />
            </div>
            <div className="text-sm font-medium text-zinc-900 mb-4 dark:text-zinc-100">
              {totalProgress}% ({fileProgress.filter((p) => p.status === 'done' || p.status === 'skipped').length} / {fileProgress.length} файлов)
            </div>

            <div className="max-h-[200px] overflow-y-auto">
              {fileProgress.map((fp) => (
                <div
                  key={fp.fileId}
                  className={`flex items-center gap-2 py-1.5 px-2 text-xs rounded ${
                    fp.status === 'done'
                      ? 'text-green-600 dark:text-green-400'
                      : fp.status === 'error'
                      ? 'text-red-600 dark:text-red-400'
                      : fp.status === 'skipped'
                      ? 'text-amber-600 dark:text-amber-400'
                      : fp.status === 'downloading'
                      ? 'text-blue-600 dark:text-blue-400'
                      : 'text-zinc-400 dark:text-zinc-500'
                  }`}
                >
                  <span className="w-5 text-center">
                    {fp.status === 'pending' && '...'}
                    {fp.status === 'downloading' && '\u23F3'}
                    {fp.status === 'done' && '\u2713'}
                    {fp.status === 'skipped' && '\u2298'}
                    {fp.status === 'error' && '\u2715'}
                  </span>
                  <span className="flex-1">{fp.regionName}</span>
                  <span className="text-zinc-400 text-[11px] dark:text-zinc-500">
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
        <div className="bg-white rounded-xl p-6 shadow-sm dark:bg-zinc-900">
          <div className="flex justify-between items-center mb-4">
            <Heading level={3} className="m-0 text-zinc-900 dark:text-white">
              История импортов
            </Heading>
            {importHistory.length > 0 && (
              <Button
                color="red"
                className="text-xs px-3 py-1"
                onClick={handleClearAll}
                disabled={importing || deleting}
              >
                Очистить всё
              </Button>
            )}
          </div>

          {!historyLoaded ? (
            <div className="flex items-center justify-center py-8">
              <svg className="h-5 w-5 animate-spin text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <span className="ml-2 text-sm text-zinc-500 dark:text-zinc-400">Загрузка...</span>
            </div>
          ) : importHistory.length === 0 ? (
            <p className="text-center text-zinc-500 py-6 dark:text-zinc-400">
              Нет импортированных данных
            </p>
          ) : (
            <div className="relative">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className="py-3 px-3 text-left border-b border-zinc-200 text-[11px] font-medium text-zinc-500 uppercase dark:border-zinc-700 dark:text-zinc-400">
                    Файл
                  </th>
                  <th className="py-3 px-3 text-left border-b border-zinc-200 text-[11px] font-medium text-zinc-500 uppercase dark:border-zinc-700 dark:text-zinc-400">
                    Период
                  </th>
                  <th className="py-3 px-3 text-left border-b border-zinc-200 text-[11px] font-medium text-zinc-500 uppercase dark:border-zinc-700 dark:text-zinc-400">
                    Записей
                  </th>
                  <th className="py-3 px-3 text-left border-b border-zinc-200 text-[11px] font-medium text-zinc-500 uppercase dark:border-zinc-700 dark:text-zinc-400">
                    Дата
                  </th>
                  <th className="py-3 px-3 border-b border-zinc-200 dark:border-zinc-700"></th>
                </tr>
              </thead>
              <tbody>
                {importHistory.map((imp) => (
                  <tr
                    key={imp.id}
                    className="hover:bg-zinc-50 dark:hover:bg-zinc-800"
                  >
                    <td className="py-3 px-3 text-sm text-zinc-900 border-b border-zinc-100 max-w-[300px] overflow-hidden text-ellipsis whitespace-nowrap dark:text-zinc-100 dark:border-zinc-800">
                      {imp.filename}
                    </td>
                    <td className="py-3 px-3 text-sm text-zinc-900 border-b border-zinc-100 dark:text-zinc-100 dark:border-zinc-800">
                      {imp.year}-Q{imp.quarter}
                    </td>
                    <td className="py-3 px-3 text-sm text-zinc-900 border-b border-zinc-100 dark:text-zinc-100 dark:border-zinc-800">
                      {formatNumber(imp.records_count)}
                    </td>
                    <td className="py-3 px-3 text-sm text-zinc-900 border-b border-zinc-100 dark:text-zinc-100 dark:border-zinc-800">
                      {formatDate(imp.imported_at)}
                    </td>
                    <td className="py-3 px-3 border-b border-zinc-100 dark:border-zinc-800">
                      <button
                        className="bg-transparent border-none cursor-pointer p-1 text-base hover:opacity-70 disabled:opacity-30 disabled:cursor-not-allowed"
                        onClick={() => handleDeleteImport(imp.id!)}
                        title="Удалить"
                        disabled={importing || deleting}
                      >
                        🗑️
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {deleting && (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/70 dark:bg-zinc-900/70">
                <div className="flex items-center gap-2 rounded-lg bg-white px-5 py-3 shadow-md dark:bg-zinc-800">
                  <svg className="h-4 w-4 animate-spin text-red-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Удаление...</span>
                </div>
              </div>
            )}
            </div>
          )}
        </div>

        {/* Кадастровые кварталы */}
        <div className="bg-white rounded-xl p-6 shadow-sm dark:bg-zinc-900">
          <div className="flex justify-between items-center mb-4">
            <Heading level={3} className="m-0 text-zinc-900 dark:text-white">
              Кадастровые кварталы
            </Heading>
            {Object.keys(cadastralRegionStats).length > 0 && (
              <Button
                color="red"
                className="text-xs px-3 py-1"
                onClick={handleClearCadastral}
                disabled={deleting}
              >
                Удалить все
              </Button>
            )}
          </div>

          {!cadastralStatsLoaded ? (
            <div className="flex items-center justify-center gap-2 py-8 text-zinc-500 dark:text-zinc-400">
              <svg className="h-4 w-4 animate-spin text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <span className="text-sm">Загрузка...</span>
            </div>
          ) : Object.keys(cadastralRegionStats).length === 0 ? (
            <p className="text-center text-zinc-500 py-6 dark:text-zinc-400">
              Кадастровые кварталы не загружены
            </p>
          ) : (
            <div className="relative">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className="py-3 px-3 text-left border-b border-zinc-200 text-[11px] font-medium text-zinc-500 uppercase dark:border-zinc-700 dark:text-zinc-400">
                    Регион
                  </th>
                  <th className="py-3 px-3 text-left border-b border-zinc-200 text-[11px] font-medium text-zinc-500 uppercase dark:border-zinc-700 dark:text-zinc-400">
                    Кварталов
                  </th>
                  <th className="py-3 px-3 border-b border-zinc-200 dark:border-zinc-700"></th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(cadastralRegionStats)
                  .sort(([a], [b]) => a.localeCompare(b))
                  .map(([regionCode, count]) => {
                    const regionName = REGION_CENTERS[regionCode]?.name;
                    return (
                      <tr key={regionCode} className="hover:bg-zinc-50 dark:hover:bg-zinc-800">
                        <td className="py-3 px-3 text-sm text-zinc-900 border-b border-zinc-100 dark:text-zinc-100 dark:border-zinc-800">
                          {regionCode} — {regionName || 'Неизвестный регион'}
                        </td>
                        <td className="py-3 px-3 text-sm text-zinc-900 border-b border-zinc-100 dark:text-zinc-100 dark:border-zinc-800">
                          {formatNumber(count)}
                        </td>
                        <td className="py-3 px-3 border-b border-zinc-100 dark:border-zinc-800">
                          <button
                            className="bg-transparent border-none cursor-pointer p-1 text-base hover:opacity-70 disabled:opacity-30 disabled:cursor-not-allowed"
                            onClick={() => handleDeleteCadastralRegion(regionCode)}
                            title="Удалить"
                            disabled={deleting}
                          >
                            🗑️
                          </button>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
            {deleting && (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/70 dark:bg-zinc-900/70">
                <div className="flex items-center gap-2 rounded-lg bg-white px-5 py-3 shadow-md dark:bg-zinc-800">
                  <svg className="h-4 w-4 animate-spin text-red-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Удаление...</span>
                </div>
              </div>
            )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ImportPage;
