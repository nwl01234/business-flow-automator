import React, { useState } from 'react';
import { doLogin, fmt, fmtDate } from './api.js';
import { SalesChart, TopProducts } from './charts.jsx';

const STATUS_META = {
  new:       { label: 'Новая',        bg: 'rgba(255,149,0,.13)',   color: '#b25e00',  dot: '#ff9500' },
  confirmed: { label: 'Подтверждена', bg: 'rgba(0,113,227,.12)',   color: '#0062c4',  dot: '#0071e3' },
  shipped:   { label: 'Отгружена',    bg: 'rgba(52,199,89,.14)',   color: '#1b7a3d',  dot: '#34c759' },
  cancelled: { label: 'Отменена',     bg: 'rgba(255,59,48,.11)',   color: '#c02924',  dot: '#ff3b30' },
};
const STATUS_ORDER = ['new', 'confirmed', 'shipped', 'cancelled'];

const TABS = [
  { id: 'dashboard', name: 'Дашборд', icon: '▦' },
  { id: 'orders', name: 'Заявки', icon: '≡' },
  { id: 'inventory', name: 'Остатки', icon: '◈' },
];

function Chip({ bg, color, dot, label }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-[3px] text-[12px] font-medium"
          style={{ background: bg, color }}>
      <span className="stat-dot" style={{ background: dot }} />
      {label}
    </span>
  );
}

function Logo({ size = 'w-9 h-9', text = 'text-[15px]' }) {
  return (
    <div className={`${size} rounded-[10px] bg-[#1d1d1f] flex items-center justify-center ${text} text-white`}>◆</div>
  );
}

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
      <form onSubmit={submit} className="card w-full max-w-[380px] p-9">
        <div className="flex flex-col items-center mb-8">
          <Logo size="w-14 h-14" text="text-[22px]" />
          <h1 className="text-[24px] font-semibold text-[#1d1d1f] mt-4 tracking-tight">Business Flow</h1>
          <p className="text-[13px] text-[#86868b] mt-1">Automator · v1.0</p>
        </div>
        <input value={login} onChange={e => setLogin(e.target.value)} placeholder="Логин" autoComplete="username"
               className="field w-full mb-3" />
        <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Пароль"
               autoComplete="current-password" className="field w-full mb-5" />
        <button type="submit" disabled={busy || !login || !password}
                className="btn btn-primary w-full rounded-[12px] py-2.5 text-[15px]">
          {busy ? 'Входим…' : 'Войти'}
        </button>
        {error && <p className="mt-4 text-[13px] text-center text-[#c02924]">{error}</p>}
        <p className="mt-6 text-[12px] text-[#86868b] text-center">
          демо-доступы: admin / admin123 · manager / manager123
        </p>
      </form>
    </div>
  );
}

