import { Injectable, computed, signal } from '@angular/core';
import { initializeApp } from 'firebase/app';
import {
  GoogleAuthProvider,
  User,
  getAuth,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
} from 'firebase/auth';
import {
  DocumentData,
  Unsubscribe,
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getFirestore,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { firebaseConfig } from './firebase-config';
import { Item } from './item';

export type ShoppingListData = {
  id: string;
  name: string;
  /** Кто создал список — только он может приглашать и удалять */
  ownerEmail: string;
  /** Email всех, у кого есть доступ (включая владельца) */
  members: string[];
  toBuy: Item[];
  bought: Item[];
  createdAt: number;
};

const STORAGE_KEY = 'shopping-lists';
const IMPORTED_KEY = 'shopping-lists-imported';
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

/** Документ из Firestore → наш тип (на случай, если каких-то полей нет) */
function toList(id: string, data: DocumentData): ShoppingListData {
  return {
    id,
    name: data['name'] ?? 'Без названия',
    ownerEmail: data['ownerEmail'] ?? '',
    members: data['members'] ?? [],
    toBuy: loadItems(data['toBuy']),
    bought: loadItems(data['bought']),
    createdAt: data['createdAt'] ?? 0,
  };
}

/** Списки, которые остались в localStorage с тех времён, когда всё хранилось в браузере */
function loadLocalLists(): { name: string; toBuy: Item[]; bought: Item[] }[] {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    const raw = JSON.parse(saved) as { name?: string; toBuy?: unknown; bought?: unknown }[];
    return raw.map((l) => ({
      name: l.name ?? 'Без названия',
      toBuy: loadItems(l.toBuy),
      bought: loadItems(l.bought),
    }));
  }
  const old = localStorage.getItem(OLD_STORAGE_KEY);
  if (old) {
    const data = JSON.parse(old) as { toBuy?: unknown; bought?: unknown };
    return [{ name: 'Мой список покупок', toBuy: loadItems(data.toBuy), bought: loadItems(data.bought) }];
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
  private readonly db = getFirestore(this.app);
  private readonly listsRef = collection(this.db, 'lists');
  private stopListening?: Unsubscribe;

  /** Кто вошёл (null — никто) */
  readonly user = signal<User | null>(null);
  readonly email = computed(() => this.user()?.email?.toLowerCase() ?? '');
  /** true, пока не известно, кто вошёл, и пока не пришли первые данные */
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  private readonly allLists = signal<ShoppingListData[]>([]);
  readonly lists = computed(() => [...this.allLists()].sort((a, b) => a.createdAt - b.createdAt));

  constructor() {
    onAuthStateChanged(this.auth, (user) => {
      this.stopListening?.();
      this.allLists.set([]);
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
          this.allLists.set(snapshot.docs.map((d) => toList(d.id, d.data())));
          this.loading.set(false);
        },
        (err) => {
          this.fail(err);
          this.loading.set(false);
        },
      );
      this.importLocalLists();
    });
  }

  signIn() {
    signInWithPopup(this.auth, new GoogleAuthProvider()).catch((e) => this.fail(e));
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
      toBuy: [],
      bought: [],
      createdAt: Date.now(),
    }).catch((e) => this.fail(e));
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
    const { name, toBuy, bought } = change(list);
    updateDoc(doc(this.listsRef, id), { name, toBuy, bought }).catch((e) => this.fail(e));
  }

  share(id: string, email: string) {
    updateDoc(doc(this.listsRef, id), { members: arrayUnion(email.trim().toLowerCase()) }).catch(
      (e) => this.fail(e),
    );
  }

  unshare(id: string, email: string) {
    updateDoc(doc(this.listsRef, id), { members: arrayRemove(email) }).catch((e) => this.fail(e));
  }

  /** Один раз переносит старые списки из браузера в облако */
  private importLocalLists() {
    const local = loadLocalLists();
    if (local.length === 0) return;
    const batch = writeBatch(this.db);
    local.forEach((l, i) => {
      batch.set(doc(this.listsRef), {
        ...l,
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
