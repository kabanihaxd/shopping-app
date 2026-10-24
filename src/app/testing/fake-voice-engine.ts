import { Provider } from '@angular/core';
import { VoiceEngine, VoiceHandlers } from '../voice-engine';

/** Распознавание речи для тестов: микрофона нет, «сказанное» подаётся вручную */
export class FakeVoiceEngine {
  /** Тест выключает поддержку речи (как в Firefox), поставив false до открытия страницы */
  static available = true;
  get supported(): boolean {
    return FakeVoiceEngine.available;
  }
  lastLang = '';
  starts = 0;
  stops = 0;
  private handlers?: VoiceHandlers;

  start(lang: string, handlers: VoiceHandlers): () => void {
    this.lastLang = lang;
    this.starts++;
    this.handlers = handlers;
    return () => {
      this.stops++;
    };
  }

  interim(text: string) {
    this.handlers?.onInterim(text);
  }

  /** Человек сказал фразу и замолчал: окончательный текст, потом конец */
  say(text: string) {
    this.handlers?.onFinal(text);
    this.handlers?.onEnd();
  }

  end() {
    this.handlers?.onEnd();
  }

  fail(code: string) {
    this.handlers?.onError(code);
    this.handlers?.onEnd();
  }
}

export function provideFakeVoiceEngine(): Provider {
  return { provide: VoiceEngine, useClass: FakeVoiceEngine };
}
