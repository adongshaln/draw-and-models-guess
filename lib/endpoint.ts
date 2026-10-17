/**
 * Every player types in a URL, and the server then fetches it. That is a
 * server-side request forgery hole unless it is closed, so this module is the
 * one place that decides what an endpoint may be:
 *
 *   - https only, no credentials in the URL
 *   - the hostname may not be localhost / *.local / *.internal
 *   - it must not resolve to a private, loopback, link-local or CGNAT address
 *
 * Known limitation: a hostname can still resolve to a public address here and a
 * private one when the model call happens (DNS rebinding). Closing that fully
 * means pinning the resolved address in a custom fetch dispatcher, which is not
 * worth it for a party game.
 */
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const BLOCKED_HOST = /(^|\.)(localhost|local|internal|home\.arpa|onion)$/i;

/** True for any address a server should never be asked to call. */
export function isPrivateAddress(ip: string): boolean {
  const family = isIP(ip);
  if (family === 4) {
    const [a, b] = ip.split(".").map(Number);
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true; // link-local, cloud metadata lives here
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 192 && b === 0) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a === 198 && (b === 18 || b === 19)) return true;
    if (a >= 224) return true; // multicast + reserved
    return false;
  }
  if (family === 6) {
    const s = ip.toLowerCase();
    if (s === "::" || s === "::1") return true;
    if (s.startsWith("fe80") || s.startsWith("fc") || s.startsWith("fd")) return true;
    const mapped = s.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
    if (mapped) return isPrivateAddress(mapped[1]);
    if (s.startsWith("::ffff:")) return true;
    return false;
  }
  return true;
}

/** Everything that can be checked without a DNS lookup. */
export function assertEndpointShape(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new Error("That endpoint is not a URL.");
  }
  if (url.protocol !== "https:") throw new Error("The endpoint must start with https://.");
  if (url.username || url.password) throw new Error("Do not put credentials in the endpoint URL.");
  const host = url.hostname.toLowerCase();
  if (!host) throw new Error("That endpoint has no host.");
  if (host === "localhost" || BLOCKED_HOST.test(host)) throw new Error("That host is not allowed.");
  if (isIP(host) !== 0 && isPrivateAddress(host)) throw new Error("That host is not allowed.");
  return url;
}

/** Shape plus DNS: every address the name resolves to must be public. */
export async function assertSafeEndpoint(raw: string): Promise<URL> {
  const url = assertEndpointShape(raw);
  if (isIP(url.hostname) !== 0) return url;
  let addresses: { address: string }[];
  try {
    addresses = await lookup(url.hostname, { all: true, verbatim: true });
  } catch {
    throw new Error("Could not resolve that endpoint.");
  }
  if (addresses.length === 0) throw new Error("Could not resolve that endpoint.");
  for (const a of addresses) {
    if (isPrivateAddress(a.address)) throw new Error("That endpoint resolves to a private address.");
  }
  return url;
}
