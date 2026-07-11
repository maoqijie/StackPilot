export const DEFAULT_CONTROLLER_HOST = "127.0.0.1";
export const DEFAULT_CONTROLLER_PORT = 8787;
export const DEFAULT_WEB_HOST = "127.0.0.1";
export const DEFAULT_WEB_PORT = 5173;
export const DEFAULT_PREVIEW_PORT = 4173;

export const DEFAULT_API_PROXY_TARGET = `http://${DEFAULT_CONTROLLER_HOST}:${DEFAULT_CONTROLLER_PORT}`;

export const DEFAULT_ALLOWED_ORIGINS = Object.freeze([
  `http://127.0.0.1:${DEFAULT_WEB_PORT}`,
  `http://localhost:${DEFAULT_WEB_PORT}`,
  `http://127.0.0.1:${DEFAULT_PREVIEW_PORT}`,
  `http://localhost:${DEFAULT_PREVIEW_PORT}`,
]);
