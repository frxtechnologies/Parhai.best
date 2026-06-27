import type { NextFunction, Request, Response } from "express";
import { createUserClient, getAuthenticatedUser } from "../lib/supabase";

export async function requireUser(req: Request, res: Response, next: NextFunction) {
  const authorization = req.header("authorization");
  const accessToken = authorization?.startsWith("Bearer ") ? authorization.slice(7) : null;
  const user = await getAuthenticatedUser(authorization);
  if (!user) {
    res.status(401).json({ error: "A valid Supabase session is required." });
    return;
  }

  res.locals.user = user;
  res.locals.supabase = createUserClient(accessToken!);
  next();
}

export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const authorization = req.header("authorization");
  const accessToken = authorization?.startsWith("Bearer ") ? authorization.slice(7) : null;
  const user = await getAuthenticatedUser(authorization);
  if (!user) {
    res.status(401).json({ error: "A valid Supabase session is required." });
    return;
  }

  const email = user.email?.trim().toLowerCase();
  const userClient = createUserClient(accessToken!);
  const { data: admin, error } = email
    ? await userClient.from("admin_users").select("email").eq("email", email).maybeSingle()
    : { data: null, error: null };

  if (error) {
    req.log.error({ error }, "Could not verify content administrator");
    res.status(500).json({ error: "Could not verify administrator access." });
    return;
  }

  if (!admin) {
    res.status(403).json({ error: "Only the Parhai content administrator can upload source documents." });
    return;
  }

  res.locals.user = user;
  res.locals.supabase = userClient;
  next();
}
