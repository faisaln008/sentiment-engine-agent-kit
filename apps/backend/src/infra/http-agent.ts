import { Agent, fetch as undiciFetch } from 'undici';

export type FetchFn = (url: string, init: RequestInit) => Promise<Response>;

/**
 * undici's own `fetch` over a keep-alive `Agent` (30 s idle keep-alive, 16 sockets per origin) so the TLS
 * handshake is paid once per provider. Using the package's fetch and Agent together avoids cross-version
 * dispatcher mismatches. Created once in server.ts and injected; adapters never build their own.
 */
export function createKeepAliveFetch(): FetchFn {
  const dispatcher = new Agent({
    keepAliveTimeout: 30_000,
    keepAliveMaxTimeout: 60_000,
    connections: 16,
  });
  // undici's Response/RequestInit are structurally the WHATWG ones; its d.ts uses its own nominal types.
  return (url, init) =>
    undiciFetch(url, { ...init, dispatcher } as Parameters<
      typeof undiciFetch
    >[1]) as unknown as Promise<Response>;
}
