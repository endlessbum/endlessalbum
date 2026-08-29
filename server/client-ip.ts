import { TRUSTED_PROXY_HOPS } from "@shared/constants";

// Определение IP клиента ЗА доверенным обратным прокси (Render).
//
// Проблема, которую это решает: WS-лимитер (server/routes.ts) держит счётчик
// подключений на IP. Наивный разбор X-Forwarded-For («взять первую запись»)
// брал САМЫЙ ЛЕВЫЙ элемент — а он полностью подконтролен клиенту: любой может
// прислать `X-Forwarded-For: <любой IP>` и получать новый счётчик на каждый
// поддельный адрес, полностью обходя WS_MAX_CONNECTIONS_PER_IP (и засоряя логи
// чужими IP). X-Real-IP так же подделываем и здесь НЕ учитывается.
//
// Правильный подход — тот же, что у Express `req.ip` при `trust proxy = N`
// (пакет proxy-addr): доверяем только N ближайшим к сокету хопам и берём адрес,
// который дописал наш доверенный прокси. Наш прокси всегда добавляет реально
// увиденный им адрес клиента СПРАВА, поэтому подделка слева игнорируется.
//
// verifyClient у ws получает сырой http.IncomingMessage (не Express req), где
// req.ip недоступен, поэтому логику воспроизводим вручную — но с тем же числом
// хопов TRUSTED_PROXY_HOPS, что и Express, чтобы HTTP- и WS-лимитеры считали
// клиента одинаково.

export interface IpRequestLike {
  headers: Record<string, string | string[] | undefined>;
  socket?: { remoteAddress?: string };
}

/**
 * Возвращает IP клиента с учётом TRUSTED_PROXY_HOPS доверенных прокси.
 *
 * Повторяет алгоритм proxy-addr для числового trust: строит список адресов от
 * ближнего к дальнему `[socket, …X-Forwarded-For справа налево]` и берёт адрес
 * с индексом `min(TRUSTED_PROXY_HOPS, len - 1)` — то есть адрес, дописанный
 * нашим доверенным прокси. Значения X-Forwarded-For левее (подконтрольные
 * клиенту) игнорируются, поэтому обойти лимит подстановкой чужого IP нельзя.
 */
export function getClientIp(req: IpRequestLike): string {
  const forwardedHeader = req.headers["x-forwarded-for"];
  const forwardedValue = Array.isArray(forwardedHeader)
    ? forwardedHeader.join(",")
    : (forwardedHeader ?? "");

  // Справа налево: первый элемент — адрес, добавленный ближайшим прокси.
  const forwardedChain = forwardedValue
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .reverse();

  // Индекс 0 — адрес сокета (сам прокси); дальше идут записи X-Forwarded-For.
  // Позицию сокета сохраняем, даже если адрес неизвестен, чтобы индексация
  // хопов совпадала с proxy-addr.
  const chain: (string | undefined)[] = [req.socket?.remoteAddress, ...forwardedChain];

  const index = Math.min(TRUSTED_PROXY_HOPS, chain.length - 1);
  const resolved = chain[index];

  return resolved && resolved.length > 0 ? resolved : "unknown";
}
