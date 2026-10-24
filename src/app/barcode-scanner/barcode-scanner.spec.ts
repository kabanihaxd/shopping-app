import { TestBed } from '@angular/core/testing';
import { BarcodeScanner } from './barcode-scanner';
import { ScanEngine } from './scan-engine';
import { FakeScanEngine, provideFakeScanEngine } from '../testing/fake-scan-engine';

describe('BarcodeScanner', () => {
  let engine: FakeScanEngine;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BarcodeScanner],
      providers: [provideFakeScanEngine()],
    }).compileComponents();
    engine = TestBed.inject(ScanEngine) as unknown as FakeScanEngine;
  });

  async function open() {
    const fixture = TestBed.createComponent(BarcodeScanner);
    const codes: string[] = [];
    fixture.componentInstance.scanned.subscribe((c) => codes.push(c));
    await fixture.whenStable();
    return { fixture, page: fixture.nativeElement as HTMLElement, codes };
  }

  it('should report the code only once even if the camera keeps seeing it', async () => {
    const { codes } = await open();

    engine.emit('5449000000996');
    engine.emit('5449000000996');

    expect(codes).toEqual(['5449000000996']);
    expect(engine.stopped).toBe(1); // камера выключена сразу после находки
  });

  it('should switch the camera off when the window is closed', async () => {
    const { fixture } = await open();
    fixture.destroy();
    expect(engine.stopped).toBe(1);
  });

  it('should explain when the camera is not allowed', async () => {
    engine.failWith = 'NotAllowedError';
    const { page } = await open();

    expect(page.querySelector('[role="alert"]')!.textContent).toContain('Немає доступу до камери');
    expect(page.querySelector('video')).toBeNull();
    expect(page.querySelector('input[aria-label="Код товару вручну"]')).not.toBeNull(); // ручной ввод остаётся
  });

  it('should explain when there is no camera at all', async () => {
    engine.failWith = 'NotFoundError';
    const { page } = await open();
    expect(page.querySelector('[role="alert"]')!.textContent).toContain('Камеру не знайдено');
  });

  it('should accept a code typed by hand', async () => {
    const { page, codes } = await open();
    page.querySelector<HTMLInputElement>('input')!.value = ' 4820000000017 ';
    page.querySelector<HTMLButtonElement>('.find-btn')!.click();
    expect(codes).toEqual(['4820000000017']);
  });

  it('should ignore an empty manual entry', async () => {
    const { page, codes } = await open();
    page.querySelector<HTMLButtonElement>('.find-btn')!.click();
    expect(codes).toEqual([]);
  });
});
