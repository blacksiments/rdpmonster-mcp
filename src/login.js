import {
  RDPMONSTER_CLIENTAREA_URL,
  RDPMONSTER_LOGIN_ACTION_URL,
  RDPMONSTER_LOGIN_PAGE_URL,
} from "./constants.js";

function extractLoginToken(html) {
  const match = html.match(/name="token"\s+value="([^"]+)"/);
  return match?.[1] ?? null;
}

/**
 * Login to manager.rdp.monster (WHMCS).
 * @param {import('./session.js').HttpSession} session
 * @param {{ email: string, password: string }} creds
 */
export async function login(session, { email, password }) {
  const page = await session.get(RDPMONSTER_LOGIN_PAGE_URL, { redirect: "follow" });
  // follow redirects manually for first get — some setups 302
  let html;
  if (page.status >= 300 && page.status < 400) {
    const loc = page.headers.get("location");
    if (!loc) throw new Error(`login page redirect without location (${page.status})`);
    const abs = loc.startsWith("http") ? loc : new URL(loc, RDPMONSTER_LOGIN_PAGE_URL).href;
    const page2 = await session.get(abs, { redirect: "follow" });
    html = await page2.text();
  } else {
    html = await page.text();
  }

  const token = extractLoginToken(html);
  if (!token) {
    throw new Error("RDP Monster login token not found (page changed or blocked)");
  }

  const loginResponse = await session.post(
    RDPMONSTER_LOGIN_ACTION_URL,
    new URLSearchParams({
      token,
      username: email,
      password,
    }),
    {
      headers: { Referer: RDPMONSTER_LOGIN_PAGE_URL },
      redirect: "manual",
    },
  );

  if (loginResponse.status === 302 || loginResponse.status === 303) {
    const location = loginResponse.headers.get("location") ?? "";
    if (
      location.includes("clientarea") ||
      location.includes("/clientarea.php") ||
      location === "/" ||
      location.includes("clientarea.php")
    ) {
      // follow into clientarea to confirm cookies
      const next = location.startsWith("http")
        ? location
        : new URL(location, RDPMONSTER_LOGIN_ACTION_URL).href;
      await session.get(next, { redirect: "follow" });
      return { ok: true, email, via: "redirect", location };
    }
    throw new Error(`RDP Monster login rejected (redirect: ${location || "empty"})`);
  }

  if (!loginResponse.ok) {
    throw new Error(`RDP Monster login failed HTTP ${loginResponse.status}`);
  }

  const body = await loginResponse.text();
  if (body.includes("login-form") && !body.includes("clientarea.php")) {
    throw new Error("RDP Monster login rejected (still on login form)");
  }

  // probe clientarea
  const ca = await session.get(RDPMONSTER_CLIENTAREA_URL, { redirect: "follow" });
  const caHtml = await ca.text();
  if (caHtml.includes("login-form") && caHtml.includes("Secure Client Login")) {
    throw new Error("RDP Monster login rejected (clientarea requires login)");
  }

  return { ok: true, email, via: "body" };
}

/**
 * Check whether current session is still authenticated.
 */
export async function checkSession(session) {
  const ca = await session.get(RDPMONSTER_CLIENTAREA_URL, { redirect: "follow" });
  const html = await ca.text();
  const loggedOut =
    html.includes("login-form") &&
    (html.includes("Secure Client Login") || html.includes('action="/login"'));
  return { ok: !loggedOut, loggedIn: !loggedOut };
}
