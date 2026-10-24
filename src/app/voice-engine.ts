import { Injectable } from '@angular/core';

/** Что нужно знать о распознавании речи (в стандартных типах браузера его нет, описываем сами) */
type RecognitionResult = { isFinal: boolean; 0: { transcript: string } };
type RecognitionEvent = { resultIndex: number; results: { length: number; [i: number]: RecognitionResult } };
type Recognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: RecognitionEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
};
type RecognitionConstructor = new () => Recognition;

export type VoiceHandlers = {
  /** Слова, которые ещё распознаются (черновик) */
  onInterim: (text: string) => void;
  /** Окончательный кусок текста */
  onFinal: (text: string) => void;
  /** Распознавание закончилось (человек замолчал или нажал «стоп») */
  onEnd: () => void;
  /** Код ошибки браузера: not-allowed, no-speech, network, audio-capture… */
  onError: (code: string) => void;
};

/**
 * Речь в текст средствами браузера (Web Speech API). Есть в Chrome и Safari, в Firefox нет.
 * Звук при этом уходит на сервер разработчика браузера (Chrome — Google, Safari — Apple).
 * Отдельный сервис — чтобы в тестах подставить заглушку: микрофона там нет.
 */
@Injectable({ providedIn: 'root' })
export class VoiceEngine {
  private get constructorOrNull(): RecognitionConstructor | null {
    const w = window as unknown as Record<string, RecognitionConstructor | undefined>;
    return w['SpeechRecognition'] ?? w['webkitSpeechRecognition'] ?? null;
  }

  get supported(): boolean {
    return this.constructorOrNull !== null;
  }

  /** Начинает слушать. Возвращает функцию «хватит слушать» (результат всё равно придёт). */
  start(lang: string, handlers: VoiceHandlers): () => void {
    const Ctor = this.constructorOrNull;
    if (!Ctor) {
      handlers.onError('not-supported');
      handlers.onEnd();
      return () => {};
    }
    let recognition: Recognition | null = null;
    let cancelled = false;
    // Сначала просим у системы микрофон сами: так браузер показывает окно разрешения
    // и сразу видно, есть ли микрофон. Распознавание само на компьютере часто молча не стартует.
    this.checkMicrophone().then((problem) => {
      if (cancelled) {
        handlers.onEnd();
        return;
      }
      if (problem) {
        handlers.onError(problem);
        handlers.onEnd();
        return;
      }
      const r = new Ctor();
      recognition = r;
      r.lang = lang;
      r.interimResults = true;
      r.continuous = false;
      r.onresult = (event) => {
        let interim = '';
        let final = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          if (result.isFinal) final += result[0].transcript;
          else interim += result[0].transcript;
        }
        if (interim) handlers.onInterim(interim);
        if (final) handlers.onFinal(final);
      };
      r.onerror = (event) => handlers.onError(event.error);
      r.onend = () => handlers.onEnd();
      try {
        r.start();
      } catch {
        handlers.onError('start-failed');
        handlers.onEnd();
      }
    });
    return () => {
      cancelled = true;
      recognition?.stop();
    };
  }

  /** Микрофон системы по умолчанию: null — всё в порядке, иначе код ошибки */
  private async checkMicrophone(): Promise<string | null> {
    const devices = navigator.mediaDevices;
    if (!devices?.getUserMedia) return null; // старый браузер — пусть пробует распознавание само
    try {
      const stream = await devices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop()); // нужен был только допуск, звук пишет распознавание
      return null;
    } catch (e) {
      const name = (e as DOMException).name;
      if (name === 'NotAllowedError' || name === 'SecurityError') return 'not-allowed';
      if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'audio-capture';
      if (name === 'NotReadableError') return 'mic-busy';
      return null;
    }
  }
}
