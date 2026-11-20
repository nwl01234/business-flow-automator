import React, { useEffect, useMemo, useState } from 'react';
import { api, doLogin, downloadExcel, fmt, fmtDate } from './api.js';
import { DonutChart, SalesChart, TopProducts } from './charts.jsx';

const STATUS_META = {
  new:       { label: 'Новая',        bg: 'rgba(255,149,0,.13)',   color: 'var(--warning)',  dot: '#ff9500' },
  confirmed: { label: 'Подтверждена', bg: 'rgba(0,113,227,.12)',   color: 'var(--accent)',  dot: 'var(--accent)' },
  shipped:   { label: 'Отгружена',    bg: 'rgba(52,199,89,.14)',   color: 'var(--success)',  dot: '#34c759' },
  cancelled: { label: 'Отменена',     bg: 'rgba(255,59,48,.11)',   color: 'var(--danger)',  dot: '#ff3b30' },
};
const STATUS_ORDER = ['new', 'confirmed', 'shipped', 'cancelled'];
// Зеркало бэкендовой матрицы ALLOWED_TRANSITIONS — модалка не показывает недоступные шаги
const TRANSITIONS = {
  new: ['confirmed', 'cancelled'],
  confirmed: ['shipped', 'cancelled'],
  shipped: [],
  cancelled: [],
};

