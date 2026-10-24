import { parseSpoken } from './voice-parse';

/** Для краткости: «имя × количество» */
const parse = (text: string) => parseSpoken(text).map((x) => `${x.name} × ${x.quantity}`);

describe('parseSpoken', () => {
  it('should split the example phrase into three items', () => {
    expect(parse('молоко, два хліби, яйця')).toEqual(['Молоко × 1', 'Хліби × 2', 'Яйця × 1']);
  });

  it('should work without commas, the way speech engines usually return text', () => {
    expect(parse('молоко і два хліби та яйця')).toEqual(['Молоко × 1', 'Хліби × 2', 'Яйця × 1']);
    expect(parse('молоко потім сир ще масло')).toEqual(['Молоко × 1', 'Сир × 1', 'Масло × 1']);
  });

  it('should read digits, number words and "x" forms as quantities', () => {
    expect(parse('2 хліби')).toEqual(['Хліби × 2']);
    expect(parse('три яблука')).toEqual(['Яблука × 3']);
    expect(parse('дві пачки молока')).toEqual(['Пачки молока × 2']);
    expect(parse("п'ять яєць")).toEqual(['Яєць × 5']);
    expect(parse('сік x3')).toEqual(['Сік × 3']);
  });

  it('should accept the quantity after the name too', () => {
    expect(parse('хліб 2')).toEqual(['Хліб × 2']);
    expect(parse('молоко два')).toEqual(['Молоко × 2']);
    expect(parse('хліб 2 шт')).toEqual(['Хліб × 2']);
    expect(parse('3 шт яблука')).toEqual(['Яблука × 3']);
  });

  it('should understand Russian number words and wrapper words', () => {
    expect(parse('добавь молоко и две булки')).toEqual(['Молоко × 1', 'Булки × 2']);
    expect(parse('мені треба купити сир і хліб')).toEqual(['Сир × 1', 'Хліб × 1']);
    expect(parse('додай у список картоплю')).toEqual(['Картоплю × 1']);
  });

  it('should keep weights and volumes in the name instead of making them a count', () => {
    expect(parse('2 кг картоплі')).toEqual(['2 кг картоплі × 1']);
    expect(parse('півтора літра молока, 2 л соку')).toEqual(['Півтора літра молока × 1', '2 л соку × 1']);
    expect(parse('молоко 3.2')).toEqual(['Молоко 3.2 × 1']); // жирность — не количество
  });

  it('should merge repeated items and cap silly quantities', () => {
    expect(parse('хліб, ще хліб, два хліб')).toEqual(['Хліб × 4']);
    expect(parse('100 хлібів')).toEqual(['100 хлібів × 1']); // больше 99 — это не количество
  });

  it('should ignore empty phrases and lone wrapper words', () => {
    expect(parse('')).toEqual([]);
    expect(parse('  ,  . ')).toEqual([]);
    expect(parse('додай')).toEqual([]);
    expect(parse('два')).toEqual(['Два × 1']); // одно число без товара — считаем названием, ничего не теряем
  });

  it('should capitalize names and treat different apostrophes the same', () => {
    expect(parse("ПЕЧИВО, п’ять яблук")).toEqual(['Печиво × 1', 'Яблук × 5']);
  });
});
