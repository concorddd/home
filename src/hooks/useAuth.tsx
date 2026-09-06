import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { usePresence } from "@/hooks/usePresence";
import { ensureAllBuckets } from "@/lib/storage.functions";

export type Profile = {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  banner_url?: string | null;
  banner_color?: string | null;
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

function normalizeProfile(raw: unknown): Profile {
  const p = (raw ?? {}) as Record<string, unknown>;
  return {
    id: typeof p["id"] === "string" ? p["id"] : "",
    username: typeof p["username"] === "string" ? p["username"] : "?",
    display_name: typeof p["display_name"] === "string" ? p["display_name"] : null,
    avatar_url: typeof p["avatar_url"] === "string" ? p["avatar_url"] : null,
    banner_url: typeof p["banner_url"] === "string" ? p["banner_url"] : undefined,
    banner_color: typeof p["banner_color"] === "string" ? p["banner_color"] : null,
    bio: typeof p["bio"] === "string" ? p["bio"] : null,
    status: typeof p["status"] === "string" ? p["status"] : "offline",
    is_online: typeof p["is_online"] === "boolean" ? p["is_online"] : false,
    last_active_at: typeof p["last_active_at"] === "string" ? p["last_active_at"] : undefined,
    created_at: typeof p["created_at"] === "string" ? p["created_at"] : new Date().toISOString(),
  };
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const userId = session?.user?.id ?? null;

  // Sistema de presença - detecta atividade e atualiza status
  usePresence(userId);

  async function loadProfile(id: string) {
    // Tentativa em cascata: o banco pode ainda não ter todas as colunas
    // (migrações pendentes). Cada tentativa remove colunas que podem faltar.
    const attempts = [
      "id, username, display_name, avatar_url, banner_url, banner_color, bio, status, is_online, last_active_at, created_at",
      "id, username, display_name, avatar_url, banner_url, bio, status, created_at",
      "id, username, display_name, avatar_url, status, created_at",
    ];

    for (const fields of attempts) {
      const { data, error } = await supabase
        .from("profiles")
        .select(fields)
        .eq("id", id)
        .maybeSingle();

      if (data) {
        setProfile(normalizeProfile(data));
        return;
      }

      // Erro que não seja "coluna não existe" → para e mostra o erro
      if (error && !/column .* does not exist|column .* does not exist/i.test(error.message)) {
        break;
      }
    }

    setProfile(null);
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

  // Garante que os buckets de storage existam quando o usuário faz login
  useEffect(() => {
    if (userId) {
      void ensureAllBuckets().catch(console.error);
    }
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
