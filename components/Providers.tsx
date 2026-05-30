"use client";
import { createContext, useContext, useEffect, useState } from "react";
import type { Seat } from "@/src/auth";
import { api, getSeatId, setSeatId } from "@/app/lib/client";

type Theme = "paper" | "ink";

interface SeatCtx {
  seats: Seat[];
  seat: Seat | null;
  seatId: string;
  setSeat: (id: string) => void;
}
interface ThemeCtxT {
  theme: Theme;
  setTheme: (t: Theme) => void;
}

const SeatContext = createContext<SeatCtx>({ seats: [], seat: null, seatId: "ana", setSeat: () => {} });
const ThemeContext = createContext<ThemeCtxT>({ theme: "paper", setTheme: () => {} });

export const useSeat = () => useContext(SeatContext);
export const useTheme = () => useContext(ThemeContext);

export function Providers({ children }: { children: React.ReactNode }) {
  const [seats, setSeats] = useState<Seat[]>([]);
  const [seatId, setId] = useState("ana");
  const [theme, setThemeState] = useState<Theme>("paper");

  useEffect(() => {
    setId(getSeatId());
    const t = (document.documentElement.getAttribute("data-theme") as Theme) || "paper";
    setThemeState(t);
    api.seats().then((r) => setSeats(r.seats)).catch(() => {});
  }, []);

  const seat = seats.find((s) => s.user_id === seatId) ?? null;
  const setSeat = (id: string) => {
    setSeatId(id);
    setId(id);
  };
  const setTheme = (t: Theme) => {
    document.documentElement.setAttribute("data-theme", t);
    try {
      localStorage.setItem("brs-theme", t);
    } catch {}
    setThemeState(t);
  };

  return (
    <SeatContext.Provider value={{ seats, seat, seatId, setSeat }}>
      <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>
    </SeatContext.Provider>
  );
}
