import { Provider, computed, signal } from '@angular/core';
import { DEFAULT_CATEGORIES } from '../category';
import { AppUser, ListsStore, ShoppingListData } from '../lists-store';
import { Item } from '../item';
import { HistoryEntry, forgetItem, rememberItem } from '../suggestions';

/** Хранилище для тестов: всё в памяти, без Firebase и интернета */
export class FakeListsStore {
  readonly user = signal<{ email: string } | null>({ email: 'me@example.com' });
  readonly email = computed(() => this.user()?.email ?? '');
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly lists = signal<ShoppingListData[]>([]);
  readonly users = signal<AppUser[]>([]);
  readonly history = signal<HistoryEntry[]>([]);

  signIn() {}
  signOut() {}

  remember(item: Item) {
    this.history.update((h) => rememberItem(h, item));
  }

  forget(name: string) {
    this.history.update((h) => forgetItem(h, name));
  }

  find(id: () => string | undefined) {
    return computed(() => this.lists().find((l) => l.id === id()));
  }

  create(name: string): string {
    const id = crypto.randomUUID();
    const email = this.email();
    this.lists.update((all) => [
      ...all,
      { id, name, ownerEmail: email, members: [email], categories: DEFAULT_CATEGORIES, toBuy: [], bought: [], createdAt: Date.now() },
    ]);
    return id;
  }

  deleteList(id: string) {
    this.lists.update((all) => all.filter((l) => l.id !== id));
  }

  update(id: string, change: (list: ShoppingListData) => ShoppingListData) {
    this.lists.update((all) => all.map((l) => (l.id === id ? change(l) : l)));
  }

  share(id: string, email: string) {
    // Как настоящее хранилище: email без пробелов и маленькими буквами
    this.update(id, (l) => ({ ...l, members: [...l.members, email.trim().toLowerCase()] }));
  }

  unshare(id: string, email: string) {
    this.update(id, (l) => ({ ...l, members: l.members.filter((m) => m !== email) }));
  }
}

export function provideFakeListsStore(): Provider {
  return { provide: ListsStore, useClass: FakeListsStore };
}
