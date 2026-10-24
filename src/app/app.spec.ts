import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { App } from './app';
import { routes } from './app.routes';
import { ListsStore } from './lists-store';
import { FakeListsStore, provideFakeListsStore } from './testing/fake-lists-store';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter(routes), provideFakeListsStore()],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('should show a notice from another member and dismiss it', async () => {
    const store = TestBed.inject(ListsStore) as unknown as FakeListsStore;
    store.notices.set([{ id: 'n1', listId: 'l1', text: 'olga у «Продукти»: додано — Сир' }]);
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const page = fixture.nativeElement as HTMLElement;

    expect(page.querySelector('.notice-text')?.textContent).toContain('додано — Сир');
    expect(page.querySelector('.notice-open')?.getAttribute('href')).toBe('/list/l1');

    page.querySelector<HTMLButtonElement>('.notice-close')!.click();
    await fixture.whenStable();
    expect(page.querySelector('.notice')).toBeNull();
  });

  it('should return to the invitation after signing in', async () => {
    localStorage.setItem('pending-join', '/join/l1/secret');
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();

    expect(TestBed.inject(Router).url).toBe('/join/l1/secret');
    expect(localStorage.getItem('pending-join')).toBeNull(); // один раз — иначе будет возвращать каждый раз
    fixture.destroy();
  });

  describe('theme', () => {
    const html = document.documentElement;

    beforeEach(() => localStorage.removeItem('theme'));
    afterEach(() => {
      localStorage.removeItem('theme');
      delete html.dataset['theme'];
    });

    async function openApp() {
      const fixture = TestBed.createComponent(App);
      await fixture.whenStable();
      const page = fixture.nativeElement as HTMLElement;
      const button = () => page.querySelector<HTMLButtonElement>('.theme-btn')!;
      return { fixture, button };
    }

    it('should go auto → light → dark → auto and remember the choice', async () => {
      const { fixture, button } = await openApp();
      expect(html.dataset['theme']).toBeUndefined(); // авто: решает система
      expect(button().getAttribute('aria-label')).toContain('авто');

      button().click();
      await fixture.whenStable();
      expect(html.dataset['theme']).toBe('light');
      expect(localStorage.getItem('theme')).toBe('light');

      button().click();
      await fixture.whenStable();
      expect(html.dataset['theme']).toBe('dark');
      expect(localStorage.getItem('theme')).toBe('dark');
      expect(button().getAttribute('aria-label')).toContain('темна');

      button().click();
      await fixture.whenStable();
      expect(html.dataset['theme']).toBeUndefined();
      expect(localStorage.getItem('theme')).toBeNull();
    });

    it('should start with the saved theme', async () => {
      localStorage.setItem('theme', 'dark');
      const { fixture } = await openApp();
      await fixture.whenStable();
      expect(html.dataset['theme']).toBe('dark');
    });
  });

  describe('nickname', () => {
    let store: FakeListsStore;

    beforeEach(() => {
      store = TestBed.inject(ListsStore) as unknown as FakeListsStore;
      localStorage.removeItem('nickname-skipped');
    });

    afterEach(() => localStorage.removeItem('nickname-skipped'));

    async function openApp() {
      const fixture = TestBed.createComponent(App);
      await fixture.whenStable();
      return { fixture, page: fixture.nativeElement as HTMLElement };
    }

    it('should offer to come up with a nickname when there is none', async () => {
      store.profileReady.set(true);
      const { page } = await openApp();
      expect(page.querySelector('app-nickname-form')).not.toBeNull();
    });

    it('should not ask before the server says whether a nickname exists', async () => {
      const { page } = await openApp(); // profileReady = false
      expect(page.querySelector('app-nickname-form')).toBeNull();
    });

    it('should save the nickname and show it instead of the email', async () => {
      store.profileReady.set(true);
      const { fixture, page } = await openApp();
      expect(page.querySelector('.nick-btn')!.textContent).toContain('me@example.com');

      const field = page.querySelector<HTMLInputElement>('.nick-input')!;
      field.value = 'Оля';
      page.querySelector<HTMLButtonElement>('.save-btn')!.click();
      await fixture.whenStable();

      expect(store.nickname()).toBe('Оля');
      expect(page.querySelector('app-nickname-form')).toBeNull();
      expect(page.querySelector('.nick-btn')!.textContent).toContain('Оля');
      expect(page.querySelector('.nick-btn')!.textContent).not.toContain('me@example.com');
    });

    it('should remember a skip and stop asking', async () => {
      store.profileReady.set(true);
      const first = await openApp();
      first.page.querySelector<HTMLButtonElement>('.skip-btn')!.click();
      await first.fixture.whenStable();
      expect(first.page.querySelector('app-nickname-form')).toBeNull();
      expect(localStorage.getItem('nickname-skipped')).toBe('me@example.com');

      const second = await openApp(); // «следующий вход»
      expect(second.page.querySelector('app-nickname-form')).toBeNull();
    });

    it('should let the user change the nickname later', async () => {
      store.profileReady.set(true);
      store.nicknames.set({ 'me@example.com': 'Оля' });
      const { fixture, page } = await openApp();
      expect(page.querySelector('app-nickname-form')).toBeNull();

      page.querySelector<HTMLButtonElement>('.nick-btn')!.click();
      await fixture.whenStable();
      expect(page.querySelector<HTMLInputElement>('.nick-input')!.value).toBe('Оля');

      page.querySelector<HTMLButtonElement>('.skip-btn')!.click(); // «Скасувати»
      await fixture.whenStable();
      expect(page.querySelector('app-nickname-form')).toBeNull();
      expect(store.nickname()).toBe('Оля');
    });
  });

  it('should show an undo button on a notice and run it once', async () => {
    const store = TestBed.inject(ListsStore) as unknown as FakeListsStore;
    const run = vi.fn();
    store.showNotice({ listId: 'l1', text: 'Видалено «Молоко»', action: { label: 'Скасувати', run } }, 5000);
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const page = fixture.nativeElement as HTMLElement;

    expect(page.querySelector('.notice-text')!.textContent).toContain('Видалено «Молоко»');
    expect(page.querySelector('.notice-open')).toBeNull(); // вместо ссылки «Відкрити» — кнопка
    page.querySelector<HTMLButtonElement>('.notice-action')!.click();
    await fixture.whenStable();

    expect(run).toHaveBeenCalledTimes(1);
    expect(page.querySelector('.notice')).toBeNull();
  });

  it('should render the lists page on /', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/');
    const h1 = (harness.routeNativeElement as HTMLElement).querySelector('h1');
    expect(h1?.textContent).toContain('Мої списки покупок');
  });
});
