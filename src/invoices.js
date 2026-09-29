import { RDPMONSTER_INVOICES_URL, invoiceUrl } from "./constants.js";

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
  return s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

function extractIsoDate(text) {
  return text.match(/(\d{4}-\d{2}-\d{2})/)?.[1] ?? null;
}

function parseInvoiceRow(rowHtml) {
  const dataUrl = rowHtml.match(/data-url=["']([^"']+)["']/i)?.[1];
  let id = null;
  if (dataUrl) {
    id = decodeEntities(dataUrl).match(/[?&]id=(\d+)/i)?.[1] ?? null;
  }
  if (!id) {
    id = rowHtml.match(/viewinvoice\.php\?id=(\d+)/i)?.[1] ?? null;
  }

  const cells = [...rowHtml.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => m[1]);
  if (cells.length < 5 && !id) return null;

  const numberText = stripTags(cells[0] || "") || id;
  const invoiceDateRaw = stripTags(cells[1] || "");
  const dueDateRaw = stripTags(cells[2] || "");
  const total = stripTags(cells[3] || "") || null;
  const statusCell = cells[4] || "";
  const statusClass = statusCell.match(/status\s+status-([a-z0-9_-]+)/i)?.[1]?.toLowerCase() ?? null;
  const status =
    statusCell.match(/data-value=["']([^"']+)["']/i)?.[1] ||
    stripTags(statusCell) ||
    null;

  if (!id && !numberText) return null;

  return {
    id: id || numberText,
    number: numberText,
    invoiceDate: extractIsoDate(invoiceDateRaw),
    dueDate: extractIsoDate(dueDateRaw),
    total,
    status,
    statusClass,
    url: invoiceUrl(id || numberText),
  };
}

/**
 * List invoices for the logged-in account.
 * @param {import('./session.js').HttpSession} session
 * @param {{ status?: string }} [opts]
 */
export async function listInvoices(session, opts = {}) {
  const res = await session.get(RDPMONSTER_INVOICES_URL, { redirect: "follow" });
  const html = await res.text();

  if (
    html.includes("login-form") &&
    (html.includes("Secure Client Login") || html.includes('action="/login"'))
  ) {
    throw new Error("Not logged in — call login first");
  }

  const tableMatch = html.match(
    /<table[^>]*id=["']tableInvoicesList["'][^>]*>([\s\S]*?)<\/table>/i,
  );
  if (!tableMatch) {
    return { ok: true, count: 0, invoices: [], empty: true };
  }

  const tbodyMatch = tableMatch[1].match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/i);
  const body = tbodyMatch ? tbodyMatch[1] : tableMatch[1];
  const rows = [...body.matchAll(/<tr\b[\s\S]*?<\/tr>/gi)].map((m) => m[0]);

  let invoices = [];
  for (const row of rows) {
    const parsed = parseInvoiceRow(row);
    if (parsed) invoices.push(parsed);
  }

  if (opts.status) {
    const want = String(opts.status).trim().toLowerCase();
    invoices = invoices.filter(
      (inv) =>
        (inv.status && inv.status.toLowerCase() === want) ||
        (inv.statusClass && inv.statusClass.toLowerCase() === want),
    );
  }

  return {
    ok: true,
    count: invoices.length,
    invoices,
  };
}
