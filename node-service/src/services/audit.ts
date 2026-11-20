import type { Store } from "../store.ts";

export class AuditService {
  private readonly store: Store;

  constructor(store: Store) {
    this.store = store;
  }

  record(actor: string, action: string, orderNumber: string, details: string): void {
    this.store.appendAudit(actor, action, orderNumber, details);
  }
}
