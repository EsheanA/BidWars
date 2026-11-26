import { createServerUrls } from './serverUrls.js';

export const { baseUrl: serverBaseUrl, url: serverUrl } = createServerUrls(import.meta.env.VITE_SERVER_BASE_URL);
