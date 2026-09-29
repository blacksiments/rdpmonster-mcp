import {
  RDPMONSTER_BASE_URL,
  RDPMONSTER_STORE_GROUPS,
  storeGroupUrl,
  storeProductUrl,
} from "./constants.js";

function stripTags(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

async function followGet(session, url) {
  let res = await session.get(url, { redirect: "manual" });
  let hops = 0;
  while ((res.status === 302 || res.status === 303) && hops < 10) {
    const loc = res.headers.get("location");
    if (!loc) break;
    const next = loc.startsWith("http") ? loc : new URL(loc, RDPMONSTER_BASE_URL).href;
    hops++;
    res = await session.get(next, { redirect: "manual" });
  }
  return { status: res.status, html: await res.text() };
}

function parsePackageTitle(chunk, slug) {
  const titled =
    chunk.match(/package-title[^>]*>\s*([^<]+)/i)?.[1]?.trim() ||
    chunk.match(/<h[234][^>]*>\s*([^<]{2,60})\s*<\/h[234]>/i)?.[1]?.trim();
  if (titled) return titled;
  const leaf = slug.split("/").pop() || slug;
  return leaf
    .split("-")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function parseGroupHtml(html, groupSlug) {
  const groupTitle =
    stripTags(html.match(/<title>([^<]+)/i)?.[1] || "")
      .split("-")[0]
      ?.trim() || groupSlug;

  const buttons = [
    ...html.matchAll(
      /id="product(\d+)-order-button"[^>]*href="(\/store\/[^"]+)"|href="(\/store\/[^"]+)"[^>]*id="product(\d+)-order-button"/g,
    ),
  ];

  const items = [];
  const seen = new Set();
  for (const m of buttons) {
    const num = m[1] || m[4];
    const href = m[2] || m[3];
    if (!num || !href || seen.has(num)) continue;
    seen.add(num);

    const slug = href.replace(/^\/store\//, "");
    const specs = [];
    const featRe2 = new RegExp(
      `id="product${num}-feature\\d+"[^>]*>\\s*<i[^>]*></i>\\s*<strong>([^<]+)</strong>\\s*<br>\\s*([^<]+)`,
      "g",
    );
    let fm;
    while ((fm = featRe2.exec(html))) {
      specs.push({ label: fm[1].trim(), value: fm[2].trim() });
    }

    const pos = html.indexOf(`product${num}-order-button`);
    const chunk = html.slice(Math.max(0, pos - 2500), pos);
    const price = chunk.match(/price-amount[^>]*>\s*\$?\s*([0-9.]+)/i);
    const cycle = chunk.match(/price-cycle[^>]*>\s*([^<]+)/i);

    items.push({
      group: groupTitle,
      groupSlug,
      slug,
      name: parsePackageTitle(chunk, slug),
      priceFrom: price ? Number(price[1]) : null,
      currency: "USD",
      cycle: cycle?.[1]?.trim() || null,
      specs,
      url: `${RDPMONSTER_BASE_URL}/store/${slug}`,
    });
  }
  return items;
}

/**
 * List available store tariffs across known groups.
 * @param {import('./session.js').HttpSession} session
 * @param {{ group?: string }} [opts]
 */
export async function listTariffs(session, opts = {}) {
  const groups = opts.group
    ? [String(opts.group).replace(/^\/?store\//, "")]
    : [...RDPMONSTER_STORE_GROUPS];

  const tariffs = [];
  for (const group of groups) {
    const { html, status } = await followGet(session, storeGroupUrl(group));
    if (status !== 200) {
      throw new Error(`store group ${group} HTTP ${status}`);
    }
    tariffs.push(...parseGroupHtml(html, group));
  }

  return {
    ok: true,
    count: tariffs.length,
    groups,
    tariffs,
  };
}

/**
 * Load configure-product options for one tariff slug (OS, disk, cycles, …).
 * Adds the product into the cart configure step — caller should empty cart if needed.
 */
export async function getTariffOptions(session, slug) {
  const { html, status } = await followGet(session, storeProductUrl(slug));
  if (status !== 200 || !html.includes("frmConfigureProduct")) {
    throw new Error(`Could not open configure page for ${slug}`);
  }
  return parseConfigurePage(html, slug);
}

export function parseConfigurePage(html, slug) {
  const product =
    stripTags(html.match(/<h2[^>]*>\s*([\s\S]*?)\s*<\/h2>/i)?.[1] || "") || slug;
  const csrfToken = html.match(/csrfToken\s*=\s*['"]([^'"]+)/)?.[1] || null;
  const cartIndex = html.match(/name=["']i["'][^>]*value=["']([^"']+)["']/i)?.[1] || "0";

  const billingCycles = [];
  for (const m of html.matchAll(/<input([^>]*name=["']billingcycle["'][^>]*)>/gi)) {
    const value = m[1].match(/value=["']([^"']+)["']/i)?.[1];
    if (!value) continue;
    const after = html.slice(m.index + m[0].length, m.index + m[0].length + 700);
    const titleHtml = after.match(/check-title[^>]*>([\s\S]*?)<\/h6>/i)?.[1] || after.slice(0, 200);
    const text = stripTags(titleHtml);
    const price = text.match(/\$([0-9]+(?:\.[0-9]+)?)/);
    const save = text.match(/Save\s+(\d+%)/i);
    billingCycles.push({
      value,
      label: value,
      price: price ? Number(price[1]) : null,
      save: save?.[1] || null,
      text: text.slice(0, 120),
      checked: /checked/i.test(m[1]),
    });
  }

  const configOptions = [];
  // selects
  for (const m of html.matchAll(/<select([^>]*)>([\s\S]*?)<\/select>/gi)) {
    const name = m[1].match(/name=["']([^"']+)["']/i)?.[1];
    if (!name || !name.startsWith("configoption[")) continue;
    const id = name.match(/configoption\[(\d+)\]/)?.[1];
    const options = [];
    for (const om of m[2].matchAll(/<option([^>]*)>([\s\S]*?)<\/option>/gi)) {
      const value = om[1].match(/value=["']([^"']*)["']/i)?.[1] ?? "";
      const text = stripTags(om[2]);
      const price = text.match(/\$([0-9]+(?:\.[0-9]+)?)/);
      options.push({
        value,
        label: text,
        price: price ? Number(price[1]) : 0,
        selected: /selected/i.test(om[1]),
      });
    }
    // section title: previous h2
    const before = html.slice(Math.max(0, m.index - 800), m.index);
    const title = stripTags([...before.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/gi)].pop()?.[1] || "") || name;
    configOptions.push({ id, name, title, type: "select", options });
  }

  // text/number configoption inputs (e.g. extra IPv4 qty)
  for (const m of html.matchAll(/<input([^>]*name=["']configoption\[\d+\]["'][^>]*)>/gi)) {
    const name = m[1].match(/name=["']([^"']+)["']/i)?.[1];
    const id = name?.match(/configoption\[(\d+)\]/)?.[1];
    const type = m[1].match(/type=["']([^"']+)["']/i)?.[1] || "text";
    const value = m[1].match(/value=["']([^"']*)["']/i)?.[1] ?? "";
    if (!name) continue;
    if (configOptions.some((c) => c.name === name)) continue;
    const before = html.slice(Math.max(0, m.index - 1000), m.index);
    let title =
      stripTags([...before.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/gi)].pop()?.[1] || "") || name;
    if (/ipv4/i.test(before) && !/operating system|disk/i.test(title)) {
      title = "Additional IPv4 Addresses";
    }
    configOptions.push({
      id,
      name,
      title,
      type,
      value,
      options: [],
    });
  }

  return {
    ok: true,
    slug,
    product,
    cartIndex,
    csrfToken,
    billingCycles,
    configOptions,
  };
}
