"""Первичное наполнение: пользователи + демо-данные, чтобы дашборд был живым с первого запуска."""
import random
from datetime import timedelta

from sqlalchemy.orm import Session

from ..config import settings
from ..models import Operation, Order, Product, User, utcnow
from ..security import hash_password

_PRODUCTS = [
    ("SKU-1001", "Промо-стенд A2", 12, 3500),
    ("SKU-1002", "Промо-стенд A3", 40, 2100),
    ("SKU-1003", "Брендированная кружка", 85, 690),
    ("SKU-1004", "Визитки 500 шт", 200, 890),
    ("SKU-1005", "Roll-up 85×200", 7, 5400),
    ("SKU-1006", "Футболка с принтом", 45, 1250),
    ("SKU-1007", "Буклет А4, тираж 100", 60, 3200),
    ("SKU-1008", "Пакет-шоппер с лого", 150, 340),
]

_CUSTOMERS = ["ООО Романофф", "ИП Смирнов", "ООО Северсталь-Трейд", "Мария К.", "ООО Логика",
              "ООО Прогресс", "Алексей В.", "ООО Экаплюс", "ИП Donut", "ООО Мосволна"]

random.seed(42)


def seed(db: Session) -> None:
    if db.query(User).count() == 0:
        db.add_all([
            User(login=settings.admin_login, password_hash=hash_password(settings.admin_password),
                 full_name="Администратор", role="admin", email=""),
            User(login=settings.manager_login, password_hash=hash_password(settings.manager_password),
                 full_name="Анна Менеджер", role="manager", email=""),
            User(login=settings.bot_login, password_hash=hash_password(settings.bot_password),
                 full_name="Telegram Bot", role="bot"),
        ])
        db.commit()

    if settings.seed_demo and db.query(Product).count() == 0:
        products = [Product(sku=s, name=n, stock=st, price=p) for s, n, st, p in _PRODUCTS]
        db.add_all(products)
        db.flush()  # получить id для связки заказов
        bot = db.query(User).filter_by(role="bot").first()
        for day in range(13, -1, -1):
            for _ in range(random.randint(2, 6)):
                p = random.choice(products)
                qty = random.choice([1, 1, 2, 3, 5, 10])
                created = utcnow().replace(hour=random.randint(9, 19), minute=random.randint(0, 59)) \
                    - timedelta(days=day)
                if day == 0 and created > utcnow():
                    created = utcnow() - timedelta(hours=random.randint(0, 3))
                if day > 3:
                    status = random.choices(["shipped", "cancelled"], weights=[85, 15])[0]
                elif day > 0:
                    status = random.choices(["shipped", "confirmed", "cancelled"], weights=[55, 25, 20])[0]
                else:
                    status = "new"
                order = Order(
                    number=f"BF-{created:%Y%m%d}-{random.randint(100, 999)}",
                    customer_name=random.choice(_CUSTOMERS),
                    contact=random.choice(["+7 9xx xxx-xx-xx", "info@company.ru", "Telegram DM"]),
                    product_id=p.id, qty=qty, price=p.price, amount=p.price * qty,
                    status=status, source=random.choice(["web", "telegram"]),
                    created_by_id=bot.id if status == "new" and random.random() < .5 else None,
                    created_at=created, updated_at=created,
                )
                db.add(order)
        db.add(Operation(actor="system", action="seed_demo", entity="system",
                         details="Начальные демо-данные созданы"))
        db.commit()
