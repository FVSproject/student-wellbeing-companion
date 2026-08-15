import { Rest } from 'ably';

// Ably REST client for server-side publishing + token minting.
// Realtime WebSocket lives in the browser only.
let restClient: Rest | null = null;

export function getAblyRest(): Rest | null {
  const key = process.env.ABLY_API_KEY;
  if (!key) return null;
  if (!restClient) restClient = new Rest(key);
  return restClient;
}

/** Channel naming — one per session, so tokens can be capability-scoped. */
export function sessionChannel(sessionId: string) {
  return `session:${sessionId}`;
}

/** Publish safely — errors log but never throw (Ably is UX, not source of truth). */
export async function publishSessionEvent(
  sessionId: string,
  event: string,
  data: unknown
): Promise<void> {
  const rest = getAblyRest();
  if (!rest) return; // No key configured — silently skip in dev.
  try {
    const channel = rest.channels.get(sessionChannel(sessionId));
    await channel.publish(event, data);
  } catch (err) {
    console.warn('[ably] publish failed:', err);
  }
}