export function Shell(p) {
  const { user, metrics, history, filters, setFilters, onRefresh, onNewOrder, wsLive, onLogout, tab, setTab } = p;

  const m = metrics || {};
  const kpis = [
    { label: 'Заявок сегодня', icon: '＋', tint: 'rgba(0,113,227,.10)', co: '#0071e3',
      value: m.orders_today ?? '—', sub: `всего за период: ${m.orders_total ?? '—'}` },
    { label: 'Заявок за 7 дней', icon: '≋', tint: 'rgba(175,82,222,.10)', co: '#8944ab',
      value: m.orders_week ?? '—', sub: `статусы: ${Object.values(m.status_counts || {}).join(' / ')}` },
    { label: 'Выручка, 7 дней', icon: '₽', tint: 'rgba(52,199,89,.12)', co: '#1b7a3d',
      value: m.revenue_week ? fmt(m.revenue_week) + ' ₽' : '—', sub: `всего: ${m.revenue_total ? fmt(m.revenue_total) + ' ₽' : '0 ₽'}` },
    { label: 'Конверсия', icon: '◎', tint: 'rgba(255,149,0,.12)', co: '#b25e00',
      value: m.conversion != null ? m.conversion + ' %' : '—', sub: `средний чек: ${m.avg_check ? fmt(m.avg_check) + ' ₽' : '—'}` },
    { label: 'Низкие остатки', icon: '⚠', tint: 'rgba(255,59,48,.10)', co: '#c02924',
      value: m.low_stock ? m.low_stock.length : '—', sub: 'позиций ≤ 5 шт' },
  ];

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="hidden lg:flex flex-col w-[240px] shrink-0 border-r hairline px-4 py-6 gap-1">
        <div className="flex items-center gap-3 px-2 mb-8">
          <Logo />
          <div>
            <div className="text-[15px] font-semibold text-[#1d1d1f] leading-tight">Business Flow</div>
            <div className="text-[11px] text-[#86868b]">Automator</div>
          </div>
        </div>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
                  className={'flex items-center gap-2.5 text-left px-3 py-2 rounded-[10px] text-[14px] font-medium transition ' +
                    (tab === t.id ? 'bg-[rgba(0,113,227,.09)] text-[#0071e3]' : 'text-[#1d1d1f] hover:bg-black/[.045]')}>
            <span className="text-[15px] opacity-70">{t.icon}</span>{t.name}
          </button>
        ))}
        <div className="mt-auto px-2">
          <div className="flex items-center gap-2 text-[12px] text-[#6e6e73] mb-2">
            <span className="pulse-dot" style={{ background: wsLive ? '#34c759' : '#ff9500' }} />
            {wsLive ? 'live · WebSocket' : 'поллинг · 20 сек'}
          </div>
          <div className="text-[13px] font-medium text-[#1d1d1f]">{user.full_name}</div>
          <div className="text-[11px] uppercase tracking-wider text-[#86868b]">{user.role}</div>
          <button onClick={onLogout} className="mt-3 text-[12px] text-[#86868b] hover:text-[#c02924] transition">Выйти</button>
        </div>
      </aside>

      <main className="flex-1 p-4 sm:p-8 max-w-7xl mx-auto w-full">
        {/* mobile header */}
        <div className="lg:hidden flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <Logo size="w-8 h-8" text="text-[13px]" />
            <span className="text-[15px] font-semibold">Business Flow</span>
          </div>
          <button onClick={onLogout} className="text-[12px] text-[#86868b]">Выйти</button>
        </div>
        <div className="lg:hidden flex gap-1.5 mb-4 overflow-x-auto pb-1">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
                    className={'px-3.5 py-1.5 rounded-full text-[12px] whitespace-nowrap font-medium transition ' +
                      (tab === t.id ? 'bg-[#1d1d1f] text-white' : 'bg-[#e9e9ee] text-[#1d1d1f]')}>
              {t.icon} {t.name}
            </button>
          ))}
        </div>

        {/* Filters */}
        <div className="card px-4 py-3.5 mb-6 flex flex-wrap items-end gap-3">
          <Field label="Дата с" value={filters.from} type="date" onChange={v => setFilters(f => ({ ...f, from: v }))} />
          <Field label="по" value={filters.to} type="date" onChange={v => setFilters(f => ({ ...f, to: v }))} />
          <Field label="Статус" value={filters.status} type="select" onChange={v => setFilters(f => ({ ...f, status: v }))} />
          {user.role !== 'bot' && (
            <button onClick={onNewOrder}
                    className="btn btn-primary rounded-[980px] ml-auto px-4 py-2 text-[13px]">
              ＋ Новая заявка
            </button>
          )}
          <button onClick={onRefresh} className="btn btn-ghost px-3" title="Обновить">⟳</button>
        </div>

        {/* KPI */}
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4 mb-6">
          {kpis.map(k => (
            <div key={k.label} className="card p-4">
              <div className="flex items-start justify-between mb-3">
                <span className="text-[12px] text-[#6e6e73] leading-snug">{k.label}</span>
                <span className="w-7 h-7 rounded-[9px] flex items-center justify-center text-[13px] font-semibold"
                      style={{ background: k.tint, color: k.co }}>{k.icon}</span>
              </div>
              <div className="num text-[26px] font-semibold text-[#1d1d1f] leading-none">{k.value}</div>
              <div className="num text-[11px] text-[#86868b] mt-1.5">{k.sub}</div>
            </div>
          ))}
        </div>

        {tab === 'dashboard' && metrics && (
          <div className="grid lg:grid-cols-3 gap-4 mb-6">
            <div className="card p-5 lg:col-span-2">
              <h3 className="text-[15px] font-semibold text-[#1d1d1f] mb-4">Динамика заявок и выручки</h3>
              <SalesChart series={metrics.series} />
            </div>
            <div className="card p-5">
              <h3 className="text-[15px] font-semibold text-[#1d1d1f] mb-4">Топ товаров</h3>
              <TopProducts top={metrics.top_products} />
            </div>
          </div>
        )}

        {(tab === 'dashboard' || tab === 'orders') && <OrdersTable {...p} />}
        {(tab === 'inventory' || tab === 'dashboard') && (
          <div className="grid lg:grid-cols-2 gap-4">
            <InventoryPanel {...p} />
            <HistoryFeed ops={history} />
          </div>
        )}
        {tab === 'orders' && <HistoryFeed ops={history} />}

        <footer className="text-center text-[11px] text-[#86868b] py-8">
          Business Flow Automator · FastAPI · React · WebSocket · Google Sheets
        </footer>
      </main>
    </div>
  );
}

