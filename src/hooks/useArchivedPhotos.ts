/**
 * Хук подмены оригинальных CDN-ссылок фото на S3-архивные.
 *
 * Принимает массив оригинальных URL, возвращает массив с подменой.
 * Если для URL нет архивной копии в локальном кеше — возвращается оригинал.
 */

import { useState, useEffect } from 'react';
import { photoArchiveService } from '@/services/photo-archive-service';

export function useArchivedPhotos(photos: string[]): string[] {
  const [resolved, setResolved] = useState<string[]>(photos);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!photos || photos.length === 0) {
        setResolved(photos);
        return;
      }

      try {
        const cached = await photoArchiveService.resolveCached(photos);
        if (cancelled) return;
        const mapped = photos.map(u => cached.get(u) ?? u);
        setResolved(mapped);
      } catch {
        if (!cancelled) setResolved(photos);
      }
    })();

    return () => { cancelled = true; };
  }, [photos]);

  return resolved;
}
