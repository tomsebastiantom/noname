import { Hono } from "hono";
export const specRoutes = new Hono();
specRoutes.post("/templates", (c) => c.json({}, 201));
specRoutes.get("/templates", (c) => c.json([]));
specRoutes.put("/templates/:name", (c) => c.json({}));
