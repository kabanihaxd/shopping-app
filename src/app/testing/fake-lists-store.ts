import { Provider, computed, signal } from '@angular/core';
import { DEFAULT_CATEGORIES } from '../category';
import { AppUser, ListsStore, ShoppingListData, copyOfList } from '../lists-store';
import { Item } from '../item';
import { Notice } from '../notices';
import { Purchase } from '../purchase';
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
  readonly notices = signal<Notice[]>([]);
  readonly nicknames = signal<Record<string, string>>({});
  readonly nickname = computed(() => this.nicknames()[this.email()] ?? '');
  /** В тестах по умолчанию false: форма нікнейма не должна мешать остальным тестам */
  readonly profileReady = signal(false);

  nameOf(email: string): string {
    return this.nicknames()[email] || email;
  }

  setNickname(nickname: string) {
    this.nicknames.update((all) => ({ ...all, [this.email()]: nickname }));
  }

  /** Сколько миллисекунд плашка должна висеть (таймера в тестах нет — смотрим, что просили) */
  lastNoticeMs = 0;

  showNotice(notice: Omit<Notice, 'id'>, ms = 10_000) {
    this.lastNoticeMs = ms;
    this.notices.update((all) => [...all, { ...notice, id: crypto.randomUUID() }]);
  }

  dismissNotice(id: string) {
    this.notices.update((all) => all.filter((n) => n.id !== id));
  }

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

  duplicate(id: string): string | null {
    const list = this.lists().find((l) => l.id === id);
    if (!list) return null;
    const copy = { id: crypto.randomUUID(), ...copyOfList(list, this.email(), Date.now()) };
    this.lists.update((all) => [...all, copy]);
    return copy.id;
  }

  addToArchive(id: string, records: Purchase[]) {
    this.update(id, (l) => ({ ...l, archive: [...(l.archive ?? []), ...records] }));
  }

  removeFromArchive(id: string, records: Purchase[]) {
    const gone = new Set(records.map((r) => r.r));
    this.update(id, (l) => ({ ...l, archive: (l.archive ?? []).filter((r) => !gone.has(r.r)) }));
  }

  setBudget(id: string, amount: number | null) {
    this.update(id, (l) => ({ ...l, budget: amount ?? 0 }));
  }

  setInviteCode(id: string, code: string | null) {
    this.update(id, (l) => ({ ...l, inviteCode: code ?? '' }));
  }

  /** Как настоящее: вступить можно, только если код совпадает с кодом списка */
  async join(id: string, code: string): Promise<boolean> {
    const target = this.joinable.find((l) => l.id === id);
    if (!target || !target.inviteCode || target.inviteCode !== code) return false;
    this.lists.update((all) => [...all, { ...target, members: [...target.members, this.email()] }]);
    return true;
  }

  /** Списки, в которые можно вступить по ссылке (мы пока не участники) */
  joinable: ShoppingListData[] = [];

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
