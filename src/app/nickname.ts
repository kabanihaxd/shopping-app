export const NICKNAME_MIN = 2;
export const NICKNAME_MAX = 20;

/** Лишние пробелы по краям и подряд внутри убираем: «  Оля   К » → «Оля К» */
export function cleanNickname(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ');
}

/** Текст ошибки для нікнейма или null, если всё в порядке */
export function nicknameError(raw: string): string | null {
  const nick = cleanNickname(raw);
  if (nick.length < NICKNAME_MIN) return `Нікнейм має містити щонайменше ${NICKNAME_MIN} символи`;
  if (nick.length > NICKNAME_MAX) return `Нікнейм має бути не довшим за ${NICKNAME_MAX} символів`;
  // Ник с «@» выглядел бы как чужая почта — путаница в списке участников
  if (nick.includes('@')) return 'Нікнейм не може містити «@»';
  return null;
}
