export const RDPMONSTER_BASE_URL = "https://manager.rdp.monster";
export const RDPMONSTER_LOGIN_PAGE_URL = `${RDPMONSTER_BASE_URL}/login`;
export const RDPMONSTER_LOGIN_ACTION_URL = `${RDPMONSTER_BASE_URL}/login`;
export const RDPMONSTER_CLIENTAREA_URL = `${RDPMONSTER_BASE_URL}/clientarea.php`;
export const RDPMONSTER_SERVICES_URL = `${RDPMONSTER_BASE_URL}/clientarea.php?action=services`;
export const RDPMONSTER_REGISTER_URL = `${RDPMONSTER_BASE_URL}/register.php`;

export function productDetailsUrl(id) {
  return `${RDPMONSTER_BASE_URL}/clientarea.php?action=productdetails&id=${id}`;
}
