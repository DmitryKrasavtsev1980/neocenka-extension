import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/catalyst/button';
import {
  XMarkIcon,
  CheckIcon,
  PencilSquareIcon,
  TrashIcon,
  ChevronDownIcon,
  FolderPlusIcon,
  PlusIcon,
  Bars2Icon,
} from '@heroicons/react/16/solid';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import * as api from '@/services/api-service';

export interface SavedFilterState {
  selectedRegions: string[];
  selectedTypes: string[];
  selectedDocTypes: string[];
  selectedPeriods: string[];
  selectedWallMaterials: string[];
  priceMin: string;
  priceMax: string;
  areaMin: string;
  areaMax: string;
  floorMin: string;
  floorMax: string;
  yearBuildMin: string;
  yearBuildMax: string;
  searchCity: string;
  searchStreet: string;
  selectedCadNumbers: string[];
  polygonCoords: [number, number][][] | null;
}

// Local types for UI (compatible with both local and server data)
export interface SavedFilter {
  id: string;
  name: string;
  groupId: string | null;
  sortOrder: number;
  createdAt: number;
  state: SavedFilterState;
  serverId?: number;
}

export interface FilterGroup {
  id: string;
  name: string;
  color: string;
  sortOrder: number;
  isCollapsed: boolean;
  serverId?: number;
}

const FILTERS_STORAGE_KEY = 'ret_saved_filters_v2';
const GROUPS_STORAGE_KEY = 'ret_filter_groups';

const GROUP_COLORS = [
  '#3b82f6', '#ef4444', '#22c55e', '#f59e0b',
  '#8b5cf6', '#ec4899', '#06b6d4', '#f97316',
];

// === Storage helpers ===

async function loadFromStorage<T>(key: string): Promise<T | null> {
  return new Promise((resolve) => {
    chrome.storage.local.get(key, (result: any) => {
      const raw = result?.[key];
      if (!raw) { resolve(null); return; }
      try { resolve(JSON.parse(raw)); }
      catch { resolve(null); }
    });
  });
}

async function saveToStorage(key: string, data: unknown): Promise<void> {
  chrome.storage.local.set({ [key]: JSON.stringify(data) });
}

// === Sortable Filter Card ===

interface SortableFilterCardProps {
  filter: SavedFilter;
  isActive: boolean;
  isEditing: boolean;
  editingName: string;
  onApply: () => void;
  onDelete: () => void;
  onStartEdit: () => void;
  onFinishEdit: () => void;
  onCancelEdit: () => void;
  onEditingNameChange: (name: string) => void;
}

const SortableFilterCard: React.FC<SortableFilterCardProps> = ({
  filter, isActive, isEditing, editingName,
  onApply, onDelete, onStartEdit, onFinishEdit, onCancelEdit, onEditingNameChange,
}) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: filter.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`rounded-lg border p-2.5 ${
        isActive
          ? 'border-blue-400 bg-blue-50 dark:border-blue-500 dark:bg-blue-950'
          : 'border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800'
      }`}
    >
      {isEditing ? (
        <div className="flex items-center gap-1">
          <input
            value={editingName}
            onChange={(e) => onEditingNameChange(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onFinishEdit()}
            className="py-1 px-2 text-xs flex-1 rounded-md border border-zinc-200 bg-white focus:border-blue-400 focus:outline-none dark:border-zinc-600 dark:bg-zinc-800 dark:text-white dark:focus:border-blue-500"
            autoFocus
          />
          <button onClick={onFinishEdit} className="rounded p-1 text-green-600 hover:bg-green-50 bg-transparent border-none cursor-pointer">
            <CheckIcon className="size-3.5" />
          </button>
          <button onClick={onCancelEdit} className="rounded p-1 text-zinc-400 hover:bg-zinc-100 bg-transparent border-none cursor-pointer">
            <XMarkIcon className="size-3.5" />
          </button>
        </div>
      ) : (
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-1 min-w-0">
            <span {...attributes} {...listeners} className="cursor-grab text-zinc-300 hover:text-zinc-500 dark:text-zinc-600 dark:hover:text-zinc-400 shrink-0">
              <Bars2Icon className="size-3" />
            </span>
            <span className="text-xs font-medium text-zinc-800 dark:text-zinc-200 truncate">
              {filter.name}
              {isActive && <span className="ml-1 text-[10px] text-blue-500 font-normal">активен</span>}
            </span>
          </div>
          <div className="flex items-center gap-0.5 shrink-0">
            <button onClick={onStartEdit} className="rounded p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 bg-transparent border-none cursor-pointer" title="Переименовать">
              <PencilSquareIcon className="size-3" />
            </button>
            <button onClick={onDelete} className="rounded p-1 text-zinc-400 hover:text-red-500 bg-transparent border-none cursor-pointer" title="Удалить">
              <TrashIcon className="size-3" />
            </button>
          </div>
        </div>
      )}
      <div className="flex items-center justify-between mt-1.5">
        <span className="text-[10px] text-zinc-400">
          {new Date(filter.createdAt).toLocaleDateString('ru-RU')}
        </span>
        <button onClick={onApply} className="text-[10px] text-blue-500 hover:text-blue-600 bg-transparent border-none cursor-pointer font-medium">
          Применить
        </button>
      </div>
    </div>
  );
};

