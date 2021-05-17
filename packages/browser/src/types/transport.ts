export interface HttpClient {
  request(
    requestUrl: string,
    method: string,
    headers: Record<string, string>,
    data?: Record<string, string>,
  ): Promise<Response>;

  requestWithTimeout(
    timeoutMillis: number,
    requestUrl: string,
    method: string,
    headers: Record<string, string>,
    data?: Record<string, string>,
  ): Promise<Response>;
}
