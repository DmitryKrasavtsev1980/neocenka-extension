/**
 * Модалка привязки/смены адреса объявления
 * Поиск адреса в БД, привязка, подтверждение, создание нового
 */

import React, { useState, useMemo } from 'react';
import type { Ad, AdAddress, ReferenceItem } from '@/types';
import { adsAddressService } from '@/services/ads-address-service';

const CONFIDENCE_COLORS: Record<string, string> = {
  perfect: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  high: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  medium: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  low: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  very_low: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  manual: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
};

const CONFIDENCE_LABELS: Record<string, string> = {
  perfect: 'Идеальное',
  high: 'Высокая',
  medium: 'Средняя',
  low: 'Низкая',
  very_low: 'Очень низкая',
  manual: 'Подтверждён',
  none: 'Нет',
};

interface Props {
  ad: Ad;
  addresses: AdAddress[];
  referenceData: {
    wallMaterials: ReferenceItem[];
    houseSeries: ReferenceItem[];
    houseClasses?: ReferenceItem[];
    ceilingMaterials?: ReferenceItem[];
    houseProblems?: ReferenceItem[];
  };
  onClose: () => void;
  onLink: (adId: number, addressId: number) => Promise<void>;
  onUnlink: (adId: number) => Promise<void>;
  onConfirm: (adId: number) => Promise<void>;
  onOpenCreate: (ad: Ad) => void;
  onOpenEdit: (address: AdAddress) => void;
}

const AdAddressAssignModal: React.FC<Props> = ({
  ad,
  addresses,
  referenceData,
  onClose,
  onLink,
  onUnlink,
  onConfirm,
  onOpenCreate,
  onOpenEdit,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedAddressId, setSelectedAddressId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  const currentAddress = ad.address_id
    ? addresses.find(a => a.id === ad.address_id)
    : null;

  // Фильтрация адресов по поиску
  const filteredAddresses = useMemo(() => {
    if (!searchQuery || searchQuery.length < 2) return [];
    const q = searchQuery.toLowerCase();
    return addresses.filter(a => a.address.toLowerCase().includes(q)).slice(0, 50);
  }, [searchQuery, addresses]);

  const handleLink = async () => {
    if (!selectedAddressId) return;
    setLoading(true);
    try {
      await onLink(ad.id!, selectedAddressId);
    } finally {
      setLoading(false);
    }
  };

  const handleUnlink = async () => {
    setLoading(true);
    try {
      await onUnlink(ad.id!);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async () => {
    setLoading(true);
    try {
      await onConfirm(ad.id!);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/30" onClick={onClose}>
      <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-xl max-w-lg w-full max-h-[85vh] overflow-y-auto mx-4 relative" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-zinc-200 dark:border-zinc-700">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-white">Объявление #{ad.id}</h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600 text-lg leading-none">&times;</button>
        </div>

        <div className="p-5 space-y-4">
          {/* Исходный адрес */}
          <section>
            <label className="block text-[10px] font-medium text-zinc-500 dark:text-zinc-400 uppercase mb-1">Исходный адрес</label>
            <p className="text-sm text-zinc-900 dark:text-white">{ad.address || 'Не указан'}</p>
            {ad.coordinates.lat != null && ad.coordinates.lng != null && (
              <p className="text-[10px] text-zinc-400 mt-0.5">{ad.coordinates.lat}, {ad.coordinates.lng}</p>
            )}
          </section>

          {/* Текущая привязка */}
          <section>
            <label className="block text-[10px] font-medium text-zinc-500 dark:text-zinc-400 uppercase mb-1">Привязанный адрес</label>
            {currentAddress ? (
              <div className="flex items-start gap-2">
                <span
                  className="text-sm text-blue-600 dark:text-blue-400 cursor-pointer hover:underline flex-1"
                  onClick={() => onOpenEdit(currentAddress)}
                >{currentAddress.address}</span>
                {ad.address_match_confidence && (
                  <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium shrink-0 ${CONFIDENCE_COLORS[ad.address_match_confidence] || 'bg-zinc-100 text-zinc-600'}`}>
                    {CONFIDENCE_LABELS[ad.address_match_confidence] || ad.address_match_confidence}
                  </span>
                )}
              </div>
            ) : (
              <p className="text-sm text-red-500">Не определён</p>
            )}
          </section>

          {/* Поиск адреса */}
          <section>
            <label className="block text-[10px] font-medium text-zinc-500 dark:text-zinc-400 uppercase mb-1">Выбрать адрес из базы</label>
            <input
              type="text"
              value={searchQuery}
              onChange={e => { setSearchQuery(e.target.value); setSelectedAddressId(null); }}
              placeholder="Начните вводить адрес..."
              className="w-full rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-700 px-2 py-1.5 text-xs text-zinc-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            {filteredAddresses.length > 0 && (
              <div className="mt-1 border border-zinc-200 dark:border-zinc-600 rounded-md max-h-40 overflow-y-auto bg-white dark:bg-zinc-800">
                {filteredAddresses.map(a => (
                  <div
                    key={a.id}
                    className={`px-2 py-1.5 text-xs cursor-pointer hover:bg-blue-50 dark:hover:bg-zinc-700 ${selectedAddressId === a.id ? 'bg-blue-50 dark:bg-zinc-700 text-blue-600 dark:text-blue-400' : 'text-zinc-700 dark:text-zinc-300'}`}
                    onClick={() => { setSelectedAddressId(a.id!); setSearchQuery(a.address); }}
                  >
                    {a.address}
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Кнопки действий */}
          <div className="space-y-2 pt-2 border-t border-zinc-100 dark:border-zinc-800">
            <div className="flex flex-wrap gap-2">
              {/* Привязать */}
              {selectedAddressId && (
                <button
                  onClick={handleLink}
                  disabled={loading || selectedAddressId === ad.address_id}
                  className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >Привязать</button>
              )}

              {/* Подтвердить */}
              {currentAddress && ad.address_match_confidence !== 'manual' && (
                <button
                  onClick={handleConfirm}
                  disabled={loading}
                  className="rounded-md bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
                >Подтвердить</button>
              )}

              {/* Новый адрес */}
              <button
                onClick={() => onOpenCreate(ad)}
                className="rounded-md bg-zinc-100 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-300 px-3 py-1.5 text-xs font-medium hover:bg-zinc-200 dark:hover:bg-zinc-600"
              >Новый адрес</button>

              {/* Редактировать */}
              {currentAddress && (
                <button
                  onClick={() => onOpenEdit(currentAddress)}
                  className="rounded-md bg-zinc-100 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-300 px-3 py-1.5 text-xs font-medium hover:bg-zinc-200 dark:hover:bg-zinc-600"
                >Редактировать</button>
              )}

              {/* Отменить привязку */}
              {currentAddress && (
                <button
                  onClick={handleUnlink}
                  disabled={loading}
                  className="rounded-md bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400 px-3 py-1.5 text-xs font-medium hover:bg-red-100 dark:hover:bg-red-900/30 disabled:opacity-50"
                >Отменить привязку</button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdAddressAssignModal;
