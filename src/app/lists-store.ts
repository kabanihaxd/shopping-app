import { Injectable, computed, effect, signal, untracked } from '@angular/core';
import { initializeApp } from 'firebase/app';
import {
  GoogleAuthProvider,
  User,
  getAuth,
  getRedirectResult,
  onAuthStateChanged,
  signInWithRedirect,
  signOut,
} from 'firebase/auth';
import {
  DocumentData,
  QuerySnapshot,
  Unsubscribe,
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  deleteField,
  doc,
  initializeFirestore,
  onSnapshot,
  persistentLocalCache,
  persistentMultipleTabManager,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { ADMIN_UID, firebaseConfig } from './firebase-config';
import { Category, DEFAULT_CATEGORIES } from './category';
import { Item } from './item';
import { Notice, describeChange } from './notices';
import { cleanNickname } from './nickname';
import { HistoryEntry, forgetItem, rememberItem } from './suggestions';

export type ShoppingListData = {
  id: string;
  name: string;
  /** Кто создал список — только он может приглашать и удалять */
  ownerEmail: string;
  /** Email всех, у кого есть доступ (включая владельца) */
  members: string[];
  /** Категории товаров — общие для всех участников списка */
  categories: Category[];
  toBuy: Item[];
  bought: Item[];
  createdAt: number;
  /** Email того, кто изменил список последним — для уведомлений остальным участникам */
  updatedBy?: string;
  /** Секретный код ссылки-приглашения; пусто — ссылка выключена */
  inviteCode?: string;
};

/** Человек, который хоть раз входил на сайт (коллекция users, id документа — email) */
export type AppUser = {
  email: string;
  name: string;
  /** Когда заходил последний раз (мс) */
  lastSeen: number;
};

const STORAGE_KEY = 'shopping-lists';
const IMPORTED_KEY = 'shopping-lists-imported';
const OLD_STORAGE_KEY = 'shopping-list';

export function loadItems(raw: unknown): Item[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((x) => {
    if (typeof x === 'string') {
      return { id: crypto.randomUUID(), name: x, quantity: 1, price: 0, categoryId: '' };
    }
    const obj = x as Partial<Item>;
    return {
      id: obj.id ?? crypto.randomUUID(),
      name: obj.name ?? '',
      quantity: obj.quantity ?? 1,
      price: obj.price ?? 0,
      categoryId: obj.categoryId ?? '',
      ...(typeof obj.boughtAt === 'number' ? { boughtAt: obj.boughtAt } : {}),
      ...(obj.pinned === true ? { pinned: true } : {}),
    };
  });
}

/**
 * Копия списка для повторяющихся покупок: все товары (и уже купленные) снова «треба купити»,
 * с новыми id и без даты покупки. Категории сохраняются; доступ только у того, кто копирует.
 */
export function copyOfList(list: ShoppingListData, email: string, now: number): Omit<ShoppingListData, 'id'> {
  const fresh = (items: Item[]) =>
    items.map(({ boughtAt, ...item }) => ({ ...item, id: crypto.randomUUID() }));
  return {
    name: `${list.name} (копія)`,
    ownerEmail: email,
    members: [email],
    categories: list.categories,
    toBuy: fresh([...list.toBuy, ...list.bought]),
    bought: [],
    createdAt: now,
  };
}

/** Документ из Firestore → наш тип (на случай, если каких-то полей нет) */
export function toList(id: string, data: DocumentData): ShoppingListData {
  return {
    id,
    name: data['name'] ?? 'Без назви',
    ownerEmail: data['ownerEmail'] ?? '',
    members: data['members'] ?? [],
    categories: Array.isArray(data['categories']) ? data['categories'] : DEFAULT_CATEGORIES,
    toBuy: loadItems(data['toBuy']),
    bought: loadItems(data['bought']),
    createdAt: data['createdAt'] ?? 0,
    updatedBy: data['updatedBy'] ?? '',
    inviteCode: data['inviteCode'] ?? '',
  };
}

/** Списки, которые остались в localStorage с тех времён, когда всё хранилось в браузере */
function loadLocalLists(): { name: string; toBuy: Item[]; bought: Item[] }[] {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    const raw = JSON.parse(saved) as { name?: string; toBuy?: unknown; bought?: unknown }[];
    return raw.map((l) => ({
      name: l.name ?? 'Без назви',
      toBuy: loadItems(l.toBuy),
      bought: loadItems(l.bought),
    }));
  }
  const old = localStorage.getItem(OLD_STORAGE_KEY);
  if (old) {
    const data = JSON.parse(old) as { toBuy?: unknown; bought?: unknown };
    return [{ name: 'Мій список покупок', toBuy: loadItems(data.toBuy), bought: loadItems(data.bought) }];
  }
  return [];
}

