import { io, Socket } from "socket.io-client";

export const API_URL = import.meta.env.VITE_API_URL || "http://localhost:10000";
export const DEVICE_ID = import.meta.env.VITE_DEVICE_ID || "my-laptop";

export async function request<T>(
  path: string,
  options: RequestInit = {},
  token?: string | null
): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || `Request failed (${response.status})`);
  }
  return response.json();
}

export function connectSocket(token: string): Socket {
  return io(API_URL, {
    auth: { token, role: "dashboard" },
    transports: ["websocket", "polling"],
  });
}
