import { createHmac } from "node:crypto";
import { fileURLToPath } from "node:url";
import { PERMISSIONS } from "@noname/auth";
import {
  type AssertionConfig,
  createBrowserObserver,
  createHttpClient,
  type EvalResult,
  evaluate,
} from "@noname/eval";
import { signServiceToken } from "../../shared/service-token";
import type { EvidenceService } from "../evidence/ports";
import { recordGateDecision } from "./gate";

/**
 * One eval job = one tenant sweep, run off the request path.
 *
 * The worker mints a short-lived service token for the org, talks to the API over HTTP (never the database), and
 * records exactly one gate decision. `run` is an injection seam so the job logic can be tested without Redis,
 * HTTP or a browser.
 */
export type EvalJobData = {
  orgId: string;
  tenantSlug: string;
  config?: AssertionConfig;
};

export type EvalJobDeps = {
  evidence: EvidenceService;
  run?: () => Promise<EvalResult>;
  apiBase?: string;
  browserEndpoint?: string;
  siteBase?: string;
};

const MACHINES_DIR = fileURLToPath(
  new URL("../../../../../extensions/src/commerce/machines", import.meta.url),
);

export async function executeEvalJob(job: EvalJobData, deps: EvalJobDeps) {
  const result = deps.run ? await deps.run() : await evaluateForJob(job, deps);
  return recordGateDecision(deps.evidence, {
    orgId: job.orgId,
    tenantSlug: job.tenantSlug,
    result,
  });
}

async function evaluateForJob(job: EvalJobData, deps: EvalJobDeps): Promise<EvalResult> {
  const secret = process.env.WORKER_SERVER_SECRET ?? "";
  if (!secret) throw new Error("WORKER_SERVER_SECRET is required to run eval jobs");

  const user = process.env.ZITADEL_DEMO_ADMIN_EMAIL ?? "admin@zitadel.localhost";
  const hmac = createHmac("sha256", secret).update(`${job.orgId}:${user}:admin`).digest("base64");
  const token = signServiceToken({
    serviceId: "eval-worker",
    orgId: job.orgId,
    permissions: [PERMISSIONS.MACHINES_READ],
    exp: Math.floor(Date.now() / 1000) + 600,
  });

  const client = createHttpClient({
    apiBase: deps.apiBase ?? process.env.EVAL_API_BASE ?? "http://127.0.0.1:3000",
    headers: {
      "x-org-id": job.orgId,
      "x-user-id": user,
      "x-role": "admin",
      "x-auth-hmac": hmac,
      Authorization: `Bearer ${token}`,
    },
  });

  const ws = deps.browserEndpoint ?? process.env.EVAL_CDP_ENDPOINT;
  const siteBase =
    deps.siteBase ?? process.env.EVAL_SITE_BASE ?? `http://${job.tenantSlug}.localhost:5173`;
  const browser = ws ? createBrowserObserver({ wsEndpoint: ws, origin: siteBase }) : undefined;

  try {
    return await evaluate({
      client,
      tenantSlug: job.tenantSlug,
      machinesDir: process.env.EVAL_MACHINES_DIR ?? MACHINES_DIR,
      maxRoutes: 50,
      canReadDefinitions: true,
      browser,
      siteBase: browser ? siteBase : undefined,
      config: job.config,
    });
  } finally {
    await browser?.close();
  }
}
