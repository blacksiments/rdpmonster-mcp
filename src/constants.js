export const RDPMONSTER_BASE_URL = "https://manager.rdp.monster";
export const RDPMONSTER_LOGIN_PAGE_URL = `${RDPMONSTER_BASE_URL}/login`;
export const RDPMONSTER_LOGIN_ACTION_URL = `${RDPMONSTER_BASE_URL}/login`;
export const RDPMONSTER_CLIENTAREA_URL = `${RDPMONSTER_BASE_URL}/clientarea.php`;
export const RDPMONSTER_SERVICES_URL = `${RDPMONSTER_BASE_URL}/clientarea.php?action=services`;
export const RDPMONSTER_INVOICES_URL = `${RDPMONSTER_BASE_URL}/clientarea.php?action=invoices`;
export const RDPMONSTER_REGISTER_URL = `${RDPMONSTER_BASE_URL}/register.php`;
export const RDPMONSTER_CART_URL = `${RDPMONSTER_BASE_URL}/cart.php`;
export const RDPMONSTER_STORE_URL = `${RDPMONSTER_BASE_URL}/store`;

/** Known store group slugs (WHMCS marketconnect/store paths). */
export const RDPMONSTER_STORE_GROUPS = [
  "europe",
  "usa",
  "europe-high-performance",
  "usa-high-performance",
  "europe-dedicated-servers",
];

export function productDetailsUrl(id) {
  return `${RDPMONSTER_BASE_URL}/clientarea.php?action=productdetails&id=${id}`;
}

export function invoiceUrl(id) {
  return `${RDPMONSTER_BASE_URL}/viewinvoice.php?id=${id}`;
}

export function storeGroupUrl(group) {
  return `${RDPMONSTER_STORE_URL}/${group}`;
}

export function storeProductUrl(slug) {
  const clean = String(slug).replace(/^\/?store\//, "").replace(/^\//, "");
  return `${RDPMONSTER_BASE_URL}/index.php?rp=/store/${clean}`;
}
