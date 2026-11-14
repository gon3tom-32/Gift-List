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

import {
  amazonAsin,
  amazonImageForAsin,
  amazonNeedsMore,
  amazonPhoneUrl,
  findPrice,
  isAmazon,
  largerAmazonImage,
  mergeAmazon,
  normalizePrice,
  parsePreview,
  type Preview,
} from './preview.ts';

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
      image: 'https://m.media-amazon.com/images/I/81abc._AC_SL1000_.jpg',
      site: 'Amazon',
      price: null,
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
      price: null,
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
      price: null,
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

describe('prices', () => {
  it('cleans up price text', () => {
    expect(normalizePrice('$1,299.99')).toBe('1299.99');
    expect(normalizePrice('89.9')).toBe('89.90');
    expect(normalizePrice(' US$ 25 ')).toBe('25.00');
    expect(normalizePrice('0')).toBeNull();
    expect(normalizePrice('Free')).toBeNull();
    expect(normalizePrice('250000')).toBeNull();
    expect(normalizePrice(null)).toBeNull();
  });

  it('reads Amazon prices from the price block', () => {
    const page = `<div id="corePrice_feature_div"><span class="a-price aok-align-center priceToPay">
      <span class="a-offscreen">$89.96</span><span aria-hidden="true">$89<sup>96</sup></span></span>
      <span class="a-price a-text-price"><span class="a-offscreen">$109.99</span></span></div>`;
    expect(findPrice(page, true)).toBe('89.96');
    expect(findPrice('<input type="hidden" id="twister-plus-price-data-price" value="64.99">', true)).toBe('64.99');
    expect(findPrice('{"priceAmount":39.95,"currencySymbol":"$"}', true)).toBe('39.95');
  });

  it('ignores an Amazon a-offscreen price outside the main price block', () => {
    expect(findPrice('<div id="similar"><span class="a-offscreen">$5.00</span></div>', true)).toBeNull();
  });

  it('reads meta, microdata and JSON-LD prices from other shops', () => {
    expect(findPrice('<meta property="product:price:amount" content="24.00"><meta property="product:price:currency" content="USD">', false)).toBe('24.00');
    expect(findPrice('<span itemprop="price" content="19.99">$19.99</span>', false)).toBe('19.99');
    expect(findPrice('{"@type":"Offer","price":"49.5","priceCurrency":"USD"}', false)).toBe('49.50');
    expect(findPrice('{"@type":"AggregateOffer","lowPrice":12,"priceCurrency":"USD"}', false)).toBe('12.00');
  });

  it('skips prices in other currencies, and pages with no price', () => {
    expect(findPrice('<meta property="og:price:amount" content="30"><meta property="og:price:currency" content="EUR">', false)).toBeNull();
    expect(findPrice('{"price":"30","priceCurrency":"GBP"}', false)).toBeNull();
    expect(findPrice('<title>Socks</title>', false)).toBeNull();
  });

  it('comes back from parsePreview', () => {
    const page = '<title>Amazon.com: Shaver : Beauty</title><span class="a-price priceToPay"><span class="a-offscreen">$79.00</span></span>';
    expect(parsePreview(page, 'https://www.amazon.com/Shaver/dp/B0BBSBJ4YK').price).toBe('79.00');
  });
});

describe("Amazon's phone layout", () => {
  const url = 'https://www.amazon.com/OUOBOB-Small-Sweater/dp/B0DQPWXMR1';

  it('asks for a bigger copy of an Amazon image', () => {
    expect(largerAmazonImage('https://m.media-amazon.com/images/I/61Abc+xyz._AC_SX38_SY50_.jpg')).toBe(
      'https://m.media-amazon.com/images/I/61Abc+xyz._AC_SL1000_.jpg',
    );
    expect(largerAmazonImage('https://m.media-amazon.com/images/I/61Abc.jpg')).toBe('https://m.media-amazon.com/images/I/61Abc.jpg');
  });

  it('reads the main image on the phone page', () => {
    const page = `<div id="imgTagWrapperId"><img alt="Dog sweater" id="main-image"
      src="https://m.media-amazon.com/images/I/71dog._AC_SX425_.jpg"
      data-a-hires="https://m.media-amazon.com/images/I/71dog._AC_SL1500_.jpg"></div>`;
    expect(parsePreview(page, url).image).toBe('https://m.media-amazon.com/images/I/71dog._AC_SL1000_.jpg');
  });

  it('reads main-image src when there is no hi-res attribute', () => {
    const page = `<img id="main-image" class="a-dynamic-image" src="https://m.media-amazon.com/images/I/81pj._AC_SY300_.jpg">`;
    expect(parsePreview(page, url).image).toBe('https://m.media-amazon.com/images/I/81pj._AC_SL1000_.jpg');
  });

  it('falls back to the first product photo on the page before the old product-code address', () => {
    const page = `<img src="https://m.media-amazon.com/images/G/01/logo.png">
      <script>var data = {"thumb":"https://m.media-amazon.com/images/I/41zz._AC_US40_.jpg"};</script>`;
    expect(parsePreview(page, url).image).toBe('https://m.media-amazon.com/images/I/41zz._AC_SL1000_.jpg');
  });
});

describe('findPrice: Best Buy style pages', () => {
  it('uses the Product offer, not an earlier unrelated price', () => {
    const html = `<script>{"plan":{"price":5.99}}</script>
      <script type="application/ld+json">{"@type":"Product","offers":{"@type":"Offer","priceCurrency":"USD","price":9.99}}</script>`;
    expect(findPrice(html, false)).toBe('9.99');
  });
  it('prefers the current price in embedded page state', () => {
    expect(findPrice('<script>{"price":5.99,"currentPrice":9.99}</script>', false)).toBe('9.99');
  });
});

