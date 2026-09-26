import { getAuth } from "@clerk/express";
import { Router, type IRouter } from "express";
import { requireAdmin } from "../lib/admin";
import { requireSupabase } from "../lib/supabase";

const router: IRouter = Router();

router.get("/admin/overview", requireAdmin, async (_req, res) => {
  try {
    const supabase = requireSupabase();
    const [profiles, openJobs, verifications] = await Promise.all([
      supabase.from("profiles").select("id", { count: "exact", head: true }),
      supabase.from("jobs").select("id", { count: "exact", head: true }).eq("status", "open"),
      supabase.from("verification_submissions").select("id", { count: "exact", head: true }).eq("status", "pending"),
    ]);
    const failed = [profiles.error, openJobs.error, verifications.error].find(Boolean);
    if (failed) throw failed;
    res.json({ registeredProfiles: profiles.count ?? 0, openJobs: openJobs.count ?? 0, pendingVerifications: verifications.count ?? 0 });
  } catch (error) {
    res.status(503).json({ error: error instanceof Error ? error.message : "Admin overview unavailable" });
  }
});

router.get("/admin/audit", requireAdmin, async (_req, res) => {
  try {
    const { data, error } = await requireSupabase().from("audit_logs")
      .select("id,actor_id,action,entity_type,entity_id,metadata,created_at")
      .order("created_at", { ascending: false }).limit(100);
    if (error) throw error;
    res.json({ events: data });
  } catch (error) {
    res.status(503).json({ error: error instanceof Error ? error.message : "Audit log unavailable" });
  }
});

router.get("/admin/verifications", requireAdmin, async (_req, res) => {
  try {
    const { data, error } = await requireSupabase().from("verification_submissions")
      .select("id,profile_id,document_type,document_url,status,submitted_at,profiles(display_name,role,city)")
      .eq("status", "pending").order("submitted_at", { ascending: true }).limit(100);
    if (error) throw error;
    res.json({ submissions: data });
  } catch (error) {
    res.status(503).json({ error: error instanceof Error ? error.message : "Verification queue unavailable" });
  }
});

router.patch("/admin/verifications/:id", requireAdmin, async (req, res) => {
  try {
    const status = (req.body as Record<string, unknown>).status;
    if (status !== "approved" && status !== "rejected") {
      res.status(400).json({ error: "Status must be approved or rejected" });
      return;
    }
    const reviewerId = getAuth(req).userId;
    const supabase = requireSupabase();
    const { data, error } = await supabase.from("verification_submissions").update({
      status,
      reviewer_id: reviewerId,
      review_notes: typeof req.body.reviewNotes === "string" ? req.body.reviewNotes.trim() : null,
      reviewed_at: new Date().toISOString(),
    }).eq("id", req.params.id).eq("status", "pending").select("id,profile_id,status").maybeSingle();
    if (error) throw error;
    if (!data) { res.status(404).json({ error: "Pending submission not found" }); return; }
    const { error: auditError } = await supabase.from("audit_logs").insert({
      actor_id: reviewerId, action: `verification_${status}`, entity_type: "verification_submission", entity_id: data.id,
      metadata: { profile_id: data.profile_id },
    });
    if (auditError) throw auditError;
    res.json({ submission: data });
  } catch (error) {
    res.status(503).json({ error: error instanceof Error ? error.message : "Could not review submission" });
  }
});

export default router;
