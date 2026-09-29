#!/usr/bin/env node
import { checkSession, login } from "../src/login.js";
import { register } from "../src/register.js";
import { HttpSession } from "../src/session.js";

const email = process.argv[2];
const password = process.argv[3];
const firstname = process.argv[4] || "Tokyo";
const lastname = process.argv[5] || "Decoy";
const country = process.argv[6] || "US";

if (!email || !password) {
  console.error("usage: register-test.js <email> <password> [firstname] [lastname] [country]");
  process.exit(2);
}

const session = new HttpSession();
console.error("register", email);
const result = await register(session, { email, password, firstname, lastname, country });
console.log(JSON.stringify({ register: result }, null, 2));

const st = await checkSession(session);
console.log(JSON.stringify({ statusAfterRegister: st }, null, 2));

// fresh session login verify
const session2 = new HttpSession();
const loginResult = await login(session2, { email, password });
console.log(JSON.stringify({ login: loginResult }, null, 2));
const st2 = await checkSession(session2);
console.log(JSON.stringify({ statusAfterLogin: st2 }, null, 2));
