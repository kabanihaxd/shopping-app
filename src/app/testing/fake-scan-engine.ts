import { Provider } from '@angular/core';
import { ScanEngine } from '../barcode-scanner/scan-engine';

/** Сканер для тестов: камеры нет, коды «приходят» вручную через `emit` */
export class FakeScanEngine {
  /** Если задано — камера «не включается» с такой ошибкой */
  failWith: string | null = null;
  stopped = 0;
  private onCode?: (code: string) => void;

  async start(_video: HTMLVideoElement, onCode: (code: string) => void): Promise<() => void> {
    if (this.failWith) throw new DOMException('нет камеры', this.failWith);
    this.onCode = onCode;
    return () => {
      this.stopped++;
    };
  }

  /** Как будто камера увидела штрихкод */
  emit(code: string) {
    this.onCode?.(code);
  }
}

export function provideFakeScanEngine(): Provider {
  return { provide: ScanEngine, useClass: FakeScanEngine };
}
