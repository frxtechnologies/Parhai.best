import { API_BASE_URL } from "@/api/client";
import { requireSupabase } from "@/lib/supabase";
export async function agentApi<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const { data } = await requireSupabase().auth.getSession();
  const response = await fetch(`${API_BASE_URL}/api${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${data.session?.access_token ?? ""}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? "Request failed.");
  return body as T;
}
