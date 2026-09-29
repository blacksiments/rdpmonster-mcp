#!/usr/bin/env node
/**
 * rdpmonster-mcp — v0.1 login + register (+ status)
 * Planned later: list_services, get_service, get_connection
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { loadCredentials } from "./credentials.js";
import { checkSession, login } from "./login.js";
import { register } from "./register.js";
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
