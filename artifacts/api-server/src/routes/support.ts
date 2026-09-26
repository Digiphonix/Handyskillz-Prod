import { isPlatformAdmin } from "../lib/admin";
import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/requireAuth";
import { requireSupabase } from "../lib/supabase";
import { createNotification } from "../lib/notifications";

const router: IRouter = Router();

router.get("/support/tickets", requireAuth, async (req, res) => {
  try {
    const userId = (req as AuthenticatedRequest).userId;
    let query = requireSupabase().from("support_tickets").select("id,user_id,subject,message,status,created_at,updated_at").order("created_at", { ascending: false }).limit(100);
    if (!(await isPlatformAdmin(userId))) query = query.eq("user_id", userId);
    const { data, error } = await query;
    if (error) throw error;
    res.json({ tickets: data });
  } catch (error) { res.status(503).json({ error: error instanceof Error ? error.message : "Support requests unavailable" }); }
});

router.post("/support/tickets", requireAuth, async (req, res) => {
  try {
    const userId = (req as AuthenticatedRequest).userId;
    const body = req.body as Record<string, unknown>;
    const subject = typeof body.subject === "string" ? body.subject.trim() : "";
    const message = typeof body.message === "string" ? body.message.trim() : "";
    if (!subject || !message || message.length > 5000) { res.status(400).json({ error: "Subject and a message of up to 5000 characters are required" }); return; }
    const { data, error } = await requireSupabase().from("support_tickets").insert({ user_id: userId, subject, message }).select("id,subject,message,status,created_at").single();
    if (error) throw error;
    res.status(201).json({ ticket: data });
  } catch (error) { res.status(503).json({ error: error instanceof Error ? error.message : "Could not create support request" }); }
});

router.patch("/support/tickets/:id", requireAuth, async (req, res) => {
  try {
    const userId = getAuth(req).userId;
    if (!userId || !(await isPlatformAdmin(userId))) { res.status(403).json({ error: "Admin access is required" }); return; }
    const status = (req.body as Record<string, unknown>).status;
    if (!['in_progress', 'resolved'].includes(String(status))) { res.status(400).json({ error: "Status must be in_progress or resolved" }); return; }
    const { data, error } = await requireSupabase().from("support_tickets").update({ status, updated_at: new Date().toISOString() }).eq("id", req.params.id).select("id,status").maybeSingle();
    if (error) throw error;
    if (!data) { res.status(404).json({ error: "Support request not found" }); return; }
    const { data: ticket } = await requireSupabase().from("support_tickets").select("user_id,subject").eq("id", data.id).maybeSingle();
    if (ticket) {
      try { await createNotification(ticket.user_id, "Support request updated", `“${ticket.subject}” is now ${String(status).replace('_', ' ')}.`, { ticketId: data.id }); } catch { /* Ticket status updates should not fail if an inbox event cannot be recorded. */ }
    }
    res.json({ ticket: data });
  } catch (error) { res.status(503).json({ error: error instanceof Error ? error.message : "Could not update support request" }); }
});

export default router;
