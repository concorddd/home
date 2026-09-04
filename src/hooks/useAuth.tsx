import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { usePresence } from "@/hooks/usePresence";

export type Profile = {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  banner_url?: string | null;
  bio?: string | null;
  status: string;
  is_online?: boolean;
  last_active_at?: string;
  created_at: string;
};

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const userId = session?.user?.id ?? null;

  // Sistema de presença - detecta atividade e atualiza status
  usePresence(userId);

  async function loadProfile(id: string) {
    // Tenta buscar com todos os campos; se alguma coluna não existir,
    // faz fallback para a query sem ela (evita quebrar o perfil).
    let { data } = await supabase
      .from("profiles")
      .select("id, username, display_name, avatar_url, banner_url, bio, status, is_online, last_active_at, created_at")
      .eq("id", id)
      .maybeSingle();

    if (data == null) {
      const fallback = await supabase
        .from("profiles")
        .select("id, username, display_name, avatar_url, banner_url, bio, status, created_at")
        .eq("id", id)
        .maybeSingle();
      data = fallback.data as unknown as typeof data;
    }

    setProfile((data as unknown as Profile) ?? null);
  }

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setLoading(false);
      if (!nextSession) setProfile(null);
    });

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!userId) {
      setProfile(null);
      return;
    }
    void loadProfile(userId);
  }, [userId]);

  const value: AuthContextValue = {
    session,
    user: session?.user ?? null,
    profile,
    loading,
    signOut: async () => {
      await supabase.auth.signOut();
      setProfile(null);
      setSession(null);
    },
    refreshProfile: async () => {
      if (userId) await loadProfile(userId);
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth deve ser usado dentro de AuthProvider");
  return ctx;
}
