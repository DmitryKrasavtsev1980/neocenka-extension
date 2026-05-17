/**
 * Модальное окно деталей объявления
 * — Заголовок, адрес, характеристики
 * — Цена + история цены
 * — Продавец, описание, фото
 * — Ссылка на источник
 * — Переключатель статуса
 */

import React, { useState } from 'react';
import type { Ad, PriceHistoryItem } from '@/types';

const SELLER_TYPE_LABELS: Record<string, string> = {
  owner: 'Собственник', agent: 'Агент', developer: 'Застройщик',
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

interface AdDetailModalProps {
  ad: Ad;
  onClose: () => void;
  onSave?: (updated: Ad) => void;
}

const AdDetailModal: React.FC<AdDetailModalProps> = ({ ad: initialAd, onClose, onSave }) => {
  const [ad, setAd] = useState<Ad>(initialAd);
  const [editPrice, setEditPrice] = useState('');
  const [showPriceInput, setShowPriceInput] = useState(false);

  const handleSavePrice = () => {
    const newPrice = Number(editPrice.replace(/\s/g, '').replace(',', '.'));
    if (isNaN(newPrice) || newPrice <= 0) return;

    const now = new Date().toISOString();
    const historyEntry: PriceHistoryItem = {
      date: now,
      old_price: ad.price ?? undefined,
      new_price: newPrice,
    };

    const updated: Ad = {
      ...ad,
      price: newPrice,
      price_per_meter: ad.area_total ? Math.round(newPrice / ad.area_total) : null,
      price_history: [...(ad.price_history || []), historyEntry],
      updated: now,
    };
    setAd(updated);
    setShowPriceInput(false);
    setEditPrice('');
    onSave?.(updated);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto mx-4" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-zinc-200 dark:border-zinc-700 sticky top-0 bg-white dark:bg-zinc-900 z-10">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-white truncate max-w-md">{ad.title || ad.address}</h2>
            <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${
              ad.status === 'active' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-700 dark:text-zinc-400'
            }`}>{ad.status === 'active' ? 'Активно' : 'Архив'}</span>
          </div>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600 text-lg leading-none">&times;</button>
        </div>

        <div className="p-5 space-y-4">
          {/* Адрес */}
          <div>
            <span className="text-[10px] font-medium text-zinc-500 dark:text-zinc-400 uppercase">Адрес</span>
            <p className="text-sm text-zinc-800 dark:text-zinc-200">{ad.address || 'Не указан'}</p>
          </div>

          {/* Характеристики */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <InfoCell label="Тип недвижимости" value={ad.property_type || '—'} />
            <InfoCell label="Площадь" value={ad.area_total != null ? `${ad.area_total} м²${ad.area_living ? ` (жилая ${ad.area_living})` : ''}${ad.area_kitchen ? ` (кухня ${ad.area_kitchen})` : ''}` : '—'} />
            <InfoCell label="Этаж" value={ad.floor != null ? `${ad.floor}/${ad.floors_total ?? '?'}` : '—'} />
            <InfoCell label="Комнат" value={ad.rooms != null ? String(ad.rooms) : '—'} />
            <InfoCell label="Год постройки" value={ad.year_built ?? ad.house_details?.build_year ?? '—'} />
            <InfoCell label="Тип дома" value={ad.house_type || '—'} />
            <InfoCell label="Ремонт" value={ad.condition || '—'} />
            <InfoCell label="Высота потолков" value={ad.ceiling_height != null ? `${ad.ceiling_height} м` : '—'} />
          </div>

          {/* Цена */}
          <div className="bg-green-50 dark:bg-green-900/10 rounded-lg p-3 space-y-1">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-lg font-semibold text-green-700 dark:text-green-400">{fmtPrice(ad.price)} ₽</div>
                {ad.price_per_meter != null && <div className="text-xs text-green-600 dark:text-green-500">{ad.price_per_meter.toLocaleString('ru-RU')} ₽/м²</div>}
              </div>
              <button onClick={() => { setShowPriceInput(!showPriceInput); setEditPrice(''); }} className="text-[10px] text-blue-600 hover:underline">
                {showPriceInput ? 'Отмена' : 'Изменить цену'}
              </button>
            </div>
            {showPriceInput && (
              <div className="flex items-center gap-2 pt-1">
                <input
                  type="text"
                  value={editPrice}
                  onChange={e => setEditPrice(e.target.value)}
                  placeholder="Новая цена"
                  className="rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-700 px-2 py-1 text-sm text-zinc-900 dark:text-white w-32 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  onKeyDown={e => { if (e.key === 'Enter') handleSavePrice(); }}
                />
                <button onClick={handleSavePrice} className="rounded-md bg-green-600 px-3 py-1 text-xs font-medium text-white hover:bg-green-700">Сохранить</button>
              </div>
            )}
          </div>

          {/* История цены */}
          {ad.price_history && ad.price_history.length > 0 && (
            <div>
              <h4 className="text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">История цены</h4>
              <div className="space-y-1">
                {ad.price_history.slice(-15).reverse().map((h: PriceHistoryItem, i: number) => (
                  <div key={i} className="flex items-center gap-2 text-[11px] text-zinc-600 dark:text-zinc-400">
                    <span className="text-zinc-400 w-16">{fmtDate(h.date)}</span>
                    {h.old_price != null && <span className="line-through text-red-400">{fmtPrice(h.old_price)}</span>}
                    {h.old_price != null && <span className="text-zinc-400">→</span>}
                    <span className="font-medium text-green-600 dark:text-green-400">{fmtPrice(h.new_price || h.price)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Продавец */}
          <div className="grid grid-cols-3 gap-3">
            <InfoCell label="Продавец" value={ad.seller_info?.name || ad.seller_name || '—'} />
            <InfoCell label="Тип" value={SELLER_TYPE_LABELS[ad.seller_info?.type || ad.seller_type] || ad.seller_type || '—'} />
            <InfoCell label="Телефон" value={ad.seller_info?.phone || ad.phone || '—'} />
          </div>

          {/* Описание */}
          {ad.description && (
            <div>
              <h4 className="text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">Описание</h4>
              <p className="text-xs text-zinc-600 dark:text-zinc-400 whitespace-pre-wrap line-clamp-8">{ad.description}</p>
            </div>
          )}

          {/* Фото */}
          {ad.photos && ad.photos.length > 0 && (
            <div>
              <h4 className="text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">Фотографии ({ad.photos.length})</h4>
              <div className="grid grid-cols-4 gap-2">
                {ad.photos.slice(0, 12).map((url, i) => (
                  <img key={i} src={url} alt="" className="rounded-md w-full h-24 object-cover" onError={e => { (e.currentTarget.style.display = 'none'); }} />
                ))}
              </div>
            </div>
          )}

          {/* Ссылка */}
          {ad.url && (
            <a href={ad.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline">
              Открыть на источнике ({ad.source_metadata?.original_source || ad.source})
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
            </a>
          )}

          {/* Даты */}
          <div className="flex items-center gap-4 text-[10px] text-zinc-400">
            <span>Создано: {fmtDate(ad.created)}</span>
            <span>Обновлено: {fmtDate(ad.updated)}</span>
            {ad.parsed_at && <span>Спарсено: {fmtDate(ad.parsed_at)}</span>}
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

export default AdDetailModal;
