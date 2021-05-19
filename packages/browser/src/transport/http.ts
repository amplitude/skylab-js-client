/**
 * @packageDocumentation
 * @internal
 */

import unfetch from 'unfetch';

import { HttpClient } from '../types/transport';

const fetch = globalThis.fetch || unfetch;

/*
 * Copied from:
 * https://github.com/github/fetch/issues/175#issuecomment-284787564
 */
function timeout(
  timeoutMillis: number,
  promise: Promise<Response>,
): Promise<Response> {
  return new Promise(function (resolve, reject) {
    setTimeout(function () {
      reject(Error('Request timeout after ' + timeoutMillis + ' milliseconds'));
    }, timeoutMillis);
    promise.then(resolve, reject);
  });
}

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
  return timeout(timeoutMillis, request(requestUrl, method, headers, data));
};

export const FetchHttpClient: HttpClient = {
  request,
  requestWithTimeout,
};
