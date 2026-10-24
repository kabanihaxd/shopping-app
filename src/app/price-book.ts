import { Item } from './item';
import { ShoppingListData } from './lists-store';

/** Последняя известная цена товара (за единицу) в одном магазине */
export type StorePrice = { store: string; unit: number; at: number };

/** Цены по товарам: ключ — название товара маленькими буквами, внутри магазины от дешёвого к дорогому */
export type PriceBook = Map<string, StorePrice[]>;

/** Подсказка «где дешевле» для строки товара */
export type DealHint = { text: string; title: string };

const nameKey = (name: string) => name.trim().toLowerCase();
const money = (n: number) => `€${n.toFixed(2)}`;

/**
 * Собирает «книгу цен» из всех покупок: купленные товары, у которых указаны магазин и цена,
 * и журнал покупок (записи оттуда, куда ушли товары после «Купити знову» / «Очистити»).
 * Цены меняются, поэтому по каждому магазину берём самую свежую покупку.
 */
export function buildPriceBook(lists: ShoppingListData[]): PriceBook {
  // товар → магазин (маленькими буквами) → цена
  const latest = new Map<string, Map<string, StorePrice>>();
  const add = (name: string, store: string | undefined, unit: number | undefined, at: number | undefined) => {
    const shop = store?.trim();
    if (!shop || !unit || unit <= 0 || at === undefined) return;
    const stores = latest.get(nameKey(name)) ?? new Map<string, StorePrice>();
    const key = shop.toLowerCase();
    const old = stores.get(key);
    if (!old || at >= old.at) stores.set(key, { store: shop, unit, at });
    latest.set(nameKey(name), stores);
  };

  for (const list of lists) {
    for (const item of list.bought) add(item.name, item.store, item.price, item.boughtAt);
    for (const p of list.archive ?? []) add(p.name, p.store, p.unit, p.at);
  }

  const book: PriceBook = new Map();
  for (const [name, stores] of latest) {
    book.set(name, [...stores.values()].sort((a, b) => a.unit - b.unit));
  }
  return book;
}

/** Магазины, которые уже встречались (в товарах и покупках), — для подсказок при вводе. Без повторов, по алфавиту. */
export function knownStoreNames(lists: ShoppingListData[]): string[] {
  const names = new Map<string, string>();
  const add = (store: string | undefined) => {
    const shop = store?.trim();
    if (shop && !names.has(shop.toLowerCase())) names.set(shop.toLowerCase(), shop);
  };
  for (const list of lists) {
    for (const item of [...list.toBuy, ...list.bought]) add(item.store);
    for (const p of list.archive ?? []) add(p.store);
  }
  return [...names.values()].sort((a, b) => a.localeCompare(b, 'uk'));
}

/**
 * Что сказать про товар «треба купити»: где его покупали дешевле, чем он записан сейчас.
 * null — подсказывать нечего (истории цен нет или нынешняя цена уже лучшая).
 */
export function dealHint(item: Item, book: PriceBook): DealHint | null {
  const prices = book.get(nameKey(item.name));
  if (!prices?.length) return null;
  const best = prices[0];
  const title = prices.map((p) => `${p.store}: ${money(p.unit)}`).join('\n');

  if (item.price <= 0) {
    // Цены у товара ещё нет — хотя бы подскажем, где обычно недорого
    return { text: `Найдешевше було в ${best.store}: ${money(best.unit)}`, title };
  }
  const sameStore = item.store?.trim().toLowerCase() === best.store.toLowerCase();
  if (!sameStore && best.unit < item.price - 0.005) {
    return { text: `Дешевше в ${best.store}: ${money(best.unit)} (на ${money(item.price - best.unit)} менше)`, title };
  }
  return null;
}