// === Group Component ===

interface FilterGroupSectionProps {
  group: FilterGroup;
  filters: SavedFilter[];
  activeFilterId: string | null;
  editingId: string | null;
  editingName: string;
  onApply: (filter: SavedFilter) => void;
  onDelete: (id: string) => void;
  onStartEdit: (id: string, name: string) => void;
  onFinishEdit: (id: string) => void;
  onCancelEdit: () => void;
  onEditingNameChange: (name: string) => void;
  onToggleCollapse: () => void;
  onRenameGroup: () => void;
  onDeleteGroup: () => void;
  onChangeGroupColor: () => void;
}

const FilterGroupSection: React.FC<FilterGroupSectionProps> = ({
  group, filters, activeFilterId, editingId, editingName,
  onApply, onDelete, onStartEdit, onFinishEdit, onCancelEdit, onEditingNameChange,
  onToggleCollapse, onRenameGroup, onDeleteGroup, onChangeGroupColor,
}) => {
  return (
    <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 bg-zinc-50 dark:bg-zinc-800 group/header">
        <div
          className="size-3 rounded-full shrink-0 cursor-pointer hover:ring-2 hover:ring-offset-1"
          style={{ backgroundColor: group.color }}
          onClick={onChangeGroupColor}
          title="Изменить цвет"
        />
        <button
          className="flex items-center gap-1 flex-1 bg-transparent border-none cursor-pointer text-left p-0"
          onClick={onToggleCollapse}
        >
          <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300 truncate">
            {group.name}
          </span>
          <span className="text-[10px] text-zinc-400">({filters.length})</span>
          <ChevronDownIcon className={`size-3 text-zinc-400 transition-transform ml-auto ${group.isCollapsed ? '' : 'rotate-180'}`} />
        </button>
        <div className="flex items-center gap-0.5 opacity-0 group-hover/header:opacity-100 transition-opacity">
          <button onClick={onRenameGroup} className="rounded p-0.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 bg-transparent border-none cursor-pointer" title="Переименовать">
            <PencilSquareIcon className="size-3" />
          </button>
          <button onClick={onDeleteGroup} className="rounded p-0.5 text-zinc-400 hover:text-red-500 bg-transparent border-none cursor-pointer" title="Удалить группу">
            <TrashIcon className="size-3" />
          </button>
        </div>
      </div>
      {!group.isCollapsed && (
        <SortableContext items={filters.map(f => f.id)} strategy={verticalListSortingStrategy}>
          <div className="p-2 space-y-1.5">
            {filters.map(filter => (
              <SortableFilterCard
                key={filter.id}
                filter={filter}
                isActive={activeFilterId === filter.id}
                isEditing={editingId === filter.id}
                editingName={editingName}
                onApply={() => onApply(filter)}
                onDelete={() => onDelete(filter.id)}
                onStartEdit={() => onStartEdit(filter.id, filter.name)}
                onFinishEdit={() => onFinishEdit(filter.id)}
                onCancelEdit={onCancelEdit}
                onEditingNameChange={onEditingNameChange}
              />
            ))}
            {filters.length === 0 && (
              <p className="py-2 text-center text-[10px] text-zinc-400">Перетащите фильтр сюда</p>
            )}
          </div>
        </SortableContext>
      )}
    </div>
  );
};

// === Main Panel ===

