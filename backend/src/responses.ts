export class RelayError extends Error {
  constructor(readonly status: number, readonly title: string, detail: string) {
    super(detail);
    this.name = "RelayError";
  }
}

export function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });
}

export function problem(status: number, title: string, detail: string): Response {
  const response = json({ title, detail, status }, status);
  response.headers.set("Content-Type", "application/problem+json; charset=utf-8");
  return response;
}

export async function readObject(request: Request): Promise<Record<string, unknown>> {
  const limit = 16_384;
  if (Number(request.headers.get("Content-Length")) > limit) {
    await request.body?.cancel();
    throw new RelayError(413, "request_too_large", "The request body is too large.");
  }
  const chunks: Uint8Array[] = [];
  let size = 0;
  if (request.body) {
    const reader = request.body.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > limit) {
          await reader.cancel();
          throw new RelayError(413, "request_too_large", "The request body is too large.");
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    const value: unknown = JSON.parse(new TextDecoder().decode(body));
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
  } catch {
    // Treat malformed JSON and non-object JSON alike; never return input in errors.
  }
  throw new RelayError(400, "invalid_request", "A JSON object is required.");
}

export function requiredString(value: unknown, field: string, title: string, maxLength = 8192): string {
  if (typeof value !== "string" || !value.trim() || value.length > maxLength) {
    throw new RelayError(400, title, `A valid '${field}' string is required.`);
  }
  return value;
}

export function optionalString(value: unknown, field: string, title: string): string | null {
  if (value === undefined || value === null || value === "") return null;
  return requiredString(value, field, title, 1000);
}

export function redirect(url: string): Response {
  return new Response(null, {
    status: 302,
    headers: { Location: url, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" }
  });
}
