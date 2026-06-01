import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Input } from '@/components/catalyst/input';

interface MultiSelectDropdownProps {
  label: string;
  options: string[];
  selected: string[];
  onChange: (selected: string[]) => void;
  searchPlaceholder?: string;
}

export const MultiSelectDropdown: React.FC<MultiSelectDropdownProps> = ({
  label,
  options,
  selected,
  onChange,
  searchPlaceholder,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Закрытие по клику вне
  useEffect(() => {
    if (!isOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isOpen]);

  // Фокус на поиск при открытии
  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isOpen]);

  const selectedSet = useMemo(() => new Set(selected), [selected]);

  const filteredOptions = useMemo(() => {
    if (!search) return options;
    const q = search.toLowerCase();
    return options.filter(o => o.toLowerCase().includes(q));
  }, [options, search]);

  const handleToggle = useCallback((value: string) => {
    if (selectedSet.has(value)) {
      onChange(selected.filter(s => s !== value));
    } else {
      onChange([...selected, value]);
    }
  }, [selected, selectedSet, onChange]);

  const handleSelectAll = useCallback(() => {
    onChange(filteredOptions);
  }, [filteredOptions, onChange]);

  const handleClear = useCallback(() => {
    onChange([]);
  }, [onChange]);

  const allFilteredSelected = filteredOptions.length > 0 && filteredOptions.every(o => selectedSet.has(o));

  return (
    <div className="min-w-[180px] flex-1" ref={containerRef}>
      <button
        type="button"
        className={`flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
          isOpen
            ? 'border-blue-500 bg-white ring-1 ring-blue-500 dark:bg-zinc-800'
            : 'border-zinc-200 bg-white hover:border-zinc-300 dark:border-zinc-600 dark:bg-zinc-800 dark:hover:border-zinc-500'
        } ${selected.length > 0 ? 'text-zinc-950 dark:text-white' : 'text-zinc-400 dark:text-zinc-500'}`}
        onClick={() => { setIsOpen(!isOpen); setSearch(''); }}
      >
        <span className="truncate">
          {selected.length === 0
            ? label
            : `${label}: ${selected.length}`}
        </span>
        <svg className={`size-4 shrink-0 text-zinc-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute z-50 mt-1 w-full min-w-[280px] rounded-lg border border-zinc-200 bg-white shadow-lg dark:border-zinc-600 dark:bg-zinc-800" style={{ width: containerRef.current?.offsetWidth }}>
          {/* Поиск */}
          <div className="border-b border-zinc-100 p-2 dark:border-zinc-700">
            <input
              ref={searchInputRef}
              type="text"
              className="w-full rounded border border-zinc-200 bg-white px-2 py-1.5 text-sm outline-none focus:border-blue-500 dark:border-zinc-600 dark:bg-zinc-700 dark:text-white"
              placeholder={searchPlaceholder || 'Поиск...'}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {/* Кнопки Все / Сбросить */}
          <div className="flex items-center gap-2 border-b border-zinc-100 px-3 py-1.5 dark:border-zinc-700">
            <button
              type="button"
              className="text-xs text-blue-600 hover:text-blue-800 dark:text-blue-400"
              onClick={handleSelectAll}
              disabled={allFilteredSelected}
            >
              {allFilteredSelected ? '✓ Все' : 'Все'}
            </button>
            <span className="text-zinc-300 dark:text-zinc-600">|</span>
            <button
              type="button"
              className="text-xs text-zinc-500 hover:text-zinc-700 dark:text-zinc-400"
              onClick={handleClear}
            >
              Сбросить
            </button>
            <span className="ml-auto text-xs text-zinc-400">{filteredOptions.length}</span>
          </div>

          {/* Список */}
          <div className="max-h-[250px] overflow-y-auto p-1">
            {filteredOptions.length === 0 && (
              <div className="px-3 py-2 text-sm text-zinc-400">Ничего не найдено</div>
            )}
            {filteredOptions.map(option => (
              <label
                key={option}
                className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-700"
              >
                <input
                  type="checkbox"
                  className="size-3.5 shrink-0"
                  checked={selectedSet.has(option)}
                  onChange={() => handleToggle(option)}
                />
                <span className="truncate text-zinc-700 dark:text-zinc-300">{option}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
