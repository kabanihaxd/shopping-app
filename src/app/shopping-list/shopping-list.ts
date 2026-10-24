import { Component, ElementRef, computed, effect, inject, input, signal, viewChild } from '@angular/core';
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
import { CategoriesEditor } from '../categories-editor/categories-editor';
import { Category } from '../category';
import { Item } from '../item';
import { ListsStore } from '../lists-store';
import { ProgressBar } from '../progress-bar/progress-bar';
import { ShoppingItem } from '../shopping-item/shopping-item';
import { HistoryEntry, suggest } from '../suggestions';

export const RATES_URL = 'https://open.er-api.com/v6/latest/EUR';

/** Ответ API курсов валют (берём только нужные поля) */
type RatesResponse = {
  rates: Record<string, number>;
};

/** Группа товаров одной категории в «Треба купити» */
type ItemGroup = { id: string; title: string; items: Item[] };

function sumCost(list: Item[]): number {
  return list.reduce((sum, x) => sum + x.quantity * x.price, 0);
}

@Component({
  imports: [
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

  /** Берётся из адреса /list/:id (withComponentInputBinding в app.config.ts) */
  readonly id = input.required<string>();

  protected readonly list = this.store.find(() => this.id());

  /** Сейчас меняем название списка */
  protected readonly renaming = signal(false);
  /** Поле с названием — появляется только в режиме переименования */
  private readonly nameField = viewChild<ElementRef<HTMLInputElement>>('listName');

  constructor() {
    // Как только поле появилось на странице — ставим в него курсор и выделяем текст
    effect(() => {
      const field = this.nameField()?.nativeElement;
      field?.focus();
      field?.select();
    });
  }
  protected readonly toBuy = computed(() => this.list()?.toBuy ?? []);
  protected readonly bought = computed(() => this.list()?.bought ?? []);
  protected readonly categories = computed(() => this.list()?.categories ?? []);

  /** «Треба купити» по группам: в порядке категорий, товары без категории — в конце */
  protected readonly groups = computed<ItemGroup[]>(() => {
    const items = this.toBuy();
    const cats = this.categories();
    const known = new Set(cats.map((c) => c.id));
    const groups = cats.map((c) => ({
      id: c.id,
      title: `${c.icon} ${c.name}`,
      items: items.filter((x) => x.categoryId === c.id),
    }));
    groups.push({ id: '', title: 'Без категорії', items: items.filter((x) => !known.has(x.categoryId)) });
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
   * в другую группу — товар ещё и получает её категорию.
   * Порядок на экране = порядок в toBuy, поэтому просто собираем toBuy заново из групп.
   */
  protected drop(event: CdkDragDrop<ItemGroup>) {
    const groups = this.groups().map((g) => ({ ...g, items: [...g.items] })); // копии — сигнал не трогаем
    const from = groups.find((g) => g.id === event.previousContainer.data.id)!;
    const to = groups.find((g) => g.id === event.container.data.id)!;

    if (from === to) {
      if (event.previousIndex === event.currentIndex) return;
      moveItemInArray(to.items, event.previousIndex, event.currentIndex);
    } else {
      transferArrayItem(from.items, to.items, event.previousIndex, event.currentIndex);
      const moved = to.items[event.currentIndex];
      to.items[event.currentIndex] = { ...moved, categoryId: to.id };
    }

    const toBuy = groups.flatMap((g) => g.items);
    this.store.update(this.id(), (l) => ({ ...l, toBuy }));
  }

  protected buy(item: Item) {
    this.store.update(this.id(), (l) => ({
      ...l,
      toBuy: l.toBuy.filter((x) => x.id !== item.id),
      bought: [...l.bought, item],
    }));
  }

  protected returnItem(item: Item) {
    this.store.update(this.id(), (l) => ({
      ...l,
      bought: l.bought.filter((x) => x.id !== item.id),
      toBuy: [...l.toBuy, item],
    }));
  }

  protected remove(item: Item) {
    this.store.update(this.id(), (l) => ({
      ...l,
      toBuy: l.toBuy.filter((x) => x.id !== item.id),
      bought: l.bought.filter((x) => x.id !== item.id),
    }));
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

  protected clearBought() {
    this.store.update(this.id(), (l) => ({ ...l, bought: [] }));
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

  protected removeMember(email: string) {
    this.store.unshare(this.id(), email);
  }
}
