import { Component, DestroyRef, ElementRef, computed, effect, inject, input, signal, untracked, viewChild } from '@angular/core';
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
import { buildPriceBook, dealHint, knownStoreNames } from '../price-book';
import { purchasesOf } from '../purchase';
import { ProgressBar } from '../progress-bar/progress-bar';
import { ShoppingItem } from '../shopping-item/shopping-item';
import { HistoryEntry, suggest } from '../suggestions';
import { VoiceEngine } from '../voice-engine';
import { parseSpoken } from '../voice-parse';
import { ScreenWakeLock } from '../wake-lock';

/** Ключ в localStorage: включён ли режим «У магазині» (личная настройка устройства) */
const STORE_MODE_KEY = 'store-mode';
/** В каком магазине человек сейчас (личная настройка устройства) */
const CURRENT_STORE_KEY = 'current-store';
/** Язык распознавания речи (личная настройка устройства) */
const VOICE_LANG_KEY = 'voice-lang';
type VoiceLang = 'uk-UA' | 'ru-RU';
/** Сколько секунд после голосового добавления можно нажать «Скасувати» */
const VOICE_UNDO_MS = 8000;

/** Что сказать человеку, если распознавание речи не сработало */
function voiceProblem(code: string): string {
  switch (code) {
    case 'not-allowed':
    case 'service-not-allowed':
      return 'Немає доступу до мікрофона. Дозвольте його в налаштуваннях браузера для цього сайту.';
    case 'audio-capture':
      return 'Мікрофон не знайдено. Підключіть його і виберіть у налаштуваннях системи «мікрофон за замовчуванням».';
    case 'mic-busy':
      return 'Мікрофон зайнятий іншою програмою. Закрийте її і спробуйте ще раз.';
    case 'network':
      return 'Розпізнавання мовлення потребує інтернету.';
    case 'language-not-supported':
      return 'Цю мову браузер не розпізнає. Спробуйте іншу (кнопка UA/RU).';
    case 'no-speech':
      return 'Нічого не почув. Спробуйте ще раз.';
    case 'aborted':
      return '';
    default:
      return `Не вдалося розпізнати мовлення (код: ${code}).`;
  }
}

function readVoiceLang(): VoiceLang {
  try {
    return localStorage.getItem(VOICE_LANG_KEY) === 'ru-RU' ? 'ru-RU' : 'uk-UA';
  } catch {
    return 'uk-UA';
  }
}

