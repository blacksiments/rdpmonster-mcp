#!/usr/bin/env node
/**
 * rdpmonster-mcp — login, register, services, invoices, connection
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { loadCredentials } from "./credentials.js";
import { listTariffs, getTariffOptions } from "./catalog.js";
import { listInvoices } from "./invoices.js";
import { checkSession, login } from "./login.js";
import { createOrder } from "./order.js";
import { register } from "./register.js";
import { getConnection, getService } from "./service.js";
import { listServices } from "./services.js";
import { HttpSession } from "./session.js";

/** @type {HttpSession | null} */
let session = null;
/** @type {string | null} */
let loggedInEmail = null;

function ok(data) {
  return {
    content: [{ type: "text", text: typeof data === "string" ? data : JSON.stringify(data, null, 2) }],
  };
}

function fail(err) {
  return {
    content: [{ type: "text", text: String(err?.message || err) }],
    isError: true,
  };
}

function requireSession() {
  if (!session) throw new Error("Not logged in — call login first");
  return session;
}

const server = new McpServer({
  name: "rdpmonster-mcp",
  version: "0.1.0",
});

server.tool(
  "login",
  "Log in to manager.rdp.monster. Uses tool args or ~/.config/rdpmonster-mcp/{email,password}.",
  {
    email: z.string().email().optional().describe("Account email; default from config"),
    password: z.string().optional().describe("Account password; default from config"),
  },
  async ({ email, password }) => {
    try {
      const creds = loadCredentials({ email, password });
      session = new HttpSession();
      const result = await login(session, creds);
      loggedInEmail = creds.email;
      return ok({
        ...result,
        note: "Session kept in MCP process memory until restart.",
      });
    } catch (e) {
      session = null;
      loggedInEmail = null;
      return fail(e);
    }
  },
);

server.tool(
  "register",
  "Register a new account on manager.rdp.monster. Keeps session logged in on success.",
  {
    email: z.string().email().describe("New account email (e.g. Pass alias)"),
    password: z.string().min(5).describe("New account password"),
    firstname: z.string().optional().describe("First name; default User"),
    lastname: z.string().optional().describe("Last name; default Rdp"),
    country: z.string().length(2).optional().describe("ISO country code; default US"),
  },
  async ({ email, password, firstname, lastname, country }) => {
    try {
      session = new HttpSession();
      const result = await register(session, { email, password, firstname, lastname, country });
      loggedInEmail = email;
      return ok({
        ...result,
        note: "Session kept in MCP process memory until restart. Store creds in Infisical separately.",
      });
    } catch (e) {
      session = null;
      loggedInEmail = null;
      return fail(e);
    }
  },
);

server.tool(
  "list_services",
  "List my WHMCS products/services and their statuses (Active, Pending, Suspended, …). Requires login first.",
  {
    status: z
      .string()
      .optional()
      .describe("Optional status filter, e.g. Active, Pending, Suspended, Terminated, Cancelled"),
  },
  async ({ status }) => {
    try {
      const result = await listServices(requireSession(), status ? { status } : {});
      return ok({ ...result, email: loggedInEmail });
    } catch (e) {
      return fail(e);
    }
  },
);

server.tool(
  "get_my_services",
  "Alias of list_services — my products/services with statuses. Requires login first.",
  {
    status: z
      .string()
      .optional()
      .describe("Optional status filter, e.g. Active, Pending, Suspended, Terminated, Cancelled"),
  },
  async ({ status }) => {
    try {
      const result = await listServices(requireSession(), status ? { status } : {});
      return ok({ ...result, email: loggedInEmail });
    } catch (e) {
      return fail(e);
    }
  },
);

server.tool(
  "get_service",
  "Product details for one service id (IP, username, OS, billing, status). Requires login first.",
  {
    id: z.union([z.string(), z.number()]).describe("WHMCS service id from list_services"),
  },
  async ({ id }) => {
    try {
      const result = await getService(requireSession(), id);
      return ok({ ...result, email: loggedInEmail });
    } catch (e) {
      return fail(e);
    }
  },
);

