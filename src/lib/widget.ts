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

// A coloured circle with the person's initial and a small status badge, drawn into ctx.
function drawAvatar(ctx, person, x, y, d) {
  ctx.setFillColor(new Color(person.color));
  ctx.fillEllipse(new Rect(x, y, d, d));
  // A white ring, so a circle is still visible when its colour matches the background.
  ctx.setStrokeColor(new Color("#ffffff", 0.9));
  ctx.setLineWidth(2);
  ctx.strokeEllipse(new Rect(x + 1, y + 1, d - 2, d - 2));
  ctx.setTextColor(Color.white());
  ctx.setFont(Font.boldRoundedSystemFont(d * 0.44));
  ctx.setTextAlignedCenter();
  ctx.drawTextInRect(person.initial, new Rect(x, y + d * 0.22, d, d * 0.56));
  const b = d * 0.36;
  const bx = x + d - b;
  const by = y + d - b;
  if (person.status === "none") {
    ctx.setFillColor(new Color(MINT));
    ctx.fillEllipse(new Rect(bx, by, b, b));
    ctx.setStrokeColor(Color.white());
    ctx.setLineWidth(b * 0.12);
    ctx.strokeEllipse(new Rect(bx + b * 0.1, by + b * 0.1, b * 0.8, b * 0.8));
  } else {
    const fill = person.status === "ideas" ? "#ffd6e4" : person.status === "partly" ? "#fff1b8" : "#bff0e3";
    ctx.setFillColor(new Color(fill));
    ctx.fillEllipse(new Rect(bx, by, b, b));
    if (person.status === "bought") {
      ctx.setTextColor(new Color("#0f5e4e"));
      ctx.setFont(Font.boldSystemFont(b * 0.7));
      ctx.setTextAlignedCenter();
      ctx.drawTextInRect("\u2713", new Rect(bx, by + b * 0.08, b, b));
    }
  }
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

// A red and white candy-cane stripe, drawn into ctx along the bottom edge.
function drawStripe(ctx, width, top, height) {
  ctx.setFillColor(Color.white());
  ctx.fillRect(new Rect(0, top, width, height));
  ctx.setFillColor(new Color("#d94b5c"));
  for (let x = -height; x < width + height; x += height * 2) {
    const band = new Path();
    band.move(new Point(x, top + height));
    band.addLine(new Point(x + height, top + height));
    band.addLine(new Point(x + height * 2, top));
    band.addLine(new Point(x + height, top));
    band.closeSubpath();
    ctx.addPath(band);
    ctx.fillPath();
  }
}

// A stripe as its own image, for the small widget.
function stripe(width, height) {
  const ctx = new DrawContext();
  ctx.size = new Size(width, height);
  ctx.opaque = true;
  ctx.respectScreenScale = true;
  drawStripe(ctx, width, 0, height);
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

// iPhone medium widget sizes in points, by the phone's screen height.
function mediumSize() {
  const screen = Device.screenSize();
  const h = Math.max(screen.width, screen.height);
  const table = { 932: [364, 170], 926: [364, 170], 896: [360, 169], 852: [338, 158], 844: [338, 158], 812: [329, 155], 736: [348, 157], 667: [322, 150], 568: [292, 141] };
  return table[h] || [338, 158];
}

// The whole medium widget as one picture, so nothing can shift or clip.
function drawMedium(data, people, open, left, days) {
  const size = mediumSize();
  const W = size[0];
  const H = size[1];
  const LW = 114;
  const bar = 8;
  const ctx = new DrawContext();
  ctx.size = new Size(W, H);
  ctx.opaque = true;
  ctx.respectScreenScale = true;
  ctx.setFillColor(new Color(MINT));
  ctx.fillRect(new Rect(0, 0, W, H));
  ctx.setFillColor(new Color("#126652"));
  ctx.fillRect(new Rect(0, 0, LW, H - bar));
  // Left panel: logo and title, the countdown, gifts open, money left
  ctx.drawImageInRect(logo(44), new Rect(12, 11, 20, 20));
  ctx.setTextAlignedLeft();
  ctx.setFont(Font.semiboldRoundedSystemFont(13));
  ctx.setTextColor(new Color("#ffffff", 0.92));
  ctx.drawTextInRect("Gift-List", new Rect(37, 13, LW - 42, 18));
  ctx.setFont(Font.boldRoundedSystemFont(40));
  ctx.setTextColor(Color.white());
  ctx.drawTextInRect(String(data.days), new Rect(12, 38, LW - 16, 46));
  ctx.setFont(Font.semiboldRoundedSystemFont(11));
  ctx.setTextColor(new Color("#ffffff", 0.9));
  ctx.drawTextInRect(data.days === 0 ? "Merry Christmas!" : "days to Christmas", new Rect(12, 85, LW - 18, 16));
  ctx.setFont(Font.semiboldRoundedSystemFont(13));
  ctx.setTextColor(Color.white());
  ctx.drawTextInRect(open, new Rect(12, 104, LW - 14, 17));
  if (left) {
    ctx.setTextColor(data.leftCents < 0 ? new Color("#ffd6e4") : Color.white());
    ctx.drawTextInRect(left, new Rect(12, 121, LW - 14, 17));
  }
  // Right: the six people who most need a gift, in a 3 x 2 grid
  const gx = LW + 6;
  const colW = (W - gx - 6) / 3;
  const rowH = (H - bar - 8) / 2;
  const d = 40;
  for (let i = 0; i < 6 && i < people.length; i++) {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const cx = gx + col * colW + (colW - d) / 2;
    const cy = 8 + row * rowH + 6;
    drawAvatar(ctx, people[i], cx, cy, d);
    ctx.setTextAlignedCenter();
    ctx.setFont(Font.semiboldRoundedSystemFont(11));
    ctx.setTextColor(Color.white());
    ctx.drawTextInRect(people[i].name, new Rect(gx + col * colW, cy + d + 3, colW, 15));
  }
  drawStripe(ctx, W, H - bar, bar);
  return { image: ctx.getImage(), W: W, H: H, LW: LW, bar: bar, gx: gx, colW: colW, rowH: rowH };
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
  const m = drawMedium(data, people, open, left, days);
  w.backgroundImage = m.image;
  w.setPadding(0, 0, 0, 0);
  w.spacing = 0;
  // Invisible tap targets over each person; tapping anywhere else opens the site.
  const row = w.addStack();
  row.layoutHorizontally();
  row.size = new Size(m.W, m.H - m.bar);
  const pad = row.addStack();
  pad.size = new Size(m.gx, m.H - m.bar);
  const grid = row.addStack();
  grid.layoutVertically();
  grid.size = new Size(m.W - m.gx, m.H - m.bar);
  grid.setPadding(8, 0, 0, 0);
  for (let r = 0; r < 2; r++) {
    const line = grid.addStack();
    line.layoutHorizontally();
    line.size = new Size(m.W - m.gx, m.rowH);
    for (let c = 0; c < 3; c++) {
      const person = people[r * 3 + c];
      const tile = line.addStack();
      tile.size = new Size(m.colW, m.rowH);
      if (person) tile.url = SITE + "#/person/" + person.id;
    }
  }
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
