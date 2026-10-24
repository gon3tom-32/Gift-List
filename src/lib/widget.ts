import { supabase } from './supabase';

/** Asks the server for this person's private widget link. */
export async function requestWidgetLink(): Promise<string> {
  const { data: auth } = await supabase.auth.getSession();
  const token = auth.session?.access_token;
  if (!token) throw new Error('Sign in first.');
  let res: Response;
  try {
    res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-push`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ kind: 'widget_link' }),
    });
  } catch {
    throw new Error('Could not reach the server. Check your connection and try again.');
  }
  const body = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
  if (!res.ok || !body.url) throw new Error(body.error ?? 'Could not make your widget link.');
  return body.url;
}

const SCRIPT = `// Gift-List widget for Scriptable
const LINK = __LINK__;
const SITE = __SITE__;
const MINT = "#18806a";

async function load() {
  try {
    const req = new Request(LINK);
    req.timeoutInterval = 15;
    const data = await req.loadJSON();
    if (typeof data.days !== "number") throw new Error("bad data");
    return data;
  } catch (e) {
    return null;
  }
}

// A coloured circle with the person's initial and a small status badge.
function avatar(person) {
  const size = 88;
  const ctx = new DrawContext();
  ctx.size = new Size(size, size);
  ctx.opaque = false;
  ctx.respectScreenScale = true;
  ctx.setFillColor(new Color(person.color));
  ctx.fillEllipse(new Rect(0, 0, size, size));
  ctx.setTextColor(Color.white());
  ctx.setFont(Font.boldRoundedSystemFont(38));
  ctx.setTextAlignedCenter();
  ctx.drawTextInRect(person.initial, new Rect(0, 20, size, 48));
  const d = 32;
  const x = size - d;
  const y = size - d;
  if (person.status === "none") {
    ctx.setFillColor(new Color(MINT));
    ctx.fillEllipse(new Rect(x, y, d, d));
    ctx.setStrokeColor(Color.white());
    ctx.setLineWidth(4);
    ctx.strokeEllipse(new Rect(x + 3, y + 3, d - 6, d - 6));
  } else {
    const fill = person.status === "ideas" ? "#ffd6e4" : person.status === "partly" ? "#fff1b8" : "#bff0e3";
    ctx.setFillColor(new Color(fill));
    ctx.fillEllipse(new Rect(x, y, d, d));
    if (person.status === "bought") {
      ctx.setTextColor(new Color("#0f5e4e"));
      ctx.setFont(Font.boldSystemFont(22));
      ctx.drawTextInRect("✓", new Rect(x, y + 3, d, d));
    }
  }
  return ctx.getImage();
}

// The app's tag logo as a small mint tile.
function logo(px) {
  const ctx = new DrawContext();
  ctx.size = new Size(px, px);
  ctx.opaque = false;
  ctx.respectScreenScale = true;
  ctx.setFillColor(new Color("#2bb59a"));
  const tile = new Path();
  tile.addRoundedRect(new Rect(0, 0, px, px), px * 0.28, px * 0.28);
  ctx.addPath(tile);
  ctx.fillPath();
  const u = px / 120;
  const tag = new Path();
  tag.move(new Point(44 * u, 14 * u));
  tag.addLine(new Point(76 * u, 14 * u));
  tag.addLine(new Point(92 * u, 30 * u));
  tag.addLine(new Point(92 * u, 102 * u));
  tag.addLine(new Point(28 * u, 102 * u));
  tag.addLine(new Point(28 * u, 30 * u));
  tag.closeSubpath();
  ctx.addPath(tag);
  ctx.setFillColor(Color.white());
  ctx.fillPath();
  ctx.setFillColor(new Color("#2bb59a"));
  ctx.fillEllipse(new Rect(54 * u, 21 * u, 12 * u, 12 * u));
  ctx.setFillColor(new Color("#2bb59a"));
  ctx.fillRect(new Rect(43 * u, 64 * u, 34 * u, 28 * u));
  ctx.setFillColor(new Color(MINT));
  ctx.fillRect(new Rect(57 * u, 58 * u, 6 * u, 34 * u));
  return ctx.getImage();
}

// A red and white candy-cane stripe for the bottom edge.
function stripe(width, height) {
  const ctx = new DrawContext();
  ctx.size = new Size(width, height);
  ctx.opaque = true;
  ctx.respectScreenScale = true;
  ctx.setFillColor(Color.white());
  ctx.fillRect(new Rect(0, 0, width, height));
  ctx.setFillColor(new Color("#d94b5c"));
  for (let x = -height; x < width + height; x += height * 2) {
    const band = new Path();
    band.move(new Point(x, height));
    band.addLine(new Point(x + height, height));
    band.addLine(new Point(x + height * 2, 0));
    band.addLine(new Point(x + height, 0));
    band.closeSubpath();
    ctx.addPath(band);
    ctx.fillPath();
  }
  return ctx.getImage();
}

// The title with the logo beside it.
function title(stack, size) {
  const row = stack.addStack();
  row.layoutHorizontally();
  row.centerAlignContent();
  const mark = row.addImage(logo(44));
  mark.imageSize = new Size(size + 6, size + 6);
  row.addSpacer(5);
  add(row, "Gift-List", size, "semibold", new Color("#ffffff", 0.92));
  return row;
}

const data = await load();
const family = config.widgetFamily || "medium";
const w = new ListWidget();
w.url = SITE;
w.refreshAfterDate = new Date(Date.now() + 30 * 60 * 1000);

function add(stack, text, size, weight, color) {
  const t = stack.addText(text);
  t.font = weight === "bold" ? Font.boldRoundedSystemFont(size) : Font.semiboldRoundedSystemFont(size);
  if (color) t.textColor = color;
  t.lineLimit = 1;
  t.minimumScaleFactor = 0.6;
  return t;
}

const days = data ? (data.days === 0 ? "Merry Christmas!" : data.days + (data.days === 1 ? " day" : " days")) : "";
const open = data ? data.open + (data.open === 1 ? " gift open" : " gifts open") : "";
const left = data && data.hasBudget ? data.leftText + " left" : "";
const people = data && data.people ? data.people : [];

if (family.indexOf("accessory") === 0) {
  w.addAccessoryWidgetBackground = true;
  add(w, "Gift-List", 12, "semibold");
  if (!data) {
    add(w, "Can't reach it", 13, "semibold");
  } else {
    add(w, days + " to go", 15, "bold");
    add(w, open, 12, "semibold");
  }
} else if (family === "medium" && data && people.length > 0) {
  // Left: the countdown on a deeper mint panel. Right: the people who most need a gift.
  w.backgroundColor = new Color(MINT);
  w.setPadding(0, 0, 0, 0);
  w.spacing = 0;
  const row = w.addStack();
  row.layoutHorizontally();
  row.size = new Size(0, 140);
  const side = row.addStack();
  side.layoutVertically();
  side.backgroundColor = new Color("#126652");
  side.size = new Size(116, 140);
  side.setPadding(10, 11, 8, 8);
  title(side, 12);
  side.addSpacer();
  add(side, String(data.days), 36, "bold", Color.white());
  add(side, data.days === 0 ? "Merry Christmas!" : "days to Christmas", 12, "semibold", new Color("#ffffff", 0.9));
  side.addSpacer(5);
  add(side, open, 13, "semibold", Color.white());
  if (left) add(side, left, 13, "semibold", data.leftCents < 0 ? new Color("#ffd6e4") : Color.white());
  const grid = row.addStack();
  grid.layoutVertically();
  grid.setPadding(10, 8, 4, 4);
  for (let r = 0; r < 2; r++) {
    const line = grid.addStack();
    line.layoutHorizontally();
    for (let c = 0; c < 3; c++) {
      const person = people[r * 3 + c];
      const tile = line.addStack();
      tile.layoutVertically();
      tile.centerAlignContent();
      tile.size = new Size(58, 60);
      if (person) {
        tile.url = SITE + "#/person/" + person.id;
        const img = tile.addImage(avatar(person));
        img.imageSize = new Size(38, 38);
        tile.addSpacer(3);
        add(tile, person.name, 11, "semibold", Color.white());
      }
    }
    if (r === 0) grid.addSpacer(4);
  }
  const bar = w.addImage(stripe(400, 8));
  bar.imageSize = new Size(400, 8);
} else {
  w.backgroundColor = new Color(MINT);
  w.setPadding(14, 14, 0, 14);
  title(w, 13);
  w.addSpacer(4);
  if (!data) {
    add(w, "Can't reach Gift-List", 15, "semibold", Color.white());
  } else {
    add(w, days, family === "small" ? 34 : 42, "bold", Color.white());
    add(w, data.days === 0 ? "" : "to Christmas", 14, "semibold", new Color("#ffffff", 0.9));
    w.addSpacer(6);
    add(w, open, 15, "semibold", Color.white());
    if (left) add(w, left, 15, "semibold", data.leftCents < 0 ? new Color("#ffd6e4") : Color.white());
  }
  w.addSpacer();
  const bottom = w.addImage(stripe(400, 8));
  bottom.imageSize = new Size(400, 8);
}

if (config.runsInWidget) {
  Script.setWidget(w);
} else {
  await w.presentMedium();
}
Script.complete();
`;

/** The Scriptable script with this person's private link filled in. */
export function buildWidgetScript(linkUrl: string, siteUrl: string): string {
  return SCRIPT.replace('__LINK__', () => JSON.stringify(linkUrl)).replace('__SITE__', () => JSON.stringify(siteUrl));
}
