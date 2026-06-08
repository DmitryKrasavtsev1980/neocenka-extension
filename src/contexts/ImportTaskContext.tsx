import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { importFromUrl } from '@/services/csv-parser';
import { logImport, type ManifestFile } from '@/services/api-service';
import { downloadCadastralData, type CadastralDownloadProgress } from '@/services/cadastral.service';
import {
  createDataRequest,
  pollDataRequest,
  downloadAndImportResult,
} from '@/services/data-request-service';

export interface ImportTask {
  id: string;
  type: 'deals' | 'cadastral' | 'ads-import';
  label: string;
  status: 'running' | 'done' | 'error';
  progress: number;
  detail?: string;
}

export interface AdsImportOptions {
  polygons?: [number, number][][];
  regionId?: number;
  regionName?: string;
  sourceIds?: number[];
  categoryIds?: number[];
  sellerTypes?: number[];
  dateFrom?: string;
  dateTo?: string;
  isNew?: number;
}

interface ImportTaskContextValue {
  tasks: ImportTask[];
  startDealsImport: (files: ManifestFile[], moduleCode: string) => void;
  startCadastralImport: (moduleCode: string, regionCodes: string[], regionNames: string[]) => void;
  startAdsImport: (options: AdsImportOptions) => void;
  removeTask: (taskId: string) => void;
}

const ImportTaskContext = createContext<ImportTaskContextValue | null>(null);

export function useImportTasks(): ImportTaskContextValue {
  const ctx = useContext(ImportTaskContext);
  if (!ctx) throw new Error('useImportTasks must be used within ImportTaskProvider');
  return ctx;
}

export function ImportTaskProvider({ children }: { children: React.ReactNode }) {
  const [tasks, setTasks] = useState<ImportTask[]>([]);
  const tasksRef = useRef(tasks);
  tasksRef.current = tasks;

  const updateTask = useCallback((taskId: string, updates: Partial<ImportTask>) => {
    setTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, ...updates } : t))
    );
  }, []);

  const removeTask = useCallback((taskId: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
  }, []);

  const startDealsImport = useCallback(
    (files: ManifestFile[], moduleCode: string) => {
      const taskId = crypto.randomUUID();

      setTasks((prev) => [
        ...prev,
        {
          id: taskId,
          type: 'deals',
          label: `Сделки: ${files.length} файл(ов)`,
          status: 'running',
          progress: 0,
          detail: `0 из ${files.length}`,
        },
      ]);

      (async () => {
        let completed = 0;
        for (const file of files) {
          updateTask(taskId, { detail: `Загрузка: ${file.region_name}` });
          try {
            await importFromUrl({
              fileId: file.id,
              regionCode: file.region_code,
              regionName: file.region_name,
              year: file.year,
              quarter: file.quarter,
              expectedRecords: file.records,
            });
            try {
              await logImport(file.id);
            } catch {
              // Не критично
            }
          } catch {
            // Пропускаем ошибку — продолжаем со следующим файлом
          }
          completed++;
          updateTask(taskId, {
            progress: Math.round((completed / files.length) * 100),
            detail: `${completed} из ${files.length}`,
          });
        }
        updateTask(taskId, { status: 'done', progress: 100, detail: 'Завершено' });
        setTimeout(() => removeTask(taskId), 5000);
      })();
    },
    [updateTask, removeTask]
  );

  const startCadastralImport = useCallback(
    (moduleCode: string, regionCodes: string[], regionNames: string[]) => {
      const taskId = crypto.randomUUID();
      const regionLabel =
        regionNames.length <= 3
          ? regionNames.join(', ')
          : `${regionNames.slice(0, 2).join(', ')} +${regionNames.length - 2}`;

      setTasks((prev) => [
        ...prev,
        {
          id: taskId,
          type: 'cadastral',
          label: `Кадастр: ${regionLabel}`,
          status: 'running',
          progress: 0,
          detail: 'Загрузка...',
        },
      ]);

      (async () => {
        try {
          await downloadCadastralData(moduleCode, (progress: CadastralDownloadProgress) => {
            updateTask(taskId, {
              progress: progress.percent,
              detail:
                progress.stage === 'manifest'
                  ? 'Загрузка манифеста...'
                  : progress.stage === 'done'
                    ? 'Завершено'
                    : `${progress.downloaded} из ${progress.total}`,
            });
          }, regionCodes);

          updateTask(taskId, { status: 'done', progress: 100, detail: 'Завершено' });
          setTimeout(() => removeTask(taskId), 5000);
        } catch {
          updateTask(taskId, { status: 'error', progress: 0, detail: 'Ошибка загрузки' });
          setTimeout(() => removeTask(taskId), 8000);
        }
      })();
    },
    [updateTask, removeTask]
  );

  const startAdsImport = useCallback(
    (options: AdsImportOptions) => {
      const taskId = crypto.randomUUID();
      const { polygons, regionId, regionName, sourceIds, categoryIds, sellerTypes, dateFrom, dateTo, isNew } = options;

      const label = regionName
        ? `Объявления: ${regionName}`
        : `Объявления: ${polygons?.length || 0} полигон(ов)`;

      setTasks((prev) => [
        ...prev,
        {
          id: taskId,
          type: 'ads-import',
          label,
          status: 'running',
          progress: 0,
          detail: 'Отправка запроса на сервер...',
        },
      ]);

      (async () => {
        try {
          // 1. Создать запрос на сервере
          const request = await createDataRequest({
            regionId,
            regionName,
            polygons: polygons,
            sourceId: sourceIds?.join(','),
            categoryId: categoryIds?.join(','),
            sellerType: sellerTypes?.join(','),
            timeStart: dateFrom ? Math.floor(new Date(dateFrom).getTime() / 1000) : undefined,
            timeEnd: dateTo ? Math.floor(new Date(dateTo).getTime() / 1000) : undefined,
            isNew,
          });

          updateTask(taskId, {
            progress: 10,
            detail: `Запрос #${request.id} отправлен. Ожидание обработки...`,
          });

          // 2. Polling статуса
          const result = await pollDataRequest(
            request.id,
            (status) => {
              const pct = status.status === 'processing'
                ? Math.min(90, 10 + Math.round(status.total_records / 100))
                : 10;
              updateTask(taskId, {
                progress: pct,
                detail: status.status === 'processing'
                  ? `Обработка: загружено ${status.total_records} записей...`
                  : 'Ожидание в очереди...',
              });
            },
            5000,  // 5 секунд интервал
            600000, // 10 минут таймаут
          );

          if (!result.download_url) {
            throw new Error('Результат готов, но нет ссылки для скачивания');
          }

          // 3. Скачать и импортировать
          updateTask(taskId, { progress: 95, detail: 'Скачивание результата...' });

          const importResult = await downloadAndImportResult(result.id, result.download_url);

          updateTask(taskId, {
            status: 'done',
            progress: 100,
            detail: `Готово: ${importResult.inserted} новых, ${importResult.updated} обновлено`,
          });
          setTimeout(() => removeTask(taskId), 8000);
        } catch (e) {
          updateTask(taskId, {
            status: 'error',
            progress: 0,
            detail: `Ошибка: ${e instanceof Error ? e.message : String(e)}`,
          });
          setTimeout(() => removeTask(taskId), 12000);
        }
      })();
    },
    [updateTask, removeTask],
  );

  return (
    <ImportTaskContext.Provider value={{ tasks, startDealsImport, startCadastralImport, startAdsImport, removeTask }}>
      {children}
    </ImportTaskContext.Provider>
  );
}
