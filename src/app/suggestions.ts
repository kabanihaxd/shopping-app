import { Item } from './item';

/** Товар, который человек когда-то добавлял — из этого строятся подсказки */
export type HistoryEntry = {
  name: string;
  categoryId: string;
  /** Последняя цена */
  price: number;
  /** Сколько раз добавляли */
  count: number;
  lastUsed: number;
};

/** Сколько товаров помнить (самые старые забываются) */
export const MAX_HISTORY = 300;

const key = (name: string) => name.trim().toLowerCase();

/** Запомнить добавленный товар: новый — в историю, знакомый — +1 к счётчику и свежие категория/цена */
export function rememberItem(entries: HistoryEntry[], item: Item, now = Date.now()): HistoryEntry[] {
  const old = entries.find((e) => key(e.name) === key(item.name));
  const entry: HistoryEntry = {
    name: item.name,
    categoryId: item.categoryId,
    price: item.price || old?.price || 0, // цену не указали — оставляем прошлую
    count: (old?.count ?? 0) + 1,
    lastUsed: now,
  };
  return [entry, ...entries.filter((e) => e !== old)]
    .sort((a, b) => b.lastUsed - a.lastUsed)
    .slice(0, MAX_HISTORY);
}

export function forgetItem(entries: HistoryEntry[], name: string): HistoryEntry[] {
  return entries.filter((e) => key(e.name) !== key(name));
}

/**
 * Подходящие подсказки к тому, что человек начал вводить.
 * Сначала — совпадение с начала названия, потом — с начала любого слова, потом — где угодно;
 * внутри — что добавляют чаще и чаще недавно. Товары из `exclude` (уже в списке) не предлагаем.
 */
export function suggest(query: string, entries: HistoryEntry[], exclude: string[] = [], limit = 6): HistoryEntry[] {
  const q = key(query);
  if (!q) return [];
  const skip = new Set(exclude.map(key));

  const score = (name: string) => {
    if (name.startsWith(q)) return 0;
    if (name.split(/[\s,.()-]+/).some((word) => word.startsWith(q))) return 1;
    if (name.includes(q)) return 2;
    return -1;
  };

  return entries
    .map((entry) => ({ entry, score: score(key(entry.name)) }))
    .filter((x) => x.score >= 0 && !skip.has(key(x.entry.name)))
    .sort(
      (a, b) =>
        a.score - b.score || b.entry.count - a.entry.count || b.entry.lastUsed - a.entry.lastUsed,
    )
    .slice(0, limit)
    .map((x) => x.entry);
}
