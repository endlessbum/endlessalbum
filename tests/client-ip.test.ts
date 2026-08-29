import { describe, it, expect } from 'vitest';
import { getClientIp, type IpRequestLike } from '../server/client-ip';

// TRUSTED_PROXY_HOPS = 1 (один доверенный прокси, как на Render). Клиент виден
// как адрес, который дописал наш прокси, — это ПОСЛЕДНЯЯ (правая) запись
// X-Forwarded-For. Всё, что левее, клиент может подделать, и это игнорируется.

const req = (
  headers: Record<string, string | string[] | undefined>,
  remoteAddress?: string,
): IpRequestLike => ({ headers, socket: { remoteAddress } });

describe('getClientIp (trust proxy = 1)', () => {
  it('игнорирует подделанную левую запись X-Forwarded-For и берёт адрес от прокси (правый)', () => {
    // Клиент прислал `X-Forwarded-For: 9.9.9.9`; прокси дописал реальный IP справа.
    expect(getClientIp(req({ 'x-forwarded-for': '9.9.9.9, 203.0.113.7' }, '10.0.0.1'))).toBe('203.0.113.7');
  });

  it('при длинной цепочке всё равно берёт запись, дописанную нашим прокси (крайнюю правую)', () => {
    // Атакующий может насовать сколько угодно левых записей — доверяем только 1 хопу.
    expect(
      getClientIp(req({ 'x-forwarded-for': '1.1.1.1, 2.2.2.2, 3.3.3.3, 203.0.113.7' }, '10.0.0.1')),
    ).toBe('203.0.113.7');
  });

  it('использует единственную запись X-Forwarded-For (нормальный случай за прокси)', () => {
    expect(getClientIp(req({ 'x-forwarded-for': '203.0.113.7' }, '10.0.0.1'))).toBe('203.0.113.7');
  });

  it('без X-Forwarded-For использует адрес сокета (прямое подключение / локалка)', () => {
    expect(getClientIp(req({}, '198.51.100.4'))).toBe('198.51.100.4');
  });

  it('НЕ доверяет X-Real-IP — он так же подделываем; откатывается к сокету', () => {
    expect(getClientIp(req({ 'x-real-ip': '9.9.9.9' }, '198.51.100.4'))).toBe('198.51.100.4');
  });

  it('два одинаковых поддельных IP слева не дают обойти лимит — ключом остаётся реальный IP', () => {
    const a = getClientIp(req({ 'x-forwarded-for': 'aaa, 203.0.113.7' }, '10.0.0.1'));
    const b = getClientIp(req({ 'x-forwarded-for': 'bbb, 203.0.113.7' }, '10.0.0.1'));
    expect(a).toBe('203.0.113.7');
    expect(b).toBe('203.0.113.7');
    expect(a).toBe(b); // разные подделки → один и тот же ключ лимита
  });

  it('склеивает X-Forwarded-For, пришедший массивом (несколько заголовков)', () => {
    expect(getClientIp(req({ 'x-forwarded-for': ['9.9.9.9', '203.0.113.7'] }, '10.0.0.1'))).toBe('203.0.113.7');
  });

  it('пропускает пустые записи и лишние пробелы', () => {
    expect(getClientIp(req({ 'x-forwarded-for': ' , 9.9.9.9 ,  203.0.113.7  ' }, '10.0.0.1'))).toBe('203.0.113.7');
  });

  it('возвращает "unknown", когда нет ни сокета, ни заголовков', () => {
    expect(getClientIp(req({}, undefined))).toBe('unknown');
  });

  it('при отсутствии сокета всё равно корректно вычленяет клиента за прокси', () => {
    // socket.remoteAddress отсутствует, но позиция хопа сохраняется — берём правый XFF.
    expect(getClientIp(req({ 'x-forwarded-for': '9.9.9.9, 203.0.113.7' }, undefined))).toBe('203.0.113.7');
  });
});
