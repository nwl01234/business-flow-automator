"""Telegram-бот приёма заявок. Работает через REST API backend'а (отдельный контейнер).

Команды:
  /start  — приветствие
  /stock  — текущие остатки
  /order  — оформить заявку (FSM: товар → количество → имя → контакт → подтверждение)
"""
import asyncio
import logging
import os

import httpx
from aiogram import Bot, Dispatcher, F, Router
from aiogram.filters import Command
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.fsm.storage.memory import MemoryStorage
from aiogram.types import (CallbackQuery, InlineKeyboardButton, InlineKeyboardMarkup,
                           KeyboardButton, Message, ReplyKeyboardMarkup)

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN") or os.environ["BOT_TOKEN"]
API_URL = os.getenv("API_PUBLIC_URL", "http://backend:8000")
API_LOGIN = os.getenv("BOT_API_LOGIN", "telegram_bot")
API_PASSWORD = os.getenv("BOT_API_PASSWORD", "bot_secret_change_me")

router = Router()


class OrderFSM(StatesGroup):
    product = State()
    qty = State()
    name = State()
    contact = State()
    confirm = State()


class ApiClient:
    """HTTP-клиент к backend API с авто-логином сервиса-бота."""

    def __init__(self):
        self.token = None
        self.client = httpx.AsyncClient(base_url=f"{API_URL}/api", timeout=15)

    async def login(self):
        r = await self.client.post("/auth/login", json={"login": API_LOGIN, "password": API_PASSWORD})
        r.raise_for_status()
        self.token = r.json()["access_token"]

    async def call(self, method: str, path: str, **kwargs) -> httpx.Response:
        if not self.token:
            await self.login()
        r = await self.client.request(method, path, headers={"Authorization": f"Bearer {self.token}"}, **kwargs)
        if r.status_code == 401:  # токен истёк — один ретрай
            await self.login()
            r = await self.client.request(method, path, headers={"Authorization": f"Bearer {self.token}"}, **kwargs)
        return r


api = ApiClient()


@router.message(Command("start"))
async def start(msg: Message):
    kb = ReplyKeyboardMarkup(keyboard=[
        [KeyboardButton(text="📦 Сделать заказ"), KeyboardButton(text="📊 Остатки")],
    ], resize_keyboard=True)
    await msg.answer("👋 Привет! Это <b>Business Flow</b> — бот приёма заявок.\n\n"
                     "📦 «Сделать заказ» — оформить заявку (остатки проверяются автоматически)\n"
                     "📊 «Остатки» — что есть в наличии", reply_markup=kb)


@router.message(F.text.in_({"📊 Остатки", "/stock"}))
async def stock(msg: Message):
    r = await api.call("GET", "/inventory")
    lines = [f"{p['name']} ({p['sku']}) — <b>{p['stock']} шт</b> · {p['price']:,.0f} ₽".replace(",", " ")
             for p in r.json()]
    await msg.answer("📊 <b>Остатки</b>:\n" + "\n".join(lines) if lines else "Каталог пуст")


@router.message(F.text.in_({"📦 Сделать заказ", "/order"}))
async def begin_order(msg: Message, state: FSMContext):
    r = await api.call("GET", "/inventory")
    products = [p for p in r.json() if p["stock"] > 0]
    if not products:
        await msg.answer("😴 Сейчас нет товаров в наличии.")
        return
    kb = InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text=f"{p['name']} · {p['stock']} шт · {p['price']:,.0f} ₽".replace(",", " "),
                              callback_data=f"pick:{p['id']}:{p['price']}")] for p in products[:10]
    ])
    await state.set_state(OrderFSM.product)
    await msg.answer("🛒 Выберите товар:", reply_markup=kb)


@router.callback_query(OrderFSM.product)
async def picked(cb: CallbackQuery, state: FSMContext):
    _, pid, price = cb.data.split(":")
    await state.update_data(product_id=int(pid), price=float(price))
    await state.set_state(OrderFSM.qty)
    await cb.message.edit_text("🔢 Сколько штук нужно? (введите число)")
    await cb.answer()


@router.message(OrderFSM.qty)
async def qty_entered(msg: Message, state: FSMContext):
    try:
        qty = int(msg.text)
        assert qty > 0
    except (ValueError, AssertionError):
        await msg.answer("❌ Введите целое число больше 0")
        return
    await state.update_data(qty=qty)
    await state.set_state(OrderFSM.name)
    await msg.answer("👤 Ваше имя или название компании:")


@router.message(OrderFSM.name)
async def name_entered(msg: Message, state: FSMContext):
    await state.update_data(customer_name=msg.text)
    await state.set_state(OrderFSM.contact)
    await msg.answer("📞 Контакт для связи (телефон или @username):")


@router.message(OrderFSM.contact)
async def contact_entered(msg: Message, state: FSMContext):
    await state.update_data(contact=msg.text)
    data = await state.get_data()
    total = data["price"] * data["qty"]
    kb = InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="✅ Подтвердить", callback_data="confirm:yes"),
         InlineKeyboardButton(text="❌ Отмена", callback_data="confirm:no")],
    ])
    await state.set_state(OrderFSM.confirm)
    await msg.answer(
        f"🧾 <b>Проверьте заявку</b>\n"
        f"📦 Товар #{data['product_id']} × {data['qty']} шт\n"
        f"👤 {data['customer_name']}\n📞 {data['contact']}\n"
        f"💰 Сумма: ~{total:,.0f} ₽".replace(",", " "), reply_markup=kb)


@router.callback_query(OrderFSM.confirm, F.data.startswith("confirm:"))
async def confirmed(cb: CallbackQuery, state: FSMContext):
    if cb.data == "confirm:no":
        await state.clear()
        await cb.message.edit_text("❌ Заявка отменена. /order — начать заново")
        return
    data = await state.get_data()
    r = await api.call("POST", "/orders", json={
        "product_id": data["product_id"], "qty": data["qty"],
        "customer_name": data["customer_name"], "contact": data["contact"],
        "note": f"Telegram: @{cb.from_user.username or cb.from_user.id}",
    })
    await state.clear()
    if r.status_code == 201:
        order = r.json()
        await cb.message.edit_text(
            f"✅ Заявка <b>{order['number']}</b> принята!\n"
            f"Статус: ожидаёт подтверждения. Менеджер свяжется с вами.")
    elif r.status_code == 409:
        await cb.message.edit_text(f"⚠️ {r.json().get('message', 'Недостаточно остатка')}\n/order — начните заново")
    else:
        logging.error("order create failed: %s", r.text)
        await cb.message.edit_text("❌ Ошибка создания заявки. Попробуйте позже.")


async def main():
    bot = Bot(BOT_TOKEN)
    dp = Dispatcher(storage=MemoryStorage())
    dp.include_router(router)
    await bot.delete_webhook(drop_pending_updates=True)
    await api.login()
    logging.info("bot connected to API %s", API_URL)
    await dp.start_polling(bot)


if __name__ == "__main__":
    asyncio.run(main())
