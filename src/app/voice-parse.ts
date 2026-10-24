/** Один товар, разобранный из сказанной фразы */
export type SpokenItem = { name: string; quantity: number };

/** Числа словами: украинские и русские формы (в падежах, в которых их обычно говорят: «два хліби», «дві пачки») */
const NUMBER_WORDS: Record<string, number> = {
  один: 1, одна: 1, одне: 1, одну: 1, одно: 1,
  два: 2, дві: 2, двох: 2, две: 2,
  три: 3, трьох: 3,
  чотири: 4, чотирьох: 4, четыре: 4,
  "п'ять": 5, пять: 5,
  шість: 6, шесть: 6,
  сім: 7, семь: 7,
  вісім: 8, восемь: 8,
  "дев'ять": 9, девять: 9,
  десять: 10, одинадцять: 11, дванадцять: 12, тринадцять: 13, чотирнадцять: 14,
  "п'ятнадцять": 15, шістнадцять: 16, сімнадцять: 17, вісімнадцять: 18, "дев'ятнадцять": 19,
  двадцять: 20,
};

/** Меры веса и объёма: «2 кг картоплі» — это не «2 штуки», число остаётся в названии */
const MEASURES = new Set([
  'кг', 'кілограм', 'кілограма', 'кілограми', 'кілограмів', 'кило', 'килограмм', 'килограмма',
  'г', 'гр', 'грам', 'грама', 'грами', 'грамів', 'грамм', 'грамма',
  'л', 'літр', 'літра', 'літри', 'літрів', 'литр', 'литра', 'литров', 'мл', 'мілілітр', 'мілілітрів',
]);

/** «2 штуки» — штуки как раз и есть количество */
const PIECES = new Set(['шт', 'штука', 'штуки', 'штук', 'штуку']);

/** Слова-обёртки в начале фразы: «додай молоко», «мені треба хліб», «купити яйця» */
const FILLERS = new Set([
  'купити', 'купи', 'купіть', 'додай', 'додати', 'додайте', 'запиши', 'записати', 'мені', 'нам', 'треба',
  'потрібно', 'потрібні', 'хочу', 'в', 'у', 'до', 'список', 'списку', 'будь', 'ласка', 'ще', 'і', 'й', 'та', 'и',
  'плюс', 'купить', 'добавь', 'добавить', 'нужно', 'надо', 'пожалуйста',
]);

/** Между товарами: запятые, точки, «і», «та», «ще», «потім» (в речи запятых часто нет) */
const SEPARATORS = /\s*(?:[,;\n]+|\.+(?=\s|$))\s*|\s+(?:і|й|та|и|плюс|ще|потім|далі)\s+/u;

const MAX_QUANTITY = 99;
const MAX_NAME = 60;

/** Количество из слова или цифр: «2», «два», «x3», «3x»; null — это не количество */
function quantityOf(token: string): number | null {
  const digits = /^(\d{1,2})$/.exec(token) ?? /^[x×х](\d{1,2})$/.exec(token) ?? /^(\d{1,2})[x×х]$/.exec(token);
  const n = digits ? Number(digits[1]) : NUMBER_WORDS[token];
  return n >= 1 && n <= MAX_QUANTITY ? n : null;
}

function parseChunk(chunk: string): SpokenItem | null {
  const tokens = chunk.split(/\s+/).filter(Boolean);
  while (tokens.length > 1 && FILLERS.has(tokens[0])) tokens.shift();

  let quantity = 1;
  const first = quantityOf(tokens[0] ?? '');
  const last = quantityOf(tokens[tokens.length - 1] ?? '');
  if (tokens.length > 1 && first !== null && !MEASURES.has(tokens[1])) {
    // «два хліби», «3 шт яблука»
    quantity = first;
    tokens.splice(0, PIECES.has(tokens[1]) ? 2 : 1);
  } else if (tokens.length > 1 && last !== null) {
    // «хліб 2», «молоко два»
    quantity = last;
    tokens.pop();
    if (PIECES.has(tokens[tokens.length - 1]) && tokens.length > 1) tokens.pop();
  } else if (tokens.length > 2 && PIECES.has(tokens[tokens.length - 1]) && quantityOf(tokens[tokens.length - 2]) !== null) {
    // «хліб 2 шт»
    quantity = quantityOf(tokens[tokens.length - 2])!;
    tokens.splice(-2);
  }

  const name = tokens.join(' ').trim().slice(0, MAX_NAME);
  if (!name || FILLERS.has(name)) return null;
  return { name: name[0].toUpperCase() + name.slice(1), quantity };
}

/**
 * Разбирает фразу «молоко, два хліби, яйця» на товары с количеством.
 * Одинаковые товары складываются («хліб, ще хліб» → хліб × 2).
 */
export function parseSpoken(text: string): SpokenItem[] {
  const cleaned = text.toLowerCase().replace(/[’ʼ`]/g, "'");
  const merged = new Map<string, SpokenItem>();
  for (const chunk of cleaned.split(SEPARATORS)) {
    const item = parseChunk(chunk.trim());
    if (!item) continue;
    const key = item.name.toLowerCase();
    const same = merged.get(key);
    if (same) same.quantity = Math.min(MAX_QUANTITY, same.quantity + item.quantity);
    else merged.set(key, item);
  }
  return [...merged.values()];
}
