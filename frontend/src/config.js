function getConfig(name, defaultValue = null) {
  // If inside a docker container, use window.ENV
  if (window.ENV !== undefined) {
    return window.ENV[name] || defaultValue;
  }

  return import.meta.env[name] || defaultValue;
}

export function getBackendUrl() {
  return getConfig("VITE_BACKEND_URL");
}

export function getHoursCloseTicketsAuto() {
  return getConfig("VITE_HOURS_CLOSE_TICKETS_AUTO");
}

/**
 * Rewrites absolute HTTP media URLs (e.g. http://host:8080/public/file.jpg)
 * to go through the current origin's /api/ proxy when the page is on HTTPS.
 * This avoids mixed-content blocking on HTTPS pages.
 */
export function getProxiedMediaUrl(url) {
  if (!url) return url;
  if (window.location.protocol === "https:" && url.startsWith("http://")) {
    // Replace http://host:port with https://current-origin/api
    return url.replace(/^http:\/\/[^/]+/, window.location.origin + "/api");
  }
  return url;
}
