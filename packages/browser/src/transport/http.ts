/**
 * @packageDocumentation
 * @internal
 */

import unfetch from 'unfetch';

import { HttpClient } from '../types/transport';

const fetch = globalThis.fetch || unfetch;

const request: HttpClient['request'] = (
  requestUrl: string,
  method: string,
  headers: Record<string, string>,
  data?: Record<string, string>,
): Promise<Response> => {
  return fetch(requestUrl, {
    method,
    headers,
    body: data && JSON.stringify(data),
  });
};

const requestWithTimeout: HttpClient['requestWithTimeout'] = (
  timeoutMillis: number,
  requestUrl: string,
  method: string,
  headers: Record<string, string>,
  data?: Record<string, string>,
): Promise<Response> => {
  const controller = new AbortController();
  const signal = controller.signal;
  const timeout = window.setTimeout(() => controller.abort(), timeoutMillis);
  const promise = fetch(requestUrl, {
    method,
    headers,
    body: data && JSON.stringify(data),
    signal,
  });
  return promise.finally(() => window.clearTimeout(timeout));
};

export const FetchHttpClient: HttpClient = {
  request,
  requestWithTimeout,
};
