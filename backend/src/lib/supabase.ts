import { createClient } from "@supabase/supabase-js";
import type { WebSocketLikeConstructor } from "@supabase/realtime-js";
import WebSocket from "ws";

const realtimeTransport = WebSocket as unknown as WebSocketLikeConstructor;

const supabaseUrl = process.env.SUPABASE_URL;
const serverKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  ?? process.env.SUPABASE_PUBLISHABLE_KEY
  ?? process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !serverKey) {
  throw new Error("SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY (or SUPABASE_SERVICE_ROLE_KEY) must be set for the API server.");
}

export const supabaseAdmin = createClient(supabaseUrl, serverKey, {
  realtime: { transport: realtimeTransport },
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

export function createUserClient(accessToken: string) {
  return createClient(supabaseUrl!, serverKey!, {
    realtime: { transport: realtimeTransport },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function getAuthenticatedUser(authorization?: string) {
  const token = authorization?.startsWith("Bearer ") ? authorization.slice(7) : null;
  if (!token) return null;

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error) return null;
  return data.user;
}
