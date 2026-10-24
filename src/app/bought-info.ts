/** Подпись у купленного товара: «Оксана · 14:20» и полная дата во всплывающей подсказке */
export type BoughtInfo = { text: string; title: string };

const two = (n: number) => String(n).padStart(2, '0');
const clock = (d: Date) => `${two(d.getHours())}:${two(d.getMinutes())}`;
const day = (d: Date) => `${two(d.getDate())}.${two(d.getMonth() + 1)}`;
const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/** Когда куплено по-человечески: сегодня — «14:20», вчера — «вчора 14:20», раньше — «12.10 14:20» (в другом году с годом) */
export function whenBought(boughtAt: number, now = Date.now()): string {
  const bought = new Date(boughtAt);
  const today = new Date(now);
  if (sameDay(bought, today)) return clock(bought);
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  if (sameDay(bought, yesterday)) return `вчора ${clock(bought)}`;
  if (bought.getFullYear() === today.getFullYear()) return `${day(bought)} ${clock(bought)}`;
  return `${day(bought)}.${bought.getFullYear()}`;
}

/**
 * «Хто купив і коли» для купленного товара. Старые покупки без ника показывают только время,
 * совсем старые (без даты и без имени) — ничего (null).
 */
export function boughtInfo(boughtAt: number | undefined, who: string, now = Date.now()): BoughtInfo | null {
  const parts = [who, boughtAt === undefined ? '' : whenBought(boughtAt, now)].filter(Boolean);
  if (parts.length === 0) return null;
  const d = boughtAt === undefined ? null : new Date(boughtAt);
  const full = d ? `${day(d)}.${d.getFullYear()} ${clock(d)}` : '';
  return { text: parts.join(' · '), title: [who && `Купив(ла): ${who}`, full && `Коли: ${full}`].filter(Boolean).join('\n') };
}
