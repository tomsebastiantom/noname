import type { PermissionKey } from "@noname/auth";
import type { Context } from "hono";
import { Hono } from "hono";
import { z } from "zod";
import { getOrgId } from "../../shared/org";
import { error, ok } from "../../shared/respond";
import { requirePermission } from "../auth/guards";
import type { EvidenceService } from "./ports";

export type EvidenceRouteOptions = {
  permission?: PermissionKey;
  recordType?: string;
  subjectType?: string;
  permissionsByRecordType?: Record<string, PermissionKey>;
  permissionsBySubjectType?: Record<string, PermissionKey>;
};

export function createEvidenceRoutes(service: EvidenceService, options: EvidenceRouteOptions = {}) {
  const routes = new Hono();

  // Writers use the server-side EvidenceService port. No browser-facing write route exists:
  // domain extensions must validate their own payloads and preserve business invariants.
  routes.get("/records", async (c) => {
    const orgId = await requireEvidenceAccess(c, options);
    if (orgId instanceof Response) return orgId;
    const limitParam = c.req.query("limit");
    const limit = limitParam ? Number(limitParam) : undefined;
    if (
      limitParam &&
      (limit === undefined || !Number.isInteger(limit) || limit < 1 || limit > 200)
    ) {
      return error(c, "limit must be an integer between 1 and 200", 400);
    }
    const type = options.recordType ?? c.req.query("type");
    const subjectType = options.subjectType ?? c.req.query("subjectType");
    const specificPermission =
      (type ? options.permissionsByRecordType?.[type] : undefined) ??
      (subjectType ? options.permissionsBySubjectType?.[subjectType] : undefined);
    if (specificPermission) {
      const denied = await requirePermission(c, specificPermission);
      if (denied instanceof Response) return denied;
    }
    const records = await service.listRecords({
      orgId,
      type,
      subjectType,
      subjectId: c.req.query("subjectId"),
      limit,
    });
    const permissionCache = new Map<PermissionKey, boolean>();
    const visible = [];
    for (const record of records) {
      const permission =
        options.permissionsByRecordType?.[record.type] ??
        options.permissionsBySubjectType?.[record.subjectType];
      if (permission && !(await hasEvidencePermission(c, permission, permissionCache))) continue;
      visible.push(record);
    }
    return ok(c, visible);
  });

  routes.get("/links/:recordId", async (c) => {
    const orgId = await requireEvidenceAccess(c, options);
    if (orgId instanceof Response) return orgId;
    const recordId = c.req.param("recordId");
    if (!z.string().uuid().safeParse(recordId).success) return error(c, "invalid record id", 400);
    const record = await service.findRecord(orgId, recordId);
    if (record) {
      const permission =
        options.permissionsByRecordType?.[record.type] ??
        options.permissionsBySubjectType?.[record.subjectType];
      if (permission) {
        const denied = await requirePermission(c, permission);
        if (denied instanceof Response) return denied;
      }
    }
    const links = await service.listLinks(orgId, recordId);
    if (!options.permissionsByRecordType && !options.permissionsBySubjectType) {
      return ok(c, links);
    }
    const permissionCache = new Map<PermissionKey, boolean>();
    const visible = [];
    for (const link of links) {
      const [from, to] = await Promise.all([
        service.findRecord(orgId, link.fromId),
        service.findRecord(orgId, link.toId),
      ]);
      const endpoints = [from, to].filter((endpoint) => endpoint !== null);
      let allowed = true;
      for (const endpoint of endpoints) {
        const permission =
          options.permissionsByRecordType?.[endpoint.type] ??
          options.permissionsBySubjectType?.[endpoint.subjectType];
        if (permission && !(await hasEvidencePermission(c, permission, permissionCache))) {
          allowed = false;
          break;
        }
      }
      if (allowed) visible.push(link);
    }
    return ok(c, visible);
  });

  routes.get("/audit", async (c) => {
    const orgId = await requireEvidenceAccess(c, options);
    if (orgId instanceof Response) return orgId;
    const subjectType = options.subjectType ?? c.req.query("subjectType");
    const specificPermission = subjectType
      ? options.permissionsBySubjectType?.[subjectType]
      : undefined;
    if (specificPermission) {
      const denied = await requirePermission(c, specificPermission);
      if (denied instanceof Response) return denied;
    }
    const records = await service.listAudit(orgId, subjectType, c.req.query("subjectId"));
    const permissionCache = new Map<PermissionKey, boolean>();
    const visible = [];
    for (const record of records) {
      const permission = options.permissionsBySubjectType?.[record.subjectType];
      if (permission && !(await hasEvidencePermission(c, permission, permissionCache))) continue;
      visible.push(record);
    }
    return ok(c, visible);
  });

  return routes;
}

async function hasEvidencePermission(
  c: Context,
  permission: PermissionKey,
  cache: Map<PermissionKey, boolean>,
): Promise<boolean> {
  const cached = cache.get(permission);
  if (cached !== undefined) return cached;
  const result = await requirePermission(c, permission);
  const allowed = !(result instanceof Response);
  cache.set(permission, allowed);
  return allowed;
}

async function requireEvidenceAccess(
  c: Context,
  options: EvidenceRouteOptions,
): Promise<string | Response> {
  if (options.permission) {
    const auth = await requirePermission(c, options.permission);
    if (auth instanceof Response) return auth;
  }
  const orgId = getOrgId(c);
  return orgId || error(c, "org id required", 400);
}
