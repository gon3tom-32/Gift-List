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

import { amazonAsin, isAmazon, parsePreview } from './preview.ts';

describe('Amazon previews', () => {
  const productUrl = 'https://www.amazon.com/LEGO-Treehouse-Building-Set/dp/B0BBSBJ4YK?ref_=abc&th=1';

  it('spots Amazon links and product codes', () => {
    expect(isAmazon('https://a.co/d/06Vunw9N')).toBe(true);
    expect(isAmazon('https://www.amazon.co.uk/dp/B0BBSBJ4YK')).toBe(true);
    expect(isAmazon('https://notamazon.com/dp/B0BBSBJ4YK')).toBe(false);
    expect(amazonAsin(productUrl)).toBe('B0BBSBJ4YK');
    expect(amazonAsin('https://www.amazon.com/gp/product/B07FZ8S74R/ref=x')).toBe('B07FZ8S74R');
    expect(amazonAsin('https://www.amazon.com/gp/aw/d/B07FZ8S74R')).toBe('B07FZ8S74R');
    expect(amazonAsin('https://www.amazon.com/s?k=lego')).toBeNull();
  });

  it('reads the product photo from the page markup and cleans the title', () => {
    const html = `<html><head><title>Amazon.com: LEGO Ideas Treehouse 21318 : Toys &amp; Games</title>
      <meta name="title" content="Amazon.com: LEGO Ideas Treehouse 21318 : Toys &amp; Games"></head>
      <body><img id="landingImage" data-old-hires="https://m.media-amazon.com/images/I/81abc._AC_SL1500_.jpg"
        data-a-dynamic-image="{&quot;https://m.media-amazon.com/images/I/81abc._AC_SX679_.jpg&quot;:[679,679]}"></body></html>`;
    expect(parsePreview(html, productUrl)).toEqual({
      title: 'LEGO Ideas Treehouse 21318',
      image: 'https://m.media-amazon.com/images/I/81abc._AC_SL1500_.jpg',
      site: 'Amazon',
    });
  });

  it('uses the dynamic image list when there is no hi-res attribute', () => {
    const html = `<img id="landingImage" data-a-dynamic-image="{&quot;https://m.media-amazon.com/images/I/71x.jpg&quot;:[500,500]}">`;
    expect(parsePreview(html, productUrl).image).toBe('https://m.media-amazon.com/images/I/71x.jpg');
  });

  it('falls back to the product code and the link words when Amazon blocks us', () => {
    const robot = '<html><head><title>Robot Check</title></head><body>Type the characters you see</body></html>';
    expect(parsePreview(robot, productUrl)).toEqual({
      title: 'LEGO Treehouse Building Set',
      image: 'https://images-na.ssl-images-amazon.com/images/P/B0BBSBJ4YK.01.L.jpg',
      site: 'Amazon',
    });
  });

  it('still gives a picture when the page could not be read at all', () => {
    expect(parsePreview('', 'https://www.amazon.com/dp/B07FZ8S74R').image).toBe(
      'https://images-na.ssl-images-amazon.com/images/P/B07FZ8S74R.01.L.jpg',
    );
  });

  it('keeps other shops working, with image_src and JSON-LD fallbacks', () => {
    expect(parsePreview('<meta property="og:image" content="/img/a.jpg"><title>Socks</title>', 'https://shop.test/p/1')).toEqual({
      title: 'Socks',
      image: 'https://shop.test/img/a.jpg',
      site: null,
    });
    expect(parsePreview('<link rel="image_src" href="https://cdn.test/b.png">', 'https://shop.test/p/2').image).toBe(
      'https://cdn.test/b.png',
    );
    expect(
      parsePreview('<script type="application/ld+json">{"@type":"Product","image":["https:\\/\\/cdn.test\\/c.jpg"]}</script>', 'https://shop.test/p/3').image,
    ).toBe('https://cdn.test/c.jpg');
  });
});

describe('JSON-LD image shapes', () => {
  it('reads plain, escaped and object forms', () => {
    expect(parsePreview('{"image":"https://cdn.test/d.jpg"}', 'https://shop.test/').image).toBe('https://cdn.test/d.jpg');
    expect(parsePreview('{"image":{"@type":"ImageObject","url":"https://cdn.test/e.jpg"}}', 'https://shop.test/').image).toBe(
      'https://cdn.test/e.jpg',
    );
  });
});