function readCurrentStore(): string {
  try {
    return localStorage.getItem(CURRENT_STORE_KEY) ?? '';
  } catch {
    return '';
  }
}

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
  protected readonly voice = inject(VoiceEngine);
  private readonly destroyRef = inject(DestroyRef);

  /** Берётся из адреса /list/:id (withComponentInputBinding в app.config.ts) */
  readonly id = input.required<string>();

  protected readonly list = this.store.find(() => this.id());

  /** Сейчас меняем название списка */
  protected readonly renaming = signal(false);
  /** Поле с названием — появляется только в режиме переименования */
  private readonly nameField = viewChild<ElementRef<HTMLInputElement>>('listName');

  /** Магазин, в котором человек сейчас: в режиме «У магазині» им помечаются купленные товары */
  protected readonly currentStore = signal(readCurrentStore());

  protected setCurrentStore(value: string) {
    this.currentStore.set(value);
    try {
      localStorage.setItem(CURRENT_STORE_KEY, value.trim());
    } catch {
      // не запомнится — после перезагрузки поле пустое
    }
  }

  /** Книга цен из всех покупок во всех списках: где какой товар был дешевле */
  private readonly priceBook = computed(() => buildPriceBook(this.store.lists()));
  /** Магазины, которые уже встречались, — подсказки в полях «Магазин» */
  protected readonly knownStores = computed(() =>
    [...new Set([...knownStoreNames(this.store.lists()), this.currentStore().trim()].filter(Boolean))].sort((a, b) =>
      a.localeCompare(b, 'uk'),
    ),
  );

  protected hintFor(item: Item) {
    return dealHint(item, this.priceBook());
  }

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
    // Ушли со страницы посреди записи — микрофон выключаем
    this.destroyRef.onDestroy(() => this.stopVoice?.());

    // Поле бюджета появилось на странице — ставим в него курсор
    effect(() => {
      const field = this.budgetField()?.nativeElement;
      field?.focus();
      field?.select();
    });

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

  /** Голосовой ввод: идёт запись, что уже услышано, что сказать человеку (ошибка / «не разобрал») */
  protected readonly voiceListening = signal(false);
  protected readonly voiceInterim = signal('');
  protected readonly voiceMessage = signal<string | null>(null);
  protected readonly voiceLang = signal<VoiceLang>(readVoiceLang());
  private stopVoice?: () => void;

  /** Бюджет списка (0 — не задан) и сколько уже запланировано/куплено в нём */
  protected readonly budget = computed(() => this.list()?.budget ?? 0);
  protected readonly editingBudget = signal(false);
  private readonly budgetField = viewChild<ElementRef<HTMLInputElement>>('budgetField');

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

  /** Всё, что в списке (и купленное, и нет): именно это сравниваем с бюджетом — превышение видно ещё до покупки */
  protected readonly listCost = computed(() => sumCost(this.toBuy()) + sumCost(this.bought()));
  protected readonly budgetLeft = computed(() => this.budget() - this.listCost());
  /** Копейки из-за дробей не должны давать ложное «перевищено» */
  protected readonly overBudget = computed(() => this.budget() > 0 && this.listCost() > this.budget() + 0.005);
  protected readonly budgetPercent = computed(() =>
    this.budget() > 0 ? Math.min(100, (this.listCost() / this.budget()) * 100) : 0,
  );

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

  protected toggleVoiceLang() {
    this.voiceLang.update((l) => (l === 'uk-UA' ? 'ru-RU' : 'uk-UA'));
    try {
      localStorage.setItem(VOICE_LANG_KEY, this.voiceLang());
    } catch {
      // не запомнится — после перезагрузки снова украинский
    }
  }

  /** Микрофон: нажали — слушаем, нажали ещё раз — хватит (то, что успели сказать, добавится) */
  protected toggleVoice() {
    if (this.voiceListening()) {
      this.stopVoice?.();
      return;
    }
    this.voiceMessage.set(null);
    this.voiceInterim.set('');
    this.voiceListening.set(true);
    let finalText = '';
    let lastInterim = '';
    this.stopVoice = this.voice.start(this.voiceLang(), {
      onInterim: (text) => {
        lastInterim = text;
        this.voiceInterim.set(text);
      },
      onFinal: (text) => (finalText += ' ' + text),
      onError: (code) => this.voiceMessage.set(voiceProblem(code)),
      onEnd: () => {
        this.voiceListening.set(false);
        this.voiceInterim.set('');
        this.stopVoice = undefined;
        const text = (finalText || lastInterim).trim();
        // Ошибка уже объяснена — а если ошибки не было и текста нет, значит ничего не расслышали
        if (text) this.addSpoken(text);
        else if (!this.voiceMessage()) this.voiceMessage.set('Нічого не почув. Спробуйте ще раз.');
      },
    });
  }

  /** «молоко, два хліби, яйця» → три товара в «Треба купити» разом, с отменой на плашке */
  private addSpoken(text: string) {
    const parsed = parseSpoken(text);
    if (parsed.length === 0) {
      this.voiceMessage.set(`Не вдалося розібрати, що купити: «${text}». Спробуйте ще раз.`);
      return;
    }
    // Что уже знаем (история и другие списки) — подставляем цену и категорию, как в подсказках
    const known = new Map(this.knownItems().map((e) => [e.name.trim().toLowerCase(), e]));
    const categories = this.categories();
    const items: Item[] = parsed.map((p) => {
      const entry = known.get(p.name.toLowerCase());
      const categoryId = categories.some((c) => c.id === entry?.categoryId) ? entry!.categoryId : '';
      return { id: crypto.randomUUID(), name: p.name, quantity: p.quantity, price: entry?.price ?? 0, categoryId };
    });
    const listId = this.id();
    const ids = new Set(items.map((x) => x.id));

    this.store.update(listId, (l) => ({ ...l, toBuy: [...l.toBuy, ...items] }));
    items.forEach((item) => this.store.remember(item));
    this.voiceMessage.set(null);

    const shown = items.slice(0, 3).map((x) => (x.quantity > 1 ? `${x.quantity}× ${x.name}` : x.name)).join(', ');
    this.store.showNotice(
      {
        listId,
        text: `Додано голосом (${items.length}): ${shown}${items.length > 3 ? ` і ще ${items.length - 3}` : ''}`,
        action: {
          label: 'Скасувати',
          run: () => this.store.update(listId, (l) => ({ ...l, toBuy: l.toBuy.filter((x) => !ids.has(x.id)) })),
        },
      },
      VOICE_UNDO_MS,
    );
  }

  /** Для шаблона: модуль числа */
  protected abs(value: number): number {
    return Math.abs(value);
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
    // В магазине пометка о магазине ставится сама — одним нажатием, без ввода (и перебивает запланированный)
    const shop = this.storeMode() ? this.currentStore().trim() : '';
    this.store.update(this.id(), (l) => ({
      ...l,
      toBuy: l.toBuy.filter((x) => x.id !== item.id),
      bought: [...l.bought, { ...loose, ...(shop ? { store: shop } : {}), boughtAt: Date.now() }], // дата нужна для статистики
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

  /**
   * Enter или клик мимо поля сохраняет бюджет; пусто или 0 — убирает его; Esc отменяет (сюда тогда уже не доходит).
   * Запятая и точка — обе годятся. Непонятный текст или минус не стирают прежний бюджет — просто игнорируются.
   */
  protected saveBudget(field: HTMLInputElement) {
    if (!this.editingBudget()) return;
    this.editingBudget.set(false);
    const text = field.value.trim().replace(',', '.');
    const value = text === '' ? 0 : Math.round(Number(text) * 100) / 100;
    if (!Number.isFinite(value) || value < 0) return;
    const amount = value > 0 ? Math.min(value, 10_000_000) : null;
    if ((amount ?? 0) !== this.budget()) this.store.setBudget(this.id(), amount);
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
