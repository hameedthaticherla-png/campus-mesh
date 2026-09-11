/**
 * Campus Mesh — Frontend API & WebSocket Environment Configuration
 *
 * In local development, requests use relative paths ('/api/...') proxied by Vite.
 * In production (e.g. Vercel deployment), VITE_API_URL and VITE_WS_URL point to
 * the authoritative persistent backend service (e.g. Render / Railway / Fly.io / VPS).
 */

export const API_BASE_URL: string = (
  (import.meta.env.VITE_API_URL as string | undefined) || ''
).replace(/\/+$/, '');

export function getSignalingWsUrl(): string {
  const customWs = import.meta.env.VITE_WS_URL as string | undefined;
  if (customWs) {
    const raw = customWs.replace(/\/+$/, '');
    return raw.endsWith('/ws/signaling') ? raw : `${raw}/ws/signaling`;
  }
  if (typeof window === 'undefined') return '';
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/ws/signaling`;
}
