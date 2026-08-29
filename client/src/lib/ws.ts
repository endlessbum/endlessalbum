import { createWebSocketUrl } from "@/lib/utils";

// Единое WS-подключение на вкладку (присваивается window.wsConnection).
// Компоненты подписываются через subscribeWs, а не создают собственные
// сокеты — иначе каждый ре-рендер открывал новое соединение (баг реконнекта).
declare global {
  interface Window {
    wsConnection?: WebSocket;
  }
}

let socket: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let manuallyClosed = false;
const listeners = new Set<(event: MessageEvent) => void>();

const RECONNECT_DELAY_MS = 2000;

function scheduleReconnect() {
  if (reconnectTimer !== null) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    ensureConnection();
  }, RECONNECT_DELAY_MS);
}

function ensureConnection(): WebSocket {
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
    return socket;
  }

  manuallyClosed = false;
  socket = new WebSocket(createWebSocketUrl("/ws"));
  window.wsConnection = socket;

  socket.onmessage = (event) => {
    listeners.forEach((listener) => {
      try {
        listener(event);
      } catch {
        // Ошибки одного подписчика не должны ронять остальных
      }
    });
  };

  socket.onclose = () => {
    if (window.wsConnection === socket) window.wsConnection = undefined;
    socket = null;
    if (!manuallyClosed) {
      scheduleReconnect();
    }
  };

  socket.onerror = () => {
    try {
      socket?.close();
    } catch {
      // ignore
    }
  };

  return socket;
}

export function getWsConnection(): WebSocket {
  return ensureConnection();
}

export function isWsOpen(): boolean {
  return !!socket && socket.readyState === WebSocket.OPEN;
}

export function sendWs(payload: unknown): boolean {
  const s = ensureConnection();
  if (s.readyState !== WebSocket.OPEN) return false;
  s.send(JSON.stringify(payload));
  return true;
}

export function subscribeWs(handler: (event: MessageEvent) => void): () => void {
  listeners.add(handler);
  ensureConnection();
  return () => {
    listeners.delete(handler);
  };
}

export function closeWs(): void {
  manuallyClosed = true;
  if (reconnectTimer !== null) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  listeners.clear();
  if (socket) {
    socket.onclose = null;
    try {
      socket.close();
    } catch {
      // ignore
    }
    socket = null;
  }
  window.wsConnection = undefined;
}
