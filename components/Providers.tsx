"use client";
import { createContext, useContext, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import type { Seat } from "@/src/auth";
import { api, getSeatId, setSeatId } from "@/app/lib/client";
import { LoginScreen } from "./LoginScreen";

type Theme = "paper" | "ink";

interface SeatCtx {
  seats: Seat[];
  seat: Seat | null;
  seatId: string;
  setSeat: (id: string) => void;
  signOut: () => void;
}
interface ThemeCtxT {
  theme: Theme;
  setTheme: (t: Theme) => void;
}

const SeatContext = createContext<SeatCtx>({ seats: [], seat: null, seatId: "ana", setSeat: () => {}, signOut: () => {} });
const ThemeContext = createContext<ThemeCtxT>({ theme: "paper", setTheme: () => {} });

export const useSeat = () => useContext(SeatContext);
export const useTheme = () => useContext(ThemeContext);

export function Providers({ children }: { children: React.ReactNode }) {
  const [seats, setSeats] = useState<Seat[]>([]);
  const [seatId, setId] = useState("ana");
  const [theme, setThemeState] = useState<Theme>("paper");
  const [loggedIn, setLoggedIn] = useState(false);
  const [mounted, setMounted] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setMounted(true);
    setId(getSeatId());
    setLoggedIn(localStorage.getItem("brs-logged-in") === "1");
    const t = (document.documentElement.getAttribute("data-theme") as Theme) || "paper";
    setThemeState(t);
    api.seats().then((r) => setSeats(r.seats)).catch(() => {});
  }, []);

  const seat = seats.find((s) => s.user_id === seatId) ?? null;
  const setSeat = (id: string) => {
    setSeatId(id);
    setId(id);
  };
  const signIn = (id: string) => {
    setSeat(id);
    try { localStorage.setItem("brs-logged-in", "1"); } catch {}
    setLoggedIn(true);
  };
  const signOut = () => {
    try { localStorage.removeItem("brs-logged-in"); } catch {}
    setLoggedIn(false);
  };
  const setTheme = (t: Theme) => {
    document.documentElement.setAttribute("data-theme", t);
    try { localStorage.setItem("brs-theme", t); } catch {}
    setThemeState(t);
  };

  return (
    <SeatContext.Provider value={{ seats, seat, seatId, setSeat, signOut }}>
      <ThemeContext.Provider value={{ theme, setTheme }}>
        {/* The access gate must render outside the mock-login wrapper — a fresh
            visitor has no seat yet and /api/seats is 401'd until they're gated. */}
        {!mounted ? null : (loggedIn || pathname === "/gate") ? children : <LoginScreen seats={seats} onSignIn={signIn} />}
      </ThemeContext.Provider>
    </SeatContext.Provider>
  );
}
