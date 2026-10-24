/** WebSocket /api/ws с автореq_connect-ом; события сводятся в onEvent. */
export function connectWs(token, onEvent, onStatus) {
  let closed = false, retry = 0, socket = null;

  const open = () => {
    const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/ws?token=${token}`;
    socket = new WebSocket(url);
    socket.onopen = () => { retry = 0; onStatus?.(true); };
    socket.onmessage = e => { try { onEvent(JSON.parse(e.data)); } catch { /* ignore */ } };
    socket.onclose = () => {
      onStatus?.(false);
      if (!closed) setTimeout(open, Math.min(30000, 2000 * ++retry));
    };
  };
  open();
  return () => { closed = true; socket?.close(); };
}
