import { Hono } from "hono";
import { ZodError, z } from "zod";
import { auth, issueToken, requireRole } from "./auth.ts";
import type { Env } from "./auth.ts";
import { AppError } from "./errors.ts";
import { AuditService } from "./services/audit.ts";
import { OrderService } from "./services/orders.ts";
import { Store } from "./store.ts";

const loginSchema = z.object({
  login: z.string().min(1).max(64),
  password: z.string().min(1).max(128),
});

const createOrderSchema = z.object({
  customerName: z.string().trim().min(1).max(128),
  productId: z.number().int().positive(),
  qty: z.number().int().positive().max(10_000),
});

const cancelSchema = z.object({
  reason: z.string().trim().min(1).max(500),
});

export function createApp(store = new Store()) {
  const orders = new OrderService(store, new AuditService(store));
  const app = new Hono<Env>();

  app.onError((error, c) => {
    if (error instanceof AppError) {
      return c.json({ error: { code: error.code, message: error.message } }, error.status as 400);
    }
    if (error instanceof ZodError) {
      return c.json(
        {
          error: {
            code: "validation_error",
            message: "invalid request body",
            details: error.issues.map((issue) => ({
              path: issue.path.join("."),
              message: issue.message,
            })),
          },
        },
        400,
      );
    }
    console.error(error);
    return c.json({ error: { code: "internal", message: "internal server error" } }, 500);
  });

  app.notFound((c) => c.json({ error: { code: "not_found", message: "route not found" } }, 404));

  app.get("/health", (c) => c.json({ status: "ok", service: "node-service" }));

  app.get("/", (c) =>
    c.json({
      service: "node-service",
      auth: "POST /auth/login {login,password} -> access_token",
      demo: { admin: "admin123", manager: "manager123" },
      endpoints: ["/inventory", "/orders", "/orders/:id/confirm", "/orders/:id/cancel", "/audit"],
    }),
  );

  app.post("/auth/login", async (c) => {
    const body = loginSchema.parse(await c.req.json());
    const user = store.findUser(body.login);
    if (!user || user.password !== body.password) {
      throw new AppError(401, "unauthorized", "invalid credentials");
    }
    return c.json({
      access_token: await issueToken(user),
      token_type: "bearer",
      user: { login: user.login, role: user.role },
    });
  });

  app.use("*", auth);

  app.get("/inventory", (c) => c.json(store.products));

  app.get("/orders", (c) => c.json(orders.list(c.get("user"))));

  app.post("/orders", requireRole("admin", "manager"), async (c) => {
    const body = createOrderSchema.parse(await c.req.json());
    return c.json(orders.create(c.get("user"), body), 201);
  });

  app.post("/orders/:id/confirm", requireRole("admin", "manager"), (c) => {
    const result = orders.confirm(c.get("user"), orderId(c.req.param("id")));
    return c.json({
      order: result.order,
      idempotent: result.idempotent,
      stock: store.getProduct(result.order.productId).stock,
    });
  });

  app.post("/orders/:id/cancel", requireRole("admin", "manager"), async (c) => {
    const body = cancelSchema.parse(await c.req.json());
    const result = orders.cancel(c.get("user"), orderId(c.req.param("id")), body.reason);
    return c.json({ order: result.order, idempotent: result.idempotent });
  });

  app.get("/audit", requireRole("admin"), (c) => c.json(store.audit));

  return app;
}

function orderId(raw: string | undefined): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) {
    throw new AppError(400, "validation_error", "order id must be a positive integer");
  }
  return id;
}
