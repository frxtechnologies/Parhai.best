import { createContext, useContext, ReactNode, useEffect, useState } from "react";
import { signOut, useGetUserProfile } from "@/api/client";
import type { UserProfile } from "@/api/types";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Session } from "@supabase/supabase-js";

interface AuthContextType {
  user: UserProfile | undefined;
  isLoading: boolean;
  isError: boolean;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isSessionLoading, setIsSessionLoading] = useState(true);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!supabase) {
      setSession(null);
      setIsSessionLoading(false);
      return;
    }

    let isMounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!isMounted) return;
      setSession(data.session);
      setIsSessionLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      queryClient.invalidateQueries({ queryKey: ["supabase", "user-profile"] });
      queryClient.invalidateQueries({ queryKey: ["supabase", "dashboard"] });
    });

    return () => {
      isMounted = false;
      listener.subscription.unsubscribe();
    };
  }, [queryClient]);

  const { data: user, isLoading, isError } = useGetUserProfile({
    query: { enabled: Boolean(session), retry: false },
  });

  const logout = async () => {
    await signOut();
    queryClient.clear();
    setSession(null);
    window.location.href = "/login";
  };

  return (
    <AuthContext.Provider value={{ user, isLoading: isSessionLoading || isLoading, isError, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
