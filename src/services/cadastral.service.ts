import { getCadastralManifest, getCadastralBatch } from './api-service';
import { cadastralRepository } from '@/db';
import { CadastralQuarter } from '@/types';

const BATCH_SIZE = 50;

export interface CadastralDownloadProgress {
  stage: 'manifest' | 'downloading' | 'done' | 'error';
  total: number;
  downloaded: number;
  percent: number;
}

export async function downloadCadastralData(
  moduleCode: string,
  onProgress?: (progress: CadastralDownloadProgress) => void,
  regionCodes?: string[]
): Promise<{ total: number; downloaded: number }> {
  onProgress?.({ stage: 'manifest', total: 0, downloaded: 0, percent: 0 });

  const manifest = await getCadastralManifest(moduleCode, regionCodes);
  const allQuarters = manifest.quarters;
  const total = allQuarters.length;

  if (total === 0) {
    onProgress?.({ stage: 'done', total: 0, downloaded: 0, percent: 100 });
    return { total: 0, downloaded: 0 };
  }

  const existingCadNumbers = new Set(
    await cadastralRepository.getAllCadNumbers()
  );
  const toDownload = allQuarters.filter(q => !existingCadNumbers.has(q.cad_number));

  if (toDownload.length === 0) {
    onProgress?.({ stage: 'done', total, downloaded: total, percent: 100 });
    return { total, downloaded: total };
  }

  let downloaded = 0;
  for (let i = 0; i < toDownload.length; i += BATCH_SIZE) {
    const batch = toDownload.slice(i, i + BATCH_SIZE);
    const batchIds = batch.map(q => q.id);

    onProgress?.({
      stage: 'downloading',
      total: toDownload.length,
      downloaded,
      percent: Math.round((downloaded / toDownload.length) * 90),
    });

    const batchResult = await getCadastralBatch(batchIds, moduleCode);

    const quartersToSave: CadastralQuarter[] = batchResult.quarters.map(q => ({
      cad_number: q.cad_number,
      geojson: q.geojson,
      center_lat: q.center_lat,
      center_lon: q.center_lon,
    }));

    await cadastralRepository.bulkUpsert(quartersToSave);
    downloaded += batchIds.length;

    // Пауза между батчами для предотвращения 429 rate limit
    if (i + BATCH_SIZE < toDownload.length) {
      await new Promise(resolve => setTimeout(resolve, 1500));
    }
  }

  onProgress?.({ stage: 'done', total, downloaded, percent: 100 });
  return { total, downloaded };
}
