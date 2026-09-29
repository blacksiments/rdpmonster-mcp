import { RDPMONSTER_CLIENTAREA_URL, RDPMONSTER_REGISTER_URL } from "./constants.js";

function extractToken(html) {
  const match = html.match(/name="token"\s+value="([^"]+)"/);
  return match?.[1] ?? null;
}

function extractErrors(html) {
  const errors = [];
  for (const re of [
    /class="[^"]*alert-danger[^"]*"[^>]*>([\s\S]*?)<\/div>/gi,
    /class="[^"]*errorbox[^"]*"[^>]*>([\s\S]*?)<\/div>/gi,
    /id="registrationError"[^>]*>([\s\S]*?)<\/div>/gi,
  ]) {
    let m;
    while ((m = re.exec(html))) {
      const text = m[1]
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      if (text && !errors.includes(text)) errors.push(text);
    }
  }
  return errors;
}

/**
 * Register a new WHMCS account on manager.rdp.monster.
 * @param {import('./session.js').HttpSession} session
 * @param {{ email: string, password: string, firstname?: string, lastname?: string, country?: string }} opts
 */
export async function register(session, opts) {
  const email = opts.email?.trim();
  const password = opts.password;
  if (!email || !password) throw new Error("register requires email and password");
  if (password.length < 5) throw new Error("password must be at least 5 characters");

  const firstname = (opts.firstname || "User").trim();
  const lastname = (opts.lastname || "Rdp").trim();
  const country = (opts.country || "US").trim().toUpperCase();

  const page = await session.get(RDPMONSTER_REGISTER_URL, { redirect: "follow" });
  const html = await page.text();
  if (!page.ok && page.status !== 200) {
    throw new Error(`register page HTTP ${page.status}`);
  }

  const token = extractToken(html);
  if (!token) throw new Error("RDP Monster register token not found (page changed or blocked)");

  const body = new URLSearchParams({
    token,
    register: "true",
    firstname,
    lastname,
    email,
    country,
    companyname: "",
    address1: "",
    city: "",
    state: "",
    postcode: "",
    password,
    password2: password,
  });

  const response = await session.post(RDPMONSTER_REGISTER_URL, body, {
    headers: { Referer: RDPMONSTER_REGISTER_URL },
    redirect: "manual",
  });

  if (response.status === 302 || response.status === 303) {
    const location = response.headers.get("location") ?? "";
    const next = location.startsWith("http")
      ? location
      : new URL(location || "/clientarea.php", RDPMONSTER_REGISTER_URL).href;
    await session.get(next, { redirect: "follow" });
    const ca = await session.get(RDPMONSTER_CLIENTAREA_URL, { redirect: "follow" });
    const caHtml = await ca.text();
    const loggedOut =
      caHtml.includes("login-form") &&
      (caHtml.includes("Secure Client Login") || caHtml.includes('action="/login"'));
    if (loggedOut) {
      throw new Error(`register redirect but still logged out (${location || "empty"})`);
    }
    return {
      ok: true,
      email,
      via: "redirect",
      location,
      firstname,
      lastname,
      country,
    };
  }

  const respHtml = await response.text();
  const errors = extractErrors(respHtml);
  if (errors.length) {
    throw new Error(`RDP Monster register rejected: ${errors.join(" | ")}`);
  }

  if (respHtml.includes("login-form") && respHtml.includes("Secure Client Login")) {
    throw new Error("RDP Monster register rejected (landed on login)");
  }

  // success sometimes returns 200 clientarea without redirect
  if (
    respHtml.includes("clientarea") ||
    respHtml.includes("Hello,") ||
    respHtml.includes("My Services") ||
    !respHtml.includes('name="register"')
  ) {
    return {
      ok: true,
      email,
      via: "body",
      firstname,
      lastname,
      country,
    };
  }

  throw new Error(`RDP Monster register failed HTTP ${response.status} (unknown response)`);
}
