/**
 * Minimal cookie-jar HTTP session for WHMCS manager.rdp.monster.
 */
export class HttpSession {
  constructor({ userAgent } = {}) {
    this.cookies = new Map();
    this.userAgent =
      userAgent ||
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
  }

  cookieHeader() {
    if (this.cookies.size === 0) return "";
    return [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  }

  rememberSetCookie(response) {
    const raw = response.headers.getSetCookie?.() ?? [];
    const single = response.headers.get("set-cookie");
    const list = raw.length ? raw : single ? [single] : [];
    for (const line of list) {
      const part = line.split(";")[0];
      const eq = part.indexOf("=");
      if (eq <= 0) continue;
      const name = part.slice(0, eq).trim();
      const value = part.slice(eq + 1).trim();
      if (name) this.cookies.set(name, value);
    }
  }

  async request(url, init = {}) {
    const headers = {
      "User-Agent": this.userAgent,
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      ...(init.headers || {}),
    };
    const cookie = this.cookieHeader();
    if (cookie) headers.Cookie = cookie;

    const response = await fetch(url, { ...init, headers, redirect: init.redirect ?? "manual" });
    this.rememberSetCookie(response);
    return response;
  }

  get(url, init = {}) {
    return this.request(url, { ...init, method: "GET" });
  }

  post(url, body, init = {}) {
    const headers = {
      "Content-Type": "application/x-www-form-urlencoded",
      ...(init.headers || {}),
    };
    return this.request(url, {
      ...init,
      method: "POST",
      headers,
      body: typeof body === "string" ? body : body.toString(),
    });
  }

  /** Export cookies for persistence (optional). */
  exportCookies() {
    return Object.fromEntries(this.cookies);
  }

  importCookies(obj) {
    this.cookies = new Map(Object.entries(obj || {}));
  }
}
