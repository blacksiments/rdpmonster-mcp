import { RDPMONSTER_SERVICES_URL, productDetailsUrl } from "./constants.js";

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

function decodeEntities(s) {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function extractTableBody(html) {
  const tableMatch = html.match(
    /<table[^>]*id=["']tableServicesList["'][^>]*>([\s\S]*?)<\/table>/i,
  );
  if (!tableMatch) return null;
  const tbodyMatch = tableMatch[1].match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/i);
  return tbodyMatch ? tbodyMatch[1] : tableMatch[1];
}

function parseProductCell(cellHtml) {
  const nameMatch = cellHtml.match(/<p>\s*<b>([^<]*)<\/b>\s*-\s*([^<]*)<\/p>/i);
  const name = nameMatch
    ? `${nameMatch[1].trim()} - ${nameMatch[2].trim()}`
    : null;

  const idMatch = cellHtml.match(/ID\s*:\s*<\/strong>\s*(\d+)/i) ||
    cellHtml.match(/ID\s*:\s*(\d+)/i);
  const dedicatedIpMatch =
    cellHtml.match(/Dedicated IP\s*:\s*<\/strong>\s*([0-9a-fA-F:.]+)/i) ||
    cellHtml.match(/Dedicated IP\s*:\s*([0-9a-fA-F:.]+)/i);
  const domainMatch =
    cellHtml.match(/class=["']text-domain["'][^>]*>[\s\S]*?<\/span>/i);
  let domain = null;
  if (domainMatch) {
    const t = stripTags(domainMatch[0]).replace(/^ID\s*:\s*/i, "").trim();
    // only treat as domain if it looks like a hostname, not bare id
    if (t && !/^\d+$/.test(t) && t.includes(".")) domain = t;
  }

  return {
    product: name,
    panelId: idMatch?.[1] ?? null,
    dedicatedIp: dedicatedIpMatch?.[1] ?? null,
    domain,
  };
}

function parseStatusCell(cellHtml) {
  const dataValue = cellHtml.match(/data-value=["']([^"']+)["']/i);
  const classMatch = cellHtml.match(/status\s+status-([a-z0-9_-]+)/i);
  const text = stripTags(cellHtml);
  return {
    status: dataValue?.[1] || text || null,
    statusClass: classMatch?.[1]?.toLowerCase() || null,
  };
}

function parseDueDate(cellHtml) {
  const text = stripTags(cellHtml);
  const iso = text.match(/(\d{4}-\d{2}-\d{2})/);
  return {
    nextDueDate: iso?.[1] ?? null,
    nextDueDateLabel: text || null,
  };
}

function parseServiceRow(rowHtml) {
  const dataUrl =
    rowHtml.match(/data-url=["']([^"']+)["']/i)?.[1] ??
    rowHtml.match(/clientarea\.php\?action=productdetails(?:&amp;|&)id=(\d+)/i)?.[0];
  let id = null;
  if (dataUrl) {
    const decoded = decodeEntities(dataUrl);
    id = decoded.match(/[?&]id=(\d+)/i)?.[1] ?? null;
  }
  if (!id) {
    id = rowHtml.match(/productdetails(?:&amp;|&)id=(\d+)/i)?.[1] ?? null;
  }

  const cells = [...rowHtml.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => m[1]);
  if (cells.length < 4) return null;

  const product = parseProductCell(cells[0] || "");
  const pricing = stripTags(cells[1] || "") || null;
  const due = parseDueDate(cells[2] || "");
  const status = parseStatusCell(cells[3] || "");

  const serviceId = id || product.panelId;
  if (!serviceId && !product.product) return null;

  return {
    id: serviceId,
    product: product.product,
    status: status.status,
    statusClass: status.statusClass,
    pricing,
    nextDueDate: due.nextDueDate,
    dedicatedIp: product.dedicatedIp,
    domain: product.domain,
    url: serviceId ? productDetailsUrl(serviceId) : null,
  };
}

/**
 * List products/services for the logged-in WHMCS account.
 * @param {import('./session.js').HttpSession} session
 * @param {{ status?: string }} [opts]
 */
export async function listServices(session, opts = {}) {
  let url = RDPMONSTER_SERVICES_URL;
  if (opts.status) {
    url += `&status=${encodeURIComponent(opts.status)}`;
  }

  const res = await session.get(url, { redirect: "follow" });
  const html = await res.text();

  if (
    html.includes("login-form") &&
    (html.includes("Secure Client Login") || html.includes('action="/login"'))
  ) {
    throw new Error("Not logged in — call login first");
  }

  const tbody = extractTableBody(html);
  if (!tbody) {
    // empty account / theme without table
    const empty =
      /no (products?|services?)/i.test(html) ||
      /you have no/i.test(html);
    return {
      ok: true,
      count: 0,
      services: [],
      empty: empty || true,
    };
  }

  const rows = [...tbody.matchAll(/<tr\b[\s\S]*?<\/tr>/gi)].map((m) => m[0]);
  let services = [];
  for (const row of rows) {
    const parsed = parseServiceRow(row);
    if (parsed) services.push(parsed);
  }

  if (opts.status) {
    const want = String(opts.status).trim().toLowerCase();
    services = services.filter(
      (s) =>
        (s.status && s.status.toLowerCase() === want) ||
        (s.statusClass && s.statusClass.toLowerCase() === want),
    );
  }

  return {
    ok: true,
    count: services.length,
    services,
  };
}