function Field({ label, value, type, onChange }) {
  return (
    <div>
      <label className="block text-[10px] font-semibold uppercase tracking-wider text-[#86868b] mb-1">{label}</label>
      {type === 'select' ? (
        <select className="field" value={value} onChange={e => onChange(e.target.value)}>
          <option value="">Все</option>
          {STATUS_ORDER.map(s => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
        </select>
      ) : (
        <input type="date" className="field" value={value} onChange={e => onChange(e.target.value)} />
      )}
    </div>
  );
}

function OrdersTable({ orders, user, canChange, onStatus }) {
  return (
    <div className="card p-0 mb-6 overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b hairline">
        <h3 className="text-[15px] font-semibold text-[#1d1d1f]">
          Заявки {user.role === 'manager' && <span className="text-[#86868b] font-normal text-[13px]">· только мои</span>}
        </h3>
        <span className="num text-[12px] text-[#86868b]">{orders.length} шт</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[13px] min-w-[760px]">
          <thead>
            <tr className="text-[10px] font-semibold uppercase tracking-wider text-[#86868b] border-b hairline bg-[#fafafa]">
              <th className="text-left px-5 py-2.5">Номер</th><th className="text-left px-3 py-2.5">Клиент</th>
              <th className="text-left px-3 py-2.5">Товар</th><th className="text-right px-3 py-2.5">Сумма</th>
              <th className="text-left px-3 py-2.5">Канал</th><th className="text-left px-3 py-2.5">Дата</th>
              <th className="text-left px-3 py-2.5">Статус</th><th className="px-3 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {orders.map(o => {
              const meta = STATUS_META[o.status];
              return (
                <tr key={o.id} className="border-b hairline/70 hover:bg-[#fafafa] transition">
                  <td className="px-5 py-3 num font-semibold text-[#1d1d1f]">{o.number}</td>
                  <td className="px-3 py-3">
                    <div className="font-medium text-[#1d1d1f]">{o.customer_name}</div>
                    <div className="text-[12px] text-[#86868b]">{o.contact}</div>
                  </td>
                  <td className="px-3 py-3 num">{o.product.name} × {o.qty}</td>
                  <td className="px-3 py-3 num text-right font-medium text-[#1d1d1f]">{fmt(o.amount)} ₽</td>
                  <td className="px-3 py-3">
                    <Chip bg={o.source === 'telegram' ? 'rgba(88,86,214,.10)' : 'rgba(28,28,30,.06)'}
                          color={o.source === 'telegram' ? '#5e5ce6' : '#3a3a3c'}
                          dot={o.source === 'telegram' ? '#5e5ce6' : '#8e8e93'}
                          label={o.source === 'telegram' ? 'Бот' : 'Форма'} />
                  </td>
                  <td className="px-3 py-3 num text-[12px] text-[#6e6e73]">{fmtDate(o.created_at)}</td>
                  <td className="px-3 py-3">
                    <select disabled={!canChange(o)} value={o.status} onChange={e => onStatus(o, e.target.value)}
                            className="cursor-pointer appearance-none font-medium text-[12px] rounded-full pl-2.5 pr-6 py-[5px] outline-none transition disabled:opacity-50"
                            style={{
                              background: `url("data:image/svg+xml;charset=utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='5' viewBox='0 0 8 5'%3E%3Cpath fill='${encodeURIComponent(meta.color)}' d='M0 0l4 5 4-5z'/%3E%3C/svg%3E") no-repeat right 9px center, ${meta.bg}`,
                              color: meta.color,
                            }}>
                      {STATUS_ORDER.map(s => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
                    </select>
                  </td>
                  <td className="px-3 py-3 text-[12px] text-[#86868b]">{o.created_by_name}</td>
                </tr>
              );
            })}
            {!orders.length && (
              <tr><td colSpan="8" className="px-5 py-12 text-center text-[#86868b] text-[13px]">Заявок нет — создайте первую</td></tr>
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
      <h3 className="text-[15px] font-semibold text-[#1d1d1f] mb-4">
        Остатки <span className="text-[#86868b] font-normal text-[12px]">· алерт при ≤ 5 шт</span>
      </h3>
      {products.map(p => {
        const col = p.stock <= 5 ? '#ff3b30' : p.stock <= 15 ? '#ff9500' : '#34c759';
        return (
          <div key={p.id} className="flex items-center gap-3 py-2.5 border-b hairline/70 last:border-0">
            <span className="text-[11px] text-[#86868b] w-20 shrink-0 font-medium">{p.sku}</span>
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-medium truncate text-[#1d1d1f]">{p.name}</div>
              <div className="h-[5px] mt-1.5 rounded-full bg-[#e9e9ee] overflow-hidden">
                <div className="h-full rounded-full transition-all" style={{ width: Math.min(100, (p.stock / max) * 100) + '%', background: col }} />
              </div>
            </div>
            <span className="num text-[13px] font-semibold text-[#1d1d1f] w-14 text-right">{p.stock} шт</span>
            <span className="num text-[12px] text-[#86868b] w-20 text-right">{fmt(p.price)} ₽</span>
          </div>
        );
      })}
      {!products.length && <div className="py-10 text-center text-[#86868b] text-[13px]">Каталог пуст</div>}
    </div>
  );
}

const OP_META = {
  order_created:     { label: 'Создана',      bg: 'rgba(0,113,227,.12)', color: '#0062c4' },
  status_confirmed:  { label: 'Подтверждена', bg: 'rgba(0,113,227,.12)', color: '#0062c4' },
  status_shipped:    { label: 'Отгружена',    bg: 'rgba(52,199,89,.14)', color: '#1b7a3d' },
  status_cancelled:  { label: 'Отменена',     bg: 'rgba(255,59,48,.11)', color: '#c02924' },
  low_stock_alert:   { label: 'Алерт',        bg: 'rgba(255,149,0,.13)', color: '#b25e00' },
  daily_report:      { label: 'Отчёт',        bg: 'rgba(88,86,214,.10)', color: '#5e5ce6' },
  seed_demo:         { label: 'Система',      bg: 'rgba(28,28,30,.06)',  color: '#6e6e73' },
};

function HistoryFeed({ ops }) {
  return (
    <div className="card p-5">
      <h3 className="text-[15px] font-semibold text-[#1d1d1f] mb-4">
        История операций <span className="text-[#86868b] font-normal text-[12px]">· кто · что · когда · почему</span>
      </h3>
      <div className="max-h-96 overflow-y-auto pr-1">
        {ops.map(op => {
          const meta = OP_META[op.action] || { label: op.action, bg: 'rgba(28,28,30,.06)', color: '#6e6e73' };
          return (
            <div key={op.id} className="py-2.5 border-b hairline/70 last:border-0">
              <div className="flex items-center gap-2">
                <Chip bg={meta.bg} color={meta.color} dot={meta.color} label={meta.label} />
                <span className="num text-[12px] font-medium text-[#1d1d1f]">{op.entity_id}</span>
                <span className="num text-[11px] text-[#86868b] ml-auto shrink-0">{fmtDate(op.ts)}</span>
              </div>
              <div className="text-[12px] text-[#6e6e73] mt-0.5">
                {op.actor} · {op.details}
                {op.reason && <span className="text-[#c02924]"> · причина: {op.reason}</span>}
              </div>
            </div>
          );
        })}
        {!ops.length && <div className="py-10 text-center text-[#86868b] text-[13px]">История пуста</div>}
      </div>
    </div>
  );
}

export function StatusModal({ modal, onClose, onChange, onApply }) {
  if (!modal) return null;
  const buttons = [
    ['confirmed', 'Подтвердить · списать остаток', '#0071e3'],
    ['shipped', 'Отгрузить', '#1b7a3d'],
    ['cancelled', 'Отменить', '#c02924'],
  ];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/35 backdrop-blur-[3px]">
      <div className="card w-full max-w-md p-6 shadow-2xl">
        <h3 className="text-[17px] font-semibold text-[#1d1d1f] mb-1">Смена статуса</h3>
        <p className="text-[12px] text-[#86868b] mb-5 num">{modal.order.number} · {fmt(modal.order.amount)} ₽</p>
        <label className="block text-[12px] font-medium text-[#6e6e73] mb-2">Новый статус</label>
        <div className="flex gap-2 flex-wrap mb-4">
          {buttons.map(([v, label, color]) => (
            <button key={v} onClick={() => onChange({ status: v })}
                    className="px-3 py-1.5 rounded-full text-[12px] font-medium transition"
                    style={modal.status === v
                      ? { background: color, color: '#fff' }
                      : { background: 'rgba(28,28,30,.055)', color: '#1d1d1f' }}>
              {label}
            </button>
          ))}
        </div>
        <label className="block text-[12px] font-medium text-[#6e6e73] mb-1.5">
          Комментарий / причина
          {modal.status === 'cancelled' && <span className="text-[#c02924]"> — обязательна при отмене</span>}
        </label>
        <textarea rows="2" value={modal.reason} onChange={e => onChange({ reason: e.target.value })}
                  className="field w-full resize-none" />
        {modal.status === 'confirmed' && (
          <p className="text-[11px] text-[#86868b] mt-2">При подтверждении остаток спишется автоматически и осядёт в журнале операций.</p>
        )}
        <div className="flex gap-2 mt-5">
          <button onClick={onClose} className="btn btn-ghost flex-1 rounded-[11px] py-2.5">Отмена</button>
          <button onClick={onApply} className="btn btn-primary flex-1 rounded-[11px] py-2.5">Применить</button>
        </div>
      </div>
    </div>
  );
}

export function NewOrderModal({ modal, products, onClose, onChange, onApply }) {
  if (!modal) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/35 backdrop-blur-[3px]">
      <div className="card w-full max-w-md p-6 shadow-2xl">
        <h3 className="text-[17px] font-semibold text-[#1d1d1f] mb-5">Новая заявка</h3>
        <label className="block text-[12px] font-medium text-[#6e6e73] mb-1.5">Товар</label>
        <select value={modal.product_id} onChange={e => onChange({ product_id: e.target.value })}
                className="field w-full mb-4">
          <option value="">— выберите —</option>
          {products.map(p => (
            <option key={p.id} value={p.id}>{p.name} · {p.stock} шт · {fmt(p.price)} ₽</option>
          ))}
        </select>
        <label className="block text-[12px] font-medium text-[#6e6e73] mb-1.5">Количество</label>
        <input type="number" min="1" value={modal.qty} onChange={e => onChange({ qty: +e.target.value })}
               className="field w-full mb-4" />
        <label className="block text-[12px] font-medium text-[#6e6e73] mb-1.5">Имя клиента / компания</label>
        <input value={modal.customer_name} onChange={e => onChange({ customer_name: e.target.value })}
               className="field w-full mb-4" />
        <label className="block text-[12px] font-medium text-[#6e6e73] mb-1.5">Контакт</label>
        <input value={modal.contact} onChange={e => onChange({ contact: e.target.value })}
               className="field w-full mb-4" />
        {modal.error && <p className="text-[12px] text-[#c02924] mb-2">{modal.error}</p>}
        <div className="flex gap-2">
          <button onClick={onClose} className="btn btn-ghost flex-1 rounded-[11px] py-2.5">Отмена</button>
          <button onClick={onApply} disabled={!modal.product_id || modal.qty < 1 || !modal.customer_name}
                  className="btn btn-primary flex-1 rounded-[11px] py-2.5">Создать</button>
        </div>
      </div>
    </div>
  );
}

export function Toast({ toast }) {
  if (!toast) return null;
  return (
    <div className={'fixed bottom-6 right-6 z-[60] px-5 py-3.5 rounded-[14px] text-[13px] font-medium text-white shadow-xl transition-all ' +
      (toast.ok ? 'bg-[#1d1d1f]' : 'bg-[#c02924]')}>
      {toast.msg}
    </div>
  );
}
