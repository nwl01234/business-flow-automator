import assert from "node:assert/strict";
import { test } from "node:test";
import { createApp } from "../src/http.ts";
import type { Order, Product } from "../src/domain.ts";

type App = ReturnType<typeof createApp>;

async function login(app: App, loginName: string, password: string): Promise<string> {
  const response = await app.request("/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ login: loginName, password }),
  });
  assert.equal(response.status, 200);
  const body = (await response.json()) as { access_token: string };
  return body.access_token;
}

function call(app: App, token: string | null, method: "GET" | "POST", path: string, body?: unknown) {
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  return app.request(path, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

async function firstProduct(app: App, token: string): Promise<Product> {
  const response = await call(app, token, "GET", "/inventory");
  assert.equal(response.status, 200);
  const products = (await response.json()) as Product[];
  const product = products[0];
  assert.ok(product);
  return product;
}

test("confirm writes off stock once and is idempotent", async () => {
  const app = createApp();
  const admin = await login(app, "admin", "admin123");
  const product = await firstProduct(app, admin);

  const created = await call(app, admin, "POST", "/orders", {
    productId: product.id,
    qty: 3,
    customerName: "Иван",
  });
  assert.equal(created.status, 201);
  const order = (await created.json()) as Order;
  assert.match(order.number, /^NODE-/);

  const first = await call(app, admin, "POST", `/orders/${order.id}/confirm`);
  assert.equal(first.status, 200);
  assert.deepEqual(await first.json(), {
    order: { ...order, status: "confirmed", deducted: true },
    idempotent: false,
    stock: 7,
  });

  const again = await call(app, admin, "POST", `/orders/${order.id}/confirm`);
  assert.equal(again.status, 200);
  const repeated = (await again.json()) as { idempotent: boolean; stock: number };
  assert.equal(repeated.idempotent, true);
  assert.equal(repeated.stock, 7);

  const audit = await call(app, admin, "GET", "/audit");
  const entries = (await audit.json()) as { action: string }[];
  assert.equal(entries.filter((entry) => entry.action === "stock_write_off").length, 1);
  assert.equal(entries.filter((entry) => entry.action === "status_confirmed").length, 1);
});

test("RBAC and object-level access", async () => {
  const app = createApp();
  const admin = await login(app, "admin", "admin123");
  const manager = await login(app, "manager", "manager123");
  const product = await firstProduct(app, admin);

  assert.equal((await call(app, null, "GET", "/orders")).status, 401);
  assert.equal((await call(app, manager, "GET", "/audit")).status, 403);

  const created = await call(app, admin, "POST", "/orders", {
    productId: product.id,
    qty: 1,
    customerName: "Чужая заявка",
  });
  const foreign = (await created.json()) as Order;
  assert.equal((await call(app, manager, "POST", `/orders/${foreign.id}/confirm`)).status, 403);

  const own = await call(app, manager, "POST", "/orders", {
    productId: product.id,
    qty: 1,
    customerName: "Своя заявка",
  });
  const ownOrder = (await own.json()) as Order;
  assert.equal((await call(app, manager, "POST", `/orders/${ownOrder.id}/confirm`)).status, 200);
});

test("validation, insufficient stock and restock on cancel", async () => {
  const app = createApp();
  const admin = await login(app, "admin", "admin123");
  const product = await firstProduct(app, admin);

  const invalid = await call(app, admin, "POST", "/orders", {
    productId: product.id,
    qty: 0,
    customerName: "Иван",
  });
  assert.equal(invalid.status, 400);
  const invalidBody = (await invalid.json()) as { error: { code: string } };
  assert.equal(invalidBody.error.code, "validation_error");

  const tooMany = await call(app, admin, "POST", "/orders", {
    productId: product.id,
    qty: 99,
    customerName: "Иван",
  });
  assert.equal(tooMany.status, 409);
  const tooManyBody = (await tooMany.json()) as { error: { code: string } };
  assert.equal(tooManyBody.error.code, "insufficient_stock");

  const created = await call(app, admin, "POST", "/orders", {
    productId: product.id,
    qty: 2,
    customerName: "Иван",
  });
  const order = (await created.json()) as Order;
  await call(app, admin, "POST", `/orders/${order.id}/confirm`);

  const noReason = await call(app, admin, "POST", `/orders/${order.id}/cancel`, {});
  assert.equal(noReason.status, 400);

  const cancelled = await call(app, admin, "POST", `/orders/${order.id}/cancel`, { reason: "клиент отказался" });
  assert.equal(cancelled.status, 200);
  const cancelledBody = (await cancelled.json()) as { order: Order; idempotent: boolean };
  assert.equal(cancelledBody.order.status, "cancelled");
  assert.equal(cancelledBody.order.deducted, false);

  const stock = (await (await call(app, admin, "GET", "/inventory")).json()) as Product[];
  assert.equal(stock.find((item) => item.id === product.id)?.stock, 10);

  const again = await call(app, admin, "POST", `/orders/${order.id}/cancel`, { reason: "повтор" });
  const againBody = (await again.json()) as { idempotent: boolean };
  assert.equal(againBody.idempotent, true);
});
