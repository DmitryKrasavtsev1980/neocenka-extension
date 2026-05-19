/**
 * Модальное окно редактирования адреса
 * Форма с секциями: Основное, Характеристики, Параметры, Коммуникации, Инфраструктура, Прочее
 */

import React, { useState, useEffect } from 'react';
import type { AdAddress, ReferenceItem } from '@/types';
import { adsAddressService } from '@/services/ads-address-service';

const TYPE_OPTIONS = [
  { value: 'house', label: 'Многоквартирный дом' },
  { value: 'house_with_land', label: 'Дом с участком' },
  { value: 'land', label: 'Земельный участок' },
  { value: 'commercial', label: 'Коммерческое' },
  { value: 'building', label: 'Здание' },
];

interface AdAddressModalProps {
  address: AdAddress;
  referenceData: {
    wallMaterials: ReferenceItem[];
    houseSeries: ReferenceItem[];
    houseClasses?: ReferenceItem[];
    ceilingMaterials?: ReferenceItem[];
    houseProblems?: ReferenceItem[];
  };
  onClose: () => void;
  onSave?: (updated: AdAddress) => void;
}

const AdAddressModal: React.FC<AdAddressModalProps> = ({ address: initialAddress, referenceData, onClose, onSave }) => {
  const [addr, setAddr] = useState<AdAddress>({ ...initialAddress });
  const [saving, setSaving] = useState(false);

  const update = <K extends keyof AdAddress>(key: K, value: AdAddress[K]) => {
    setAddr(prev => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await adsAddressService.update(addr.id!, {
        ...addr,
        updated_at: new Date().toISOString(),
      });
      onSave?.(addr);
      onClose();
    } catch {
      // silent
    } finally {
      setSaving(false);
    }
  };

  const refSelect = (label: string, key: keyof AdAddress, items: ReferenceItem[] | undefined) => {
    if (!items || items.length === 0) return null;
    return (
      <div>
        <label className="block text-[10px] font-medium text-zinc-500 dark:text-zinc-400 mb-1">{label}</label>
        <select
          value={(addr[key] as string) || ''}
          onChange={e => update(key, e.target.value || null)}
          className="w-full rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-700 px-2 py-1.5 text-xs text-zinc-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="">—</option>
          {items.map(item => (
            <option key={item.id} value={String(item.id)}>
              {item.name}
              {item.color ? ` (${item.color})` : ''}
            </option>
          ))}
        </select>
      </div>
    );
  };

  const numField = (label: string, key: keyof AdAddress, min?: number, max?: number) => (
    <div>
      <label className="block text-[10px] font-medium text-zinc-500 dark:text-zinc-400 mb-1">{label}</label>
      <input
        type="number"
        min={min}
        max={max}
        value={addr[key] != null ? String(addr[key]) : ''}
        onChange={e => update(key, e.target.value ? Number(e.target.value) : null)}
        className="w-full rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-700 px-2 py-1.5 text-xs text-zinc-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
      />
    </div>
  );

  const boolField = (label: string, key: keyof AdAddress) => (
    <label className="flex items-center gap-2 text-xs text-zinc-700 dark:text-zinc-300">
      <input
        type="checkbox"
        checked={!!addr[key]}
        onChange={e => update(key, e.target.checked as any)}
        className="rounded border-zinc-300 text-blue-600 h-3 w-3"
      />
      {label}
    </label>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto mx-4" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-zinc-200 dark:border-zinc-700 sticky top-0 bg-white dark:bg-zinc-900 z-10">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-white truncate max-w-md">
              Адрес #{addr.id}
            </h2>
            {addr.source && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                {addr.source}
              </span>
            )}
          </div>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600 text-lg leading-none">&times;</button>
        </div>

        <div className="p-5 space-y-5">
          {/* Основное */}
          <section>
            <h3 className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase mb-2">Основное</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-[10px] font-medium text-zinc-500 dark:text-zinc-400 mb-1">Адрес</label>
                <input
                  type="text"
                  value={addr.address}
                  onChange={e => update('address', e.target.value)}
                  className="w-full rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-700 px-2 py-1.5 text-xs text-zinc-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-medium text-zinc-500 dark:text-zinc-400 mb-1">Тип</label>
                  <select
                    value={addr.type || ''}
                    onChange={e => update('type', e.target.value)}
                    className="w-full rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-700 px-2 py-1.5 text-xs text-zinc-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    {TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-medium text-zinc-500 dark:text-zinc-400 mb-1">Регион</label>
                  <input
                    type="text"
                    value={addr.region || ''}
                    onChange={e => update('region', e.target.value || null)}
                    className="w-full rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-700 px-2 py-1.5 text-xs text-zinc-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-medium text-zinc-500 dark:text-zinc-400 mb-1">Широта</label>
                  <input
                    type="number"
                    step="any"
                    value={addr.coordinates.lat ?? ''}
                    onChange={e => update('coordinates', { ...addr.coordinates, lat: e.target.value ? Number(e.target.value) : null })}
                    className="w-full rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-700 px-2 py-1.5 text-xs text-zinc-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-medium text-zinc-500 dark:text-zinc-400 mb-1">Долгота</label>
                  <input
                    type="number"
                    step="any"
                    value={addr.coordinates.lng ?? ''}
                    onChange={e => update('coordinates', { ...addr.coordinates, lng: e.target.value ? Number(e.target.value) : null })}
                    className="w-full rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-700 px-2 py-1.5 text-xs text-zinc-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-medium text-zinc-500 dark:text-zinc-400 mb-1">Кадастровый номер</label>
                  <input
                    type="text"
                    value={addr.cadno || ''}
                    onChange={e => update('cadno', e.target.value || null)}
                    className="w-full rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-700 px-2 py-1.5 text-xs text-zinc-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-medium text-zinc-500 dark:text-zinc-400 mb-1">HOUSE_ID</label>
                  <input
                    type="text"
                    value={addr.house_id || ''}
                    onChange={e => update('house_id', e.target.value || null)}
                    className="w-full rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-700 px-2 py-1.5 text-xs text-zinc-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>
          </section>

          {/* Характеристики */}
          <section>
            <h3 className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase mb-2">Характеристики</h3>
            <div className="grid grid-cols-2 gap-3">
              {refSelect('Серия дома', 'house_series_id', referenceData.houseSeries)}
              {refSelect('Класс дома', 'house_class_id', referenceData.houseClasses)}
              {refSelect('Материал стен', 'wall_material_id', referenceData.wallMaterials)}
              {refSelect('Перекрытия', 'ceiling_material_id', referenceData.ceilingMaterials)}
              {refSelect('Проблема', 'house_problem_id', referenceData.houseProblems)}
            </div>
          </section>

          {/* Параметры */}
          <section>
            <h3 className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase mb-2">Параметры</h3>
            <div className="grid grid-cols-3 gap-3">
              {numField('Этажей', 'floors_count', 1, 100)}
              {numField('Год постройки', 'build_year', 1800, 2030)}
              {numField('Подъездов', 'entrances_count', 1, 50)}
              {numField('Жилых помещений', 'living_spaces_count', 0)}
              {numField('Площадь общая (м²)', 'area_total', 0)}
              {numField('Площадь жилая (м²)', 'area_live', 0)}
            </div>
            <div className="mt-3">
              <label className="block text-[10px] font-medium text-zinc-500 dark:text-zinc-400 mb-1">Высота потолков</label>
              <input
                type="text"
                value={addr.ceiling_height || ''}
                onChange={e => update('ceiling_height', e.target.value || null)}
                placeholder="напр. 2.7"
                className="w-32 rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-700 px-2 py-1.5 text-xs text-zinc-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </section>

          {/* Коммуникации */}
          <section>
            <h3 className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase mb-2">Коммуникации</h3>
            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-xs text-zinc-700 dark:text-zinc-300">
                <input
                  type="checkbox"
                  checked={addr.gas_supply === true}
                  onChange={e => update('gas_supply', e.target.checked || null)}
                  className="rounded border-zinc-300 text-blue-600 h-3 w-3"
                />
                Газоснабжение
              </label>
              <label className="flex items-center gap-2 text-xs text-zinc-700 dark:text-zinc-300">
                <input
                  type="checkbox"
                  checked={addr.individual_heating === true}
                  onChange={e => update('individual_heating', e.target.checked || null)}
                  className="rounded border-zinc-300 text-blue-600 h-3 w-3"
                />
                Инд. отопление
              </label>
            </div>
          </section>

          {/* Инфраструктура */}
          <section>
            <h3 className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase mb-2">Инфраструктура</h3>
            <div className="flex flex-wrap gap-4">
              {boolField('Детская площадка', 'has_playground')}
              {boolField('Спортплощадка', 'has_sports_area')}
            </div>
          </section>

          {/* Прочее */}
          <section>
            <h3 className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase mb-2">Прочее</h3>
            <div>
              <label className="block text-[10px] font-medium text-zinc-500 dark:text-zinc-400 mb-1">Комментарий</label>
              <textarea
                value={addr.comment || ''}
                onChange={e => update('comment', e.target.value)}
                rows={3}
                className="w-full rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-700 px-2 py-1.5 text-xs text-zinc-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500 resize-y"
              />
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-zinc-200 dark:border-zinc-700 sticky bottom-0 bg-white dark:bg-zinc-900">
          <button onClick={onClose} className="rounded-md px-3 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800">
            Отмена
          </button>
          <button onClick={handleSave} disabled={saving} className="rounded-md bg-blue-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2">
            {saving && <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" /></svg>}
            Сохранить
          </button>
        </div>
      </div>
    </div>
  );
};

export default AdAddressModal;
