import { Provider, computed, signal } from '@angular/core';
import { ListsStore, ShoppingListData } from '../lists-store';

/** Хранилище для тестов: всё в памяти, без Firebase и интернета */
export class FakeListsStore {
  readonly user = signal<{ email: string } | null>({ email: 'me@example.com' });
  readonly email = computed(() => this.user()?.email ?? '');
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly lists = signal<ShoppingListData[]>([]);

  signIn() {}
  signOut() {}

  find(id: () => string | undefined) {
    return computed(() => this.lists().find((l) => l.id === id()));
  }

  create(name: string): string {
    const id = crypto.randomUUID();
    const email = this.email();
    this.lists.update((all) => [
      ...all,
      { id, name, ownerEmail: email, members: [email], toBuy: [], bought: [], createdAt: Date.now() },
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
    this.update(id, (l) => ({ ...l, members: [...l.members, email] }));
  }

  unshare(id: string, email: string) {
    this.update(id, (l) => ({ ...l, members: l.members.filter((m) => m !== email) }));
  }
}

export function provideFakeListsStore(): Provider {
  return { provide: ListsStore, useClass: FakeListsStore };
}
