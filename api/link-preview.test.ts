import { describe, expect, it } from 'vitest';
import { assertPublicUrl, isPrivateIp, metaContent } from './link-preview';

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