interface SavedFiltersPanelProps {
  open: boolean;
  onClose: () => void;
  currentState: SavedFilterState;
  onApply: (state: SavedFilterState, filterId?: string, filterName?: string) => void;
  activeFilterId: string | null;
}

const SavedFiltersPanel: React.FC<SavedFiltersPanelProps> = ({ open, onClose, currentState, onApply, activeFilterId }) => {
  const [filters, setFilters] = useState<SavedFilter[]>([]);
  const [groups, setGroups] = useState<FilterGroup[]>([]);
  const [saving, setSaving] = useState(false);
  const [newName, setNewName] = useState('');
  const [newFilterGroupId, setNewFilterGroupId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editingGroupName, setEditingGroupName] = useState('');
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupColor, setNewGroupColor] = useState(GROUP_COLORS[0]);
  const [isOnline, setIsOnline] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // Load data
  const loadData = useCallback(async () => {
    // Try server first if authenticated
    try {
      const auth = await api.loadAuth();
      if (auth.token) {
        setIsOnline(true);
        const [serverGroups, serverFilters] = await Promise.all([
          api.getFilterGroups(),
          api.getSavedFilters(),
        ]);
        const mappedGroups: FilterGroup[] = serverGroups.map(sg => ({
          id: `g_${sg.id}`,
          name: sg.name,
          color: sg.color,
          sortOrder: sg.sort_order,
          isCollapsed: sg.is_collapsed,
          serverId: sg.id,
        }));
        const mappedFilters: SavedFilter[] = serverFilters.map(sf => ({
          id: `f_${sf.id}`,
          name: sf.name,
          groupId: sf.saved_filter_group_id ? `g_${sf.saved_filter_group_id}` : null,
          sortOrder: sf.sort_order,
          createdAt: new Date(sf.created_at).getTime(),
          state: sf.filter_data as unknown as SavedFilterState,
          serverId: sf.id,
        }));
        setGroups(mappedGroups);
        setFilters(mappedFilters);
        // Cache locally
        await Promise.all([
          saveToStorage(GROUPS_STORAGE_KEY, mappedGroups),
          saveToStorage(FILTERS_STORAGE_KEY, mappedFilters),
        ]);
        return;
      }
    } catch {
      setIsOnline(false);
    }

    // Fallback to local storage
    const [localGroups, localFilters] = await Promise.all([
      loadFromStorage<FilterGroup[]>(GROUPS_STORAGE_KEY),
      loadFromStorage<SavedFilter[]>(FILTERS_STORAGE_KEY),
    ]);

    // Migrate from old format if needed
    if (!localFilters) {
      const oldFilters = await loadFromStorage<SavedFilter[]>('ret_saved_filters');
      if (oldFilters && Array.isArray(oldFilters) && oldFilters.length > 0) {
        const migrated: SavedFilter[] = oldFilters.map((f: any) => ({
          id: f.id,
          name: f.name,
          groupId: null,
          sortOrder: 0,
          createdAt: f.createdAt,
          state: f.state,
        }));
        setFilters(migrated);
        await saveToStorage(FILTERS_STORAGE_KEY, migrated);
        return;
      }
    }

    setGroups(localGroups || []);
    setFilters(localFilters || []);
  }, []);

  useEffect(() => {
    if (open) loadData();
  }, [open, loadData]);

  // Persist to local storage (always)
  const persistLocal = useCallback(async () => {
    await Promise.all([
      saveToStorage(GROUPS_STORAGE_KEY, groups),
      saveToStorage(FILTERS_STORAGE_KEY, filters),
    ]);
  }, [groups, filters]);

  useEffect(() => {
    if (open && (groups.length > 0 || filters.length > 0)) {
      persistLocal();
    }
  }, [groups, filters, open, persistLocal]);

  // === Handlers ===

  const handleApplyFilter = (filter: SavedFilter) => {
    onApply(filter.state, filter.id, filter.name);
    onClose();
  };

  const handleDeleteFilter = async (id: string) => {
    const filter = filters.find(f => f.id === id);
    const updated = filters.filter(f => f.id !== id);
    setFilters(updated);

    if (isOnline && filter?.serverId) {
      try { await api.deleteSavedFilter(filter.serverId); } catch {}
    }
  };

  const handleRenameFilter = async (id: string) => {
    if (!editingName.trim()) { setEditingId(null); return; }
    const updated = filters.map(f => f.id === id ? { ...f, name: editingName.trim() } : f);
    setFilters(updated);
    setEditingId(null);

    if (isOnline) {
      const filter = updated.find(f => f.id === id);
      if (filter?.serverId) {
        try { await api.updateSavedFilter(filter.serverId, { name: editingName.trim() }); } catch {}
      }
    }
  };

  const handleSaveFilter = async () => {
    if (!newName.trim()) return;
    const filter: SavedFilter = {
      id: crypto.randomUUID(),
      name: newName.trim(),
      groupId: newFilterGroupId,
      sortOrder: filters.filter(f => f.groupId === newFilterGroupId).length,
      createdAt: Date.now(),
      state: currentState,
    };
    const updated = [...filters, filter];
    setFilters(updated);
    setNewName('');
    setSaving(false);
    setNewFilterGroupId(null);

    if (isOnline) {
      try {
        const serverFilter = await api.createSavedFilter({
          name: filter.name,
          saved_filter_group_id: filter.groupId ? groups.find(g => g.id === filter.groupId)?.serverId : null,
          filter_data: currentState as unknown as Record<string, unknown>,
          sort_order: filter.sortOrder,
        });
        // Update with server ID
        setFilters(prev => prev.map(f => f.id === filter.id ? { ...f, serverId: serverFilter.id } : f));
      } catch {}
    }
  };

  const handleCreateGroup = async () => {
    if (!newGroupName.trim()) return;
    const group: FilterGroup = {
      id: crypto.randomUUID(),
      name: newGroupName.trim(),
      color: newGroupColor,
      sortOrder: groups.length,
      isCollapsed: false,
    };
    const updated = [...groups, group];
    setGroups(updated);
    setNewGroupName('');
    setCreatingGroup(false);

    if (isOnline) {
      try {
        const serverGroup = await api.createFilterGroup({
          name: group.name,
          color: group.color,
          sort_order: group.sortOrder,
        });
        setGroups(prev => prev.map(g => g.id === group.id ? { ...g, serverId: serverGroup.id } : g));
      } catch {}
    }
  };

  const handleToggleGroup = (groupId: string) => {
    setGroups(prev => prev.map(g => g.id === groupId ? { ...g, isCollapsed: !g.isCollapsed } : g));

    if (isOnline) {
      const group = groups.find(g => g.id === groupId);
      if (group?.serverId) {
        api.updateFilterGroup(group.serverId, { is_collapsed: !group.isCollapsed }).catch(() => {});
      }
    }
  };

  const handleRenameGroup = async (groupId: string) => {
    if (!editingGroupName.trim()) { setEditingGroupId(null); return; }
    setGroups(prev => prev.map(g => g.id === groupId ? { ...g, name: editingGroupName.trim() } : g));
    setEditingGroupId(null);

    if (isOnline) {
      const group = groups.find(g => g.id === groupId);
      if (group?.serverId) {
        try { await api.updateFilterGroup(group.serverId, { name: editingGroupName.trim() }); } catch {}
      }
    }
  };

  const handleDeleteGroup = async (groupId: string) => {
    // Move filters to "no group"
    setFilters(prev => prev.map(f => f.groupId === groupId ? { ...f, groupId: null } : f));
    setGroups(prev => prev.filter(g => g.id !== groupId));

    if (isOnline) {
      const group = groups.find(g => g.id === groupId);
      if (group?.serverId) {
        try { await api.deleteFilterGroup(group.serverId); } catch {}
      }
    }
  };

  const handleChangeGroupColor = (groupId: string) => {
    const group = groups.find(g => g.id === groupId);
    if (!group) return;
    const currentIdx = GROUP_COLORS.indexOf(group.color);
    const nextColor = GROUP_COLORS[(currentIdx + 1) % GROUP_COLORS.length];
    setGroups(prev => prev.map(g => g.id === groupId ? { ...g, color: nextColor } : g));

    if (isOnline && group.serverId) {
      api.updateFilterGroup(group.serverId, { color: nextColor }).catch(() => {});
    }
  };

  // DnD handler
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const activeId = String(active.id);

    // Determine target group from over item
    const overFilter = filters.find(f => f.id === String(over.id));
    const targetGroupId = overFilter?.groupId ?? null;

    let newFilters: SavedFilter[] = [];
    setFilters(prev => {
      const updated = prev.map(f =>
        f.id === activeId ? { ...f, groupId: targetGroupId } : f
      );
      // Re-sort within target group
      const groupFilters = updated.filter(f => f.groupId === targetGroupId);
      const otherFilters = updated.filter(f => f.groupId !== targetGroupId);
      const overIdx = groupFilters.findIndex(f => f.id === String(over.id));
      const activeIdx = groupFilters.findIndex(f => f.id === activeId);

      if (overIdx >= 0 && activeIdx >= 0) {
        const [moved] = groupFilters.splice(activeIdx, 1);
        groupFilters.splice(overIdx, 0, moved);
      }
      // Re-assign sort orders
      groupFilters.forEach((f, i) => { f.sortOrder = i; });

      newFilters = [...otherFilters, ...groupFilters];
      return newFilters;
    });

    // Immediately persist to local storage
    saveToStorage(FILTERS_STORAGE_KEY, newFilters);

    // Sync with server
    if (isOnline) {
      const activeFilter = filters.find(f => f.id === activeId);
      if (activeFilter?.serverId) {
        const targetGroup = targetGroupId ? groups.find(g => g.id === targetGroupId) : null;
        api.updateSavedFilter(activeFilter.serverId, {
          saved_filter_group_id: targetGroup?.serverId ?? null,
        }).catch(() => {});
      }
    }
  };

  if (!open) return null;

  const groupedFilters = groups
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map(g => ({
      group: g,
      filters: filters.filter(f => f.groupId === g.id).sort((a, b) => a.sortOrder - b.sortOrder),
    }));

  const ungroupedFilters = filters
    .filter(f => !f.groupId || !groups.find(g => g.id === f.groupId))
    .sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-[10000] bg-black/30" onClick={onClose} />
      {/* Panel */}
      <div className="fixed right-0 top-0 z-[10001] h-full w-80 bg-white shadow-xl dark:bg-zinc-900 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-700">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Сохранённые фильтры
            </h3>
            {isOnline && (
              <span className="size-1.5 rounded-full bg-green-400" title="Синхронизировано" />
            )}
          </div>
          <button onClick={onClose} className="rounded p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 bg-transparent border-none cursor-pointer">
            <XMarkIcon className="size-4" />
          </button>
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-zinc-100 dark:border-zinc-800">
          <button
            onClick={() => { setCreatingGroup(true); setNewGroupName(''); setNewGroupColor(GROUP_COLORS[0]); }}
            className="flex items-center gap-1 text-[11px] text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200 bg-transparent border-none cursor-pointer"
          >
            <FolderPlusIcon className="size-3.5" />
            Группа
          </button>
          <button
            onClick={() => { setSaving(true); setNewName(''); setNewFilterGroupId(null); }}
            className="flex items-center gap-1 text-[11px] text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200 bg-transparent border-none cursor-pointer"
          >
            <PlusIcon className="size-3.5" />
            Фильтр
          </button>
        </div>

        {/* Content */}
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {creatingGroup && (
              <div className="rounded-lg border border-dashed border-zinc-300 dark:border-zinc-600 p-3">
                <div className="flex items-center gap-2 mb-2">
                  <div className="flex gap-1">
                    {GROUP_COLORS.slice(0, 6).map(c => (
                      <button
                        key={c}
                        onClick={() => setNewGroupColor(c)}
                        className={`size-4 rounded-full border-2 ${newGroupColor === c ? 'border-zinc-800 dark:border-white' : 'border-transparent'}`}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <input
                    value={newGroupName}
                    onChange={(e) => setNewGroupName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleCreateGroup()}
                    placeholder="Название группы..."
                    className="py-1 px-2 text-xs flex-1 rounded-md border border-zinc-200 bg-white focus:border-blue-400 focus:outline-none dark:border-zinc-600 dark:bg-zinc-800 dark:text-white dark:focus:border-blue-500"
                    autoFocus
                  />
                  <button onClick={handleCreateGroup} className="rounded p-1 text-green-600 hover:bg-green-50 bg-transparent border-none cursor-pointer">
                    <CheckIcon className="size-3.5" />
                  </button>
                  <button onClick={() => setCreatingGroup(false)} className="rounded p-1 text-zinc-400 hover:bg-zinc-100 bg-transparent border-none cursor-pointer">
                    <XMarkIcon className="size-3.5" />
                  </button>
                </div>
              </div>
            )}

            {/* Grouped filters */}
            {groupedFilters.map(({ group, filters: groupFilters }) => (
              <FilterGroupSection
                key={group.id}
                group={editingGroupId === group.id ? { ...group, name: editingGroupName } : group}
                filters={groupFilters}
                activeFilterId={activeFilterId}
                editingId={editingId}
                editingName={editingName}
                onApply={handleApplyFilter}
                onDelete={handleDeleteFilter}
                onStartEdit={(id, name) => { setEditingId(id); setEditingName(name); }}
                onFinishEdit={handleRenameFilter}
                onCancelEdit={() => setEditingId(null)}
                onEditingNameChange={setEditingName}
                onToggleCollapse={() => handleToggleGroup(group.id)}
                onRenameGroup={() => { setEditingGroupId(group.id); setEditingGroupName(group.name); }}
                onDeleteGroup={() => handleDeleteGroup(group.id)}
                onChangeGroupColor={() => handleChangeGroupColor(group.id)}
              />
            ))}

            {/* Ungrouped filters */}
            {ungroupedFilters.length > 0 && (
              <div>
                {groupedFilters.length > 0 && (
                  <p className="text-[10px] text-zinc-400 uppercase tracking-wide mb-2 px-1">Без группы</p>
                )}
                <SortableContext items={ungroupedFilters.map(f => f.id)} strategy={verticalListSortingStrategy}>
                  <div className="space-y-1.5">
                    {ungroupedFilters.map(filter => (
                      <SortableFilterCard
                        key={filter.id}
                        filter={filter}
                        isActive={activeFilterId === filter.id}
                        isEditing={editingId === filter.id}
                        editingName={editingName}
                        onApply={() => handleApplyFilter(filter)}
                        onDelete={() => handleDeleteFilter(filter.id)}
                        onStartEdit={() => { setEditingId(filter.id); setEditingName(filter.name); }}
                        onFinishEdit={() => handleRenameFilter(filter.id)}
                        onCancelEdit={() => setEditingId(null)}
                        onEditingNameChange={setEditingName}
                      />
                    ))}
                  </div>
                </SortableContext>
              </div>
            )}

            {filters.length === 0 && !creatingGroup && (
              <p className="py-8 text-center text-xs text-zinc-400">
                Нет сохранённых фильтров
              </p>
            )}
          </div>
        </DndContext>

        {/* Save current filter (inline) */}
        {saving && (
          <div className="border-t border-zinc-200 p-3 dark:border-zinc-700">
            <div className="flex items-center gap-1 mb-2">
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSaveFilter()}
                placeholder="Название фильтра..."
                className="py-1.5 px-2 text-xs flex-1 rounded-md border border-zinc-200 bg-white focus:border-blue-400 focus:outline-none dark:border-zinc-600 dark:bg-zinc-800 dark:text-white dark:focus:border-blue-500"
                autoFocus
              />
              <Button color="blue" className="!py-1.5 !px-2" onClick={handleSaveFilter}>
                <CheckIcon className="size-3.5" />
              </Button>
              <Button className="!py-1.5 !px-2" onClick={() => { setSaving(false); setNewFilterGroupId(null); }}>
                <XMarkIcon className="size-3.5" />
              </Button>
            </div>
            {groups.length > 0 && (
              <div className="flex flex-wrap gap-1">
                <button
                  onClick={() => setNewFilterGroupId(null)}
                  className={`text-[10px] px-2 py-0.5 rounded-full border cursor-pointer ${!newFilterGroupId ? 'border-blue-400 bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400 dark:border-blue-500' : 'border-zinc-200 text-zinc-500 dark:border-zinc-700 dark:text-zinc-400'} bg-transparent`}
                >
                  Без группы
                </button>
                {groups.map(g => (
                  <button
                    key={g.id}
                    onClick={() => setNewFilterGroupId(g.id)}
                    className={`text-[10px] px-2 py-0.5 rounded-full border cursor-pointer flex items-center gap-1 ${newFilterGroupId === g.id ? 'border-blue-400 bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400 dark:border-blue-500' : 'border-zinc-200 text-zinc-500 dark:border-zinc-700 dark:text-zinc-400'} bg-transparent`}
                  >
                    <span className="size-2 rounded-full" style={{ backgroundColor: g.color }} />
                    {g.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
};

export default SavedFiltersPanel;
