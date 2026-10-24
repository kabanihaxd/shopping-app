import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { StatsPage } from './stats-page';
import { ListsStore } from '../lists-store';
import { FakeListsStore, provideFakeListsStore } from '../testing/fake-lists-store';

describe('StatsPage', () => {
  let store: FakeListsStore;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [StatsPage],
      providers: [provideRouter([]), provideFakeListsStore()],
    }).compileComponents();
    store = TestBed.inject(ListsStore) as unknown as FakeListsStore;
  });

  async function openPage() {
    const fixture = TestBed.createComponent(StatsPage);
    await fixture.whenStable();
    const page = fixture.nativeElement as HTMLElement;
    const button = (label: string) => page.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;
    return { fixture, page, button };
  }

  /** Список с одной покупкой: сыр за 12 €, купленный `boughtAt` */
  function buyCheese(boughtAt: number) {
    const id = store.create('Продукти');
    store.update(id, (l) => ({
      ...l,
      bought: [{ id: 'c', name: 'Сир', quantity: 2, price: 6, categoryId: 'dairy', boughtAt }],
    }));
  }

  it('should say there are no purchases when nothing was bought', async () => {
    const { page } = await openPage();
    expect(page.textContent).toContain('За цей місяць покупок немає');
  });

  it('should show the total and the category for this month', async () => {
    buyCheese(Date.now());
    const { page } = await openPage();

    expect(page.querySelector('.total')!.textContent).toContain('€12.00');
    expect(page.querySelector('.categories')!.textContent).toContain('Молочне та яйця');
    expect(page.querySelectorAll('.col').length).toBeGreaterThanOrEqual(28);
  });

  it('should not count last month and let the user go back to it', async () => {
    const lastMonth = new Date();
    lastMonth.setDate(1);
    lastMonth.setMonth(lastMonth.getMonth() - 1);
    buyCheese(lastMonth.getTime());
    const { fixture, page, button } = await openPage();
    expect(page.textContent).toContain('За цей місяць покупок немає');

    button('Попередній місяць').click();
    await fixture.whenStable();
    expect(page.querySelector('.total')!.textContent).toContain('€12.00');
  });

  it('should not allow going into the future', async () => {
    const { button } = await openPage();
    expect(button('Наступний місяць').disabled).toBe(true);
  });

  it('should show the amount of the tapped day', async () => {
    buyCheese(Date.now());
    const { fixture, page } = await openPage();
    const today = new Date().getDate();

    page.querySelectorAll<HTMLButtonElement>('.col')[today - 1].click();
    await fixture.whenStable();

    expect(page.querySelector('.picked')!.textContent).toContain(`${today} число`);
    expect(page.querySelector('.picked')!.textContent).toContain('€12.00');
  });

  it('should mention purchases without a date', async () => {
    const id = store.create('Старий');
    store.update(id, (l) => ({
      ...l,
      bought: [{ id: 'x', name: 'Давнє', quantity: 1, price: 1, categoryId: '' }],
    }));
    const { page } = await openPage();
    expect(page.querySelector('.note')!.textContent).toContain('без дати покупки: 1');
  });
});
