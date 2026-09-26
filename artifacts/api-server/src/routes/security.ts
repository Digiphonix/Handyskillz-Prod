import { Router, type IRouter } from "express";
import { clerkClient, getAuth } from "@clerk/express";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

router.get("/account/security/sessions", requireAuth, async (req, res) => {
  try {
    const { userId, sessionId } = getAuth(req);
    if (!userId) { res.status(401).json({ error: "Sign in to review your sessions" }); return; }
    const { data } = await clerkClient.sessions.getSessionList({ userId, limit: 100 });
    res.json({ sessions: data.map((session) => ({
      id: session.id,
      status: session.status,
      current: session.id === sessionId,
      createdAt: session.createdAt,
      lastActiveAt: session.lastActiveAt,
      expiresAt: session.expireAt,
      deviceType: session.latestActivity?.deviceType || null,
      browserName: session.latestActivity?.browserName || null,
      city: session.latestActivity?.city || null,
      country: session.latestActivity?.country || null,
    })) });
  } catch (error) { res.status(503).json({ error: error instanceof Error ? error.message : "Could not load account sessions" }); }
});

router.post("/account/security/revoke-other-sessions", requireAuth, async (req, res) => {
  try {
    const { userId, sessionId } = getAuth(req);
    if (!userId || !sessionId) { res.status(401).json({ error: "Sign in to manage sessions" }); return; }
    const { data } = await clerkClient.sessions.getSessionList({ userId, status: "active", limit: 100 });
    const otherSessions = data.filter((session) => session.id !== sessionId);
    const results = await Promise.allSettled(otherSessions.map((session) => clerkClient.sessions.revokeSession(session.id)));
    const revoked = results.filter((result) => result.status === "fulfilled").length;
    const failed = results.length - revoked;
    res.json({ revoked, failed, currentSessionPreserved: true });
  } catch (error) { res.status(503).json({ error: error instanceof Error ? error.message : "Could not revoke other sessions" }); }
});

export default router;
