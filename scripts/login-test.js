#!/usr/bin/env node
import { loadCredentials } from "../src/credentials.js";
import { checkSession, login } from "../src/login.js";
import { HttpSession } from "../src/session.js";

const creds = loadCredentials({
  email: process.argv[2],
  password: process.argv[3],
});

const session = new HttpSession();
console.error("login as", creds.email);
const result = await login(session, creds);
console.log(JSON.stringify(result, null, 2));
const st = await checkSession(session);
console.log(JSON.stringify({ status: st }, null, 2));
