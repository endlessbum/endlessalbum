import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function createWebSocketUrl(path: string = "/ws"): string {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  
  let host = window.location.host;
  
  if (!host) {
    const hostname = window.location.hostname || 'localhost';
    const port = window.location.port || '5000';
    host = `${hostname}:${port}`;
  }
  
  return `${protocol}//${host}${path}`;
}
