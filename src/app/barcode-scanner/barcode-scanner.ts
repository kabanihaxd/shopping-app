import { Component, DestroyRef, ElementRef, afterNextRender, inject, output, signal, viewChild } from '@angular/core';
import { ScanEngine } from './scan-engine';

/** Что сказать человеку, если камера не включилась */
function cameraProblem(e: unknown): string {
  const name = e instanceof DOMException ? e.name : '';
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'Немає доступу до камери. Дозвольте його в налаштуваннях браузера для цього сайту.';
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'Камеру не знайдено на цьому пристрої.';
    case 'NotSupportedError':
      return 'Камера недоступна на цій сторінці.';
    default:
      return 'Не вдалося увімкнути камеру.';
  }
}

/** Окно сканера: видео с камеры поверх страницы. Сообщает о коде через `scanned`. */
@Component({
  selector: 'app-barcode-scanner',
  templateUrl: './barcode-scanner.html',
  styleUrl: './barcode-scanner.css',
})
export class BarcodeScanner {
  private readonly engine = inject(ScanEngine);
  private readonly video = viewChild.required<ElementRef<HTMLVideoElement>>('video');

  readonly scanned = output<string>();
  readonly closed = output();

  protected readonly error = signal<string | null>(null);
  private stopCamera?: () => void;
  private finished = false;
  private destroyed = false;

  constructor() {
    // Камеру включаем, когда <video> уже есть на странице
    afterNextRender(() => this.start());
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      this.stopCamera?.();
    });
  }

  private async start() {
    try {
      const stop = await this.engine.start(this.video().nativeElement, (code) => this.found(code));
      if (this.destroyed) stop(); // закрыли окно, пока камера включалась
      else this.stopCamera = stop;
    } catch (e) {
      this.error.set(cameraProblem(e));
    }
  }

  /** Код приходит несколько раз подряд, пока штрихкод в кадре, — берём только первый */
  private found(code: string) {
    if (this.finished) return;
    this.finished = true;
    this.stopCamera?.();
    this.scanned.emit(code);
  }

  protected manual(field: HTMLInputElement) {
    const code = field.value.trim();
    if (code) this.found(code);
  }
}
