import { describe, expect, it } from 'vitest';
import { buildWidgetScript } from './widget';

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor as new (...args: string[]) => unknown;

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

describe('the widget script when it runs', () => {
  // Stand-ins for Scriptable's objects, so the layout code is actually executed.
  function run(family: string, data: unknown) {
    const urls: string[] = [];
    const texts: string[] = [];
    const draws: string[] = [];
    const stack = (): Record<string, unknown> => {
      const s: Record<string, unknown> = {
        layoutHorizontally() {},
        layoutVertically() {},
        centerAlignContent() {},
        setPadding() {},
        addSpacer() {},
        addText(t: string) {
          texts.push(t);
          return {};
        },
        addImage() {
          return {};
        },
        addStack: () => stack(),
      };
      Object.defineProperty(s, 'url', { set: (u: string) => urls.push(u) });
      return s;
    };
    const widget = stack();
    widget.addAccessoryWidgetBackground = false;
    const font = { boldRoundedSystemFont: () => ({}), semiboldRoundedSystemFont: () => ({}), boldSystemFont: () => ({}) };
    const Color = Object.assign(function () {} as unknown as new (...a: unknown[]) => object, { white: () => ({}) });
    const ctx = () => ({
      setFillColor() {},
      fillEllipse() {},
      setTextColor() {},
      setFont() {},
      setTextAlignedCenter() {},
      drawTextInRect: (t: string) => draws.push(t),
      fillRect() {},
      addPath() {},
      fillPath() {},
      setStrokeColor() {},
      setLineWidth() {},
      strokeEllipse() {},
      getImage: () => ({}),
    });
    const names = ['config', 'Request', 'ListWidget', 'Font', 'Color', 'Size', 'Rect', 'DrawContext', 'Script', 'Path', 'Point'];
    const args = [
      { widgetFamily: family, runsInWidget: true },
      function () {
        return { loadJSON: async () => data };
      },
      function () {
        return widget;
      },
      font,
      Color,
      function () {},
      function () {},
      function () {
        return ctx();
      },
      { setWidget() {}, complete() {} },
      function () {
        return { addRoundedRect() {}, move() {}, addLine() {}, closeSubpath() {} };
      },
      function () {},
    ];
    const fn = new AsyncFunction(...names, buildWidgetScript('https://x.test/l?widget=a.b', 'https://site.test/Gift-List/')) as (
      ...a: unknown[]
    ) => Promise<void>;
    return fn(...args).then(() => ({ urls, texts, draws }));
  }

  const sample = {
    days: 63,
    open: 5,
    hasBudget: true,
    leftText: '$892',
    leftCents: 89200,
    people: [
      { id: 'p1', name: 'Andrew', initial: 'A', color: '#18806a', status: 'none' },
      { id: 'p2', name: 'Ben', initial: 'B', color: '#b8426f', status: 'ideas' },
      { id: 'p3', name: 'Lily', initial: 'L', color: '#6f52b8', status: 'partly' },
      { id: 'p4', name: 'Zoe', initial: 'Z', color: '#b4562c', status: 'bought' },
    ],
  };

  it('draws the medium grid and links each tile to its person', async () => {
    const out = await run('medium', sample);
    expect(out.urls).toContain('https://site.test/Gift-List/#/person/p1');
    expect(out.urls).toContain('https://site.test/Gift-List/#/person/p4');
    expect(out.texts).toContain('63');
    expect(out.texts).toContain('5 gifts open');
    expect(out.texts).toContain('$892 left');
    expect(out.texts).toContain('Andrew');
    expect(out.draws).toContain('A');
    expect(out.draws).toContain('✓');
  });

  it('copes with no people, a failed link, small and Lock Screen sizes', async () => {
    await expect(run('medium', { ...sample, people: [] })).resolves.toBeDefined();
    await expect(run('medium', null)).resolves.toBeDefined();
    await expect(run('small', sample)).resolves.toBeDefined();
    await expect(run('accessoryRectangular', sample)).resolves.toBeDefined();
    await expect(run('medium', { ...sample, days: 0 })).resolves.toBeDefined();
  });
});