/**
 * Хранилище всех списков — теперь в облаке (Firebase Firestore).
 * Списки видны на всех устройствах, где выполнен вход, и всем приглашённым людям.
 */
@Injectable({ providedIn: 'root' })
export class ListsStore {
  private readonly app = initializeApp(firebaseConfig);
  private readonly auth = getAuth(this.app);
  // Кэш на устройстве: списки открываются и меняются даже без интернета (в магазине без связи)
  private readonly db = initializeFirestore(this.app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  });
  private readonly listsRef = collection(this.db, 'lists');
  private readonly usersRef = collection(this.db, 'users');
  private readonly historiesRef = collection(this.db, 'histories');
  private readonly profilesRef = collection(this.db, 'profiles');
  private stopListening?: Unsubscribe;
  private stopListeningUsers?: Unsubscribe;
  private stopListeningHistory?: Unsubscribe;
  /** Первый ответ сервера — отправная точка: о том, что уже было в списках, не уведомляем */
  private baselineReady = false;
  /** Подписки на профили (нікнейми) людей из моих списков, ключ — email */
  private readonly profileListeners = new Map<string, Unsubscribe>();

  /** Кто вошёл (null — никто) */
  readonly user = signal<User | null>(null);
  readonly email = computed(() => this.user()?.email?.toLowerCase() ?? '');
  /** true, пока не известно, кто вошёл, и пока не пришли первые данные */
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  private readonly allLists = signal<ShoppingListData[]>([]);
  readonly lists = computed(() => [...this.allLists()].sort((a, b) => a.createdAt - b.createdAt));

  /** Все, кто входил на сайт, — новые сверху. Им можно дать доступ к списку одним нажатием. */
  readonly users = signal<AppUser[]>([]);

  /** Что я раньше добавлял — для подсказок при вводе. Личное: другие люди её не видят. */
  readonly history = signal<HistoryEntry[]>([]);

  /** Уведомления об изменениях, которые сделали другие участники */
  readonly notices = signal<Notice[]>([]);

  /** Нікнейми известных мне людей: email → ник (пусто, если не задан) */
  private readonly nicknames = signal<Record<string, string>>({});
  /** Мой нікнейм (пусто — ещё не придумал) */
  readonly nickname = computed(() => this.nicknames()[this.email()] ?? '');
  /** true, когда сервер ответил, есть ли у меня нікнейм, — только тогда можно предлагать его придумать */
  readonly profileReady = signal(false);

  constructor() {
    // Следим за нікнеймами всех, кто есть в моих списках (и за своим): список людей меняется — подписки тоже
    effect(() => {
      const me = this.email();
      const emails = new Set(me ? [me] : []);
      for (const list of this.allLists()) list.members.forEach((m) => emails.add(m));
      untracked(() => this.syncProfiles(emails));
    });

    // Если вернулись со страницы входа Google с ошибкой — показать её
    getRedirectResult(this.auth).catch((e) => this.fail(e));

    onAuthStateChanged(this.auth, (user) => {
      this.stopListening?.();
      this.stopListeningUsers?.();
      this.stopListeningHistory?.();
      this.allLists.set([]);
      this.users.set([]);
      this.history.set([]);
      this.notices.set([]);
      this.baselineReady = false;
      this.stopProfiles();
      this.nicknames.set({});
      this.profileReady.set(false);
      this.user.set(user);
      if (!user) {
        this.loading.set(false);
        return;
      }

      // Подписка: Firestore сам присылает новые данные при любом изменении — с любого устройства
      this.loading.set(true);
      const mine = query(this.listsRef, where('members', 'array-contains', this.email()));
      this.stopListening = onSnapshot(
        mine,
        (snapshot) => {
          const previous = this.allLists();
          this.allLists.set(snapshot.docs.map((d) => toList(d.id, d.data())));
          this.announceChanges(snapshot, previous);
          this.loading.set(false);
        },
        (err) => {
          this.fail(err);
          this.loading.set(false);
        },
      );
      this.importLocalLists();
      this.rememberMe(user);
      // Список посетителей видит только админ (база всё равно не отдаст его остальным)
      if (user.uid === ADMIN_UID) {
        this.listenToUsers();
      }
      this.listenToHistory();
    });
  }

  /**
   * Вход через переход на страницу Google и обратно (не всплывающее окно):
   * так работает и в Safari на iPhone, и в приложении с главного экрана.
   * Работает, потому что authDomain совпадает с адресом сайта (см. firebase-config.ts).
   */
  signIn() {
    signInWithRedirect(this.auth, new GoogleAuthProvider()).catch((e) => this.fail(e));
  }

  signOut() {
    signOut(this.auth).catch((e) => this.fail(e));
  }

  /** Список по id — сигнал, который обновляется при любом изменении. */
  find(id: () => string | undefined) {
    return computed(() => this.lists().find((l) => l.id === id()));
  }

  create(name: string): string {
    const ref = doc(this.listsRef); // id генерируется сразу, ещё до отправки на сервер
    setDoc(ref, {
      name,
      ownerEmail: this.email(),
      members: [this.email()],
      categories: DEFAULT_CATEGORIES,
      toBuy: [],
      bought: [],
      createdAt: Date.now(),
    }).catch((e) => this.fail(e));
    return ref.id;
  }

  /** Копия списка одним нажатием — возвращает id новой копии (null, если списка нет) */
  duplicate(id: string): string | null {
    const list = this.lists().find((l) => l.id === id);
    if (!list) return null;
    const ref = doc(this.listsRef);
    setDoc(ref, copyOfList(list, this.email(), Date.now())).catch((e) => this.fail(e));
    return ref.id;
  }

  /** Владелец удаляет список целиком, остальные — просто выходят из него */
  deleteList(id: string) {
    const list = this.lists().find((l) => l.id === id);
    const ref = doc(this.listsRef, id);
    const done = list?.ownerEmail === this.email()
      ? deleteDoc(ref)
      : updateDoc(ref, { members: arrayRemove(this.email()) });
    done.catch((e) => this.fail(e));
  }

  update(id: string, change: (list: ShoppingListData) => ShoppingListData) {
    const list = this.lists().find((l) => l.id === id);
    if (!list) return;
    const { name, categories, toBuy, bought } = change(list);
    updateDoc(doc(this.listsRef, id), { name, categories, toBuy, bought, updatedBy: this.email() }).catch((e) => this.fail(e));
  }

  /** Как показывать человека: нікнейм, а если его нет — email */
  nameOf(email: string): string {
    return this.nicknames()[email] || email;
  }

  setNickname(raw: string) {
    const nickname = cleanNickname(raw);
    this.nicknames.update((all) => ({ ...all, [this.email()]: nickname })); // сразу, не дожидаясь сервера
    setDoc(doc(this.profilesRef, this.email()), { nickname }).catch((e) => this.fail(e));
  }

  private syncProfiles(emails: Set<string>) {
    for (const [email, stop] of this.profileListeners) {
      if (emails.has(email)) continue;
      stop();
      this.profileListeners.delete(email);
    }
    for (const email of emails) {
      if (this.profileListeners.has(email)) continue;
      const stop = onSnapshot(
        doc(this.profilesRef, email),
        (snapshot) => {
          const nickname = snapshot.data()?.['nickname'];
          this.nicknames.update((all) => ({ ...all, [email]: typeof nickname === 'string' ? nickname : '' }));
          if (email === this.email()) this.profileReady.set(true);
        },
        // Без красной полоски: пока правила не выложены, просто показываем почту и не пристаём с вопросом
        (err) => console.error(err),
      );
      this.profileListeners.set(email, stop);
    }
  }

  private stopProfiles() {
    this.profileListeners.forEach((stop) => stop());
    this.profileListeners.clear();
  }

  dismissNotice(id: string) {
    this.notices.update((all) => all.filter((n) => n.id !== id));
  }

  /**
   * Уведомляет о том, что изменили другие. Мои собственные правки пропускаем:
   * пока сервер их не подтвердил, Firestore помечает документ hasPendingWrites.
   */
  private announceChanges(snapshot: QuerySnapshot<DocumentData>, previous: ShoppingListData[]) {
    if (!this.baselineReady) {
      // Ответ из кэша на устройстве — ещё не «настоящее» состояние, ждём сервер
      this.baselineReady = !snapshot.metadata.fromCache;
      return;
    }
    for (const change of snapshot.docChanges()) {
      if (change.type === 'removed' || change.doc.metadata.hasPendingWrites) continue;
      const before = previous.find((l) => l.id === change.doc.id);
      if (change.type === 'modified' && !before) continue;
      const after = toList(change.doc.id, change.doc.data());
      const text = describeChange(before, after, this.email(), (e) => this.nicknames()[e] || e.split('@')[0]);
      if (text) this.notify({ id: crypto.randomUUID(), listId: after.id, text });
    }
  }

  private notify(notice: Notice) {
    this.notices.update((all) => [...all, notice].slice(-3)); // больше трёх сразу не показываем
    setTimeout(() => this.dismissNotice(notice.id), 10_000);
  }

  /** Включить (code) или выключить (null) ссылку-приглашение — только владелец */
  setInviteCode(id: string, code: string | null) {
    updateDoc(doc(this.listsRef, id), {
      inviteCode: code ?? deleteField(),
      updatedBy: this.email(),
    }).catch((e) => this.fail(e));
  }

  /**
   * Вступить в список по ссылке. Список ещё не наш, читать его нельзя — поэтому только дописываем
   * себя в members и показываем серверу код из ссылки (правила проверяют его).
   * Ошибку показывает страница приглашения сама, а не общая красная полоска.
   */
  async join(id: string, code: string): Promise<boolean> {
    try {
      await updateDoc(doc(this.listsRef, id), { members: arrayUnion(this.email()), joinCode: code });
      return true;
    } catch (e) {
      console.error(e);
      return false;
    }
  }

  share(id: string, email: string) {
    updateDoc(doc(this.listsRef, id), { members: arrayUnion(email.trim().toLowerCase()) }).catch(
      (e) => this.fail(e),
    );
  }

  unshare(id: string, email: string) {
    updateDoc(doc(this.listsRef, id), { members: arrayRemove(email) }).catch((e) => this.fail(e));
  }

  /** Запомнить добавленный товар для подсказок */
  remember(item: Item) {
    this.saveHistory(rememberItem(this.history(), item));
  }

  /** Убрать товар из подсказок */
  forget(name: string) {
    this.saveHistory(forgetItem(this.history(), name));
  }

  private saveHistory(entries: HistoryEntry[]) {
    this.history.set(entries); // сразу, не дожидаясь ответа сервера
    setDoc(doc(this.historiesRef, this.email()), { entries }).catch((e) => this.fail(e));
  }

  private listenToHistory() {
    this.stopListeningHistory = onSnapshot(
      doc(this.historiesRef, this.email()),
      (snapshot) => {
        const entries = snapshot.data()?.['entries'];
        this.history.set(Array.isArray(entries) ? entries : []);
      },
      (err) => this.fail(err),
    );
  }

  /** Записывает меня в users (или обновляет время входа) — так владельцы списков увидят мой email */
  private rememberMe(user: User) {
    setDoc(doc(this.usersRef, this.email()), {
      email: this.email(),
      name: user.displayName ?? '',
      lastSeen: Date.now(),
    }).catch((e) => this.fail(e));
  }

  private listenToUsers() {
    this.stopListeningUsers = onSnapshot(
      this.usersRef,
      (snapshot) => {
        const users = snapshot.docs.map((d) => {
          const data = d.data();
          return { email: d.id, name: data['name'] ?? '', lastSeen: data['lastSeen'] ?? 0 };
        });
        this.users.set(users.sort((a, b) => b.lastSeen - a.lastSeen));
      },
      (err) => this.fail(err),
    );
  }

  /** Один раз переносит старые списки из браузера в облако */
  private importLocalLists() {
    const local = loadLocalLists();
    if (local.length === 0) return;
    const batch = writeBatch(this.db);
    local.forEach((l, i) => {
      batch.set(doc(this.listsRef), {
        ...l,
        categories: DEFAULT_CATEGORIES,
        ownerEmail: this.email(),
        members: [this.email()],
        createdAt: Date.now() + i,
      });
    });
    batch
      .commit()
      .then(() => {
        // Не удаляем насовсем — оставляем копию под другим ключом на всякий случай
        localStorage.setItem(IMPORTED_KEY, localStorage.getItem(STORAGE_KEY) ?? '');
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(OLD_STORAGE_KEY);
      })
      .catch((e) => this.fail(e));
  }

  private fail(e: unknown) {
    console.error(e);
    this.error.set(e instanceof Error ? e.message : String(e));
  }
}
