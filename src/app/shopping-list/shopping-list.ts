import { Component, ElementRef, computed, effect, inject, input, signal, untracked, viewChild } from '@angular/core';
import { CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import {
  CdkDrag,
  CdkDragDrop,
  CdkDropList,
  CdkDropListGroup,
  moveItemInArray,
  transferArrayItem,
} from '@angular/cdk/drag-drop';
import { httpResource } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { BarcodeScanner } from '../barcode-scanner/barcode-scanner';
import { CategoriesEditor } from '../categories-editor/categories-editor';
import { Category } from '../category';
import { Item } from '../item';
import { ListsStore } from '../lists-store';
import { listToText } from '../list-text';
import { ProductLookup, isBarcode } from '../product-lookup';
import { purchasesOf } from '../purchase';
import { ProgressBar } from '../progress-bar/progress-bar';
import { ShoppingItem } from '../shopping-item/shopping-item';
import { HistoryEntry, suggest } from '../suggestions';
import { ScreenWakeLock } from '../wake-lock';

/** Ключ в localStorage: включён ли режим «У магазині» (личная настройка устройства) */
const STORE_MODE_KEY = 'store-mode';

function readStoreMode(): boolean {
  try {
    return localStorage.getItem(STORE_MODE_KEY) === '1';
  } catch {
    return false;
  }
}

/** Сколько секунд после удаления можно нажать «Скасувати» */
const UNDO_MS = 5000;

/** Вставляет товар на прежнее место (а если список стал короче — в конец) */
function insertAt(items: Item[], index: number, item: Item): Item[] {
  const copy = [...items];
  copy.splice(Math.min(index, copy.length), 0, item);
  return copy;
}

export const RATES_URL = 'https://open.er-api.com/v6/latest/EUR';

/** Ответ API курсов валют (берём только нужные поля) */
type RatesResponse = {
  rates: Record<string, number>;
};

/** Группа товаров одной категории в «Треба купити» */
type ItemGroup = { id: string; title: string; items: Item[] };

/** От дорогого к дешёвому по сумме (количество × цена). Порядок равных не меняется, товары без цены — в конце. */
export function sortByCostDesc(items: Item[]): Item[] {
  return [...items].sort((a, b) => b.quantity * b.price - a.quantity * a.price);
}

/**
 * Порядок показа товаров одной группы: закреплённые (перетащенные вручную) стоят на своих местах —
 * там, где они лежат в списке, — а остальные по очереди заполняют свободные места от дорогого к дешёвому.
 * Без закреплённых это просто сортировка по цене.
 */
export function arrangeByPrice(items: Item[]): Item[] {
  const free = sortByCostDesc(items.filter((x) => !x.pinned));
  const rest = free[Symbol.iterator]();
  return items.map((x) => (x.pinned ? x : rest.next().value!));
}

function sumCost(list: Item[]): number {
  return list.reduce((sum, x) => sum + x.quantity * x.price, 0);
}

@Component({
  imports: [
    BarcodeScanner,
    CategoriesEditor,
    CdkDrag,
    CdkDropList,
    CdkDropListGroup,
    CurrencyPipe,
    DatePipe,
    DecimalPipe,
    ProgressBar,
    RouterLink,
    ShoppingItem,
  ],
  selector: 'app-shopping-list',
  styleUrl: './shopping-list.css',
  templateUrl: './shopping-list.html',
})
export class ShoppingList {
  private readonly store = inject(ListsStore);
  private readonly products = inject(ProductLookup);
  protected readonly wakeLock = inject(ScreenWakeLock);

  /** Берётся из адреса /list/:id (withComponentInputBinding в app.config.ts) */
  readonly id = input.required<string>();

  protected readonly list = this.store.find(() => this.id());

  /** Сейчас меняем название списка */
  protected readonly renaming = signal(false);
  /** Поле с названием — появляется только в режиме переименования */
  private readonly nameField = viewChild<ElementRef<HTMLInputElement>>('listName');

  /** Режим «У магазині»: экран не гаснет, кнопки и галочки крупнее */
  protected readonly storeMode = signal(readStoreMode());

  protected toggleStoreMode() {
    this.storeMode.update((on) => !on);
    try {
      localStorage.setItem(STORE_MODE_KEY, this.storeMode() ? '1' : '0');
    } catch {
      // не запомнится — после перезагрузки режим выключен
    }
  }

  constructor() {
    // Пока режим включён и список открыт — экран не гаснет. Уходим со страницы — блокировка снимается.
    effect((onCleanup) => {
      if (!this.storeMode()) return;
      untracked(() => this.wakeLock.enable());
      onCleanup(() => this.wakeLock.disable());
    });

    // Как только поле появилось на странице — ставим в него курсор и выделяем текст
    effect(() => {
      const field = this.nameField()?.nativeElement;
      field?.focus();
      field?.select();
    });
  }
  /** Окно сканера штрихкодов открыто */
  protected readonly scanning = signal(false);
  /** Что произошло после сканирования («Знайдено…», «Немає в базі…») */
  protected readonly scanMessage = signal<string | null>(null);
  private readonly newItemField = viewChild<ElementRef<HTMLInputElement>>('newItem');

  protected readonly toBuy = computed(() => this.list()?.toBuy ?? []);
  protected readonly bought = computed(() => this.list()?.bought ?? []);
  /** «Вже куплено» в том порядке, в каком показываем */
  protected readonly boughtShown = computed(() => sortByCostDesc(this.bought()));
  protected readonly categories = computed(() => this.list()?.categories ?? []);

  /** «Треба купити» по группам: в порядке категорий, товары без категории — в конце */
  protected readonly groups = computed<ItemGroup[]>(() => {
    const items = this.toBuy();
    const cats = this.categories();
    const known = new Set(cats.map((c) => c.id));
    const groups = cats.map((c) => ({
      id: c.id,
      title: `${c.icon} ${c.name}`,
      items: arrangeByPrice(items.filter((x) => x.categoryId === c.id)),
    }));
    groups.push({ id: '', title: 'Без категорії', items: arrangeByPrice(items.filter((x) => !known.has(x.categoryId))) });
    return groups.filter((g) => g.items.length > 0);
  });

  protected readonly remaining = computed(() => this.toBuy().length);
  protected readonly total = computed(() => this.toBuy().length + this.bought().length);
  protected readonly remainingCost = computed(() => sumCost(this.toBuy()));
  protected readonly boughtCost = computed(() => sumCost(this.bought()));

  /** Курс евро из интернета: загружается сам при открытии страницы */
  protected readonly rates = httpResource<RatesResponse>(() => RATES_URL);
  // hasValue() — сначала спрашиваем «курс есть?»: value() при ошибке загрузки не возвращает пусто, а падает
  protected readonly uahRate = computed(() =>
    this.rates.hasValue() ? this.rates.value().rates['UAH'] : undefined,
  );

  /** Что сейчас введено в поле названия */
  protected readonly query = signal('');
  /** Подсказки видны, пока поле в фокусе */
  protected readonly suggestionsOpen = signal(false);
  /** Подсказка, выбранная стрелками (-1 — никакая) */
  protected readonly activeSuggestion = signal(-1);

  /**
   * Всё, что можно подсказать: моя история + товары из всех моих списков
   * (так подсказки есть сразу, даже по товарам, добавленным до появления истории).
   */
  private readonly knownItems = computed(() => {
    const byName = new Map<string, HistoryEntry>();
    for (const l of this.store.lists()) {
      for (const x of [...l.toBuy, ...l.bought]) {
        const entry = { name: x.name, categoryId: x.categoryId, price: x.price, count: 0, lastUsed: 0 };
        byName.set(x.name.trim().toLowerCase(), entry);
      }
    }
    for (const e of this.store.history()) byName.set(e.name.trim().toLowerCase(), e);
    return [...byName.values()];
  });

  protected readonly suggestions = computed(() =>
    suggest(this.query(), this.knownItems(), this.toBuy().map((x) => x.name)),
  );

  /** Штрихкод считан (или введён вручную): ищем название в базе и подставляем в поле «Що купити?» */
  protected async onScanned(code: string) {
    this.scanning.set(false);
    if (!isBarcode(code)) {
      this.scanMessage.set('Це не схоже на штрихкод товару: потрібні лише цифри (6–14).');
      return;
    }
    this.scanMessage.set('Шукаю товар…');
    try {
      const name = await this.products.find(code);
      if (!name) {
        this.scanMessage.set(`Товару з кодом ${code} немає в базі. Введіть назву вручну.`);
        return;
      }
      const field = this.newItemField()?.nativeElement;
      if (field) {
        field.value = name;
        field.focus();
      }
      this.query.set(name);
      this.suggestionsOpen.set(true); // вдруг такой товар уже есть в подсказках — с ценой и категорией
      this.scanMessage.set(`Знайдено: «${name}». Вкажіть кількість і ціну та додайте.`);
    } catch {
      this.scanMessage.set('Не вдалося звернутися до бази товарів. Перевірте інтернет.');
    }
  }

  protected categoryOf(entry: HistoryEntry) {
    return this.categories().find((c) => c.id === entry.categoryId);
  }

  protected onNameInput(nameInput: HTMLInputElement) {
    this.query.set(nameInput.value);
    this.activeSuggestion.set(-1);
    this.suggestionsOpen.set(true);
  }

  /** Стрелки — выбор подсказки, Enter — взять её (или добавить товар), Esc — закрыть */
  protected onNameKeydown(
    event: KeyboardEvent,
    nameInput: HTMLInputElement,
    qtyInput: HTMLInputElement,
    priceInput: HTMLInputElement,
    categorySelect: HTMLSelectElement,
  ) {
    const count = this.suggestionsOpen() ? this.suggestions().length : 0;
    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowUp':
        if (count === 0) return;
        event.preventDefault(); // иначе курсор прыгает в начало/конец поля
        // По кругу: -1 (ничего, просто текст) → 0 → 1 → … → последняя → снова -1
        const step = event.key === 'ArrowDown' ? 1 : -1;
        this.activeSuggestion.update((i) => {
          const next = i + step;
          if (next >= count) return -1;
          if (next < -1) return count - 1;
          return next;
        });
        break;
      case 'Enter':
        if (this.activeSuggestion() >= 0 && this.activeSuggestion() < count) {
          event.preventDefault();
          this.pick(this.suggestions()[this.activeSuggestion()], nameInput, priceInput, categorySelect);
        } else {
          this.add(nameInput, qtyInput, priceInput, categorySelect);
        }
        break;
      case 'Escape':
        this.suggestionsOpen.set(false);
        break;
    }
  }

  /** Подставить подсказку: название, категорию и последнюю цену */
  protected pick(
    entry: HistoryEntry,
    nameInput: HTMLInputElement,
    priceInput: HTMLInputElement,
    categorySelect: HTMLSelectElement,
  ) {
    nameInput.value = entry.name;
    priceInput.value = entry.price > 0 ? String(entry.price) : '';
    categorySelect.value = this.categoryOf(entry)?.id ?? '';
    this.query.set(entry.name);
    this.suggestionsOpen.set(false);
    this.activeSuggestion.set(-1);
    nameInput.focus();
  }

  protected forget(entry: HistoryEntry) {
    this.store.forget(entry.name);
  }

  protected add(
    nameInput: HTMLInputElement,
    qtyInput: HTMLInputElement,
    priceInput: HTMLInputElement,
    categorySelect: HTMLSelectElement,
  ) {
    const name = nameInput.value.trim();
    if (!name) return;
    const quantity = Number(qtyInput.value) || 1;
    const price = Number(priceInput.value) || 0;
    // Выбранная категория остаётся — удобно добавлять подряд несколько товаров из одного отдела
    const item: Item = { id: crypto.randomUUID(), name, quantity, price, categoryId: categorySelect.value };
    this.store.update(this.id(), (l) => ({ ...l, toBuy: [...l.toBuy, item] }));
    this.store.remember(item);
    this.query.set('');
    this.suggestionsOpen.set(false);
    nameInput.value = '';
    qtyInput.value = '';
    priceInput.value = '';
    nameInput.focus();
  }

  /**
   * Товар отпустили после перетаскивания. Внутри группы — меняем порядок,
   * в другую группу — товар ещё и получает её категорию. Перетащенный товар закрепляется
   * на новом месте: цена его больше не двигает (пока не нажать 📌).
   * Порядок на экране = порядок в toBuy, поэтому просто собираем toBuy заново из групп.
   */
  protected drop(event: CdkDragDrop<ItemGroup>) {
    const groups = this.groups().map((g) => ({ ...g, items: [...g.items] })); // копии — сигнал не трогаем
    const from = groups.find((g) => g.id === event.previousContainer.data.id)!;
    const to = groups.find((g) => g.id === event.container.data.id)!;

    if (from === to) {
      if (event.previousIndex === event.currentIndex) return;
      moveItemInArray(to.items, event.previousIndex, event.currentIndex);
      to.items[event.currentIndex] = { ...to.items[event.currentIndex], pinned: true };
    } else {
      transferArrayItem(from.items, to.items, event.previousIndex, event.currentIndex);
      const moved = to.items[event.currentIndex];
      to.items[event.currentIndex] = { ...moved, categoryId: to.id, pinned: true };
    }

    const toBuy = groups.flatMap((g) => g.items);
    this.store.update(this.id(), (l) => ({ ...l, toBuy }));
  }

  protected buy(item: Item) {
    const { pinned, ...loose } = item; // купленные всегда по цене, закрепление теряется
    this.store.update(this.id(), (l) => ({
      ...l,
      toBuy: l.toBuy.filter((x) => x.id !== item.id),
      bought: [...l.bought, { ...loose, boughtAt: Date.now() }], // дата нужна для статистики
    }));
  }

  /** Снять закрепление: товар встанет на место по цене */
  protected unpin(item: Item) {
    const { pinned, ...loose } = item;
    this.store.update(this.id(), (l) => ({
      ...l,
      toBuy: l.toBuy.map((x) => (x.id === item.id ? loose : x)),
    }));
  }

  protected returnItem(item: Item) {
    const { boughtAt, ...unbought } = item; // вернули в «Треба купити» — даты покупки больше нет
    this.store.update(this.id(), (l) => ({
      ...l,
      bought: l.bought.filter((x) => x.id !== item.id),
      toBuy: [...l.toBuy, unbought],
    }));
  }

  protected remove(item: Item) {
    const list = this.list();
    if (!list) return;
    // Запоминаем, откуда удаляем и с какого места, — чтобы вернуть ровно туда же
    const from: 'toBuy' | 'bought' = list.toBuy.some((x) => x.id === item.id) ? 'toBuy' : 'bought';
    const index = list[from].findIndex((x) => x.id === item.id);
    const listId = this.id();

    this.store.update(listId, (l) => ({
      ...l,
      toBuy: l.toBuy.filter((x) => x.id !== item.id),
      bought: l.bought.filter((x) => x.id !== item.id),
    }));
    this.store.showNotice(
      {
        listId,
        text: `Видалено «${item.name}»`,
        action: {
          label: 'Скасувати',
          run: () =>
            this.store.update(listId, (l) => {
              const already = [...l.toBuy, ...l.bought].some((x) => x.id === item.id); // второй раз не вставляем
              return already ? l : { ...l, [from]: insertAt(l[from], index, item) };
            }),
        },
      },
      UNDO_MS,
    );
  }

  protected updateItem(updated: Item) {
    const replace = (items: Item[]) => items.map((x) => (x.id === updated.id ? updated : x));
    this.store.update(this.id(), (l) => ({
      ...l,
      toBuy: replace(l.toBuy),
      bought: replace(l.bought),
    }));
  }

  protected saveName(nameInput: HTMLInputElement) {
    if (!this.renaming()) return; // уже отменили по Esc — blur после этого ничего не сохраняет
    this.renaming.set(false);
    const name = nameInput.value.trim();
    if (name && name !== this.list()?.name) {
      this.store.update(this.id(), (l) => ({ ...l, name }));
    }
  }

  /** Новые категории из редактора. Товары удалённой категории становятся «без категории». */
  protected setCategories(categories: Category[]) {
    const known = new Set(categories.map((c) => c.id));
    const clean = (items: Item[]) =>
      items.map((x) => (known.has(x.categoryId) ? x : { ...x, categoryId: '' }));
    this.store.update(this.id(), (l) => ({
      ...l,
      categories,
      toBuy: clean(l.toBuy),
      bought: clean(l.bought),
    }));
  }

  /**
   * Убирает купленные товары из «Вже куплено» и записывает их в журнал покупок (чтобы статистика их не потеряла).
   * Вернуть назад можно кнопкой «Скасувати» на плашке.
   */
  private takeBought(text: string, moveToBuy: boolean) {
    const listId = this.id();
    const items = this.bought();
    if (items.length === 0) return;
    const records = purchasesOf(items, this.categories());
    const ids = new Set(items.map((x) => x.id));
    // Вернули в список — товар снова «треба купити»: дата покупки уже в журнале, у самого товара её нет
    const returned = moveToBuy ? items.map(({ boughtAt, ...rest }) => rest) : [];

    this.store.update(listId, (l) => ({
      ...l,
      bought: l.bought.filter((x) => !ids.has(x.id)),
      toBuy: [...l.toBuy, ...returned],
    }));
    if (records.length) this.store.addToArchive(listId, records);

    this.store.showNotice(
      {
        listId,
        text,
        action: {
          label: 'Скасувати',
          run: () => {
            this.store.update(listId, (l) => {
              const present = new Set(l.bought.map((x) => x.id));
              return {
                ...l,
                toBuy: l.toBuy.filter((x) => !(moveToBuy && ids.has(x.id))),
                bought: [...items.filter((x) => !present.has(x.id)), ...l.bought],
              };
            });
            if (records.length) this.store.removeFromArchive(listId, records);
          },
        },
      },
      UNDO_MS,
    );
  }

  /** «Купити знову»: все купленное — обратно в «Треба купити» одним нажатием (для регулярных покупок) */
  protected buyAgain() {
    this.takeBought(`Повернуто до списку: ${this.bought().length}`, true);
  }

  protected clearBought() {
    this.takeBought(`Очищено куплене: ${this.bought().length}`, false);
  }

  /** Владелец списка может приглашать и убирать участников */
  protected readonly isOwner = computed(() => this.list()?.ownerEmail === this.store.email());

  /** Кто заходил на сайт, но ещё не имеет доступа к этому списку */
  protected readonly candidates = computed(() => {
    const members = this.list()?.members ?? [];
    return this.store.users().filter((u) => !members.includes(u.email));
  });

  protected grant(email: string) {
    this.store.share(this.id(), email);
  }

  protected invite(emailInput: HTMLInputElement) {
    const email = emailInput.value.trim();
    if (!email.includes('@')) return;
    this.store.share(this.id(), email);
    emailInput.value = '';
  }

  /** Ссылка-приглашение: открывается на этом же сайте, адрес вида /#/join/<список>/<код> */
  protected readonly inviteLink = computed(() => {
    const code = this.list()?.inviteCode;
    return code ? `${location.origin}${location.pathname}#/join/${this.id()}/${code}` : '';
  });

  /** Показываем «Скопійовано ✓» пару секунд */
  protected readonly copied = signal(false);
  protected readonly listCopied = signal(false);
  /** Меню «Поделиться» есть в телефонах и Safari; на компьютере — только копирование */
  protected readonly canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  protected createInvite() {
    // Два UUID подряд: 244 бита случайности — код нельзя подобрать
    const code = (crypto.randomUUID() + crypto.randomUUID()).replaceAll('-', '');
    this.store.setInviteCode(this.id(), code);
  }

  protected disableInvite() {
    this.store.setInviteCode(this.id(), null);
  }

  protected async copyLink(link: string, field: HTMLInputElement) {
    try {
      await navigator.clipboard.writeText(link);
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    } catch {
      field.select(); // буфер недоступен — хотя бы выделим, дальше Ctrl+C
    }
  }

  /** «Надіслати»: меню телефона (Viber, Telegram, SMS…); на компьютере — копируем текст */
  protected async sendList() {
    const text = listToText(this.list()?.name ?? '', this.groups());
    try {
      if (this.canShare) {
        await navigator.share({ title: this.list()?.name, text });
      } else {
        await navigator.clipboard.writeText(text);
        this.listCopied.set(true);
        setTimeout(() => this.listCopied.set(false), 2000);
      }
    } catch {
      // человек закрыл меню — это не ошибка
    }
  }

  protected async shareLink(link: string) {
    try {
      await navigator.share({
        title: this.list()?.name,
        text: `Приєднуйся до спільного списку покупок «${this.list()?.name}»`,
        url: link,
      });
    } catch {
      // человек закрыл меню — это не ошибка
    }
  }

  /** Нікнейм участника или его почта, если ника нет */
  protected nameOf(email: string): string {
    return this.store.nameOf(email);
  }

  protected removeMember(email: string) {
    this.store.unshare(this.id(), email);
  }
}