const TABS = [
  { id: 'dashboard',  name: 'Дашборд',   icon: '▦' },
  { id: 'analytics',  name: 'Аналитика', icon: '◔' },
  { id: 'orders',     name: 'Заявки',    icon: '≡' },
  { id: 'inventory',  name: 'Остатки',   icon: '◈' },
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

const StatusChip = ({ status }) => <Chip {...STATUS_META[status]} label={STATUS_META[status].label} />;

function Logo({ size = 'w-9 h-9', text = 'text-[15px]' }) {
  return (
    <div className={`${size} rounded-[10px] bg-strong flex items-center justify-center ${text} text-on-strong`}>◆</div>
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
          <h1 className="text-[24px] font-semibold text-ink mt-4 tracking-tight">Business Flow</h1>
          <p className="text-[13px] text-muted mt-1">Automator · v1.1</p>
        </div>
        <input value={login} onChange={e => setLogin(e.target.value)} placeholder="Логин" autoComplete="username"
               className="field w-full mb-3" />
        <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Пароль"
               autoComplete="current-password" className="field w-full mb-5" />
        <button type="submit" disabled={busy || !login || !password}
                className="btn btn-primary w-full rounded-[12px] py-2.5 text-[15px]">
          {busy ? 'Входим…' : 'Войти'}
        </button>
        {error && <p className="mt-4 text-[13px] text-center text-danger">{error}</p>}
        <p className="mt-6 text-[12px] text-muted text-center">
          демо-доступы: admin / admin123 · manager / manager123
        </p>
      </form>
    </div>
  );
}

export function Shell(p) {
  const { user, metrics, history, filters, setFilters, onNewOrder, onStatus,
          onRefresh, wsLive, onLogout, tab, setTab } = p;
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));
  const toggleTheme = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle('dark', next);
    try { localStorage.setItem('bf_theme', next ? 'dark' : 'light'); } catch (e) {}
  };

  const m = metrics || {};
  const kpis = [
    { label: 'Заявок сегодня', icon: '＋', tint: 'rgba(0,113,227,.10)', co: 'var(--accent)', go: 'orders',
      value: m.orders_today ?? '—', sub: `всего за период: ${m.orders_total ?? '—'}` },
    { label: 'Заявок за 7 дней', icon: '≋', tint: 'rgba(175,82,222,.10)', co: 'var(--violet)', go: 'analytics',
      value: m.orders_week ?? '—', sub: `статусы: ${Object.values(m.status_counts || {}).join(' / ') || '—'}` },
    { label: 'Выручка, 7 дней', icon: '₽', tint: 'rgba(52,199,89,.12)', co: 'var(--success)', go: 'analytics',
      value: m.revenue_week ? fmt(m.revenue_week) + ' ₽' : '—', sub: `всего: ${m.revenue_total ? fmt(m.revenue_total) + ' ₽' : '0 ₽'}` },
    { label: 'Конверсия', icon: '◎', tint: 'rgba(255,149,0,.12)', co: 'var(--warning)', go: 'analytics',
      value: m.conversion != null ? m.conversion + ' %' : '—', sub: `средний чек: ${m.avg_check ? fmt(m.avg_check) + ' ₽' : '—'}` },
    { label: 'Низкие остатки', icon: '⚠', tint: 'rgba(255,59,48,.10)', co: 'var(--danger)', go: 'inventory',
      value: m.low_stock ? m.low_stock.length : '—', sub: 'позиций ≤ 5 шт — кликни' },
  ];

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="hidden lg:flex flex-col w-[240px] shrink-0 border-r hairline px-4 py-6 gap-1">
        <div className="flex items-center gap-3 px-2 mb-8">
          <Logo />
          <div>
            <div className="text-[15px] font-semibold text-ink leading-tight">Business Flow</div>
            <div className="text-[11px] text-muted">Automator</div>
          </div>
        </div>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
                  className={'flex items-center gap-2.5 text-left px-3 py-2 rounded-[10px] text-[14px] font-medium transition ' +
                    (tab === t.id ? 'bg-accent-soft text-accent' : 'text-ink hover:bg-soft')}>
            <span className="text-[15px] opacity-70">{t.icon}</span>{t.name}
          </button>
        ))}
        <div className="mt-auto px-2">
          <div className="flex items-center gap-2 text-[12px] text-muted-2 mb-2">
            <span className="pulse-dot" style={{ background: wsLive ? '#34c759' : '#ff9500' }} />
            {wsLive ? 'live · WebSocket' : 'поллинг · 20 сек'}
          </div>
          <div className="text-[13px] font-medium text-ink">{user.full_name}</div>
          <div className="text-[11px] uppercase tracking-wider text-muted">{user.role}</div>
          <div className="flex items-center justify-between mt-3">
            <button onClick={onLogout} className="text-[12px] text-muted hover:text-danger transition">Выйти</button>
            <button onClick={toggleTheme} className="text-[12px] text-muted hover:text-ink transition"
                    title="Переключить тему">{dark ? '☀ светлая' : '☾ тёмная'}</button>
          </div>
        </div>
      </aside>

      <main className="flex-1 p-4 sm:p-8 max-w-7xl mx-auto w-full">
        {/* mobile header */}
        <div className="lg:hidden flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <Logo size="w-8 h-8" text="text-[13px]" />
            <span className="text-[15px] font-semibold">Business Flow</span>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={toggleTheme} className="text-[12px] text-muted" title="Переключить тему">{dark ? '☀' : '☾'}</button>
            <button onClick={onLogout} className="text-[12px] text-muted">Выйти</button>
          </div>
        </div>
        <div className="lg:hidden flex gap-1.5 mb-4 overflow-x-auto pb-1">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
                    className={'px-3.5 py-1.5 rounded-full text-[12px] whitespace-nowrap font-medium transition ' +
                      (tab === t.id ? 'bg-strong text-on-strong' : 'bg-soft text-ink')}>
              {t.icon} {t.name}
            </button>
          ))}
        </div>

        {/* Toolbar */}
        <div className="card px-4 py-3.5 mb-6 flex flex-wrap items-end gap-3">
          <Field label="Дата с" value={filters.from} onChange={v => setFilters(f => ({ ...f, from: v }))} />
          <Field label="по" value={filters.to} onChange={v => setFilters(f => ({ ...f, to: v }))} />
          <Field label="Статус" value={filters.status} type="select" onChange={v => setFilters(f => ({ ...f, status: v }))} />
          {user.role !== 'bot' && (
            <button onClick={() => onNewOrder()}
                    className="btn btn-primary rounded-[980px] ml-auto px-4 py-2 text-[13px]">
              ＋ Новая заявка
            </button>
          )}
          <button onClick={() => downloadExcel().catch(() => {})}
                  className="btn btn-ghost px-3" title="Скачать Excel-зеркало данных">xlsx ↓</button>
          <button className="btn btn-ghost px-3" onClick={onRefresh} title="Обновить">⟳</button>
        </div>

        {/* KPI — каждый кликабелен */}
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4 mb-6">
          {kpis.map(k => (
            <button key={k.label} onClick={() => setTab(k.go)}
                    className="card p-4 text-left transition hover:-translate-y-0.5 hover:shadow-[0_10px_34px_rgba(0,0,0,.09)]">
              <div className="flex items-start justify-between mb-3">
                <span className="text-[12px] text-muted-2 leading-snug">{k.label}</span>
                <span className="w-7 h-7 rounded-[9px] flex items-center justify-center text-[13px] font-semibold shrink-0"
                      style={{ background: k.tint, color: k.co }}>{k.icon}</span>
              </div>
              <div className="num text-[26px] font-semibold text-ink leading-none">{k.value}</div>
              <div className="num text-[11px] text-muted mt-1.5">{k.sub}</div>
            </button>
          ))}
        </div>

        {tab === 'dashboard' && metrics && (
          <div className="grid lg:grid-cols-3 gap-4 mb-6">
            <div className="card p-5 lg:col-span-2">
              <h3 className="text-[15px] font-semibold text-ink mb-4">Динамика заявок и выручки</h3>
              <SalesChart series={metrics.series} />
            </div>
            <div className="card p-5">
              <h3 className="text-[15px] font-semibold text-ink mb-4">Статусы заявок</h3>
              <DonutChart data={STATUS_ORDER.map(s => ({
                label: STATUS_META[s].label, value: metrics.status_counts[s] || 0, color: STATUS_META[s].dot,
              }))} />
            </div>
          </div>
        )}

        {tab === 'analytics' && <AnalyticsTab metrics={metrics} orders={p.orders} />}

        {(tab === 'dashboard' || tab === 'orders') && <OrdersTable {...p} />}

        {tab === 'inventory' && (
          <div className="grid lg:grid-cols-2 gap-4">
            <InventoryPanel {...p} />
            <HistoryFeed ops={history} />
          </div>
        )}
        {(tab === 'dashboard' || tab === 'orders') && (
          <div className="grid lg:grid-cols-2 gap-4">
            <InventoryPanel {...p} />
            <HistoryFeed ops={history} />
          </div>
        )}

        <footer className="text-center text-[11px] text-muted py-8">
          Business Flow Automator · FastAPI · React · WebSocket · Excel-зеркало · Google Sheets
        </footer>
      </main>
    </div>
  );
}

