"""API-level проверки: auth, RBAC, транзакция списания, аудит, идемпотентность."""
from conftest import auth


def make_order(client, token, product, qty=3, customer="Иван"):
    resp = client.post("/api/orders", headers=auth(token), json={
        "product_id": product["id"], "qty": qty, "customer_name": customer,
    })
    assert resp.status_code == 201, resp.text
    return resp.json()


def stock_of(client, token, product_id):
    resp = client.get("/api/inventory", headers=auth(token))
    assert resp.status_code == 200
    return next(p["stock"] for p in resp.json() if p["id"] == product_id)


def operations(client, token, action=None):
    resp = client.get("/api/analytics/operations?limit=200", headers=auth(token))
    assert resp.status_code == 200
    items = resp.json()
    return [o for o in items if action is None or o["action"] == action]


def test_missing_token_is_401_not_422(client):
    assert client.get("/api/orders").status_code == 401
    assert client.get("/api/orders", headers={"Authorization": "Bearer broken"}).status_code == 401


def test_bad_password_is_401_and_audited(client):
    resp = client.post("/api/auth/login", json={"login": "admin", "password": "wrong"})
    assert resp.status_code == 401
    assert operations(client, _admin(client), "login_failed")


def _admin(client):
    return client.post("/api/auth/login", json={
        "login": "admin", "password": "admin123"}).json()["access_token"]


def test_manager_cannot_write_inventory(client, manager_token, admin_token):
    payload = {"sku": "RBAC-1", "name": "Нельзя", "stock": 1, "price": 1}
    assert client.post("/api/inventory", headers=auth(manager_token), json=payload).status_code == 403
    assert client.post("/api/inventory", headers=auth(admin_token), json=payload).status_code == 200


def test_order_validation_rejects_non_positive_qty(client, admin_token, product):
    resp = client.post("/api/orders", headers=auth(admin_token), json={
        "product_id": product["id"], "qty": 0, "customer_name": "Иван"})
    assert resp.status_code == 422


def test_insufficient_stock_returns_409(client, admin_token, product):
    resp = client.post("/api/orders", headers=auth(admin_token), json={
        "product_id": product["id"], "qty": 99, "customer_name": "Иван"})
    assert resp.status_code == 409
    assert resp.json()["detail"]["error"] == "insufficient_stock"


def test_confirm_writes_off_once_and_writes_audit(client, admin_token, product):
    order = make_order(client, admin_token, product, qty=3)
    assert stock_of(client, admin_token, product["id"]) == 10

    first = client.patch(f"/api/orders/{order['id']}/status",
                         headers=auth(admin_token), json={"status": "confirmed"})
    assert first.status_code == 200, first.text
    assert stock_of(client, admin_token, product["id"]) == 7

    # Повторное подтверждение не списывает второй раз.
    again = client.patch(f"/api/orders/{order['id']}/status",
                         headers=auth(admin_token), json={"status": "confirmed"})
    assert again.status_code == 200
    assert stock_of(client, admin_token, product["id"]) == 7

    audit_rows = operations(client, admin_token)
    assert any(o["action"] == "status_confirmed" and o["entity_id"] == order["number"]
               for o in audit_rows)
    assert any(o["action"] == "stock_write_off" and o["entity_id"] == product["sku"]
               for o in audit_rows)


def test_cancel_restocks_once_and_requires_reason(client, admin_token, product):
    order = make_order(client, admin_token, product, qty=4)
    client.patch(f"/api/orders/{order['id']}/status",
                 headers=auth(admin_token), json={"status": "confirmed"})
    assert stock_of(client, admin_token, product["id"]) == 6

    no_reason = client.patch(f"/api/orders/{order['id']}/status",
                             headers=auth(admin_token), json={"status": "cancelled"})
    assert no_reason.status_code == 400

    cancelled = client.patch(f"/api/orders/{order['id']}/status",
                             headers=auth(admin_token),
                             json={"status": "cancelled", "reason": "клиент отказался"})
    assert cancelled.status_code == 200, cancelled.text
    assert stock_of(client, admin_token, product["id"]) == 10

    again = client.patch(f"/api/orders/{order['id']}/status",
                         headers=auth(admin_token),
                         json={"status": "cancelled", "reason": "повтор"})
    assert again.status_code == 200
    assert stock_of(client, admin_token, product["id"]) == 10


def test_invalid_transition_is_400(client, admin_token, product):
    order = make_order(client, admin_token, product, qty=1)
    client.patch(f"/api/orders/{order['id']}/status",
                 headers=auth(admin_token), json={"status": "confirmed"})
    client.patch(f"/api/orders/{order['id']}/status",
                 headers=auth(admin_token), json={"status": "shipped"})
    resp = client.patch(f"/api/orders/{order['id']}/status",
                        headers=auth(admin_token), json={"status": "new"})
    assert resp.status_code == 400


def test_manager_object_level_access(client, admin_token, manager_token, product):
    foreign = make_order(client, admin_token, product, qty=1, customer="Чужая заявка")
    visible_ids = {o["id"] for o in client.get("/api/orders", headers=auth(manager_token)).json()}
    assert foreign["id"] not in visible_ids

    resp = client.patch(f"/api/orders/{foreign['id']}/status",
                        headers=auth(manager_token), json={"status": "confirmed"})
    assert resp.status_code == 403


def test_bot_order_is_unassigned_pool_for_manager(client, bot_token, manager_token, product):
    order = make_order(client, bot_token, product, qty=2, customer="Из Telegram")
    visible = client.get("/api/orders", headers=auth(manager_token)).json()
    assert order["id"] in {o["id"] for o in visible}

    resp = client.patch(f"/api/orders/{order['id']}/status",
                        headers=auth(manager_token), json={"status": "confirmed"})
    assert resp.status_code == 200, resp.text


def test_stock_service_never_goes_negative(client, admin_token, product):
    from backend.app.database import SessionLocal
    from backend.app.services import stock

    db = SessionLocal()
    try:
        assert stock.write_off(db, product["id"], 8) == 2
        try:
            stock.write_off(db, product["id"], 5)
            assert False, "должно было упасть InsufficientStock"
        except stock.InsufficientStock as e:
            assert e.available == 2
        db.rollback()
    finally:
        db.close()


def test_seed_is_idempotent(client):
    from backend.app.database import SessionLocal
    from backend.app.models import Order, Product, User
    from backend.app.services.seed import seed

    db = SessionLocal()
    try:
        counts = lambda: (db.query(User).count(), db.query(Product).count(), db.query(Order).count())
        before = counts()
        seed(db)
        seed(db)
        assert counts() == before
    finally:
        db.close()
