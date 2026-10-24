import { ShoppingListData } from './lists-store';

/** Уведомление «в списке что-то изменили» — показывается внизу экрана */
export type Notice = { id: string; listId: string; text: string };

/** Сколько названий товаров показываем в одном уведомлении */
const MAX_NAMES = 3;

function names(items: { name: string }[]): string {
  const shown = items.slice(0, MAX_NAMES).map((x) => x.name).join(', ');
  return items.length > MAX_NAMES ? `${shown} і ще ${items.length - MAX_NAMES}` : shown;
}

/**
 * Что изменилось в списке, по-человечески. null — уведомлять не о чем
 * (например, это изменил я сам с другого устройства).
 * before === undefined — список только что появился у меня (мне дали доступ).
 */
export function describeChange(
  before: ShoppingListData | undefined,
  after: ShoppingListData,
  myEmail: string,
  nameOf: (email: string) => string = (email) => email.split('@')[0],
): string | null {
  if (!before) return `Вам надали доступ до списку «${after.name}»`;

  // Новый участник (по ссылке или по email) — сообщаем всем, кроме него самого
  const joined = after.members.filter((m) => !before.members.includes(m) && m !== myEmail);
  if (joined.length) return `Новий учасник у «${after.name}»: ${joined.map(nameOf).join(', ')}`;

  if (after.updatedBy === myEmail) return null;

  const who = after.updatedBy ? nameOf(after.updatedBy) : 'Хтось';
  const oldIds = new Set([...before.toBuy, ...before.bought].map((x) => x.id));
  const oldBoughtIds = new Set(before.bought.map((x) => x.id));
  const newIds = new Set([...after.toBuy, ...after.bought].map((x) => x.id));

  const added = after.toBuy.filter((x) => !oldIds.has(x.id));
  const bought = after.bought.filter((x) => !oldBoughtIds.has(x.id) && oldIds.has(x.id));
  const removed = [...oldIds].filter((id) => !newIds.has(id)).length;

  const parts: string[] = [];
  if (added.length) parts.push(`додано — ${names(added)}`);
  if (bought.length) parts.push(`куплено — ${names(bought)}`);
  if (removed) parts.push(`видалено товарів: ${removed}`);
  // Изменился только состав участников или ссылка-приглашение — отдельно об этом уже сказано выше
  // (или это не повод беспокоить остальных)
  const onlyAccessChanged =
    after.name === before.name &&
    (after.inviteCode !== before.inviteCode || after.members.length !== before.members.length);
  if (parts.length === 0 && onlyAccessChanged) return null;
  if (parts.length === 0) parts.push('список змінено');

  return `${who} у «${after.name}»: ${parts.join('; ')}`;
}
