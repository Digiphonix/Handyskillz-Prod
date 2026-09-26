import { Router, type IRouter } from "express";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/requireAuth";
import { requireSupabase } from "../lib/supabase";

const router: IRouter = Router();

router.get("/notifications", requireAuth, async (req, res) => {
  try {
    const userId = (req as AuthenticatedRequest).userId;
    const { data, error } = await requireSupabase().from("user_notifications")
      .select("id,title,body,data,read_at,created_at").eq("user_id", userId)
      .order("created_at", { ascending: false }).limit(100);
    if (error) throw error;
    res.json({ notifications: data });
  } catch (error) { res.status(503).json({ error: error instanceof Error ? error.message : "Notifications unavailable" }); }
});

router.post("/notifications/push-token", requireAuth, async (req, res) => {
  try {
    const userId = (req as AuthenticatedRequest).userId;
    const token = typeof req.body?.token === "string" ? req.body.token.trim() : "";
    const platform = req.body?.platform;
    if (!/^Expo(nent)?PushToken\[[A-Za-z0-9_-]+\]$/.test(token) || !["ios", "android"].includes(platform)) {
      res.status(400).json({ error: "A valid Expo push token and iOS or Android platform are required" }); return;
    }
    const { error } = await requireSupabase().from("expo_push_tokens").upsert({
      expo_push_token: token, user_id: userId, platform, updated_at: new Date().toISOString(),
    }, { onConflict: "expo_push_token" });
    if (error) throw error;
    res.json({ registered: true });
  } catch (error) { res.status(503).json({ error: error instanceof Error ? error.message : "Could not register push notifications" }); }
});

router.get("/notifications/push-token/status", requireAuth, async (req, res) => {
  try {
    const userId = (req as AuthenticatedRequest).userId;
    const { count, error } = await requireSupabase().from("expo_push_tokens").select("expo_push_token", { count: "exact", head: true }).eq("user_id", userId);
    if (error) throw error;
    res.json({ enabled: (count ?? 0) > 0 });
  } catch (error) { res.status(503).json({ error: error instanceof Error ? error.message : "Could not load push notification status" }); }
});

router.delete("/notifications/push-token", requireAuth, async (req, res) => {
  try {
    const userId = (req as AuthenticatedRequest).userId;
    const token = typeof req.body?.token === "string" ? req.body.token.trim() : "";
    if (!token) { res.status(400).json({ error: "Push token is required" }); return; }
    const { error } = await requireSupabase().from("expo_push_tokens").delete().eq("expo_push_token", token).eq("user_id", userId);
    if (error) throw error;
    res.json({ registered: false });
  } catch (error) { res.status(503).json({ error: error instanceof Error ? error.message : "Could not disable push notifications" }); }
});

router.patch("/notifications/:id/read", requireAuth, async (req, res) => {
  try {
    const userId = (req as AuthenticatedRequest).userId;
    const { data, error } = await requireSupabase().from("user_notifications")
      .update({ read_at: new Date().toISOString() }).eq("id", req.params.id).eq("user_id", userId)
      .select("id,read_at").maybeSingle();
    if (error) throw error;
    if (!data) { res.status(404).json({ error: "Notification not found" }); return; }
    res.json({ notification: data });
  } catch (error) { res.status(503).json({ error: error instanceof Error ? error.message : "Could not update notification" }); }
});

router.post("/notifications/read-all", requireAuth, async (req, res) => {
  try {
    const userId = (req as AuthenticatedRequest).userId;
    const { error } = await requireSupabase().from("user_notifications").update({ read_at: new Date().toISOString() }).eq("user_id", userId).is("read_at", null);
    if (error) throw error;
    res.json({ success: true });
  } catch (error) { res.status(503).json({ error: error instanceof Error ? error.message : "Could not mark notifications read" }); }
});

export default router;
