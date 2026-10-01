import { linkEndpoint } from './storage.service';

describe('signed link address', () => {
  it('AWS S3: the SDK default (no endpoint)', () => {
    expect(linkEndpoint({ S3_PUBLIC_ENDPOINT: 'https://files.example.in' } as NodeJS.ProcessEnv)).toBeUndefined();
  });
  it('S3-compatible store: links name the public address, not the internal one', () => {
    expect(linkEndpoint({ S3_ENDPOINT: 'http://objectstore:9000', S3_PUBLIC_ENDPOINT: 'https://files.1-2-3-4.sslip.io' } as NodeJS.ProcessEnv))
      .toBe('https://files.1-2-3-4.sslip.io');
    expect(linkEndpoint({ S3_ENDPOINT: 'http://127.0.0.1:4890' } as NodeJS.ProcessEnv)).toBe('http://127.0.0.1:4890');
  });
});
