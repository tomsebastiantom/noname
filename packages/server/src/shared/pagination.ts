import type { Context } from "hono";

export interface LimitOffset {
  limit?: number;
  offset?: number;
}

export interface ParseLimitOffsetOptions {
  defaultLimit?: number;
  defaultOffset?: number;
  maxLimit?: number;
}

/** Parse `limit` and `offset` query params with sane bounds. */
export function parseLimitOffset(c: Context, options: ParseLimitOffsetOptions = {}): LimitOffset {
  const { defaultLimit, defaultOffset = 0, maxLimit = 500 } = options;

  const limitRaw = c.req.query("limit");
  const offsetRaw = c.req.query("offset");

  let limit: number | undefined;
  if (limitRaw !== undefined && limitRaw !== "") {
    const parsed = Number(limitRaw);
    if (!Number.isFinite(parsed) || parsed < 1) {
      limit = defaultLimit;
    } else {
      limit = Math.min(Math.floor(parsed), maxLimit);
    }
  } else if (defaultLimit !== undefined) {
    limit = defaultLimit;
  }

  let offset: number | undefined;
  if (offsetRaw !== undefined && offsetRaw !== "") {
    const parsed = Number(offsetRaw);
    offset = Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : defaultOffset;
  } else if (defaultOffset > 0) {
    offset = defaultOffset;
  }

  return { limit, offset };
}
