export type Role = "admin" | "manager";
export type OrderStatus = "new" | "confirmed" | "cancelled";

export interface AuthUser {
  login: string;
  role: Role;
}

export interface User extends AuthUser {
  password: string;
}

export interface Product {
  id: number;
  sku: string;
  name: string;
  stock: number;
  price: number;
}

export interface Order {
  id: number;
  number: string;
  customerName: string;
  productId: number;
  qty: number;
  amount: number;
  status: OrderStatus;
  deducted: boolean;
  createdBy: string;
}

export interface OrderView extends Order {
  product: Pick<Product, "sku" | "name">;
}

export interface AuditEntry {
  id: number;
  ts: string;
  actor: string;
  action: string;
  orderNumber: string;
  details: string;
}
