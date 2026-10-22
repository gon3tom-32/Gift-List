import { describe, expect, it } from 'vitest';
import { assertPublicUrl, isPrivateIp, metaContent, setResolver } from './preview.ts';

describe('link preview safety', () => {
  it('flags private and internal addresses', () => {
    for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '192.168.1.1', '169.254.169.254', '0.0.0.0', '100.64.0.1', '::1', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1']) {
      expect(isPrivateIp(ip), ip).toBe(true);
    }
  });

  it('allows public addresses', () => {
    for (const ip of ['8.8.8.8', '151.101.1.69', '2606:4700::1111']) expect(isPrivateIp(ip), ip).toBe(false);
  });

  it('refuses unsafe urls before fetching', async () => {
    await expect(assertPublicUrl('file:///etc/passwd')).rejects.toThrow();
    await expect(assertPublicUrl('http://localhost/')).rejects.toThrow();
    await expect(assertPublicUrl('http://127.0.0.1/')).rejects.toThrow();
    await expect(assertPublicUrl('http://[::1]/')).rejects.toThrow();
    await expect(assertPublicUrl('http://169.254.169.254/latest/meta-data')).rejects.toThrow();
    await expect(assertPublicUrl('http://user:pw@example.com/')).rejects.toThrow();
    await expect(assertPublicUrl('http://example.com:8080/')).rejects.toThrow();
  });

  it('reads Open Graph tags in either attribute order', () => {
    const html = `<meta property="og:title" content="Cozy &amp; Warm Socks"><meta content="https://x.test/a.jpg" property="og:image">`;
    expect(metaContent(html, ['og:title'])).toBe('Cozy & Warm Socks');
    expect(metaContent(html, ['og:image'])).toBe('https://x.test/a.jpg');
    expect(metaContent(html, ['og:site_name'])).toBeNull();
  });
});

describe('DNS checks', () => {
  it('refuses a name that resolves to a private address', async () => {
    setResolver(async () => ['10.0.0.5']);
    await expect(assertPublicUrl('https://sneaky.example/')).rejects.toThrow();
    setResolver(async () => ['93.184.216.34', '::1']);
    await expect(assertPublicUrl('https://mixed.example/')).rejects.toThrow();
  });

  it('allows a name that resolves to public addresses', async () => {
    setResolver(async () => ['93.184.216.34']);
    await expect(assertPublicUrl('https://shop.example/item')).resolves.toBeInstanceOf(URL);
  });

  it('still blocks literal private IPs when DNS is unavailable', async () => {
    setResolver(async () => null);
    await expect(assertPublicUrl('http://192.168.0.1/')).rejects.toThrow();
    await expect(assertPublicUrl('http://2130706433/')).rejects.toThrow(); // 127.0.0.1 in disguise
  });
});
