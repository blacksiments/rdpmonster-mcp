# RDP Monster MCP

> WHMCS client-area automation for [manager.rdp.monster](https://manager.rdp.monster) — login, register, stay authenticated.

RDP Monster MCP talks to the live WHMCS panel over HTTPS with a cookie-jar HTTP session. It logs in with existing credentials, registers new client accounts, and reports whether the in-process session is still authenticated. No browser is required: CSRF tokens are scraped from the login/register HTML, forms are posted as `application/x-www-form-urlencoded`, and cookies stay in MCP process memory for follow-up calls until the process restarts. Credentials resolve from tool arguments, environment variables, or small files under `~/.config/rdpmonster-mcp/` so agents can rotate accounts without baking secrets into the config.

## What it does

- Authenticates against `https://manager.rdp.monster/login` and confirms access to the client area.
- Registers new WHMCS clients via `/register.php` (firstname, lastname, email, country, password).
- Keeps the authenticated cookie session in memory for subsequent tools in the same MCP process.
- Reports session health without re-entering credentials (`status`).
- Resolves email/password from tool args → env → config files, so multi-account vaults (e.g. Infisical) can feed the server at call time.

JavaScript-rendered pages are **not** required. Cloudflare challenges, CAPTCHAs, or form markup changes will surface as missing CSRF tokens or rejected redirects.

## MCP tools

| Tool | Purpose |
| --- | --- |
| `login` | Log in to manager.rdp.monster. Optional `email` / `password`; otherwise uses env or `~/.config/rdpmonster-mcp/{email,password}`. Starts a fresh HTTP session and keeps cookies in memory. |
| `register` | Create a new WHMCS account (`email`, `password` required; optional `firstname`, `lastname`, `country`). On success the process session is already logged in. |
| `list_services` / `get_my_services` | List products/services for the logged-in account with `status`, pricing, next due date, dedicated IP. Optional `status` filter (`Active`, `Pending`, …). Requires `login` first. |
| `get_service` | Product details by service id: IP, username, OS, billing fields, status. |
| `get_connection` | Connection hint (`host`, `port`, `protocol`, `username`, `password` if the panel exposes Cloud-Init Password). |
| `list_invoices` / `get_my_invoices` | List invoices with totals and statuses (`Paid`, `Unpaid`, `Cancelled`, …). Optional `status` filter. |
| `status` | Check whether the current in-memory session is still authenticated. Returns `reason: "no_session"` if `login` / `register` was never called. |

All tools return a JSON text payload (`ok`, identity fields, and error messages on failure). `login` and `register` replace any previous session in the process.

### Session reuse

`login` and `register` own the process-wide cookie jar. Consecutive `status` calls reuse that jar — no re-login. Restarting the MCP server (or a failed login/register) clears the session. There is no disk-backed cookie store.

### Credentials that write files

This server does **not** write credentials. Put secrets in env, config files you manage, or an external vault. `register` creates a real panel account — store that password outside the repo.

## Quick start

Requirements: Node.js **18** or newer.

```bash
git clone https://github.com/blacksiments/rdpmonster-mcp.git
cd rdpmonster-mcp
npm install
```

Add the server to your MCP client configuration. Replace the path with the absolute project path:

```json
{
  "mcpServers": {
    "rdpmonster": {
      "command": "node",
      "args": ["/absolute/path/to/rdpmonster-mcp/src/index.js"],
      "env": {
        "RDPMONSTER_EMAIL": "you@example.com",
        "RDPMONSTER_PASSWORD": "your-password"
      }
    }
  }
}
```

Or omit `env` and use files:

```bash
mkdir -p ~/.config/rdpmonster-mcp
printf '%s' 'you@example.com' > ~/.config/rdpmonster-mcp/email
printf '%s' 'your-password' > ~/.config/rdpmonster-mcp/password
chmod 600 ~/.config/rdpmonster-mcp/email ~/.config/rdpmonster-mcp/password
```

Override the config directory with `RDPMONSTER_MCP_CRED_DIR`. Email also accepts `RDPMONSTER_USERNAME`.

The MCP server communicates over standard input/output. Diagnostic messages from CLI smoke scripts go to stderr; the server itself is quiet on stdout except MCP framing.

## Connect an MCP client (Cursor)

Same shape as above in `~/.cursor/mcp.json` (or project MCP config). Reload MCP after edits. Call `login` or `register` once per process lifetime before any tool that needs an authenticated session.

## Example calls

Login with explicit credentials:

```json
{
  "email": "tokyo.decoy874@passinbox.com",
  "password": "••••••••"
}
```

Login from env / config files (no args):

```json
{}
```

Register a new account:

```json
{
  "email": "new.alias@passinbox.com",
  "password": "••••••••",
  "firstname": "Tokyo",
  "lastname": "Decoy",
  "country": "US"
}
```

`country` is an ISO-3166 alpha-2 code (default `US`). Password minimum length is **5** (WHMCS panel rule).

Check session:

```json
{}
```

## Development

```bash
# smoke login (args or config files)
npm run login:test -- user@example.com 'password'

# register + fresh-session login verify
npm run register:test -- new@example.com 'password' First Last US

# run MCP over stdio
npm start
```

### Layout

```
src/
  index.js        MCP server (stdio)
  login.js        WHMCS login
  register.js     WHMCS register
  session.js      cookie-jar fetch wrapper
  credentials.js  env / config resolution
  constants.js    base URLs
scripts/
  login-test.js
  register-test.js
```

## Roadmap

- Optional Infisical-backed multi-account picker as a first-class tool
- Reveal Cloud-Init password when the panel exposes it via module AJAX
- Order / renew / pay invoice helpers

## Practical limitations

- Authentication beyond form login (2FA, CAPTCHA, Cloudflare interstitial) is not bypassed.
- Markup or CSRF field renames on manager.rdp.monster will break token extraction until updated.
- Session cookies exist only in the MCP process; they are lost on restart and are not shared across parallel server instances.
- `register` hits the live panel — duplicate emails and weak passwords are rejected by WHMCS, not by local validation beyond length.
- Cloud-Init / root password is often empty in the product HTML; `get_connection` returns `password: null` and a note when that happens.
- Invoice and service `status` filters are applied client-side (the panel query string does not narrow the table).

## License

Private — [blacksiments/rdpmonster-mcp](https://github.com/blacksiments/rdpmonster-mcp).