function AnalyticsTab({ metrics, orders }) {
  const [integrations, setIntegrations] = useState(null);
  useEffect(() => {
    api('/analytics/integrations').then(setIntegrations).catch(() => setIntegrations({}));
  }, []);

  const m = metrics || {};
  const funnel = STATUS_ORDER.map(s => ({ ...STATUS_META[s], id: s, value: (m.status_counts || {})[s] || 0 }));
  const funnelMax = Math.max(1, ...funnel.map(f => f.value));

  // Менеджеры считаются на клиенте из уже загруженного списка заявок
  const byManager = useMemo(() => {
    const acc = {};
    for (const o of orders) {
      if (o.status === 'cancelled') continue;
      const name = o.created_by_name || '—';
      acc[name] = acc[name] || { name, qty: 0, revenue: 0 };
      acc[name].qty += o.qty;
      acc[name].revenue += o.amount;
    }
    return Object.values(acc).sort((a, b) => b.revenue - a.revenue).slice(0, 5);
  }, [orders]);
  const mgrMax = Math.max(1, ...byManager.map(x => x.revenue));

  return (
    <>
      <div className="grid lg:grid-cols-3 gap-4 mb-6">
        <div className="card p-5">
          <h3 className="text-[15px] font-semibold text-ink mb-4">Каналы заявок</h3>
          <DonutChart data={[
            { label: 'Telegram-бот', value: (m.by_source || {}).telegram || 0, color: 'var(--indigo)' },
            { label: 'Веб-форма', value: (m.by_source || {}).web || 0, color: 'var(--accent)' },
          ]} />
        </div>
        <div className="card p-5">
          <h3 className="text-[15px] font-semibold text-ink mb-4">Воронка статусов</h3>
          <div className="pt-2">
            {funnel.map(f => (
              <div key={f.id} className="mb-4 last:mb-0">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[12px] font-medium text-ink">{f.label}</span>
                  <span className="num text-[12px] font-semibold" style={{ color: f.dot }}>{f.value}</span>
                </div>
                <div className="h-2 rounded-full bg-soft overflow-hidden">
                  <div className="h-full rounded-full transition-all" style={{ width: (f.value / funnelMax * 100) + '%', background: f.dot }} />
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="card p-5 flex flex-col justify-between">
          <h3 className="text-[15px] font-semibold text-ink mb-4">Скорость и деньги</h3>
          <div>
            <div className="num text-[32px] font-semibold text-ink leading-none">
              {m.avg_ship_hours != null ? m.avg_ship_hours + ' ч' : '—'}
            </div>
            <div className="text-[12px] text-muted mt-1">среднее время до отгрузки</div>
          </div>
          <div className="border-t hairline mt-4 pt-4">
            <div className="num text-[22px] font-semibold text-ink leading-none">
              {m.avg_check ? fmt(m.avg_check) + ' ₽' : '—'}
            </div>
            <div className="text-[12px] text-muted mt-1">средний чек</div>
          </div>
          <div className="border-t hairline mt-4 pt-4">
            <div className="num text-[22px] font-semibold text-success leading-none">
              {m.revenue_total ? fmt(m.revenue_total) + ' ₽' : '0 ₽'}
            </div>
            <div className="text-[12px] text-muted mt-1">выручка за период</div>
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-4 mb-6">
        <div className="card p-5 lg:col-span-2">
          <h3 className="text-[15px] font-semibold text-ink mb-4">Динамика по дням</h3>
          <SalesChart series={m.series || []} />
        </div>
        <div className="card p-5">
          <h3 className="text-[15px] font-semibold text-ink mb-4">По менеджерам</h3>
          {byManager.map(mgr => (
            <div key={mgr.name} className="mb-4 last:mb-0">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[13px] font-medium text-ink truncate">{mgr.name}</span>
                <span className="num text-[12px] text-muted-2 ml-2 shrink-0">{fmt(mgr.revenue)} ₽ · {mgr.qty} шт</span>
              </div>
              <div className="h-2 rounded-full bg-soft overflow-hidden">
                <div className="h-full rounded-full bg-[#0071e3] transition-all" style={{ width: (mgr.revenue / mgrMax * 100) + '%' }} />
              </div>
            </div>
          ))}
          {!byManager.length && <div className="py-8 text-center text-[13px] text-muted">Нет данных за период</div>}
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-4 mb-6">
        <div className="card p-5">
          <h3 className="text-[15px] font-semibold text-ink mb-4">Топ товаров</h3>
          <TopProducts top={m.top_products || []} />
        </div>
        <div className="card p-5 lg:col-span-2">
          <h3 className="text-[15px] font-semibold text-ink mb-4">Интеграции выгрузки</h3>
          {[
            { ok: integrations && integrations.excel_mirror, title: 'Excel-зеркало',
              desc: 'data/mirror.xlsx — обновляется после каждой операции, качается кнопкой «xlsx ↓»' },
            { ok: integrations && integrations.sheets_configured, title: 'Google Sheets',
              desc: 'двусторонняя синхронизация остатков (см. README «Подключение Google Sheets»)' },
          ].map(row => (
            <div key={row.title} className="flex items-start gap-3 py-3 border-b hairline last:border-0">
              <span className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0"
                    style={{ background: row.ok ? 'rgba(52,199,89,.15)' : 'rgba(255,149,0,.15)', color: row.ok ? 'var(--success)' : 'var(--warning)' }}>
                {row.ok ? '✓' : '!'}
              </span>
              <div>
                <div className="text-[13px] font-medium text-ink">{row.title}</div>
                <div className="text-[12px] text-muted">{row.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function Field({ label, value, type, onChange }) {
  return (
    <div>
      <label className="block text-[10px] font-semibold uppercase tracking-wider text-muted mb-1">{label}</label>
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
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState({ key: 'created_at', dir: 'desc' });

  const toggleSort = key => setSort(s => s.key === key ? { key, dir: -s.dir } : { key, dir: -1 });

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = orders;
    if (q) list = list.filter(o =>
      [o.number, o.customer_name, o.product.name, o.contact, o.created_by_name]
        .some(v => String(v).toLowerCase().includes(q)));
    const dir = sort.dir === 1 ? 1 : -1;
    return [...list].sort((a, b) => {
      if (sort.key === 'amount') return (a.amount - b.amount) * dir;
      if (sort.key === 'qty') return (a.qty - b.qty) * dir;
      return String(a[sort.key] || '').localeCompare(String(b[sort.key] || '')) * dir;
    });
  }, [orders, search, sort]);

  const SortTh = ({ label, k, cls }) => (
    <th className={'px-3 py-2.5 ' + (cls || '')}>
      <button onClick={() => toggleSort(k)}
              className={'uppercase tracking-wider hover:text-ink transition ' +
                (sort.key === k ? 'text-ink' : '')}>
        {label}
        <span className="ml-1 text-[9px]">{sort.key === k ? (sort.dir === 1 ? '↑' : '↓') : '⇅'}</span>
      </button>
    </th>
  );

  return (
    <div className="card p-0 mb-6 overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 px-5 py-4 border-b hairline">
        <h3 className="text-[15px] font-semibold text-ink">
          Заявки {user.role === 'manager' && <span className="text-muted font-normal text-[13px]">· только мои</span>}
        </h3>
        <input className="field ml-auto w-56" placeholder="Поиск: номер / клиент / товар"
               value={search} onChange={e => setSearch(e.target.value)} />
        <span className="num text-[12px] text-muted">{rows.length} из {orders.length}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[13px] min-w-[820px]">
          <thead>
            <tr className="text-[10px] font-semibold uppercase tracking-wider text-muted border-b hairline bg-subtle">
              <SortTh label="Номер" k="number" cls="text-left px-5" />
              <SortTh label="Клиент" k="customer_name" cls="text-left" />
              <th className="text-left px-3 py-2.5 uppercase tracking-wider">Товар</th>
              <SortTh label="Сумма" k="amount" cls="text-right" />
              <th className="text-left px-3 py-2.5 uppercase tracking-wider">Канал</th>
              <SortTh label="Дата" k="created_at" cls="text-left" />
              <th className="text-left px-3 py-2.5 uppercase tracking-wider">Статус</th>
              <th className="px-3 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map(o => {
              const active = canChange(o);
              return (
                <tr key={o.id}
                    onClick={active ? () => onStatus(o, (TRANSITIONS[o.status] || [])[0] || o.status) : undefined}
                    className={'border-b hairline/70 hover:bg-subtle transition ' + (active ? 'cursor-pointer' : '')}>
                  <td className="px-5 py-3 num font-semibold text-ink">{o.number}</td>
                  <td className="px-3 py-3">
                    <div className="font-medium text-ink">{o.customer_name}</div>
                    <div className="text-[12px] text-muted">{o.contact}</div>
                  </td>
                  <td className="px-3 py-3 num">{o.product.name} × {o.qty}</td>
                  <td className="px-3 py-3 num text-right font-medium text-ink">{fmt(o.amount)} ₽</td>
                  <td className="px-3 py-3">
                    <Chip bg={o.source === 'telegram' ? 'rgba(88,86,214,.10)' : 'var(--soft)'}
                          color={o.source === 'telegram' ? 'var(--indigo)' : '#3a3a3c'}
                          dot={o.source === 'telegram' ? 'var(--indigo)' : '#8e8e93'}
                          label={o.source === 'telegram' ? 'Бот' : 'Форма'} />
                  </td>
                  <td className="px-3 py-3 num text-[12px] text-muted-2">{fmtDate(o.created_at)}</td>
                  <td className="px-3 py-3">
                    <select disabled={!active} value={o.status} onClick={e => e.stopPropagation()}
                            onChange={e => onStatus(o, e.target.value)}
                            className="cursor-pointer appearance-none font-medium text-[12px] rounded-full pl-2.5 pr-6 py-[5px] outline-none transition disabled:opacity-50"
                            style={{
                              background: `url("data:image/svg+xml;charset=utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='5' viewBox='0 0 8 5'%3E%3Cpath fill='${encodeURIComponent(STATUS_META[o.status].color)}' d='M0 0l4 5 4-5z'/%3E%3C/svg%3E") no-repeat right 9px center, ${STATUS_META[o.status].bg}`,
                              color: STATUS_META[o.status].color,
                            }}>
                      {STATUS_ORDER.map(s => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
                    </select>
                  </td>
                  <td className="px-3 py-3 text-[12px] text-muted">{o.created_by_name}</td>
                </tr>
              );
            })}
            {!rows.length && (
              <tr><td colSpan="8" className="px-5 py-12 text-center text-muted text-[13px]">
                {search ? 'Ничего не найдено по запросу' : 'Заявок нет — создайте первую'}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function InventoryPanel({ products, onNewOrder, canChange }) {
  const max = Math.max(20, ...products.map(p => p.stock));
  return (
    <div className="card p-5">
      <h3 className="text-[15px] font-semibold text-ink mb-4">
        Остатки <span className="text-muted font-normal text-[12px]">· алерт при ≤ 5 шт</span>
      </h3>
      {products.map(p => {
        const col = p.stock <= 5 ? '#ff3b30' : p.stock <= 15 ? '#ff9500' : '#34c759';
        return (
          <div key={p.id} className="flex items-center gap-3 py-2.5 border-b hairline/70 last:border-0">
            <span className="text-[11px] text-muted w-20 shrink-0 font-medium">{p.sku}</span>
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-medium truncate text-ink">{p.name}</div>
              <div className="h-[5px] mt-1.5 rounded-full bg-soft overflow-hidden">
                <div className="h-full rounded-full transition-all" style={{ width: Math.min(100, (p.stock / max) * 100) + '%', background: col }} />
              </div>
            </div>
            <span className="num text-[13px] font-semibold text-ink w-16 text-right">{p.stock} шт</span>
            <span className="num text-[12px] text-muted w-20 text-right hidden sm:block">{fmt(p.price)} ₽</span>
            <button onClick={() => onNewOrder(p.id)}
                    className="btn btn-ghost px-2.5 py-1 text-[11px] shrink-0" title="Создать заявку на этот товар">
              ＋ заявка
            </button>
          </div>
        );
      })}
      {!products.length && <div className="py-10 text-center text-muted text-[13px]">Каталог пуст</div>}
    </div>
  );
}

const OP_META = {
  order_created:     { label: 'Создана',      bg: 'rgba(0,113,227,.12)', color: 'var(--accent)' },
  status_confirmed:  { label: 'Подтверждена', bg: 'rgba(0,113,227,.12)', color: 'var(--accent)' },
  status_shipped:    { label: 'Отгружена',    bg: 'rgba(52,199,89,.14)', color: 'var(--success)' },
  status_cancelled:  { label: 'Отменена',     bg: 'rgba(255,59,48,.11)', color: 'var(--danger)' },
  login_failed:      { label: 'Безопасность', bg: 'rgba(255,149,0,.13)', color: 'var(--warning)' },
  low_stock_alert:   { label: 'Алерт',        bg: 'rgba(255,149,0,.13)', color: 'var(--warning)' },
  daily_report:      { label: 'Отчёт',        bg: 'rgba(88,86,214,.10)', color: 'var(--indigo)' },
  seed_demo:         { label: 'Система',      bg: 'var(--soft)',  color: 'var(--ink-2)' },
};

function HistoryFeed({ ops }) {
  return (
    <div className="card p-5">
      <h3 className="text-[15px] font-semibold text-ink mb-4">
        История операций <span className="text-muted font-normal text-[12px]">· кто · что · когда · почему</span>
      </h3>
      <div className="max-h-96 overflow-y-auto pr-1">
        {ops.map(op => {
          const meta = OP_META[op.action] || { label: op.action, bg: 'var(--soft)', color: 'var(--ink-2)' };
          return (
            <div key={op.id} className="py-2.5 border-b hairline/70 last:border-0">
              <div className="flex items-center gap-2">
                <Chip bg={meta.bg} color={meta.color} dot={meta.color} label={meta.label} />
                <span className="num text-[12px] font-medium text-ink">{op.entity_id}</span>
                <span className="num text-[11px] text-muted ml-auto shrink-0">{fmtDate(op.ts)}</span>
              </div>
              <div className="text-[12px] text-muted-2 mt-0.5">
                {op.actor} · {op.details}
                {op.reason && <span className="text-danger"> · причина: {op.reason}</span>}
              </div>
            </div>
          );
        })}
        {!ops.length && <div className="py-10 text-center text-muted text-[13px]">История пуста</div>}
      </div>
    </div>
  );
}

export function StatusModal({ modal, onClose, onChange, onApply }) {
  if (!modal) return null;
  const allowed = TRANSITIONS[modal.order.status] || [];
  const labels = { confirmed: 'Подтвердить · списать остаток', shipped: 'Отгрузить', cancelled: 'Отменить' };
  const colors = { confirmed: 'var(--accent)', shipped: 'var(--success)', cancelled: 'var(--danger)' };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/35 backdrop-blur-[3px]">
      <div className="card w-full max-w-md p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-[17px] font-semibold text-ink">Смена статуса</h3>
          <StatusChip status={modal.order.status} />
        </div>
        <p className="text-[12px] text-muted mb-5 num">
          {modal.order.number} · {modal.order.product.name} × {modal.order.qty} · {fmt(modal.order.amount)} ₽
        </p>
        {allowed.length ? (
          <>
            <label className="block text-[12px] font-medium text-muted-2 mb-2">Новый статус</label>
            <div className="flex gap-2 flex-wrap mb-4">
              {allowed.map(v => (
                <button key={v} onClick={() => onChange({ status: v })}
                        className="px-3 py-1.5 rounded-full text-[12px] font-medium transition"
                        style={modal.status === v
                          ? { background: colors[v], color: '#fff' }
                          : { background: 'var(--soft)', color: 'var(--ink)' }}>
                  {labels[v]}
                </button>
              ))}
            </div>
            <label className="block text-[12px] font-medium text-muted-2 mb-1.5">
              Комментарий / причина
              {modal.status === 'cancelled' && <span className="text-danger"> — обязательна при отмене</span>}
            </label>
            <textarea rows="2" value={modal.reason} onChange={e => onChange({ reason: e.target.value })}
                      className="field w-full resize-none" />
            {modal.status === 'confirmed' && (
              <p className="text-[11px] text-muted mt-2">При подтверждении остаток спишется автоматически и осядёт в журнале операций.</p>
            )}
            <div className="flex gap-2 mt-5">
              <button onClick={onClose} className="btn btn-ghost flex-1 rounded-[11px] py-2.5">Отмена</button>
              <button onClick={onApply} disabled={!modal.status}
                      className="btn btn-primary flex-1 rounded-[11px] py-2.5">Применить</button>
            </div>
          </>
        ) : (
          <p className="text-[13px] text-muted mb-4">
            Заявка в финальном статусе — переходы недоступны. Все изменения уже в журнале операций.
          </p>
        )}
      </div>
    </div>
  );
}

export function NewOrderModal({ modal, products, onClose, onChange, onApply }) {
  if (!modal) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/35 backdrop-blur-[3px]">
      <div className="card w-full max-w-md p-6 shadow-2xl">
        <h3 className="text-[17px] font-semibold text-ink mb-5">Новая заявка</h3>
        <label className="block text-[12px] font-medium text-muted-2 mb-1.5">Товар</label>
        <select value={modal.product_id} onChange={e => onChange({ product_id: e.target.value })}
                className="field w-full mb-4">
          <option value="">— выберите —</option>
          {products.map(p => (
            <option key={p.id} value={p.id}>{p.name} · {p.stock} шт · {fmt(p.price)} ₽</option>
          ))}
        </select>
        <label className="block text-[12px] font-medium text-muted-2 mb-1.5">Количество</label>
        <input type="number" min="1" value={modal.qty} onChange={e => onChange({ qty: +e.target.value })}
               className="field w-full mb-4" />
        <label className="block text-[12px] font-medium text-muted-2 mb-1.5">Имя клиента / компания</label>
        <input value={modal.customer_name} onChange={e => onChange({ customer_name: e.target.value })}
               className="field w-full mb-4" />
        <label className="block text-[12px] font-medium text-muted-2 mb-1.5">Контакт</label>
        <input value={modal.contact} onChange={e => onChange({ contact: e.target.value })}
               className="field w-full mb-4" />
        {modal.error && <p className="text-[12px] text-danger mb-2">{modal.error}</p>}
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
    <div className={'fixed bottom-6 right-6 z-[60] px-5 py-3.5 rounded-[14px] text-[13px] font-medium text-on-strong shadow-xl transition-all ' +
      (toast.ok ? 'bg-strong' : 'bg-danger')}>
      {toast.msg}
    </div>
  );
}
