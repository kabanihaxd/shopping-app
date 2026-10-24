import { Injectable, signal } from '@angular/core';

export type WakeLockState = 'off' | 'on' | 'unsupported' | 'failed';

/**
 * Не даёт экрану погаснуть (Screen Wake Lock API) — чтобы список в магазине не пропадал,
 * пока человек ищет товар. Браузер сам снимает блокировку, когда вкладка уходит в фон
 * (свернули приложение, выключили экран), поэтому при возвращении берём её заново.
 */
@Injectable({ providedIn: 'root' })
export class ScreenWakeLock {
  /** off — не просили; on — экран не гаснет; unsupported — браузер не умеет; failed — отказал (например, экономия заряда) */
  readonly state = signal<WakeLockState>('off');
  private sentinel: WakeLockSentinel | null = null;
  private wanted = false;

  constructor() {
    document.addEventListener('visibilitychange', () => {
      if (this.wanted && document.visibilityState === 'visible') void this.acquire();
    });
  }

  async enable() {
    this.wanted = true;
    await this.acquire();
  }

  async disable() {
    this.wanted = false;
    const sentinel = this.sentinel;
    this.sentinel = null;
    this.state.set('off');
    try {
      await sentinel?.release();
    } catch {
      // уже снята браузером — нам это и нужно
    }
  }

  private async acquire() {
    if (!('wakeLock' in navigator)) {
      this.state.set('unsupported');
      return;
    }
    try {
      const sentinel = await navigator.wakeLock.request('screen');
      if (!this.wanted) {
        // пока ждали ответа, режим уже выключили
        await sentinel.release();
        return;
      }
      this.sentinel = sentinel;
      this.state.set('on');
    } catch {
      this.state.set('failed');
    }
  }
}
