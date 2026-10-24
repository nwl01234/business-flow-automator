import React, { useState } from 'react';
import { fmt, fmtDate } from './api.js';
import { SalesChart, TopProducts } from './charts.jsx';

const STATUS_STYLE = {
  new: 'bg-amber-500/15 text-amber-300',
  confirmed: 'bg-blue-500/15 text-blue-300',
  shipped: 'bg-emerald-500/15 text-emerald-300',
  cancelled: 'bg-rose-500/15 text-rose-300',
};
const STATUS_OPTIONS = [
  ['new', '● Новая'], ['confirmed', '● Подтверждена'],
  ['shipped', '● Отгружена'], ['cancelled', '● Отменена'],
];

const TABS = [
  { id: 'dashboard', name: 'Дашборд', icon: '📊' },
  { id: 'orders', name: 'Заявки', icon: '🧾' },
  { id: 'inventory', name: 'Остатки', icon: '📦' },
];

export function Login({ onLogin }) {
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async e => {
    e.preventDefault();
    setBusy(true); setError('');
    try { onLogin(await doLogin(login, password)); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <form onSubmit={submit} className="card w-full max-w-sm p-8 shadow-2xl">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-lg">◆</div>
          <div>
            <div className="text-white font-bold">Business Flow</div>
            <div className="text-xs text-slate-500">Automator · v1.0</div>
          </div>
        </div>
        <label className="block text-xs font-semibold text-slate-400 mb-1">Логин</label>
        <input value={login} onChange={e => setLogin(e.target.value)} placeholder="admin"
               className="w-full mb-4 bg-slate-900/70 border border-[#1e2947] rounded-lg px-3 py-2.5 text-sm text-white outline-none focus:border-indigo-500" />
        <label className="block text-xs font-semibold text-slate-400 mb-1">Пароль</label>
        <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••"
               className="w-full mb-6 bg-slate-900/70 border border-[#1e2947] rounded-lg px-3 py-2.5 text-sm text-white outline-none focus:border-indigo-500" />
        <button disabled={busy}
                className="w-full py-2.5 rounded-lg bg-gradient-to-r from-indigo-500 to-violet-600 text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50">
          {busy ? 'Проверка…' : 'Войти'}
        </button>
        {error && <p className="mt-4 text-xs text-center text-rose-400">{error}</p>}
        <p className="mt-2 text-xs text-slate-600 text-center">демо: admin / admin123 · manager / manager123</p>
      </form>
    </div>
  );
}

export function Shell(p) {
  const { user, metrics, history, filters, setFilters, onRefresh, onNewOrder, wsLive, onLogout, tab, setTab } = p;

  const m = metrics || {};
  const kpis = [
    { label: 'Заявок сегодня', icon: '🆕', value: m.orders_today ?? '—', sub: 'всего за период: ' + (m.orders_total ?? '—') },
    { label: 'Заявок за 7 дней', icon: '📅', value: m.orders_week ?? '—', sub: 'статусы: ' + Object.values(m.status_counts || {}).join(' / ') },
    { label: 'Выручка, 7 дней', icon: '💰', value: m.revenue_week ? fmt(m.revenue_week) + ' ₽' : '—', sub: 'всего: ' + (m.revenue_total ? fmt(m.revenue_total) + ' ₽' : '0 ₽') },
    { label: 'Конверсия', icon: '🎯', value: m.conversion != null ? m.conversion + ' %' : '—', sub: 'средний чек: ' + (m.avg_check ? fmt(m.avg_check) + ' ₽' : '—') },
    { label: 'Низкие остатки', icon: '⚠️', value: m.low_stock ? m.low_stock.length : '—', sub: 'позиций ≤ 5 шт' },
  ];

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="hidden lg:flex flex-col w-60 shrink-0 border-r border-[#1e2947] p-5 gap-2">
        <div className="flex items-center gap-2 mb-6">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-sm">◆</div>
          <span className="text-white font-bold text-sm">Business Flow</span>
        </div>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
                  className={'text-left px-3 py-2 rounded-lg text-sm font-medium transition ' + (tab === t.id ? 'bg-indigo-500/15 text-indigo-300' : 'hover:bg-slate-800/60')}>
            {t.icon}&nbsp; {t.name}
          </button>
        ))}
        <div className="mt-auto text-xs text-slate-500">
          <div className="flex items-center gap-2 mb-1">
            <span className="pulse-dot" style={{ background: wsLive ? '#10b981' : '#f59e0b' }} />
            {wsLive ? 'live · WebSocket' : 'поллинг · 20 сек'}
          </div>
          <div className="text-slate-400">{user.full_name}</div>
          <div className="uppercase tracking-wide text-[10px]">{user.role}</div>
          <button onClick={onLogout} className="mt-3 text-slate-500 hover:text-rose-400">Выйти →</button>
        </div>
      </aside>

      <main className="flex-1 p-4 sm:p-8 max-w-7xl mx-auto w-full">
        {/* mobile header */}
        <div className="lg:hidden flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-xs">◆</div>
            <span className="text-white font-bold text-sm">Business Flow</span>
          </div>
          <button onClick={onLogout} className="text-xs text-slate-500">Выйти</button>
        </div>
        <div className="lg:hidden flex gap-1 mb-4 overflow-x-auto">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
                    className={'px-3 py-1.5 rounded-lg text-xs whitespace-nowrap ' + (tab === t.id ? 'bg-indigo-500/20 text-indigo-300' : 'bg-slate-800/60')}>
              {t.icon} {t.name}
            </button>
          ))}
        </div>

        {/* Filters */}
        <div className="card p-4 mb-6 flex flex-wrap items-end gap-3">
          <DateField label="Дата с" type="date" value={filters.from} onChange={v => setFilters(f => ({ ...f, from: v }))} />
          <DateField label="по" type="date" value={filters.to} onChange={v => setFilters(f => ({ ...f, to: v }))} />
          <DateField label="Статус" type="select" value={filters.status} onChange={v => setFilters(f => ({ ...f, status: v }))} />
          {user.role !== 'bot' && (
            <button onClick={onNewOrder}
                    className="ml-auto px-4 py-2 rounded-lg bg-gradient-to-r from-indigo-500 to-violet-600 text-white text-sm font-semibold hover:opacity-90">
              ＋ Новая заявка
            </button>
          )}
          <button onClick={onRefresh} className="px-3 py-2 rounded-lg bg-slate-800/60 text-sm hover:bg-slate-700/60">⟳</button>
        </div>

        {/* KPI */}
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4 mb-6">
          {kpis.map(k => (
            <div key={k.label} className="card p-5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-slate-500">{k.label}</span>
                <span className="text-lg">{k.icon}</span>
              </div>
              <div className="num text-2xl font-bold text-white">{k.value}</div>
              <div className="num text-xs mt-1 text-slate-400">{k.sub}</div>
            </div>
          ))}
        </div>

        {/* Charts */}
        {(tab === 'dashboard') && metrics && (
          <div className="grid lg:grid-cols-3 gap-4 mb-6">
            <div className="card p-5 lg:col-span-2">
              <h3 className="text-sm font-semibold text-white mb-4">📈 Динамика заявок и выручки</h3>
              <SalesChart series={metrics.series} />
            </div>
            <div className="card p-5">
              <h3 className="text-sm font-semibold text-white mb-4">🏆 Топ товаров</h3>
              <TopProducts top={metrics.top_products} />
            </div>
          </div>
        )}

        {/* Sections */}
        {(tab === 'dashboard' || tab === 'orders') && <OrdersTable {...p} />}
        {tab === 'inventory' && (
          <div className="grid lg:grid-cols-2 gap-4">
            <InventoryPanel {...p} />
            <HistoryFeed ops={history} />
          </div>
        )}
        {tab === 'dashboard' && (
          <div className="grid lg:grid-cols-2 gap-4">
            <InventoryPanel {...p} />
            <HistoryFeed ops={history} />
          </div>
        )}
        {tab === 'orders' && <HistoryFeed ops={history} />}

        <footer className="text-center text-xs text-slate-600 py-6">
          Business Flow Automator · FastAPI · React · WebSocket · Google Sheets
        </footer>
      </main>
    </div>
  );
}

