import { boughtInfo, whenBought } from './bought-info';

/** «Сейчас» для тестов: 24 жовтня 2026, 15:00 по местному времени */
const NOW = new Date(2026, 9, 24, 15, 0).getTime();
const at = (y: number, m: number, d: number, h = 14, min = 20) => new Date(y, m, d, h, min).getTime();

describe('whenBought', () => {
  it('should show just the time for today', () => {
    expect(whenBought(at(2026, 9, 24), NOW)).toBe('14:20');
    expect(whenBought(at(2026, 9, 24, 8, 5), NOW)).toBe('08:05'); // с нулём впереди
  });

  it('should say "вчора" for yesterday, even across a month border', () => {
    expect(whenBought(at(2026, 9, 23), NOW)).toBe('вчора 14:20');
    const firstOfMonth = new Date(2026, 10, 1, 9, 0).getTime();
    expect(whenBought(new Date(2026, 9, 31, 22, 30).getTime(), firstOfMonth)).toBe('вчора 22:30');
  });

  it('should show the date earlier this year and the year in older ones', () => {
    expect(whenBought(at(2026, 9, 12), NOW)).toBe('12.10 14:20');
    expect(whenBought(at(2025, 11, 31), NOW)).toBe('31.12.2025');
  });
});

describe('boughtInfo', () => {
  it('should combine who and when, as in «Оксана · 14:20»', () => {
    const info = boughtInfo(at(2026, 9, 24), 'Оксана', NOW)!;
    expect(info.text).toBe('Оксана · 14:20');
    expect(info.title).toBe('Купив(ла): Оксана\nКоли: 24.10.2026 14:20');
  });

  it('should show only the time for old purchases without a name', () => {
    expect(boughtInfo(at(2026, 9, 24), '', NOW)!.text).toBe('14:20');
  });

  it('should show only the name when there is no date', () => {
    expect(boughtInfo(undefined, 'Оксана', NOW)!.text).toBe('Оксана');
  });

  it('should show nothing when neither is known', () => {
    expect(boughtInfo(undefined, '', NOW)).toBeNull();
  });
});
