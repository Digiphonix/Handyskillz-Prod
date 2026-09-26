import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/requireAuth";
import { requireSupabase } from "../lib/supabase";
import { createNotification } from "../lib/notifications";

const router: IRouter = Router();

async function requireConversationMember(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = (req as AuthenticatedRequest).userId;
    const { data, error } = await requireSupabase().from("conversation_members")
      .select("conversation_id").eq("conversation_id", req.params.id).eq("profile_id", userId).maybeSingle();
    if (error) throw error;
    if (!data) { res.status(404).json({ error: "Conversation not found" }); return; }
    next();
  } catch (error) { res.status(503).json({ error: error instanceof Error ? error.message : "Could not verify conversation access" }); }
}

router.get("/conversations", requireAuth, async (req, res) => {
  try {
    const userId = (req as AuthenticatedRequest).userId;
    const supabase = requireSupabase();
    const { data: memberships, error: memberError } = await supabase.from("conversation_members").select("conversation_id").eq("profile_id", userId);
    if (memberError) throw memberError;
    const ids = (memberships ?? []).map((item) => item.conversation_id);
    if (!ids.length) { res.json({ conversations: [] }); return; }
    const { data: conversations, error } = await supabase.from("conversations").select("*").in("id", ids).order("updated_at", { ascending: false });
    if (error) throw error;
    const results = await Promise.all((conversations ?? []).map(async (conversation) => {
      const [{ data: members, error: otherError }, { data: latest, error: messageError }] = await Promise.all([
        supabase.from("conversation_members").select("profile_id,profiles(id,display_name,role,avatar_url,phone)").eq("conversation_id", conversation.id).neq("profile_id", userId),
        supabase.from("messages").select("id,body,sender_id,created_at").eq("conversation_id", conversation.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      ]);
      if (otherError) throw otherError;
      if (messageError) throw messageError;
      return { ...conversation, participant: members?.[0]?.profiles ?? null, latest_message: latest };
    }));
    res.json({ conversations: results });
  } catch (error) { res.status(503).json({ error: error instanceof Error ? error.message : "Could not load conversations" }); }
});

router.post("/conversations", requireAuth, async (req, res) => {
  try {
    const userId = (req as AuthenticatedRequest).userId;
    const body = req.body as Record<string, unknown>;
    const providerId = typeof body.providerId === "string" ? body.providerId.trim() : "";
    const jobId = typeof body.jobId === "string" ? body.jobId.trim() : "";
    if (!providerId && !jobId) { res.status(400).json({ error: "providerId or jobId is required" }); return; }
    const supabase = requireSupabase();
    let targetId = providerId;
    if (jobId) {
      const { data: job, error } = await supabase.from("jobs").select("id,customer_id,selected_provider_id,status").eq("id", jobId).maybeSingle();
      if (error) throw error;
      if (!job) { res.status(404).json({ error: "Job not found" }); return; }
      if (job.customer_id === userId) targetId = job.selected_provider_id || providerId;
      else if (job.selected_provider_id === userId || job.status === "open") targetId = job.customer_id;
      else { res.status(403).json({ error: "You are not a participant in this job" }); return; }
      if (!targetId) { res.status(400).json({ error: "Choose a provider before starting a job conversation" }); return; }
    }
    if (targetId === userId) { res.status(400).json({ error: "A conversation needs another participant" }); return; }
    const { data: target, error: targetError } = await supabase.from("profiles").select("id,role").eq("id", targetId).maybeSingle();
    if (targetError) throw targetError;
    if (!target) { res.status(404).json({ error: "Conversation participant not found" }); return; }

    if (jobId) {
      const { data: existing, error } = await supabase.from("conversations").select("id").eq("job_id", jobId).maybeSingle();
      if (error && error.code !== "PGRST116") throw error;
      if (existing) {
        const { data: members } = await supabase.from("conversation_members").select("profile_id").eq("conversation_id", existing.id);
        if (members?.some((member) => member.profile_id === userId) && members.some((member) => member.profile_id === targetId)) {
          res.json({ conversation: existing }); return;
        }
      }
    }
    const { data: conversation, error: conversationError } = await supabase.from("conversations").insert({ job_id: jobId || null }).select("*").single();
    if (conversationError) throw conversationError;
    const { error: insertMembersError } = await supabase.from("conversation_members").insert([
      { conversation_id: conversation.id, profile_id: userId },
      { conversation_id: conversation.id, profile_id: targetId },
    ]);
    if (insertMembersError) throw insertMembersError;
    res.status(201).json({ conversation });
  } catch (error) { res.status(503).json({ error: error instanceof Error ? error.message : "Could not start conversation" }); }
});

router.get("/conversations/:id/messages", requireAuth, requireConversationMember, async (req, res) => {
  try {
    const { data, error } = await requireSupabase().from("messages").select("id,body,sender_id,message_type,metadata,created_at")
      .eq("conversation_id", req.params.id).order("created_at", { ascending: true }).limit(500);
    if (error) throw error;
    res.json({ messages: data });
  } catch (error) { res.status(503).json({ error: error instanceof Error ? error.message : "Could not load messages" }); }
});

router.post("/conversations/:id/messages", requireAuth, requireConversationMember, async (req, res) => {
  try {
    const userId = (req as AuthenticatedRequest).userId;
    const body = req.body as Record<string, unknown>;
    const message = typeof body.body === "string" ? body.body.trim() : "";
    if (!message || message.length > 5000) { res.status(400).json({ error: "Message must contain 1 to 5000 characters" }); return; }
    const supabase = requireSupabase();
    const { data, error } = await supabase.from("messages").insert({ conversation_id: req.params.id, sender_id: userId, body: message, message_type: "text" }).select("id,body,sender_id,message_type,metadata,created_at").single();
    if (error) throw error;
    await supabase.from("conversations").update({ updated_at: new Date().toISOString() }).eq("id", req.params.id);
    const { data: members } = await supabase.from("conversation_members").select("profile_id").eq("conversation_id", req.params.id).neq("profile_id", userId);
    for (const member of members ?? []) {
      try { await createNotification(member.profile_id, "New message", message.slice(0, 140), { conversationId: req.params.id }); } catch { /* Message delivery succeeds even if the inbox event cannot be recorded. */ }
    }
    res.status(201).json({ message: data });
  } catch (error) { res.status(503).json({ error: error instanceof Error ? error.message : "Could not send message" }); }
});

export default router;