function DateField({ label, type, value, onChange }) {
  return (
    <div>
      <label className="block text-[10px] uppercase text-slate-500 mb-1">{label}</label>
      {type === 'select' ? (
        <select value={value} onChange={e => onChange(e.target.value)}
                className="bg-slate-900/70 border border-[#1e2947] rounded-lg px-3 py-2 text-sm text-white">
          <option value="">Все</option><option value="new">Новые</option>
          <option value="confirmed">Подтверждены</option><option value="shipped">Отгружены</option>
          <option value="cancelled">Отменены</option>
        </select>
      ) : (
        <input type="date" value={value} onChange={e => onChange(e.target.value)}
               className="bg-slate-900/70 border border-[#1e2947] rounded-lg px-3 py-2 text-sm text-white" />
      )}
    </div>
  );
}

function OrdersTable({ orders, user, canChange, onStatus }) {
  return (
    <div className="card p-0 mb-6 overflow-hidden">
      <div className="flex items-center justify-between p-5 pb-3">
        <h3 className="text-sm font-semibold text-white">
          🧾 Заявки <span className="text-slate-500 font-normal">{user.role === 'manager' && '(только мои)'}</span>
        </h3>
        <span className="num text-xs text-slate-500">{orders.length} шт</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[760px]">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-slate-500 border-y border-[#1e2947]">
              <th className="text-left px-5 py-2.5">Номер</th><th className="text-left px-3 py-2.5">Клиент</th>
              <th className="text-left px-3 py-2.5">Товар</th><th className="text-right px-3 py-2.5">Сумма</th>
              <th className="text-left px-3 py-2.5">Канал</th><th className="text-left px-3 py-2.5">Дата</th>
              <th className="text-left px-3 py-2.5">Статус</th><th className="px-3 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {orders.map(o => (
              <tr key={o.id} className="border-b border-[#1e2947]/60 hover:bg-slate-800/30 transition">
                <td className="px-5 py-3 num font-semibold text-white">{o.number}</td>
                <td className="px-3 py-3">
                  <div>{o.customer_name}</div>
                  <div className="text-xs text-slate-500">{o.contact}</div>
                </td>
                <td className="px-3 py-3 num">{o.product.name} × {o.qty}</td>
                <td className="px-3 py-3 num text-right text-white">{fmt(o.amount)} ₽</td>
                <td className="px-3 py-3">
                  <span className={'px-2 py-0.5 rounded text-xs ' + (o.source === 'telegram' ? 'bg-sky-500/15 text-sky-300' : 'bg-violet-500/15 text-violet-300')}>
                    {o.source === 'telegram' ? '✈️ Бот' : '🌐 Форма'}
                  </span>
                </td>
                <td className="px-3 py-3 num text-xs text-slate-400">{fmtDate(o.created_at)}</td>
                <td className="px-3 py-3">
                  <select value={o.status} disabled={!canChange(o)}
                          onChange={e => onStatus(o, e.target.value)}
                          className={'px-2 py-1 rounded-md text-xs font-semibold cursor-pointer outline-none disabled:opacity-60 ' + STATUS_STYLE[o.status]}>
                    {STATUS_OPTIONS.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
                  </select>
                </td>
                <td className="px-3 py-3 text-xs text-slate-600 num">{o.created_by_name}</td>
              </tr>
            ))}
            {!orders.length && (
              <tr><td colSpan="8" className="px-5 py-10 text-center text-slate-500 text-sm">Заявок нет — создайте первую 🚀</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function InventoryPanel({ products }) {
  const max = Math.max(20, ...products.map(p => p.stock));
  return (
    <div className="card p-5">
      <h3 className="text-sm font-semibold text-white mb-4">
        📦 Остатки <span className="text-slate-500 font-normal text-xs">(≤5 шт — повестка алерта)</span>
      </h3>
      {products.map(p => (
        <div key={p.id} className="flex items-center gap-3 py-2 border-b border-[#1e2947]/40 last:border-0">
          <span className="text-xs text-slate-500 w-20">{p.sku}</span>
          <div className="flex-1 min-w-0">
            <div className="text-sm truncate">{p.name}</div>
            <div className="h-1.5 mt-1 rounded bg-slate-800 overflow-hidden">
              <div className={'h-full rounded ' + (p.stock <= 5 ? 'bg-rose-500' : p.stock <= 15 ? 'bg-amber-400' : 'bg-emerald-400')}
                   style={{ width: Math.min(100, (p.stock / max) * 100) + '%' }} />
            </div>
          </div>
          <span className="num text-sm font-semibold w-14 text-right">{p.stock} шт</span>
          <span className="num text-xs text-slate-500 w-20 text-right">{fmt(p.price)} ₽</span>
        </div>
      ))}
      {!products.length && <div className="py-8 text-center text-slate-500 text-sm">Каталог пуст</div>}
    </div>
  );
}

const OP_TITLE = {
  order_created: 'Новая заявка', status_confirmed: 'Подтверждена', status_shipped: 'Отгружена',
  status_cancelled: 'Отменена', low_stock_alert: 'Алерт остатков', daily_report: 'Дневной отчёт',
  seed_demo: 'Инициализация',
};
const OP_COLOR = {
  order_created: 'bg-sky-500/15 text-sky-300', status_confirmed: 'bg-blue-500/15 text-blue-300',
  status_shipped: 'bg-emerald-500/15 text-emerald-300', status_cancelled: 'bg-rose-500/15 text-rose-300',
  low_stock_alert: 'bg-amber-500/15 text-amber-300',
};

function HistoryFeed({ ops }) {
  return (
    <div className="card p-5">
      <h3 className="text-sm font-semibold text-white mb-4">
        🕐 История операций <span className="text-slate-500 font-normal text-xs">кто · что · когда · почему</span>
      </h3>
      <div className="space-y-0 max-h-96 overflow-y-auto pr-1">
        {ops.map(op => (
          <div key={op.id} className="py-2.5 border-b border-[#1e2947]/40 last:border-0">
            <div className="flex items-center gap-2 text-sm">
              <span className={'px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ' + (OP_COLOR[op.action] || 'bg-slate-500/15 text-slate-300')}>
                {OP_TITLE[op.action] || op.action}
              </span>
              <span className="num text-slate-400">{op.entity_id}</span>
              <span className="num text-xs text-slate-600 ml-auto">{fmtDate(op.ts)}</span>
            </div>
            <div className="text-xs text-slate-500 mt-0.5">
              {op.actor} · {op.details}
              {op.reason && <span className="text-rose-300/80"> · причина: {op.reason}</span>}
            </div>
          </div>
        ))}
        {!ops.length && <div className="py-8 text-center text-slate-500 text-sm">История пуста</div>}
      </div>
    </div>
  );
}

export function StatusModal({ modal, onClose, onChange, onApply }) {
  if (!modal) return null;
  const buttons = [
    ['confirmed', '✅ Подтвердить (списать остаток)', 'bg-blue-500'],
    ['shipped', '🚚 Отгрузить', 'bg-emerald-500'],
    ['cancelled', '❌ Отменить', 'bg-rose-500'],
  ];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="card w-full max-w-md p-6 shadow-2xl" onMouseDown={e => e.stopPropagation()}>
        <h3 className="text-white font-bold mb-1">Смена статуса</h3>
        <p className="text-xs text-slate-500 mb-4">{modal.order.number} · {fmt(modal.order.amount)} ₽</p>
        <div className="mb-4">
          <label className="block text-xs text-slate-400 mb-1">Новый статус</label>
          <div className="flex gap-2 flex-wrap">
            {buttons.map(([v, label, bg]) => (
              <button key={v} onClick={() => onChange({ status: v })}
                      className={'px-3 py-1.5 rounded-lg text-xs font-semibold ' + (modal.status === v ? bg + ' text-white' : 'bg-slate-800 text-slate-400')}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <label className="block text-xs text-slate-400 mb-1">
          Комментарий / причина {modal.status === 'cancelled' && <span className="text-rose-400">— обязательна при отмене</span>}
        </label>
        <textarea rows="2" value={modal.reason} onChange={e => onChange({ reason: e.target.value })}
                  className="w-full bg-slate-900/70 border border-[#1e2947] rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-indigo-500" />
        {modal.status === 'confirmed' && (
          <p className="text-xs mt-2 text-slate-500">⚠️ При подтверждении остаток спишется автоматически и запишется в историю.</p>
        )}
        <div className="flex gap-2 mt-4">
          <button onClick={onClose} className="flex-1 py-2 rounded-lg bg-slate-800 text-sm">Отмена</button>
          <button onClick={onApply} className="flex-1 py-2 rounded-lg bg-gradient-to-r from-indigo-500 to-violet-600 text-white text-sm font-semibold">
            Применить
          </button>
        </div>
      </div>
    </div>
  );
}

export function NewOrderModal({ modal, products, onClose, onChange, onApply }) {
  if (!modal) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="card w-full max-w-md p-6 shadow-2xl">
        <h3 className="text-white font-bold mb-4">＋ Новая заявка</h3>
        <label className="block text-xs text-slate-400 mb-1">Товар</label>
        <select value={modal.product_id} onChange={e => onChange({ product_id: e.target.value })}
                className="w-full mb-3 bg-slate-900/70 border border-[#1e2947] rounded-lg px-3 py-2 text-sm text-white">
          <option value="">— выберите —</option>
          {products.map(p => (
            <option key={p.id} value={p.id}>{p.name} · {p.stock} шт · {fmt(p.price)} ₽</option>
          ))}
        </select>
        <label className="block text-xs text-slate-400 mb-1">Количество</label>
        <input type="number" min="1" value={modal.qty} onChange={e => onChange({ qty: +e.target.value })}
               className="w-full mb-3 bg-slate-900/70 border border-[#1e2947] rounded-lg px-3 py-2 text-sm text-white" />
        <label className="block text-xs text-slate-400 mb-1">Имя клиента / компания</label>
        <input value={modal.customer_name} onChange={e => onChange({ customer_name: e.target.value })}
               className="w-full mb-3 bg-slate-900/70 border border-[#1e2947] rounded-lg px-3 py-2 text-sm text-white" />
        <label className="block text-xs text-slate-400 mb-1">Контакт</label>
        <input value={modal.contact} onChange={e => onChange({ contact: e.target.value })}
               className="w-full mb-4 bg-slate-900/70 border border-[#1e2947] rounded-lg px-3 py-2 text-sm text-white" />
        {modal.error && <p className="text-xs text-amber-400 mb-2">{modal.error}</p>}
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-2 rounded-lg bg-slate-800 text-sm">Отмена</button>
          <button onClick={onApply} disabled={!modal.product_id || modal.qty < 1 || !modal.customer_name}
                  className="flex-1 py-2 rounded-lg bg-gradient-to-r from-indigo-500 to-violet-600 text-white text-sm font-semibold disabled:opacity-40">
            Создать
          </button>
        </div>
      </div>
    </div>
  );
}

export function Toast({ toast }) {
  if (!toast) return null;
  return (
    <div className={'fixed bottom-5 right-5 z-[60] card px-5 py-3 text-sm text-white shadow-2xl ' + (toast.ok ? 'border-emerald-500/40' : 'border-rose-500/40')}>
      {toast.msg}
    </div>
  );
}
