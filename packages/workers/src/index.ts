import { Hono } from "hono";
import { createApiProxyRoutes } from "./routes/proxy";
import { createStaticRoutes } from "./routes/static";
import { createStorefrontRoutes } from "./routes/storefront";
import type { Env } from "./types";

const app = new Hono<{ Bindings: Env }>();

app.get("/health", (c) => c.json({ status: "ok", version: "0.0.1" }));

app.route("/api", createApiProxyRoutes());
app.route("/", createStaticRoutes());
app.route("/", createStorefrontRoutes());

export default app;
