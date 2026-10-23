import { Injectable, computed, effect, signal } from '@angular/core';
import { Item } from './item';

export type ShoppingListData = {
  id: string;
  name: string;
  toBuy: Item[];
  bought: Item[];
};

const STORAGE_KEY = 'shopping-lists';
const OLD_STORAGE_KEY = 'shopping-list';

function loadItems(raw: unknown): Item[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((x) => {
    if (typeof x === 'string') {
      return { id: crypto.randomUUID(), name: x, quantity: 1, price: 0 };
    }
    const obj = x as Partial<Item>;
    return {
      id: obj.id ?? crypto.randomUUID(),
      name: obj.name ?? '',
      quantity: obj.quantity ?? 1,
      price: obj.price ?? 0,
    };
  });
}

function loadLists(): ShoppingListData[] {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    const raw = JSON.parse(saved) as Partial<ShoppingListData>[];
    return raw.map((l) => ({
      id: l.id ?? crypto.randomUUID(),
      name: l.name ?? 'Без названия',
      toBuy: loadItems(l.toBuy),
      bought: loadItems(l.bought),
    }));
  }

  // Миграция: раньше был один список под ключом 'shopping-list'
  const old = localStorage.getItem(OLD_STORAGE_KEY);
  if (old) {
    const data = JSON.parse(old) as Partial<ShoppingListData>;
    return [
      {
        id: crypto.randomUUID(),
        name: 'Мой список покупок',
        toBuy: loadItems(data.toBuy),
        bought: loadItems(data.bought),
      },
    ];
  }
  return [];
}

/** Хранилище всех списков. Один экземпляр на всё приложение (providedIn: 'root'). */
@Injectable({ providedIn: 'root' })
export class ListsStore {
  readonly lists = signal<ShoppingListData[]>(loadLists());

  constructor() {
    effect(() => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.lists()));
    });
  }

  /** Список по id — сигнал, который обновляется при любом изменении. */
  find(id: () => string | undefined) {
    return computed(() => this.lists().find((l) => l.id === id()));
  }

  create(name: string): string {
    const list: ShoppingListData = { id: crypto.randomUUID(), name, toBuy: [], bought: [] };
    this.lists.update((all) => [...all, list]);
    return list.id;
  }

  deleteList(id: string) {
    this.lists.update((all) => all.filter((l) => l.id !== id));
  }

  update(id: string, change: (list: ShoppingListData) => ShoppingListData) {
    this.lists.update((all) => all.map((l) => (l.id === id ? change(l) : l)));
  }
}
