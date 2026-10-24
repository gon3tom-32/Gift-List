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

const data = await load();
const family = config.widgetFamily || "medium";
const w = new ListWidget();
w.url = SITE;
w.refreshAfterDate = new Date(Date.now() + 30 * 60 * 1000);

function line(text, size, weight, color) {
  const t = w.addText(text);
  t.font = weight === "bold" ? Font.boldRoundedSystemFont(size) : Font.semiboldRoundedSystemFont(size);
  if (color) t.textColor = color;
  t.lineLimit = 1;
  t.minimumScaleFactor = 0.6;
  return t;
}

const days = data ? (data.days === 0 ? "Merry Christmas!" : data.days + (data.days === 1 ? " day" : " days")) : "";
const open = data ? data.open + (data.open === 1 ? " gift open" : " gifts open") : "";
const left = data && data.hasBudget ? data.leftText + " left" : "";

if (family.indexOf("accessory") === 0) {
  w.addAccessoryWidgetBackground = true;
  line("Gift-List", 12, "semibold");
  if (!data) {
    line("Can't reach it", 13, "semibold");
  } else {
    line(days + " to go", 15, "bold");
    line(open, 12, "semibold");
  }
} else {
  w.backgroundColor = new Color("#18806a");
  w.setPadding(14, 14, 14, 14);
  line("Gift-List", 13, "semibold", new Color("#ffffff", 0.85));
  w.addSpacer(4);
  if (!data) {
    line("Can't reach Gift-List", 15, "semibold", Color.white());
  } else {
    const big = family === "small" ? 34 : 42;
    line(days, big, "bold", Color.white());
    line(data.days === 0 ? "" : "to Christmas", 14, "semibold", new Color("#ffffff", 0.9));
    w.addSpacer(6);
    line(open, 15, "semibold", Color.white());
    if (left) line(left, 15, "semibold", data.leftCents < 0 ? new Color("#ffd6e4") : Color.white());
  }
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