describe('Amazon titles from the phone page', () => {
  it('keeps the product name and drops the feature list after the bar', () => {
    const html = '<title>Amazon.com : cyeollo Sherpa Dog Coat Reversible Dog Jackets for Small Dogs, Pink, M | Warm Fleece Winter Sweater, Easy On &amp; Off</title>';
    expect(parsePreview(html, 'https://www.amazon.com/gp/aw/d/B09XB8BHTQ').title).toBe(
      'cyeollo Sherpa Dog Coat Reversible Dog Jackets for Small Dogs, Pink, M',
    );
  });
});

describe('Amazon phone page fallback (the main page answers servers with a 503)', () => {
  const asin = 'B09XB8BHTQ';
  const blocked: Preview = {
    title: 'cyeollo Sherpa Dog Coat',
    image: amazonImageForAsin(asin), // the product-code photo, which is often a blank 1-pixel image
    site: 'Amazon',
    price: null,
  };
  const phone: Preview = {
    title: 'cyeollo Sherpa Dog Coat Reversible Dog Jackets for Small Dogs, Pink, M',
    image: 'https://m.media-amazon.com/images/I/71abc._AC_SL1000_.jpg',
    site: 'Amazon',
    price: '24.99',
  };

  it('uses the phone version of the product page', () => {
    expect(amazonPhoneUrl(asin)).toBe('https://www.amazon.com/gp/aw/d/B09XB8BHTQ');
    expect(amazonAsin(amazonPhoneUrl(asin))).toBe(asin);
  });

  it('asks for the phone page when the price or a real photo is missing', () => {
    expect(amazonNeedsMore(blocked, asin)).toBe(true);
    expect(amazonNeedsMore({ ...phone, price: null }, asin)).toBe(true);
    expect(amazonNeedsMore({ ...phone, image: null }, asin)).toBe(true);
    expect(amazonNeedsMore(phone, asin)).toBe(false);
  });

  it('takes the real title, photo and price from the phone page', () => {
    expect(mergeAmazon(blocked, phone, asin)).toEqual(phone);
  });

  it('keeps what the first try found and only fills the gaps', () => {
    const first: Preview = { title: 'First title', image: 'https://m.media-amazon.com/images/I/first.jpg', site: 'Amazon', price: '10.00' };
    const merged = mergeAmazon(first, phone, asin);
    expect(merged.image).toBe('https://m.media-amazon.com/images/I/first.jpg');
    expect(merged.price).toBe('10.00');
  });

  it('falls back to the first result when the phone page is blocked too', () => {
    const phoneBlocked: Preview = { title: null, image: amazonImageForAsin(asin), site: 'Amazon', price: null };
    expect(mergeAmazon(blocked, phoneBlocked, asin)).toEqual(blocked);
  });
});

describe('Amazon phone page: pick the real product photo', () => {
  // From a real page: a small unrelated picture with data-a-hires came first on the page,
  // and the product's own main-image tag came later.
  const html = `<html><head><title>Amazon.com: Clemas Kids Toy Golf Set | Indoor Outdoor</title></head><body>
    <div><img src="https://m.media-amazon.com/images/I/21f+uIHLN1L.jpg" data-a-hires="https://m.media-amazon.com/images/I/21f+uIHLN1L.jpg"></div>
    <img alt="Clemas Kids Toy Golf Set" src="https://m.media-amazon.com/images/I/71R5ZclzmnL._AC_UF350,350_QL50_.jpg" data-fling-asin="B0F1CKN84T" data-fling-refmarker="detail_main_image_block" data-midres-replacement="https://m.media-amazon.com/images/I/71R5ZclzmnL._AC_UF350,350_QL80_.jpg" id="main-image" onload="setCSMReq('af')">
    <ul><li data-a-hires="https://m.media-amazon.com/images/I/71akhC1XgHL._AC_UF894,1000_QL80_.jpg"></li></ul></body></html>`;

  it('uses the main image tag, not an earlier unrelated picture', () => {
    const p = parsePreview(html, 'https://www.amazon.com/gp/aw/d/B0F1CKN84T');
    expect(p.image).toBe('https://m.media-amazon.com/images/I/71R5ZclzmnL._AC_SL1000_.jpg');
    expect(p.title).toBe('Clemas Kids Toy Golf Set');
  });

  it('still finds the photo when the main tag has no hi-res attribute and the id comes last', () => {
    const tag = '<img src="https://m.media-amazon.com/images/I/81abcDEF._AC_SX679_.jpg" alt="x" id="landingImage">';
    expect(parsePreview(tag, 'https://www.amazon.com/dp/B0BBSBJ4YK').image).toBe(
      'https://m.media-amazon.com/images/I/81abcDEF._AC_SL1000_.jpg',
    );
  });

  it('keeps the old fallbacks when there is no main tag', () => {
    const only = '<li data-a-hires="https://m.media-amazon.com/images/I/71akhC1XgHL._AC_UF894,1000_QL80_.jpg"></li>';
    expect(parsePreview(only, 'https://www.amazon.com/dp/B0BBSBJ4YK').image).toBe(
      'https://m.media-amazon.com/images/I/71akhC1XgHL._AC_SL1000_.jpg',
    );
  });
});
