/**
 * Модальное окно деталей объекта недвижимости
 * — Характеристики объекта
 * — Текущая цена + история
 * — Список объявлений объекта (мини-таблица)
 * — Статус собственника
 */

import React from 'react';
import type { AdObject, Ad } from '@/types';

const PROPERTY_TYPE_FULL: Record<string, string> = {
  studio: 'Студия', '1k': '1-комн.', '2k': '2-комн.', '3k': '3-комн.', '4k+': '4+ комн.',
};
const SOURCE_LABELS: Record<string, string> = {
  avito: 'Авито', cian: 'ЦИАН', domclick: 'Домклик', youla: 'Юла', unknown: '?',
};
const SELLER_TYPE_LABELS: Record<string, string> = {
  owner: 'Собственник', agent: 'Агент', agency: 'Агентство', developer: 'Девелопер',
};

const fmtPrice = (price: number | null): string => {
  if (price == null) return '—';
  return price.toLocaleString('ru-RU');
};

const fmtDate = (date: string | null): string => {
  if (!date) return '—';
  try { return new Date(date).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' }); }
  catch { return date; }
};

interface AdObjectDetailModalProps {
  obj: AdObject;
  listings: Ad[];
  onClose: () => void;
  onAdClick?: (ad: Ad) => void;
}

const AdObjectDetailModal: React.FC<AdObjectDetailModalProps> = ({ obj, listings, onClose, onAdClick }) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto mx-4" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-zinc-200 dark:border-zinc-700 sticky top-0 bg-white dark:bg-zinc-900 z-10">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-white">
            Объект: {PROPERTY_TYPE_FULL[obj.property_type || ''] || obj.property_type || '—'}
            {obj.area_total != null ? `, ${obj.area_total} м²` : ''}
          </h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600 text-lg leading-none">&times;</button>
        </div>

        <div className="p-5 space-y-4">
          {/* Характеристики */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <InfoCell label="Тип недвижимости" value={PROPERTY_TYPE_FULL[obj.property_type || ''] || obj.property_type || '—'} />
            <InfoCell label="Площадь" value={obj.area_total != null ? `${obj.area_total} м²` : '—'} />
            <InfoCell label="Жилая" value={obj.area_living != null ? `${obj.area_living} м²` : '—'} />
            <InfoCell label="Кухня" value={obj.area_kitchen != null ? `${obj.area_kitchen} м²` : '—'} />
            <InfoCell label="Этаж" value={obj.floor != null ? `${obj.floor}/${obj.floors_total ?? '?'}` : '—'} />
            <InfoCell label="Комнат" value={obj.rooms != null ? String(obj.rooms) : '—'} />
            <InfoCell label="Объявлений" value={`${obj.listings_count} (${obj.active_listings_count} акт.)`} />
            <InfoCell label="Адрес" value={obj.address_id ? `#${obj.address_id}` : 'Не определен'} />
          </div>

          {/* Цена */}
          <div className="bg-green-50 dark:bg-green-900/10 rounded-lg p-3">
            <div className="text-lg font-semibold text-green-700 dark:text-green-400">{fmtPrice(obj.current_price)} ₽</div>
            {obj.price_per_meter != null && <div className="text-xs text-green-600 dark:text-green-500">{obj.price_per_meter.toLocaleString('ru-RU')} ₽/м²</div>}
          </div>

          {/* Статус собственника */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-500 dark:text-zinc-400">Статус собственника:</span>
            <span className={`text-xs font-medium ${
              obj.owner_status === 'есть от собственника' ? 'text-green-600' :
              obj.owner_status === 'было от собственника' ? 'text-yellow-600' :
              'text-zinc-400'
            }`}>{obj.owner_status || '—'}</span>
          </div>

          {/* Список объявлений */}
          {listings.length > 0 && (
            <div>
              <h4 className="text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-2">Объявления объекта ({listings.length})</h4>
              <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-700">
                <table className="w-full text-xs">
                  <thead className="bg-zinc-50 dark:bg-zinc-800">
                    <tr className="text-[10px] font-medium text-zinc-500 dark:text-zinc-400 uppercase">
                      <th className="px-2 py-1.5 text-left">Источник</th>
                      <th className="px-2 py-1.5 text-left">Статус</th>
                      <th className="px-2 py-1.5 text-left">Цена</th>
                      <th className="px-2 py-1.5 text-left">Продавец</th>
                      <th className="px-2 py-1.5 text-left">Обновлено</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                    {listings.map(ad => (
                      <tr
                        key={ad.id}
                        className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50 cursor-pointer"
                        onClick={() => onAdClick?.(ad)}
                      >
                        <td className="px-2 py-1.5">
                          {ad.url ? (
                            <a href={ad.url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="text-blue-600 hover:underline">
                              {ad.source_metadata?.original_source || SOURCE_LABELS[ad.source] || ad.source}
                            </a>
                          ) : (
                            <span>{SOURCE_LABELS[ad.source] || ad.source}</span>
                          )}
                        </td>
                        <td className="px-2 py-1.5">
                          <span className={`inline-flex items-center px-1 py-0.5 rounded text-[9px] font-medium ${
                            ad.status === 'active' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-700 dark:text-zinc-400'
                          }`}>{ad.status === 'active' ? 'Акт.' : 'Арх.'}</span>
                        </td>
                        <td className="px-2 py-1.5 font-medium text-green-600 dark:text-green-400">{fmtPrice(ad.price)}</td>
                        <td className="px-2 py-1.5">
                          <div>{SELLER_TYPE_LABELS[ad.seller_info?.type || ad.seller_type] || '—'}</div>
                          {ad.seller_info?.name && <div className="text-[10px] text-zinc-400 truncate max-w-[120px]">{ad.seller_info.name}</div>}
                        </td>
                        <td className="px-2 py-1.5 text-zinc-500">{fmtDate(ad.updated)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Даты */}
          <div className="flex items-center gap-4 text-[10px] text-zinc-400">
            <span>Создано: {fmtDate(obj.created)}</span>
            <span>Обновлено: {fmtDate(obj.updated)}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

const InfoCell: React.FC<{ label: string; value: string | number | null }> = ({ label, value }) => (
  <div>
    <span className="block text-[10px] font-medium text-zinc-500 dark:text-zinc-400">{label}</span>
    <p className="text-xs text-zinc-800 dark:text-zinc-200">{value ?? '—'}</p>
  </div>
);

export default AdObjectDetailModal;
