import { Injectable } from '@angular/core';
import type { DecodeHintType } from '@zxing/library'; // только тип — сама библиотека подгружается ниже, по требованию

/**
 * Распознаёт штрихкоды с камеры. Библиотека (≈ 400 КБ) подгружается только при первом открытии
 * сканера, поэтому на скорость запуска приложения не влияет.
 * Отдельный сервис — чтобы в тестах подставить заглушку: настоящей камеры там нет.
 */
@Injectable({ providedIn: 'root' })
export class ScanEngine {
  /** Включает камеру и вызывает onCode при каждом распознанном коде. Возвращает функцию «выключить камеру». */
  async start(video: HTMLVideoElement, onCode: (code: string) => void): Promise<() => void> {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new DOMException('Камера недоступна', 'NotSupportedError');
    }
    const { BarcodeFormat, BrowserMultiFormatReader, DecodeHintType } = await import('@zxing/library');
    // Только штрихкоды товаров — так распознавание быстрее и реже путается
    const hints = new Map<DecodeHintType, unknown>([
      [
        DecodeHintType.POSSIBLE_FORMATS,
        [BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E],
      ],
    ]);
    const reader = new BrowserMultiFormatReader(hints, 250);
    await reader.decodeFromConstraints(
      { video: { facingMode: { ideal: 'environment' } } }, // задняя камера
      video,
      (result) => {
        if (result) onCode(result.getText());
      },
    );
    return () => reader.reset();
  }
}
