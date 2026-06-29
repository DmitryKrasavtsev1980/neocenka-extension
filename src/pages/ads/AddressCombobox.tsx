/**
 * Комбобокс с текстовым поиском по адресам.
 * Используется в «Фильтре обработки» вместо обычного <select>.
 *
 * Поиск: запрос разбивается на токены (по небуквенно-цифровым разделителям),
 * регистр игнорируется. Адрес подходит, если каждый токен запроса совпадает
 * (точно или как префикс) с одним из токенов адреса.
 * Пример: «золотодолинская 5» найдёт «обл. Новосибирская, г. Новосибирск,
 * ул. Золотодолинская, д. 5».
 */

import React, { useMemo, useRef, useState, useEffect } from 'react';

interface Props {
  addresses: { id: number; address: string }[];
  value: number | '';
  onChange: (id: number | '') => void;
  placeholder?: string;
}

const MAX_RESULTS = 100;

/** Разбить строку на токены: lower case, игнорировать пунктуацию. */
function tokenize(s: string): string[] {
  return s.toLowerCase()
    .replace(/[^a-zа-яё0-9]+/gi, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

const AddressCombobox: React.FC<Props> = ({ addresses, value, onChange, placeholder = 'Поиск адреса…' }) => {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Предвычисленные токены для каждого адреса (чтобы не нормализовать при каждом вводе)
  const addressTokens = useMemo(() => {
    return addresses.map(a => ({ id: a.id, address: a.address, tokens: tokenize(a.address) }));
  }, [addresses]);

  // Текст в инпуте: если выбран id — показываем его адрес, иначе — введённый запрос
  const selectedAddress = useMemo(() => {
    if (value === '' || value == null) return '';
    return addresses.find(a => a.id === value)?.address || '';
  }, [value, addresses]);

  const inputValue = selectedAddress || query;

  // Отфильтрованные и отсортированные результаты
  const filtered = useMemo(() => {
    const qTokens = tokenize(query);
    if (qTokens.length === 0) return addresses.slice(0, MAX_RESULTS);

    const scored: Array<{ id: number; address: string; score: number; len: number }> = [];
    for (const a of addressTokens) {
      let allMatch = true;
      let exactCount = 0;
      for (const qt of qTokens) {
        let matched = false;
        for (const at of a.tokens) {
          if (at === qt) { exactCount++; matched = true; break; }
          if (at.startsWith(qt)) { matched = true; break; }
        }
        if (!matched) { allMatch = false; break; }
      }
      if (allMatch) {
        scored.push({ id: a.id, address: a.address, score: exactCount, len: a.address.length });
      }
    }
    // Больше точных совпадений → выше; при равенстве — короче адрес → выше
    scored.sort((x, y) => y.score - x.score || x.len - y.len);
    return scored.slice(0, MAX_RESULTS).map(s => ({ id: s.id, address: s.address }));
  }, [addressTokens, addresses, query]);

  const handleSelect = (id: number) => {
    onChange(id);
    setQuery('');
    setIsOpen(false);
    inputRef.current?.blur();
  };

  const handleClear = () => {
    onChange('');
    setQuery('');
    setIsOpen(false);
    inputRef.current?.focus();
  };

  const handleFocus = () => {
    if (blurTimer.current) { clearTimeout(blurTimer.current); blurTimer.current = null; }
    setIsOpen(true);
  };

  const handleBlur = () => {
    // Задержка, чтобы клик по option успел сработать до закрытия
    blurTimer.current = setTimeout(() => {
      setIsOpen(false);
      // Сбрасываем query, чтобы снова показать выбранный адрес
      setQuery('');
    }, 150);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    setQuery(v);
    // Если пользователь начал редактировать — сбрасываем выбор
    if (value !== '') onChange('');
    if (!isOpen) setIsOpen(true);
  };

  useEffect(() => {
    return () => { if (blurTimer.current) clearTimeout(blurTimer.current); };
  }, []);

  return (
    <div className="relative">
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          placeholder={value === '' ? placeholder : ''}
          className="w-full rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-700 px-2 py-1.5 text-xs text-zinc-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500 pr-6"
        />
        {inputValue && (
          <button
            type="button"
            onMouseDown={e => { e.preventDefault(); handleClear(); }}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
            title="Очистить"
          >
            <svg className="size-3.5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        )}
      </div>
      {isOpen && (
        <div className="absolute z-30 mt-0.5 w-full max-h-60 overflow-y-auto rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 shadow-lg">
          {filtered.length === 0 ? (
            <div className="px-2 py-2 text-[11px] text-zinc-400">Ничего не найдено</div>
          ) : (
            <>
              {filtered.map(a => (
                <button
                  key={a.id}
                  type="button"
                  onMouseDown={e => { e.preventDefault(); handleSelect(a.id); }}
                  className={`block w-full text-left px-2 py-1.5 text-[11px] hover:bg-blue-50 dark:hover:bg-blue-900/30 truncate ${value === a.id ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 font-medium' : 'text-zinc-700 dark:text-zinc-300'}`}
                  title={a.address}
                >
                  {a.address}
                </button>
              ))}
              {addresses.length > MAX_RESULTS && (
                <div className="px-2 py-1.5 text-[10px] text-zinc-400 border-t border-zinc-100 dark:border-zinc-700">
                  Показано первые {MAX_RESULTS}. Уточните запрос.
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default AddressCombobox;
