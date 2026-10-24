const BASE = '/api';

export const fmt = n => new Intl.NumberFormat('ru-RU').format(Math.round(n));
export const fmtDate = s => new Date(s).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
export const STATUS_RU = { new: 'Создана', confirmed: 'Подтверждена', shipped: 'Отгружена', cancelled: 'Отменена' };
export const STATUS_ENDPOINT = ['/new', '/confirmed', '/shipped', '/cancelled'];

const dstr = off => new Date(Date.now() - off * 864e5).toISOString().slice(0, 10);
export const defaultFilters = () => ({ from: dstr(13), to: dstr(0), status: '' });

export const getToken = () => localStorage.getItem('bf_token');
export const clearAuth = () => { localStorage.removeItem('bf_token'); localStorage.removeItem('bf_user'); };

export async function api(path, opts = {}) {
  const token = getToken();
  const res = await fetch(BASE + path, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(token && { Authorization: 'Bearer ' + token }),
      ...(opts.headers || {}),
    },
  });
  if (res.status === 401) {
    clearAuth();
    const err = new Error('Сессия истекла');
    err.status = 401;
    throw err;
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const err = new Error(
      (body.detail && typeof body.detail === 'object' && body.detail.message)
      || (typeof body.detail === 'string' && body.detail)
      || body.message || res.statusText
    );
    err.status = res.status;
    err.payload = body.detail ?? body;
    throw err;
  }
  return res.json();
}

export async function doLogin(login, password) {
  const res = await fetch(BASE + '/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ login, password }),
  });
  if (!res.ok) throw new Error('Неверный логин или пароль');
  const data = await res.json();
  localStorage.setItem('bf_token', data.access_token);
  localStorage.setItem('bf_user', JSON.stringify(data.user));
  return data.user;
}

export function readUser() {
  try { return JSON.parse(localStorage.getItem('bf_user')); } catch { return null; }
}
