#!/usr/bin/env node
import { loadCredentials } from "../src/credentials.js";
import { login } from "../src/login.js";
import { listServices } from "../src/services.js";
import { HttpSession } from "../src/session.js";

const creds = loadCredentials({
  email: process.argv[2],
  password: process.argv[3],
});
const statusFilter = process.argv[4]; // optional e.g. Active

const session = new HttpSession();
console.error("login as", creds.email);
await login(session, creds);
const result = await listServices(session, statusFilter ? { status: statusFilter } : {});
console.log(JSON.stringify(result, null, 2));
