#!/usr/bin/env node
import { loadCredentials } from "../src/credentials.js";
import { login } from "../src/login.js";
import { getConnection, getService } from "../src/service.js";
import { listInvoices } from "../src/invoices.js";
import { HttpSession } from "../src/session.js";

const creds = loadCredentials({
  email: process.argv[2],
  password: process.argv[3],
});
const serviceId = process.argv[4] || "47519";
const invoiceStatus = process.argv[5];

const session = new HttpSession();
console.error("login as", creds.email);
await login(session, creds);

const service = await getService(session, serviceId);
console.log(JSON.stringify({ service }, null, 2));

const connection = await getConnection(session, serviceId);
console.log(JSON.stringify({ connection }, null, 2));

const invoices = await listInvoices(session, invoiceStatus ? { status: invoiceStatus } : {});
console.log(JSON.stringify({ invoices }, null, 2));
