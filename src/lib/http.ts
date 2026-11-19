import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { ZodError, type z, type ZodTypeAny } from "zod";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export const ok = (data: unknown, status = 200) =>
  NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });

export const fail = (status: number, message: string) =>
  NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });

// Wraps a route handler with uniform error handling — internal errors never leak details.
export function route<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (e) {
      // Let Next.js' internal control-flow signals through (e.g. it uses this one at
      // build time to detect that a route reads cookies/headers and must stay dynamic).
      const digest = (e as { digest?: unknown } | null)?.digest;
      if (typeof digest === "string" && (digest === "DYNAMIC_SERVER_USAGE" || digest.startsWith("NEXT_"))) throw e;
      if (e instanceof HttpError) return fail(e.status, e.message);
      if (e instanceof ZodError) {
        return fail(400, e.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("; "));
      }
      console.error("[api]", e);
      return fail(500, "Internal server error");
    }
  };
}

export async function body<S extends ZodTypeAny>(req: Request, schema: S): Promise<z.output<S>> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new HttpError(400, "Invalid JSON body");
  }
  return schema.parse(raw);
}

export function clientIp(): string | null {
  const h = headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null;
}

export function notFound(what = "Resource"): never {
  throw new HttpError(404, `${what} not found`);
}
