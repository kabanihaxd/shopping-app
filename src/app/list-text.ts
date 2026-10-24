import { Item } from './item';

export type TextGroup = { title: string; items: Item[] };

function line(item: Item): string {
  const qty = item.quantity > 1 ? ` × ${item.quantity}` : '';
  const price = item.price > 0 ? ` — ${(item.quantity * item.price).toFixed(2)} €` : '';
  return `• ${item.name}${qty}${price}`;
}

/** Список «Треба купити» обычным текстом для мессенджера: заголовок и товары по категориям */
export function listToText(name: string, groups: TextGroup[]): string {
  const blocks = groups.map((g) => [g.title, ...g.items.map(line)].join('\n'));
  return [`🛒 ${name}`, ...blocks].join('\n\n');
}