server.tool(
  "get_connection",
  "Connection hint for a service (host, port, protocol, username, password if panel exposes it). Requires login first.",
  {
    id: z.union([z.string(), z.number()]).describe("WHMCS service id from list_services"),
  },
  async ({ id }) => {
    try {
      const result = await getConnection(requireSession(), id);
      return ok({ ...result, email: loggedInEmail });
    } catch (e) {
      return fail(e);
    }
  },
);

server.tool(
  "list_invoices",
  "List my invoices with statuses (Paid, Unpaid, Cancelled, …). Requires login first.",
  {
    status: z
      .string()
      .optional()
      .describe("Optional status filter, e.g. Paid, Unpaid, Cancelled, Refunded"),
  },
  async ({ status }) => {
    try {
      const result = await listInvoices(requireSession(), status ? { status } : {});
      return ok({ ...result, email: loggedInEmail });
    } catch (e) {
      return fail(e);
    }
  },
);

server.tool(
  "get_my_invoices",
  "Alias of list_invoices — my invoices with statuses. Requires login first.",
  {
    status: z
      .string()
      .optional()
      .describe("Optional status filter, e.g. Paid, Unpaid, Cancelled, Refunded"),
  },
  async ({ status }) => {
    try {
      const result = await listInvoices(requireSession(), status ? { status } : {});
      return ok({ ...result, email: loggedInEmail });
    } catch (e) {
      return fail(e);
    }
  },
);

server.tool(
  "list_tariffs",
  "List available RDP Monster store tariffs (Europe/USA/HP/Dedicated) with prices and specs. Login optional but recommended.",
  {
    group: z
      .string()
      .optional()
      .describe(
        "Optional store group slug: europe, usa, europe-high-performance, usa-high-performance, europe-dedicated-servers",
      ),
  },
  async ({ group }) => {
    try {
      const s = session || new HttpSession();
      const result = await listTariffs(s, group ? { group } : {});
      return ok(result);
    } catch (e) {
      return fail(e);
    }
  },
);

server.tool(
  "get_tariff_options",
  "Load configure options for one tariff slug (billing cycles, OS, disk, extra IPv4). Opens configure step.",
  {
    slug: z
      .string()
      .describe("Tariff slug from list_tariffs, e.g. europe/standard or usa/basic-usa"),
  },
  async ({ slug }) => {
    try {
      const s = session || new HttpSession();
      const result = await getTariffOptions(s, slug);
      return ok(result);
    } catch (e) {
      return fail(e);
    }
  },
);

server.tool(
  "create_order",
  "Add one or more tariffs to the WHMCS cart (qty, billing cycle, OS, disk, maxPrice). Does not pay. Requires login.",
  {
    items: z
      .array(
        z.object({
          slug: z.string().describe("Tariff slug, e.g. europe/standard"),
          qty: z.number().int().min(1).optional().describe("How many servers; default 1"),
          billingcycle: z
            .string()
            .optional()
            .describe("monthly | quarterly | annually (default monthly)"),
          os: z.string().optional().describe('OS label or option id, e.g. "Ubuntu 24.04"'),
          disk: z.string().optional().describe('Disk label or option id, e.g. "70 GB"'),
          extraIpv4: z.union([z.number(), z.string()]).optional().describe("Extra IPv4 count; default 0"),
          maxPrice: z
            .number()
            .optional()
            .describe("Refuse if selected billing-cycle price exceeds this USD amount"),
          exactPrice: z
            .number()
            .optional()
            .describe("Refuse unless billing-cycle price equals this USD amount"),
        }),
      )
      .min(1),
    emptyCart: z
      .boolean()
      .optional()
      .describe("Clear cart before adding; default true"),
  },
  async ({ items, emptyCart }) => {
    try {
      const result = await createOrder(requireSession(), {
        items,
        emptyCart: emptyCart !== false,
      });
      return ok({ ...result, email: loggedInEmail });
    } catch (e) {
      return fail(e);
    }
  },
);

server.tool(
  "status",
  "Check whether the current MCP session is still logged in to RDP Monster.",
  {},
  async () => {
    try {
      if (!session) {
        return ok({ ok: false, loggedIn: false, email: null, reason: "no_session" });
      }
      const st = await checkSession(session);
      return ok({ ...st, email: loggedInEmail });
    } catch (e) {
      return fail(e);
    }
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
