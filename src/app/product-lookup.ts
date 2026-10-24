import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

/** Ответ Open Food Facts (берём только нужные поля) */
type OffResponse = {
  status?: number;
  product?: { product_name?: string; product_name_uk?: string };
};

/** Штрихкод товара — только цифры (EAN-8, UPC-E, UPC-A, EAN-13, GTIN-14) */
export function isBarcode(code: string): boolean {
  return /^\d{6,14}$/.test(code);
}

/**
 * Название товара по штрихкоду из открытой базы Open Food Facts (бесплатно, без ключа, CORS открыт).
 * База общая и неполная — на неизвестный код вернётся null.
 */
@Injectable({ providedIn: 'root' })
export class ProductLookup {
  private readonly http = inject(HttpClient);

  /** Название, null — товара нет в базе. Если базу не удалось спросить (нет сети), бросает ошибку. */
  async find(barcode: string): Promise<string | null> {
    const url = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json?fields=product_name,product_name_uk`;
    try {
      const response = await firstValueFrom(this.http.get<OffResponse>(url));
      if (response.status !== 1 || !response.product) return null;
      const { product_name_uk, product_name } = response.product;
      // Украинское название бывает пустым — тогда берём общее
      return product_name_uk?.trim() || product_name?.trim() || null;
    } catch (e) {
      if (e instanceof HttpErrorResponse && e.status === 404) return null;
      throw e;
    }
  }
}
