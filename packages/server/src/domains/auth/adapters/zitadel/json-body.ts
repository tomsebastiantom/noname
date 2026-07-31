/** JSON body for fetch when `body` is optional — omit Content-Length when undefined. */
export function jsonRequestBody(body: unknown | undefined): string | undefined {
  if (body === undefined) return undefined;
  return JSON.stringify(body);
}
