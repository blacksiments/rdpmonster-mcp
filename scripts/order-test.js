#!/usr/bin/env node
import { listTariffs, getTariffOptions } from "../src/catalog.js";
import { loadCredentials } from "../src/credentials.js";
import { login } from "../src/login.js";
import { createOrder, emptyCart } from "../src/order.js";
import { HttpSession } from "../src/session.js";

const creds = loadCredentials({
  email: process.argv[2],
  password: process.argv[3],
});

const session = new HttpSession();
console.error("login as", creds.email);
await login(session, creds);

const tariffs = await listTariffs(session, { group: "europe" });
console.log(JSON.stringify({ tariffs: { count: tariffs.count, sample: tariffs.tariffs.slice(0, 2) } }, null, 2));

const options = await getTariffOptions(session, "europe/standard");
console.log(
  JSON.stringify(
    {
      options: {
        product: options.product,
        billingCycles: options.billingCycles,
        configOptions: options.configOptions.map((c) => ({
          title: c.title,
          name: c.name,
          type: c.type,
          options: c.options?.slice?.(0, 3) || c.value,
        })),
      },
    },
    null,
    2,
  ),
);

await emptyCart(session);
const order = await createOrder(session, {
  emptyCart: true,
  items: [
    {
      slug: "europe/basic",
      qty: 2,
      billingcycle: "monthly",
      os: "Ubuntu 24.04",
      disk: "40 GB",
      extraIpv4: 0,
      maxPrice: 10,
    },
  ],
});
console.log(JSON.stringify({ order }, null, 2));

// also verify maxPrice guard
let guarded = null;
try {
  await createOrder(session, {
    emptyCart: true,
    items: [{ slug: "europe/standard", billingcycle: "monthly", maxPrice: 5 }],
  });
} catch (e) {
  guarded = String(e.message);
}
console.log(JSON.stringify({ maxPriceGuard: guarded }, null, 2));

await emptyCart(session);
console.error("cart emptied after test");
