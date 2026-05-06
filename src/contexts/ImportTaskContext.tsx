import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { importFromUrl } from '@/services/csv-parser';
import { logImport, type ManifestFile } from '@/services/api-service';
import { downloadCadastralData, type CadastralDownloadProgress } from '@/services/cadastral.service';
import { getListingsByPolygon, transformInparsListing, getInparsToken } from '@/services/inpars-service';
import { adsRepository } from '@/db/repositories/ads.repository';

export interface ImportTask {
  id: string;
  type: 'deals' | 'cadastral' | 'ads-import';
  label: string;
  status: 'running' | 'done' | 'error';
  progress: number;
  detail?: string;
}

export interface AdsImportOptions {
  polygons: [number, number][][];
  sourceIds?: number[];
  categoryIds?: number[];
  dateFrom?: string;
  dateTo?: string;
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

      // Запускаем в фоне — не await
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

      // Запускаем в фоне
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
      const { polygons, sourceIds, categoryIds, dateFrom, dateTo } = options;

      setTasks((prev) => [
        ...prev,
        {
          id: taskId,
          type: 'ads-import',
          label: `Объявления: ${polygons.length} полигон(ов)`,
          status: 'running',
          progress: 0,
          detail: 'Запуск загрузки...',
        },
      ]);

      (async () => {
        try {
          if (!getInparsToken()) {
            updateTask(taskId, { status: 'error', detail: 'API ключ не задан' });
            setTimeout(() => removeTask(taskId), 8000);
            return;
          }

          const apiOptions: Record<string, unknown> = {};
          if (categoryIds?.length === 1) apiOptions.categoryId = categoryIds[0];
          if (sourceIds?.length === 1) apiOptions.sourceId = sourceIds[0];
          else if (sourceIds && sourceIds.length > 1) apiOptions.sourceId = sourceIds.join(',');
          if (dateFrom) apiOptions.timeStart = Math.floor(new Date(dateFrom).getTime() / 1000);
          if (dateTo) apiOptions.timeEnd = Math.floor(new Date(dateTo).getTime() / 1000);

          const allListings: ReturnType<typeof transformInparsListing>[] = [];

          for (let i = 0; i < polygons.length; i++) {
            updateTask(taskId, {
              progress: Math.round((i / polygons.length) * 90),
              detail: `Полигон ${i + 1}/${polygons.length}...`,
            });
            const result = await getListingsByPolygon(polygons[i], apiOptions);
            allListings.push(...result.listings);
          }

          updateTask(taskId, { progress: 92, detail: `Получено ${allListings.length}. Сохранение...` });

          const adsData = allListings.map(transformInparsListing);
          const importResult = await adsRepository.bulkInsert(adsData);

          await adsRepository.recordImport({
            source: sourceIds?.length ? sourceIds.join(',') : 'all',
            params: JSON.stringify({ polygonCount: polygons.length, ...apiOptions }),
            count: importResult.inserted,
            created_at: new Date().toISOString(),
          });

          updateTask(taskId, {
            status: 'done',
            progress: 100,
            detail: `Загружено: ${importResult.inserted} новых, ${importResult.updated} обновлено`,
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
