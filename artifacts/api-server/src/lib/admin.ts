import { clerkClient, getAuth } from "@clerk/express";
import type { Request, Response, NextFunction } from "express";

// Platform administration is reserved for this verified primary email.
export async function isPlatformAdmin(userId: string | null | undefined): Promise<boolean> {
  if (!userId) return false;
  const user = await clerkClient.users.getUser(userId);
  const email = user.emailAddresses.find((item) => item.id === user.primaryEmailAddressId);
  return email?.verification?.status === "verified"
    && email.emailAddress.trim().toLowerCase() === "digiphonix@gmail.com";
}

export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  try {
    if (!(await isPlatformAdmin(getAuth(req).userId))) {
      res.status(403).json({ error: "Admin access is required" });
      return;
    }
    next();
  } catch {
    res.status(503).json({ error: "Could not verify admin access" });
  }
}
