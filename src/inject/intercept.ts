// MAIN-world interceptor. MUST be injected at document_start (before the page's own
// scripts run) so our wrappers are installed when the app first calls the API.
//
// NOTE: not part of this phase's verified deliverable, and UNTESTED against the live
// site. Two things are still unknown (see README "Open questions"):
//   1. whether nrc.gsds.ng issues these calls via fetch or XHR — so we patch BOTH;
//   2. the auth scheme — which only matters for *actively* re-querying segments, not
//      for passively forwarding what the page already fetched (what this file does).
//
// It recognises a GSDS payload by host + envelope shape and posts it to the content
// script via window.postMessage. The content script (next increment) feeds it into the
// provider; nothing here modifies the page's requests.

import { API_HOST } from '../shared/config';
import { looksLikeGsdsEnvelope } from '../api/envelope';

export const CAPTURE_CHANNEL = 'NRC_OPTIMISER_CAPTURE';
export const ACTIVE_FETCH = 'NRC_OPTIMISER_ACTIVE_FETCH';
export const ACTIVE_RESULT = 'NRC_OPTIMISER_ACTIVE_RESULT';
export const ACTIVE_READY = 'NRC_OPTIMISER_ACTIVE_READY';

// Captured from a real search-trips request so active mode can replay its auth verbatim,
// rather than reverse-engineering where the token lives.
let capturedInit: { headers: Record<string, string>; credentials: RequestCredentials } | null = null;

function extractInit(input: unknown, init: RequestInit | undefined) {
  const headers: Record<string, string> = {};
  try {
    if (input instanceof Request) input.headers.forEach((v, k) => (headers[k] = v));
  } catch {
    /* ignore */
  }
  try {
    if (init?.headers) new Headers(init.headers).forEach((v, k) => (headers[k] = v));
  } catch {
    /* ignore */
  }
  return { headers, credentials: 'include' as RequestCredentials };
}

function isGsdsUrl(url: string): boolean {
  try {
    return new URL(url, location.href).host === API_HOST;
  } catch {
    return false;
  }
}

function forward(url: string, body: unknown): void {
  if (looksLikeGsdsEnvelope(body)) {
    console.debug('[NRC Optimiser] forwarding GSDS payload', url);
    window.postMessage({ channel: CAPTURE_CHANNEL, url, body }, location.origin);
  }
}

export function installInterceptor(): void {
  console.info('[NRC Optimiser] interceptor installed (MAIN world) on', location.href);
  // --- fetch ---
  const origFetch = window.fetch;
  window.fetch = async function (this: unknown, ...args: Parameters<typeof fetch>) {
    const res = await origFetch.apply(this as typeof globalThis, args);
    const input = args[0];
    const url =
      typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url;
    if (isGsdsUrl(url)) {
      if (!capturedInit && url.includes('/search/search-trips')) {
        capturedInit = extractInit(input, args[1]);
        window.postMessage({ channel: ACTIVE_READY }, location.origin);
        console.info('[NRC Optimiser] active mode ready (captured request template)');
      }
      console.debug('[NRC Optimiser] fetch →', url);
      res
        .clone()
        .json()
        .then((body) => forward(url, body))
        .catch(() => {
          /* non-JSON response — ignore */
        });
    }
    return res;
  };

  // --- XMLHttpRequest ---
  const origOpen = XMLHttpRequest.prototype.open;
  const origSend = XMLHttpRequest.prototype.send;
  const origSetHeader = XMLHttpRequest.prototype.setRequestHeader;
  type NrcXhr = XMLHttpRequest & { __nrcUrl?: string; __nrcHeaders?: Record<string, string> };

  XMLHttpRequest.prototype.open = function (
    this: XMLHttpRequest,
    method: string,
    url: string | URL,
    ...rest: unknown[]
  ): void {
    (this as NrcXhr).__nrcUrl = String(url);
    (origOpen as (...a: unknown[]) => void).call(this, method, url, ...rest);
  };

  // Record headers the page sets (e.g. Authorization) so active mode can replay them.
  XMLHttpRequest.prototype.setRequestHeader = function (
    this: XMLHttpRequest,
    name: string,
    value: string,
  ): void {
    const x = this as NrcXhr;
    (x.__nrcHeaders ??= {})[name] = value;
    origSetHeader.call(this, name, value);
  };

  XMLHttpRequest.prototype.send = function (this: XMLHttpRequest, body?: unknown): void {
    const x = this as NrcXhr;
    const url = x.__nrcUrl;
    if (url && isGsdsUrl(url) && !capturedInit && url.includes('/search/search-trips')) {
      capturedInit = { headers: x.__nrcHeaders ?? {}, credentials: 'include' };
      window.postMessage({ channel: ACTIVE_READY }, location.origin);
      console.info('[NRC Optimiser] active mode ready (captured XHR template)');
    }
    this.addEventListener('load', () => {
      if (url && isGsdsUrl(url)) {
        try {
          forward(url, JSON.parse(this.responseText));
        } catch {
          /* not JSON — ignore */
        }
      }
    });
    (origSend as (...a: unknown[]) => void).call(this, body);
  };

  // --- active mode: on request from the content script, fetch a sub-segment via the
  //     ORIGINAL fetch (so we don't recursively re-forward), reusing the captured auth.
  window.addEventListener('message', (ev: MessageEvent) => {
    if (ev.source !== window) return;
    const d = ev.data as { channel?: string; url?: string };
    if (d?.channel !== ACTIVE_FETCH || !d.url) return;
    const url = d.url;
    void (async () => {
      try {
        const res = await origFetch(url, {
          headers: capturedInit?.headers ?? {},
          credentials: capturedInit?.credentials ?? 'include',
        });
        const body = await res.json().catch(() => null);
        window.postMessage({ channel: ACTIVE_RESULT, url, ok: res.ok, body }, location.origin);
      } catch {
        window.postMessage({ channel: ACTIVE_RESULT, url, ok: false, body: null }, location.origin);
      }
    })();
  });
}
