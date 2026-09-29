import { parseConfigurePage, getTariffOptions } from "./catalog.js";
import {
  RDPMONSTER_BASE_URL,
  RDPMONSTER_CART_URL,
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
  return { status: res.status, html: await res.text(), headers: res.headers };
}

function normalizeSlug(slug) {
  return String(slug || "")
    .trim()
    .replace(/^https?:\/\/[^/]+/i, "")
    .replace(/^\/?store\//, "")
    .replace(/^\//, "");
}

function matchOption(options, want) {
  if (want == null || want === "") return null;
  const raw = String(want).trim();
  const byValue = options.find((o) => String(o.value) === raw);
  if (byValue) return byValue;
  const lower = raw.toLowerCase();
  const exact = options.find((o) => o.label.toLowerCase() === lower);
  if (exact) return exact;
  // "70 GB" vs "70 GB $2.50" / "Ubuntu 24.04"
  const starts = options.find((o) => o.label.toLowerCase().startsWith(lower));
  if (starts) return starts;
  const fuzzy = options.find(
    (o) => o.label.toLowerCase().includes(lower) || lower.includes(o.label.toLowerCase()),
  );
  if (fuzzy) return fuzzy;
  // match leading number for disk sizes: "70" → "70 GB"
  const num = raw.match(/^(\d+(?:\.\d+)?)/);
  if (num) {
    const byNum = options.find((o) => o.label.trim().toLowerCase().startsWith(num[1]));
    if (byNum) return byNum;
  }
  return null;
}

function pickConfigValue(configOptions, titleMatchers, want, fallbackSelected = true) {
  const opt = configOptions.find((c) =>
    titleMatchers.some((t) => c.title.toLowerCase().includes(t)),
  );
  if (!opt) return null;
  if (opt.type === "select") {
    if (want != null && want !== "") {
      const matched = matchOption(opt.options, want);
      if (!matched) {
        throw new Error(
          `No option matching ${JSON.stringify(want)} for ${opt.title}. Available: ${opt.options
            .map((o) => o.label)
            .join("; ")}`,
        );
      }
      return { name: opt.name, value: matched.value, label: matched.label, price: matched.price };
    }
    const selected = opt.options.find((o) => o.selected) || opt.options[0];
    if (!selected) return null;
    if (!fallbackSelected) return null;
    return {
      name: opt.name,
      value: selected.value,
      label: selected.label,
      price: selected.price,
    };
  }
  // text/number
  return {
    name: opt.name,
    value: want != null && want !== "" ? String(want) : String(opt.value ?? "0"),
    label: opt.title,
    price: 0,
  };
}

function parseCartSummary(html) {
  const items = [];
  for (const m of html.matchAll(
    /class=["'][^"']*item-title[^"']*["'][^>]*>([\s\S]*?)<\//gi,
  )) {
    const title = stripTags(m[1]);
    if (title) items.push({ title });
  }

  const subtotal = stripTags(
    html.match(/Subtotal[\s\S]{0,80}?(\$[0-9]+(?:\.[0-9]+)?)/i)?.[0] || "",
  ).match(/\$[0-9]+(?:\.[0-9]+)?/)?.[0];

  const totalDueToday = stripTags(
    html.match(/Total Due Today[\s\S]{0,80}?(\$[0-9]+(?:\.[0-9]+)?)/i)?.[0] || "",
  ).match(/\$[0-9]+(?:\.[0-9]+)?/)?.[0];

  return {
    items,
    subtotal: subtotal || null,
    totalDueToday: totalDueToday || null,
  };
}

export async function emptyCart(session) {
  await followGet(session, `${RDPMONSTER_CART_URL}?a=empty`);
}

/**
 * Configure + add one product unit to the WHMCS cart.
 */
export async function addProductToCart(session, item) {
  const slug = normalizeSlug(item.slug || item.product || item.tariff);
  if (!slug) throw new Error("item.slug is required");

  const opened = await followGet(session, storeProductUrl(slug));
  if (opened.status !== 200 || !opened.html.includes("frmConfigureProduct")) {
    throw new Error(`Failed to open configure page for ${slug}`);
  }

  const cfg = parseConfigurePage(opened.html, slug);
  const billingcycle = String(item.billingcycle || item.cycle || "monthly").toLowerCase();
  const cycle = cfg.billingCycles.find((c) => c.value === billingcycle);
  if (!cycle && cfg.billingCycles.length) {
    throw new Error(
      `Unknown billingcycle ${billingcycle}. Available: ${cfg.billingCycles.map((c) => c.value).join(", ")}`,
    );
  }

  if (item.maxPrice != null && cycle?.price != null && cycle.price > Number(item.maxPrice)) {
    throw new Error(
      `Price $${cycle.price} for ${slug} (${billingcycle}) exceeds maxPrice $${item.maxPrice}`,
    );
  }
  if (
    item.exactPrice != null &&
    cycle?.price != null &&
    Math.abs(cycle.price - Number(item.exactPrice)) > 0.009
  ) {
    throw new Error(
      `Price $${cycle.price} for ${slug} (${billingcycle}) != exactPrice $${item.exactPrice}`,
    );
  }

  const disk = pickConfigValue(
    cfg.configOptions,
    ["disk"],
    item.disk ?? item.diskSpace ?? item.storage,
  );
  const os = pickConfigValue(
    cfg.configOptions,
    ["operating system", "os"],
    item.os ?? item.operatingSystem,
  );
  let ipv4 = pickConfigValue(
    cfg.configOptions,
    ["ipv4", "additional ipv4"],
    item.extraIpv4 ?? item.ipv4 ?? item.additionalIpv4 ?? "0",
  );
  if (!ipv4) {
    const textOpt = cfg.configOptions.find((c) => c.type === "text" || c.type === "number");
    if (textOpt) {
      ipv4 = {
        name: textOpt.name,
        value: String(item.extraIpv4 ?? item.ipv4 ?? item.additionalIpv4 ?? textOpt.value ?? "0"),
        label: textOpt.title,
        price: 0,
      };
    }
  }

  const params = new URLSearchParams({
    addproductajax: "1",
    a: "confproduct",
    configure: "true",
    i: cfg.cartIndex,
    billingcycle,
  });
  if (cfg.csrfToken) params.set("token", cfg.csrfToken);
  for (const picked of [disk, os, ipv4]) {
    if (picked?.name) params.set(picked.name, picked.value);
  }
  // pass through raw configoption map if provided
  if (item.configoptions && typeof item.configoptions === "object") {
    for (const [k, v] of Object.entries(item.configoptions)) {
      const name = k.startsWith("configoption[") ? k : `configoption[${k}]`;
      params.set(name, String(v));
    }
  }

  const post = await session.post(RDPMONSTER_CART_URL, params, {
    headers: {
      Referer: `${RDPMONSTER_CART_URL}?a=confproduct&i=${cfg.cartIndex}`,
      Accept: "application/json, text/javascript, */*; q=0.01",
      "X-Requested-With": "XMLHttpRequest",
    },
    redirect: "manual",
  });

  // success typically 302 → confdomains
  if (post.status === 302 || post.status === 303) {
    const loc = post.headers.get("location") || "";
    const next = loc.startsWith("http") ? loc : new URL(loc, RDPMONSTER_BASE_URL).href;
    await session.get(next, { redirect: "manual" }); // often JSON, ignore body
  } else {
    const body = await post.text();
    // ajax validation errors come as HTML snippet with ajax=1; with addproductajax should redirect
    throw new Error(
      `Add to cart failed HTTP ${post.status}: ${stripTags(body).slice(0, 200) || "empty"}`,
    );
  }

  return {
    ok: true,
    slug,
    product: cfg.product,
    billingcycle,
    price: cycle?.price ?? null,
    disk: disk ? { label: disk.label, value: disk.value, price: disk.price } : null,
    os: os ? { label: os.label, value: os.value } : null,
    extraIpv4: ipv4 ? { value: ipv4.value } : null,
  };
}

/**
 * Create a cart order from one or more tariff line items.
 *
 * @param {import('./session.js').HttpSession} session
 * @param {{
 *   items: Array<{
 *     slug: string,
 *     qty?: number,
 *     billingcycle?: string,
 *     os?: string,
 *     disk?: string,
 *     extraIpv4?: number|string,
 *     maxPrice?: number,
 *     exactPrice?: number,
 *     configoptions?: Record<string,string|number>,
 *   }>,
 *   emptyCart?: boolean,
 * }} opts
 */
export async function createOrder(session, opts) {
  const items = opts.items;
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error("create_order requires items[]");
  }

  if (opts.emptyCart !== false) {
    await emptyCart(session);
  }

  const added = [];
  for (const item of items) {
    const qty = Math.max(1, Number(item.qty || item.quantity || 1));
    for (let n = 0; n < qty; n++) {
      added.push(await addProductToCart(session, item));
    }
  }

  const checkout = await followGet(session, `${RDPMONSTER_CART_URL}?a=view`);
  const summary = parseCartSummary(checkout.html);

  return {
    ok: true,
    added,
    count: added.length,
    cart: summary,
    checkoutUrl: `${RDPMONSTER_CART_URL}?a=checkout`,
    note: "Items are in the WHMCS cart. Payment is not completed automatically — open checkoutUrl or pay the invoice after checkout.",
  };
}

export { getTariffOptions };
