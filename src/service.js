import { productDetailsUrl } from "./constants.js";

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

function assertLoggedIn(html) {
  if (
    html.includes("login-form") &&
    (html.includes("Secure Client Login") || html.includes('action="/login"'))
  ) {
    throw new Error("Not logged in — call login first");
  }
}

function extractListInfo(html) {
  const out = {};
  const re =
    /list-info-title["']?[^>]*>\s*([^<]+?)\s*<\/span>\s*<span[^>]*list-info-text[^>]*>\s*([\s\S]*?)\s*<\/span>/gi;
  let m;
  while ((m = re.exec(html))) {
    const key = m[1].replace(/\s+/g, " ").trim();
    const value = stripTags(m[2]);
    if (key) out[key] = value || null;
  }
  return out;
}

function extractOverview(html) {
  const out = {};
  const re =
    /<span class="gray-base">\s*([^<]+?)\s*<\/span>\s*<\/div>\s*<div[^>]*>\s*(?:<span[^>]*>)?([^<]+)/gi;
  let m;
  while ((m = re.exec(html))) {
    const key = m[1].replace(/\s+/g, " ").trim();
    const value = m[2].replace(/\s+/g, " ").trim();
    if (key && value) out[key] = value;
  }
  return out;
}

function pickStatus(info, html) {
  if (info.Status) return info.Status;
  const badge = html.match(/status\s+status-([a-z0-9_-]+)[^>]*>\s*([^<]+)/i);
  if (badge) return badge[2].trim();
  return null;
}

function guessPort(os, product) {
  const hay = `${os || ""} ${product || ""}`.toLowerCase();
  if (/windows|rdp/.test(hay) && !/ubuntu|debian|centos|linux/.test(hay)) {
    return 3389;
  }
  if (/ubuntu|debian|centos|linux|alma|rocky/.test(hay)) return 22;
  // RDP Monster brand but many SKUs are Linux VPS — default SSH when OS looks Linux, else RDP
  return 3389;
}

function guessProtocol(port) {
  if (port === 22) return "ssh";
  if (port === 3389) return "rdp";
  return null;
}

/**
 * Product details for one service id.
 * @param {import('./session.js').HttpSession} session
 * @param {string|number} id
 */
export async function getService(session, id) {
  const serviceId = String(id).trim();
  if (!/^\d+$/.test(serviceId)) throw new Error("service id must be numeric");

  const res = await session.get(productDetailsUrl(serviceId), { redirect: "follow" });
  const html = await res.text();
  assertLoggedIn(html);

  if (/invalid|not found|no longer|permission/i.test(html) && !html.includes("Product Details")) {
    throw new Error(`Service ${serviceId} not found or inaccessible`);
  }

  const info = extractListInfo(html);
  const overview = extractOverview(html);
  const product =
    html.match(/<h2[^>]*class="[^"]*product-name[^"]*"[^>]*>\s*([^<]+)\s*<\/h2>/i)?.[1]?.trim() ||
    html.match(/<h[23][^>]*>\s*([^<]{3,120})\s*<\/h[23]>/i)?.[1]?.trim() ||
    null;

  let status = pickStatus(info, html);
  let statusClass = null;
  let pricing = null;
  // Active products often omit Status in list-info — fall back to services table
  if (!status) {
    try {
      const { listServices } = await import("./services.js");
      const listed = await listServices(session);
      const row = listed.services.find((s) => String(s.id) === serviceId);
      if (row) {
        status = row.status;
        statusClass = row.statusClass;
        pricing = row.pricing;
      }
    } catch {
      // ignore enrichment failures
    }
  }

  const username = info.Username || null;
  const ip =
    info["IP Address"] ||
    info["Dedicated IP"] ||
    info["Primary IP"] ||
    null;
  const serverName = info["Server Name"] || info.Hostname || null;
  const os = info["Operating System"] || info.OS || null;
  const password =
    info["Cloud-Init Password"] ||
    info.Password ||
    info["Root Password"] ||
    null;

  return {
    ok: true,
    id: serviceId,
    product,
    status,
    statusClass,
    username,
    password: password || null,
    ip,
    serverName,
    os,
    disk: info["Disk Space"] || null,
    domain: info.Domain || null,
    pricing,
    registrationDate: overview["Registration Date"] || info["Registration Date"] || null,
    nextDueDate: overview["Next Due Date"] || info["Next Due Date"] || null,
    recurringAmount: overview["Recurring Amount"] || info["Recurring Amount"] || null,
    billingCycle: overview["Billing Cycle"] || info["Billing Cycle"] || null,
    paymentMethod: overview["Payment Method"] || info["Payment Method"] || null,
    fields: { ...overview, ...info },
    url: productDetailsUrl(serviceId),
  };
}

/**
 * Connection hint derived from product details.
 * Password may be null if the panel does not expose Cloud-Init Password in HTML.
 */
export async function getConnection(session, id) {
  const svc = await getService(session, id);
  const host = svc.ip || svc.serverName || null;
  const port = guessPort(svc.os, svc.product);
  const protocol = guessProtocol(port);

  return {
    ok: true,
    id: svc.id,
    product: svc.product,
    status: svc.status,
    protocol,
    host,
    port,
    username: svc.username,
    password: svc.password,
    os: svc.os,
    connectionString:
      host && svc.username
        ? protocol === "ssh"
          ? `ssh ${svc.username}@${host}${port && port !== 22 ? ` -p ${port}` : ""}`
          : `mstsc /v:${host}:${port || 3389}`
        : null,
    note: svc.password
      ? null
      : "Password not exposed on product page (Cloud-Init Password empty). Check welcome email or panel reveal.",
    url: svc.url,
  };
}
