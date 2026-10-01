import { skuFromFilename, skuKey } from './skuFromFilename';

describe('bulk photo file name → SKU', () => {
  it('takes the whole name before the extension as the SKU', () => {
    expect(skuFromFilename('PARA-500.jpg')).toEqual({ ok: true, sku: 'PARA-500', ext: 'jpg', mimetype: 'image/jpeg' });
    expect(skuFromFilename('amox.250.JPEG')).toEqual({ ok: true, sku: 'amox.250', ext: 'jpeg', mimetype: 'image/jpeg' });
    expect(skuFromFilename('X1.PNG')).toMatchObject({ ok: true, sku: 'X1', mimetype: 'image/png' });
    expect(skuFromFilename('X1.webp')).toMatchObject({ ok: true, sku: 'X1', mimetype: 'image/webp' });
  });

  it('ignores folder parts and surrounding spaces', () => {
    expect(skuFromFilename('photos/batch1/PARA-500.png')).toMatchObject({ ok: true, sku: 'PARA-500' });
    expect(skuFromFilename('C:\\pics\\PARA-500.png')).toMatchObject({ ok: true, sku: 'PARA-500' });
    expect(skuFromFilename(' PARA-500 .png')).toMatchObject({ ok: true, sku: 'PARA-500' });
  });

  it('refuses other types and names without a SKU', () => {
    expect(skuFromFilename('PARA-500.gif')).toMatchObject({ ok: false });
    expect(skuFromFilename('PARA-500.pdf')).toMatchObject({ ok: false });
    expect(skuFromFilename('PARA-500')).toMatchObject({ ok: false });
    expect(skuFromFilename('.png')).toMatchObject({ ok: false });
    expect(skuFromFilename(' .png')).toMatchObject({ ok: false });
    expect(skuFromFilename('')).toMatchObject({ ok: false });
    expect(skuFromFilename(`${'A'.repeat(101)}.png`)).toMatchObject({ ok: false });
  });

  it('matches SKUs without regard to case', () => {
    expect(skuKey('para-500')).toBe(skuKey('PARA-500 '));
  });
});
