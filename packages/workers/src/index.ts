import { Hono } from "hono";
import type { Env } from "./types";
import { createApiRoutes } from "./routes/api";
import { createStaticRoutes } from "./routes/static";

const app = new Hono<{ Bindings: Env }>();

app.get("/health", (c) => c.json({ status: "ok", version: "0.0.1" }));

app.route("/", createStaticRoutes());
app.route("/", createApiRoutes());

export default app;
