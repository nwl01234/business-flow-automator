import type { AuthUser, Order, OrderView } from "../domain.ts";
import { AppError } from "../errors.ts";
import type { AuthActor, Store } from "../store.ts";
import type { AuditService } from "./audit.ts";

export interface CreateOrderInput {
  customerName: string;
  productId: number;
  qty: number;
}

export interface StatusResult {
  order: OrderView;
  idempotent: boolean;
}

export class OrderService {
  private readonly store: Store;
  private readonly audit: AuditService;

  constructor(store: Store, audit: AuditService) {
    this.store = store;
    this.audit = audit;
  }

  list(actor: AuthUser): OrderView[] {
    return this.store.listOrders(toActor(actor)).map((order) => this.view(order));
  }

  create(actor: AuthUser, input: CreateOrderInput): OrderView {
    const product = this.store.getProduct(input.productId);
    if (product.stock < input.qty) {
      throw new AppError(
        409,
        "insufficient_stock",
        `insufficient stock: available ${product.stock}, requested ${input.qty}`,
      );
    }

    const order = this.store.insertOrder({
      customerName: input.customerName,
      productId: product.id,
      qty: input.qty,
      price: product.price,
      createdBy: actor.login,
    });
    this.audit.record(
      actor.login,
      "order_created",
      order.number,
      `${product.name} × ${order.qty} = ${order.amount}`,
    );
    return this.view(order);
  }

  confirm(actor: AuthUser, orderId: number): StatusResult {
    const order = this.accessibleOrder(actor, orderId);

    if (order.status === "confirmed") {
      return { order: this.view(order), idempotent: true };
    }
    if (order.status !== "new") {
      throw new AppError(409, "invalid_transition", `cannot confirm order in status ${order.status}`);
    }

    const stock = this.store.writeOff(order.productId, order.qty);
    order.status = "confirmed";
    order.deducted = true;
    this.audit.record(actor.login, "status_confirmed", order.number, `written off ${order.qty}, stock ${stock}`);
    this.audit.record(actor.login, "stock_write_off", order.number, `-${order.qty}, stock ${stock}`);
    return { order: this.view(order), idempotent: false };
  }

  cancel(actor: AuthUser, orderId: number, reason: string): StatusResult {
    const order = this.accessibleOrder(actor, orderId);

    if (order.status === "cancelled") {
      return { order: this.view(order), idempotent: true };
    }
    if (order.status !== "confirmed" && order.status !== "new") {
      throw new AppError(409, "invalid_transition", `cannot cancel order in status ${order.status}`);
    }

    if (order.deducted) {
      const stock = this.store.restock(order.productId, order.qty);
      order.deducted = false;
      this.audit.record(actor.login, "stock_restock", order.number, `+${order.qty}, stock ${stock}`);
    }
    order.status = "cancelled";
    this.audit.record(actor.login, "status_cancelled", order.number, reason);
    return { order: this.view(order), idempotent: false };
  }

  private accessibleOrder(actor: AuthUser, orderId: number): Order {
    const order = this.store.getOrder(orderId);
    if (actor.role !== "admin" && order.createdBy !== actor.login) {
      throw new AppError(403, "forbidden", "order belongs to another manager");
    }
    return order;
  }

  private view(order: Order): OrderView {
    const product = this.store.getProduct(order.productId);
    return { ...order, product: { sku: product.sku, name: product.name } };
  }
}

function toActor(user: AuthUser): AuthActor {
  return { login: user.login, role: user.role };
}
