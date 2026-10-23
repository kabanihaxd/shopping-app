import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { App } from './app';
import { routes } from './app.routes';
import { provideFakeListsStore } from './testing/fake-lists-store';

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

  it('should render the lists page on /', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/');
    const h1 = (harness.routeNativeElement as HTMLElement).querySelector('h1');
    expect(h1?.textContent).toContain('Мої списки покупок');
  });
});
