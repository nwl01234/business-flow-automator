import React, { useCallback, useEffect, useState } from 'react';
import { api, doLogin, clearAuth, defaultFilters, getToken, readUser } from './api.js';
import { connectWs } from './ws.js';
import { Login, Shell, Toast, StatusModal, NewOrderModal } from './components.jsx';

export default function App() {
  const [user, setUser] = useState(readUser());
  const [booted, setBooted] = useState(false);
  const [tab, setTab] = useState('dashboard');
  const [filters, setFilters] = useState(defaultFilters());
  const [metrics, setMetrics] = useState(null);
  const [orders, setOrders] = useState([]);
  const [products, setProducts] = useState([]);
  const [history, setHistory] = useState([]);
  const [wsLive, setWsLive] = useState(false);
  const [statusModal, setStatusModal] = useState(null);   // {order, status, reason}
  const [newOrder, setNewOrder] = useState(null);          // {product_id, qty, ...}
  const [toast, setToast] = useState(null);

  const showToast = useCallback((msg, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  }, []);

  const qs = useCallback(f => {
    const p = new URLSearchParams();
    if (f.from) p.set('date_from', f.from);
    if (f.to) p.set('date_to', f.to);
    if (f.status) p.set('status', f.status);
    return p.toString();
  }, []);

  const loadAll = useCallback(async f => {
    const ff = f || filters;
    try {
      const [m, os, ps, ops] = await Promise.all([
        api('/analytics/metrics?' + qs(ff)),
        api('/orders?' + qs(ff)),
        api('/inventory'),
        api('/analytics/operations?limit=40'),
      ]);
      setMetrics(m); setOrders(os); setProducts(ps); setHistory(ops);
    } catch (e) {
      if (e.status === 401) { setUser(null); return; }
      showToast('Ошибка загрузки: ' + e.message, false);
    }
  }, [filters, qs, showToast]);

  // Bootstrap: проверяем сохранённую сессию
  useEffect(() => {
    (async () => {
      if (getToken()) {
        try { setUser(await api('/auth/me')); } catch { setUser(null); }
      }
      setBooted(true);
    })();
  }, []);

  // Данные:_WS события + фолбэк-поллинг
  useEffect(() => {
    if (!user) return undefined;
    loadAll();
    const stopWs = connectWs(
      getToken(),
      e => { if (e.type === 'orders_updated') loadAll(); },
      setWsLive,
    );
    const poll = setInterval(() => loadAll(), 20000); // fallback на случай отвалившегося WS
    return () => { stopWs(); clearInterval(poll); };
  }, [user, loadAll]);

  if (!booted) return null;
  if (!user) return <Login onLogin={u => { setUser(u); }} />;

  const changeStatus = async () => {
    const { order, status, reason } = statusModal;
    try {
      await api(`/orders/${order.id}/status`, { method: 'PATCH', body: JSON.stringify({ status, reason }) });
      setStatusModal(null);
      showToast(`Заявка ${order.number} → ${status}`);
      loadAll();
    } catch (e) { showToast(e.message || 'Ошибка', false); }
  };

  const createOrder = async () => {
    try {
      const o = await api('/orders', { method: 'POST', body: JSON.stringify({
        product_id: +newOrder.product_id, qty: newOrder.qty,
        customer_name: newOrder.customer_name, contact: newOrder.contact,
      }) });
      setNewOrder(null);
      showToast(`Заявка ${o.number} создана ✅`);
      loadAll();
    } catch (e) {
      setNewOrder(n => ({ ...n, error: e.message || 'Ошибка создания' }));
    }
  };

  const canChange = o => user.role !== 'bot'
    && !(user.role === 'manager' && (o.status === 'shipped' || o.status === 'cancelled'));

  return (
    <>
      <Shell
        user={user} tab={tab} setTab={setTab} wsLive={wsLive}
        onLogout={() => { clearAuth(); setUser(null); }}
        metrics={metrics} orders={orders} products={products} history={history}
        filters={filters} setFilters={setFilters} onRefresh={() => loadAll()}
        canChange={canChange}
        onStatus={(o, status) => setStatusModal({ order: o, status, reason: '' })}
        onNewOrder={preset => setNewOrder({ product_id: preset ? String(preset) : '', qty: 1, customer_name: '', contact: '', error: '' })}
      />
      <StatusModal
        modal={statusModal}
        onClose={() => setStatusModal(null)}
        onChange={patch => setStatusModal(m => ({ ...m, ...patch }))}
        onApply={changeStatus}
      />
      <NewOrderModal
        modal={newOrder}
        products={products}
        onClose={() => setNewOrder(null)}
        onChange={patch => setNewOrder(n => ({ ...n, ...patch }))}
        onApply={createOrder}
      />
      <Toast toast={toast} />
    </>
  );
}
