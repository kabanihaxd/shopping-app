import { DEFAULT_CATEGORIES } from './category';
import { Item } from './item';
import { ShoppingListData } from './lists-store';
import { Purchase } from './purchase';
import { buildPriceBook, dealHint, knownStoreNames } from './price-book';

const bought = (name: string, store: string | undefined, price: number, boughtAt = 1000): Item => ({
  id: name + store + boughtAt, name, quantity: 1, price, categoryId: '', boughtAt, ...(store ? { store } : {}),
});

const record = (name: string, store: string | undefined, unit: number | undefined, at = 1000): Purchase => ({
  r: name + store + at, name, amount: unit ?? 0, category: 'x', icon: '🛒', at, ...(store ? { store } : {}), ...(unit ? { unit } : {}),
});

function list(boughtItems: Item[], archive: Purchase[] = [], toBuy: Item[] = []): ShoppingListData {
  return { id: 'l', name: 'L', ownerEmail: '', members: [], categories: DEFAULT_CATEGORIES, toBuy, bought: boughtItems, archive, createdAt: 0 };
}

const planned = (name: string, price: number, store?: string): Item => ({
  id: name, name, quantity: 1, price, categoryId: '', ...(store ? { store } : {}),
});

describe('buildPriceBook', () => {
  it('should collect prices per store, cheapest first', () => {
    const book = buildPriceBook([list([bought('Молоко', 'Сільпо', 1.2), bought('Молоко', 'Метро', 1.5), bought('Молоко', 'АТБ', 1.1)])]);
    expect(book.get('молоко')!.map((p) => [p.store, p.unit])).toEqual([['АТБ', 1.1], ['Сільпо', 1.2], ['Метро', 1.5]]);
  });

  it('should keep the latest price in each store, whatever the case of the names', () => {
    const book = buildPriceBook([
      list([bought('Молоко', 'Сільпо', 1.0, 1000), bought('молоко', 'сільпо', 1.4, 2000), bought('Молоко', 'Сільпо', 0.9, 500)]),
    ]);
    expect(book.get('молоко')!.map((p) => [p.store, p.unit])).toEqual([['сільпо', 1.4]]);
  });

  it('should also read the purchase log and merge several lists', () => {
    const book = buildPriceBook([
      list([bought('Сир', 'Метро', 6)]),
      list([], [record('Сир', 'АТБ', 4.5), record('Сир', undefined, 1), record('Сир', 'Сільпо', undefined)]),
    ]);
    expect(book.get('сир')!.map((p) => [p.store, p.unit])).toEqual([['АТБ', 4.5], ['Метро', 6]]);
  });

  it('should ignore purchases without a store, price or date', () => {
    const book = buildPriceBook([list([bought('Хліб', undefined, 2), bought('Яйця', 'АТБ', 0), { ...bought('Чай', 'АТБ', 3), boughtAt: undefined }])]);
    expect(book.size).toBe(0);
  });
});

describe('dealHint', () => {
  const book = buildPriceBook([list([bought('Молоко', 'Сільпо', 1.2), bought('Молоко', 'Метро', 1.5)])]);

  it('should say where it is cheaper than the current price', () => {
    const hint = dealHint(planned('Молоко', 1.5, 'Метро'), book)!;
    expect(hint.text).toBe('Дешевше в Сільпо: €1.20 (на €0.30 менше)');
    expect(hint.title).toBe('Сільпо: €1.20\nМетро: €1.50');
  });

  it('should be silent when the item is already planned at the cheapest store or price', () => {
    expect(dealHint(planned('Молоко', 1.2, 'сільпо'), book)).toBeNull();
    expect(dealHint(planned('Молоко', 1.0), book)).toBeNull();
  });

  it('should still suggest the cheapest place when the item has no price yet', () => {
    expect(dealHint(planned('Молоко', 0), book)!.text).toBe('Найдешевше було в Сільпо: €1.20');
  });

  it('should say nothing about products without any history', () => {
    expect(dealHint(planned('Сир', 5), book)).toBeNull();
  });
});

describe('knownStoreNames', () => {
  it('should list each store once, sorted, from items and the log', () => {
    const l = list([bought('A', 'Сільпо', 1)], [record('B', 'АТБ', 1), record('C', 'сільпо', 1)], [planned('D', 1, 'Метро')]);
    expect(knownStoreNames([l])).toEqual(['АТБ', 'Метро', 'Сільпо']);
  });
});
