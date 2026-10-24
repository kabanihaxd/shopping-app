import { TestBed } from '@angular/core/testing';
import { ScreenWakeLock } from './wake-lock';

describe('ScreenWakeLock', () => {
  afterEach(() => delete (navigator as { wakeLock?: unknown }).wakeLock);

  function mockWakeLock(request = vi.fn().mockResolvedValue({ release: vi.fn().mockResolvedValue(undefined) })) {
    Object.defineProperty(navigator, 'wakeLock', { value: { request }, configurable: true });
    return request;
  }

  it('should request the lock and report it', async () => {
    const request = mockWakeLock();
    const lock = TestBed.inject(ScreenWakeLock);

    await lock.enable();
    expect(request).toHaveBeenCalledWith('screen');
    expect(lock.state()).toBe('on');

    await lock.disable();
    expect(lock.state()).toBe('off');
  });

  it('should take the lock again when the page comes back to the foreground', async () => {
    const request = mockWakeLock();
    const lock = TestBed.inject(ScreenWakeLock);
    await lock.enable();
    expect(request).toHaveBeenCalledTimes(1);

    document.dispatchEvent(new Event('visibilitychange')); // браузер снял замок, когда вкладка пряталась
    await Promise.resolve();
    expect(request).toHaveBeenCalledTimes(2);

    await lock.disable();
    document.dispatchEvent(new Event('visibilitychange'));
    await Promise.resolve();
    expect(request).toHaveBeenCalledTimes(2); // выключили — больше не просим
  });

  it('should say when the browser has no wake lock', async () => {
    const lock = TestBed.inject(ScreenWakeLock);
    await lock.enable();
    expect(lock.state()).toBe('unsupported');
  });

  it('should say when the browser refuses', async () => {
    mockWakeLock(vi.fn().mockRejectedValue(new DOMException('low battery', 'NotAllowedError')));
    const lock = TestBed.inject(ScreenWakeLock);
    await lock.enable();
    expect(lock.state()).toBe('failed');
  });

  it('should drop a lock that arrived after it was switched off', async () => {
    const release = vi.fn().mockResolvedValue(undefined);
    mockWakeLock(vi.fn().mockImplementation(async () => ({ release })));
    const lock = TestBed.inject(ScreenWakeLock);

    const pending = lock.enable();
    await lock.disable(); // выключили, пока замок ещё запрашивался
    await pending;

    expect(release).toHaveBeenCalled();
    expect(lock.state()).toBe('off');
  });
});
