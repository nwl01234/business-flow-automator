import type { AuditEntry, Order, Product, User } from "./domain.ts";
import { AppError } from "./errors.ts";

const SEED_PRODUCTS: readonly Product[] = [
  { id: 1, sku: "SKU-1001", name: "Промо-стенд A2", stock: 10, price: 3500 },
  { id: 2, sku: "SKU-1002", name: "Буклет A4, тираж 100", stock: 40, price: 3200 },
  { id: 3, sku: "SKU-1003", name: "Визитки 500 шт", stock: 200, price: 890 },
];

const SEED_USERS: readonly User[] = [
  { login: "admin", password: "admin123", role: "admin" },
  { login: "manager", password: "manager123", role: "manager" },
];

export interface NewOrder {
  customerName: string;
  productId: number;
  qty: number;
  price: number;
  createdBy: string;
}

export class Store {
  readonly products: Product[];
  readonly users: User[];
  readonly audit: AuditEntry[] = [];
  private readonly orders = new Map<number, Order>();
  private nextOrderId = 1;
  private nextAuditId = 1;

  constructor() {
    this.products = SEED_PRODUCTS.map((product) => ({ ...product }));
    this.users = SEED_USERS.map((user) => ({ ...user }));
  }

  findUser(login: string): User | undefined {
    return this.users.find((user) => user.login === login);
  }

  getProduct(id: number): Product {
    const product = this.products.find((candidate) => candidate.id === id);
    if (!product) {
      throw new AppError(404, "not_found", "product not found");
    }
    return product;
  }

  getOrder(id: number): Order {
    const order = this.orders.get(id);
    if (!order) {
      throw new AppError(404, "not_found", "order not found");
    }
    return order;
  }

  listOrders(actor: AuthActor): Order[] {
    const all = [...this.orders.values()];
    return actor.role === "admin"
      ? all
      : all.filter((order) => order.createdBy === actor.login);
  }

  insertOrder(input: NewOrder): Order {
    const id = this.nextOrderId++;
    const order: Order = {
      id,
      number: `NODE-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${1000 + id}`,
      customerName: input.customerName,
      productId: input.productId,
      qty: input.qty,
      amount: input.price * input.qty,
      status: "new",
      deducted: false,
      createdBy: input.createdBy,
    };
    this.orders.set(id, order);
    return order;
  }

  writeOff(productId: number, qty: number): number {
    const product = this.getProduct(productId);
    if (product.stock < qty) {
      throw new AppError(
        409,
        "insufficient_stock",
        `insufficient stock: available ${product.stock}, requested ${qty}`,
      );
    }
    product.stock -= qty;
    return product.stock;
  }

  restock(productId: number, qty: number): number {
    const product = this.getProduct(productId);
    product.stock += qty;
    return product.stock;
  }

  appendAudit(actor: string, action: string, orderNumber: string, details: string): void {
    this.audit.push({
      id: this.nextAuditId++,
      ts: new Date().toISOString(),
      actor,
      action,
      orderNumber,
      details,
    });
  }
}

export type AuthActor = Pick<User, "login" | "role">;
