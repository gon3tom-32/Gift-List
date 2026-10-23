import { describe, expect, it } from 'vitest';
import { parseRoute, parseShare } from './route';

describe('parseRoute', () => {
  it('keeps the existing routes', () => {
    expect(parseRoute('#/')).toEqual({ name: 'people' });
    expect(parseRoute('#/gifts')).toEqual({ name: 'gifts' });
    expect(parseRoute('#/person/abc')).toEqual({ name: 'person', id: 'abc' });
    expect(parseRoute('')).toEqual({ name: 'people' });
  });

  it('reads an encoded shared link', () => {
    const shared = 'https://www.target.com/p/cozy-socks/-/A-123?ref=x&tag=y';
    expect(parseRoute('#/add?url=' + encodeURIComponent(shared))).toEqual({ name: 'add', url: shared, text: null });
  });

  it('reads a link that was not encoded, keeping its own & parts', () => {
    expect(parseRoute('#/add?url=https://amazon.com/dp/B01?ref=a&tag=b')).toEqual({
      name: 'add',
      url: 'https://amazon.com/dp/B01?ref=a&tag=b',
      text: null,
    });
  });

  it('opens add with nothing when there is nothing shared', () => {
    expect(parseRoute('#/add')).toEqual({ name: 'add', url: null, text: null });
  });
});

describe('parseShare', () => {
  it('finds the link inside shared text and keeps the words as a name hint', () => {
    expect(parseShare('url=' + encodeURIComponent('Check out Lego Treehouse https://a.co/d/abc123'))).toEqual({
      url: 'https://a.co/d/abc123',
      text: 'Check out Lego Treehouse',
    });
  });

  it('accepts text= as well', () => {
    expect(parseShare('text=' + encodeURIComponent('Fuzzy slippers (https://shop.example/s).'))).toEqual({
      url: 'https://shop.example/s',
      text: 'Fuzzy slippers',
    });
  });

  it('treats text with no link as just the idea name', () => {
    expect(parseShare('url=' + encodeURIComponent('A warm scarf'))).toEqual({ url: null, text: 'A warm scarf' });
  });

  it('survives junk', () => {
    expect(parseShare('url=%E0%A4%A')).toEqual({ url: null, text: '%E0%A4%A' });
    expect(parseShare('')).toEqual({ url: null, text: null });
  });
});
