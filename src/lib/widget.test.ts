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
  function run(family: string, data: unknown, edit: (script: string) => string = (x) => x) {
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
      drawImageInRect() {},
      setTextAlignedLeft() {},
      addPath() {},
      fillPath() {},
      setStrokeColor() {},
      setLineWidth() {},
      strokeEllipse() {},
      getImage: () => ({}),
    });
    const names = ['config', 'Request', 'ListWidget', 'Font', 'Color', 'Size', 'Rect', 'DrawContext', 'Script', 'Path', 'Point', 'Device'];
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
      { screenSize: () => ({ width: 390, height: 844 }) },
    ];
    const fn = new AsyncFunction(...names, edit(buildWidgetScript('https://x.test/l?widget=a.b', 'https://site.test/Gift-List/'))) as (
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
    // The medium widget is drawn as one picture, so its words are drawn text rather than stack text.
    expect(out.draws).toContain('Gift List');
    expect(out.draws).toContain('63');
    expect(out.draws).toContain('5 gifts open');
    expect(out.draws).toContain('$892 left');
    expect(out.draws).toContain('Andrew');
    expect(out.draws).toContain('A');
    expect(out.draws).toContain('✓');
  });

  const withGroups = {
    ...sample,
    groups: [
      { id: 'g1', name: 'Coworkers', initial: 'C', color: '#2f6fa8', total: 4, remaining: 3 },
      { id: 'g2', name: 'Our family', initial: 'O', color: '#18806a', total: 4, remaining: 0 },
    ],
  };

  it('draws groups, with a number for people still waiting and a check when all are done', async () => {
    const out = await run('medium', withGroups);
    expect(out.draws).toContain('Coworkers');
    expect(out.draws).toContain('Our family');
    expect(out.draws).toContain('C');
    expect(out.draws).toContain('3');
    expect(out.draws).toContain('✓');
    // groups have no page of their own, so no person links
    expect(out.urls.some((u) => u.includes('#/person/'))).toBe(false);
    // and the people are not drawn
    expect(out.draws).not.toContain('Andrew');
  });

  it('falls back to people when the server sends no groups (an older server)', async () => {
    const out = await run('medium', sample);
    expect(out.draws).toContain('Andrew');
  });

  it('shows people when the script is switched to "people"', async () => {
    const out = await run('medium', withGroups, (script) => script.replace('const SHOW = "groups";', 'const SHOW = "people";'));
    expect(out.draws).toContain('Andrew');
    expect(out.draws).not.toContain('Coworkers');
  });

  it('copes with no people, a failed link, small and Lock Screen sizes', async () => {
    await expect(run('medium', { ...sample, people: [] })).resolves.toBeDefined();
    await expect(run('medium', null)).resolves.toBeDefined();
    await expect(run('small', sample)).resolves.toBeDefined();
    await expect(run('accessoryRectangular', sample)).resolves.toBeDefined();
    await expect(run('medium', { ...sample, days: 0 })).resolves.toBeDefined();
  });
});
