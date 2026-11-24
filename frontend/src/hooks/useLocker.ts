import { useEffect, useState } from "react";
import { io } from "socket.io-client";
import type { BankStatus, LockerEvent } from "../../../shared/types";
export async function request<T>(path: string, body?: unknown): Promise<T> {
  const r = await fetch(`/api/${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(8000),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.message ?? "Yêu cầu thất bại.");
  return data as T;
}
export function useLocker() {
  const [state, setState] = useState<BankStatus | null>(null),
    [events, setEvents] = useState<LockerEvent[]>([]),
    [connected, setConnected] = useState(false);
  useEffect(() => {
    let active = true,
      latest = -1;
    const socket = io({ autoConnect: false, timeout: 5000 });
    const receive = (s: BankStatus) => {
      if (!active || s.revision < latest) return;
      latest = s.revision;
      setState(s);
    };
    socket.on("connect", () => {
      latest = -1;
      setConnected(true);
    });
    socket.on("disconnect", () => setConnected(false));
    socket.on("connect_error", () => setConnected(false));
    socket.on("status", receive);
    socket.on("events", (e: LockerEvent[]) => setEvents(e));
    socket.on("event", (e: LockerEvent) =>
      setEvents((v) => [e, ...v.filter((x) => x.id !== e.id)].slice(0, 200)),
    );
    socket.connect();
    void request<BankStatus>("status")
      .then((s) => {
        if (latest < 0) receive(s);
      })
      .catch(() => {});
    return () => {
      active = false;
      socket.disconnect();
    };
  }, []);
  return { state, events, connected };
}
