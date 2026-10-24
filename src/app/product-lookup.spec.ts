import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ProductLookup, isBarcode } from './product-lookup';

describe('ProductLookup', () => {
  let lookup: ProductLookup;
  let http: HttpTestingController;
  const url = (code: string) =>
    `https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=product_name,product_name_uk`;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    lookup = TestBed.inject(ProductLookup);
    http = TestBed.inject(HttpTestingController);
  });

  it('should prefer the Ukrainian name', async () => {
    const found = lookup.find('4820000000017');
    http.expectOne(url('4820000000017')).flush({ status: 1, product: { product_name: 'Milk', product_name_uk: ' Молоко ' } });
    expect(await found).toBe('Молоко');
  });

  it('should fall back to the general name when the Ukrainian one is empty', async () => {
    const found = lookup.find('5449000000996');
    http.expectOne(url('5449000000996')).flush({ status: 1, product: { product_name: 'Coca-Cola Original', product_name_uk: '' } });
    expect(await found).toBe('Coca-Cola Original');
  });

  it('should return null for an unknown product, with or without a 404', async () => {
    const unknown = lookup.find('1111111111111');
    http.expectOne(url('1111111111111')).flush({ status: 0 });
    expect(await unknown).toBeNull();

    const missing = lookup.find('2222222222222');
    http.expectOne(url('2222222222222')).flush('', { status: 404, statusText: 'Not Found' });
    expect(await missing).toBeNull();
  });

  it('should return null when the product has no name', async () => {
    const found = lookup.find('3333333333333');
    http.expectOne(url('3333333333333')).flush({ status: 1, product: { product_name: '  ' } });
    expect(await found).toBeNull();
  });

  it('should fail loudly when the database cannot be reached', async () => {
    const found = lookup.find('4444444444444');
    http.expectOne(url('4444444444444')).flush('', { status: 500, statusText: 'Server Error' });
    await expect(found).rejects.toBeTruthy();
  });

  it('should recognize barcodes by their digits', () => {
    expect(isBarcode('5449000000996')).toBe(true);
    expect(isBarcode('12345678')).toBe(true);
    expect(isBarcode('12345')).toBe(false);
    expect(isBarcode('abc12345678')).toBe(false);
    expect(isBarcode('')).toBe(false);
  });
});
