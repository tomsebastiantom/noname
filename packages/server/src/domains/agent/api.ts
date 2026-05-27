import { Hono } from "hono";
export const agentRoutes = new Hono();
agentRoutes.post("/tasks", (c) => c.json({}, 201));
agentRoutes.get("/tasks", (c) => c.json([]));
agentRoutes.put("/tasks/:id/approve", (c) => c.json({}));
agentRoutes.put("/tasks/:id/reject", (c) => c.json({}));
