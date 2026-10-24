import { describe, expect, it } from 'vitest';
import { buildWidgetScript } from './widget';

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor as new (body: string) => unknown;

describe('buildWidgetScript', () => {
  const link = 'https://example.supabase.co/functions/v1/send-push?widget=abc.def';
  const site = 'https://gon3tom-32.github.io/Gift-List/';

  it('puts the link and the site address in the script', () => {
    const script = buildWidgetScript(link, site);
    expect(script).toContain(JSON.stringify(link));
    expect(script).toContain(JSON.stringify(site));
    expect(script).not.toContain('__LINK__');
    expect(script).not.toContain('__SITE__');
  });

  it('is valid JavaScript (Scriptable runs it with await at the top)', () => {
    expect(() => new AsyncFunction(buildWidgetScript(link, site))).not.toThrow();
  });

  it('cannot be broken by quotes or dollar signs in the address', () => {
    const odd = 'https://x.test/a"b$&c';
    const script = buildWidgetScript(odd, site);
    expect(() => new AsyncFunction(script)).not.toThrow();
    expect(script).toContain(JSON.stringify(odd));
  });

  it('never contains a secret-looking key', () => {
    expect(buildWidgetScript(link, site)).not.toMatch(/service_role|PUSH_SECRET|VAPID/i);
  });
});
