import { isPlatformAdmin } from "../lib/admin";
import { Router, type IRouter } from "express";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/requireAuth";
import { requireSupabase } from "../lib/supabase";
import { createNotification } from "../lib/notifications";

const router: IRouter = Router();
const statuses = new Set(["draft", "open", "matched", "in_progress", "completed", "cancelled", "disputed"]);
const asText = (value: unknown) => typeof value === "string" ? value.trim() : "";

router.get("/jobs", requireAuth, async (req, res) => {
  try {
    const userId = (req as AuthenticatedRequest).userId;
    const status = typeof req.query.status === "string" ? req.query.status : "";
    const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
    const location = typeof req.query.location === "string" ? req.query.location.trim() : "";
    const supabase = requireSupabase();
    const { data: profile, error: profileError } = await supabase.from("profiles").select("role").eq("id", userId).maybeSingle();
    if (profileError) throw profileError;
    if (!profile) { res.status(404).json({ error: "Complete your profile before viewing work" }); return; }
    const isAdmin = profile.role === "admin" && (await isPlatformAdmin(userId));
    const postedBy = typeof req.query.postedBy === "string" ? req.query.postedBy.trim() : "";
    let query = supabase.from("jobs").select("*").order("created_at", { ascending: false }).limit(100);
    if (postedBy) query = query.eq("customer_id", postedBy).eq("status", "open");
    else if (status === "open" || !statuses.has(status)) query = query.eq("status", "open");
    else if (!isAdmin) query = query.or(`customer_id.eq.${userId},selected_provider_id.eq.${userId}`);
    if (statuses.has(status)) query = query.eq("status", status);
    if (search) query = query.ilike("title", `%${search}%`);
    if (location) query = query.ilike("location", `%${location}%`);
    const { data, error } = await query;
    if (error) throw error;
    res.json({ jobs: data });
  } catch (error) {
    res.status(503).json({ error: error instanceof Error ? error.message : "Could not load jobs" });
  }
});

router.post("/jobs", requireAuth, async (req, res) => {
  try {
    const userId = (req as AuthenticatedRequest).userId;
    const body = req.body as Record<string, unknown>;
    const title = asText(body.title);
    const description = asText(body.description);
    const category = asText(body.category);
    if (!title || !description || !category) {
      res.status(400).json({ error: "Title, description and category are required" });
      return;
    }
    const budgetMin = body.budgetMinNgn == null || body.budgetMinNgn === "" ? null : Number(body.budgetMinNgn);
    const budgetMax = body.budgetMaxNgn == null || body.budgetMaxNgn === "" ? null : Number(body.budgetMaxNgn);
    if ((budgetMin !== null && (!Number.isFinite(budgetMin) || budgetMin < 0)) || (budgetMax !== null && (!Number.isFinite(budgetMax) || budgetMax < 0)) || (budgetMin !== null && budgetMax !== null && budgetMin > budgetMax)) {
      res.status(400).json({ error: "Enter valid budgets with the maximum at least the minimum" });
      return;
    }
    const supabase = requireSupabase();
    const { data: profile, error: profileError } = await supabase.from("profiles").select("role").eq("id", userId).maybeSingle();
    if (profileError) throw profileError;
    if (!profile || !["customer", "artisan", "professional", "business"].includes(profile.role)) {
      res.status(403).json({ error: "Customer and provider accounts can publish jobs" });
      return;
    }
    const { data, error } = await supabase.from("jobs").insert({
      customer_id: userId,
      title,
      description,
      category,
      location: asText(body.location) || null,
      budget_min_ngn: Number.isFinite(budgetMin) ? budgetMin : null,
      budget_max_ngn: Number.isFinite(budgetMax) ? budgetMax : null,
      status: "open",
      due_at: asText(body.dueAt) || null,
    }).select("*").single();
    if (error) throw error;
    res.status(201).json({ job: data });
  } catch (error) {
    res.status(503).json({ error: error instanceof Error ? error.message : "Could not publish opportunity" });
  }
});

router.get("/jobs/:jobId", requireAuth, async (req, res) => {
  try {
    const userId = (req as AuthenticatedRequest).userId;
    const supabase = requireSupabase();
    const [{ data: job, error: jobError }, { data: profile, error: profileError }] = await Promise.all([
      supabase.from("jobs").select("*").eq("id", req.params.jobId).maybeSingle(),
      supabase.from("profiles").select("role").eq("id", userId).maybeSingle(),
    ]);
    if (jobError) throw jobError;
    if (profileError) throw profileError;
    if (!job || !profile) { res.status(404).json({ error: "Job not found" }); return; }
    const isAdmin = profile.role === "admin" && (await isPlatformAdmin(userId));
    const participant = job.customer_id === userId || job.selected_provider_id === userId;
    const providerCanViewOpenJob = job.status === "open";
    if (!isAdmin && !participant && !providerCanViewOpenJob) { res.status(404).json({ error: "Job not found" }); return; }
    res.json({ job });
  } catch (error) { res.status(503).json({ error: error instanceof Error ? error.message : "Could not load job" }); }
});

router.get("/jobs/:jobId/bids", requireAuth, async (req, res) => {
  try {
    const userId = (req as AuthenticatedRequest).userId;
    const supabase = requireSupabase();
    const { data: job, error: jobError } = await supabase.from("jobs").select("id,customer_id,status").eq("id", req.params.jobId).maybeSingle();
    if (jobError) throw jobError;
    if (!job) { res.status(404).json({ error: "Job not found" }); return; }
    const { data: profile, error: profileError } = await supabase.from("profiles").select("role").eq("id", userId).maybeSingle();
    if (profileError) throw profileError;
    if (!profile) { res.status(404).json({ error: "Complete your profile before viewing proposals" }); return; }
    let query = supabase.from("job_bids").select("id,job_id,provider_id,amount_ngn,message,status,created_at,profiles(id,display_name,role,city,avatar_url)").eq("job_id", req.params.jobId).order("created_at", { ascending: false });
    if (job.customer_id !== userId) {
      if (["customer", "admin"].includes(profile.role)) { res.json({ bids: [], canManage: false, jobStatus: job.status }); return; }
      query = query.eq("provider_id", userId);
    }
    const { data, error } = await query;
    if (error) throw error;
    res.json({ bids: data ?? [], canManage: job.customer_id === userId, jobStatus: job.status });
  } catch (error) { res.status(503).json({ error: error instanceof Error ? error.message : "Could not load job proposals" }); }
});

router.post("/jobs/:jobId/bids", requireAuth, async (req, res) => {
  try {
    const userId = (req as AuthenticatedRequest).userId;
    const body = req.body as Record<string, unknown>;
    const amountNgn = Number(body.amountNgn);
    const message = asText(body.message);
    if (!Number.isFinite(amountNgn) || amountNgn <= 0 || amountNgn > 100_000_000 || !message || message.length > 3000) {
      res.status(400).json({ error: "Enter a valid amount and a proposal of up to 3000 characters" }); return;
    }
    const supabase = requireSupabase();
    const [{ data: profile, error: profileError }, { data: job, error: jobError }] = await Promise.all([
      supabase.from("profiles").select("role,onboarding_complete").eq("id", userId).maybeSingle(),
      supabase.from("jobs").select("id,customer_id,status").eq("id", req.params.jobId).maybeSingle(),
    ]);
    if (profileError) throw profileError;
    if (jobError) throw jobError;
    if (!profile || !["artisan", "professional", "business"].includes(profile.role)) { res.status(403).json({ error: "Complete a provider profile before submitting a proposal" }); return; }
    if (!profile.onboarding_complete) { res.status(403).json({ error: "Complete your profile before submitting a proposal" }); return; }
    if (!job) { res.status(404).json({ error: "Job not found" }); return; }
    if (job.customer_id === userId) { res.status(400).json({ error: "You cannot submit a proposal to your own job" }); return; }
    if (job.status !== "open") { res.status(409).json({ error: "This job is no longer accepting proposals" }); return; }
    const { data, error } = await supabase.from("job_bids").upsert({
      job_id: req.params.jobId, provider_id: userId, amount_ngn: amountNgn, message, status: "pending", updated_at: new Date().toISOString(),
    }, { onConflict: "job_id,provider_id" }).select("id,job_id,provider_id,amount_ngn,message,status,created_at").single();
    if (error) throw error;
    try { await createNotification(job.customer_id, "New job proposal", `${message.slice(0, 120)}${message.length > 120 ? "…" : ""}`, { jobId: job.id }); } catch { /* Proposal creation must not fail if an inbox notification is unavailable. */ }
    res.status(201).json({ bid: data });
  } catch (error) { res.status(503).json({ error: error instanceof Error ? error.message : "Could not submit proposal" }); }
});

router.post("/jobs/:jobId/bids/:bidId/accept", requireAuth, async (req, res) => {
  try {
    const userId = (req as AuthenticatedRequest).userId;
    const supabase = requireSupabase();
    const { data: job, error: jobError } = await supabase.from("jobs").select("id,customer_id,status").eq("id", req.params.jobId).maybeSingle();
    if (jobError) throw jobError;
    if (!job) { res.status(404).json({ error: "Job not found" }); return; }
    if (job.customer_id !== userId) { res.status(403).json({ error: "Only the job owner can choose a proposal" }); return; }
    const { data: providerId, error } = await supabase.rpc("accept_job_bid", { p_job_id: req.params.jobId, p_bid_id: req.params.bidId });
    if (error) {
      if (error.message?.includes("not open")) { res.status(409).json({ error: "This job already has a selected provider or is closed" }); return; }
      if (error.message?.includes("pending proposal")) { res.status(409).json({ error: "That proposal is no longer available" }); return; }
      throw error;
    }
    if (typeof providerId === "string") {
      try { await createNotification(providerId, "Proposal accepted", "The customer accepted your proposal. Open the job conversation to agree on next steps.", { jobId: job.id }); } catch { /* The job award is already committed. */ }
    }
    res.json({ jobId: job.id, providerId, status: "matched" });
  } catch (error) { res.status(503).json({ error: error instanceof Error ? error.message : "Could not accept proposal" }); }
});

router.post("/jobs/:jobId/start", requireAuth, async (req, res) => {
  try {
    const userId = (req as AuthenticatedRequest).userId;
    const supabase = requireSupabase();
    const { data: funded, error: paymentError } = await supabase.from("escrow_transactions").select("id")
      .eq("job_id", req.params.jobId).eq("status", "funded").maybeSingle();
    if (paymentError) throw paymentError;
    if (!funded) { res.status(409).json({ error: "The customer must fund the job before work can start" }); return; }
    const { data, error } = await supabase.from("jobs").update({ status: "in_progress", updated_at: new Date().toISOString() })
      .eq("id", req.params.jobId).eq("selected_provider_id", userId).eq("status", "matched")
      .select("id,customer_id,title,status").maybeSingle();
    if (error) throw error;
    if (!data) { res.status(409).json({ error: "Only the selected provider can start a matched job" }); return; }
    try { await createNotification(data.customer_id, "Work started", `${data.title} is now in progress.`, { jobId: data.id }); } catch { /* Job transition is already saved. */ }
    res.json({ job: data });
  } catch (error) { res.status(503).json({ error: error instanceof Error ? error.message : "Could not start job" }); }
});

router.post("/jobs/:jobId/complete", requireAuth, async (req, res) => {
  try {
    const userId = (req as AuthenticatedRequest).userId;
    const supabase = requireSupabase();
    const { data, error } = await supabase.from("jobs").update({ status: "completed", updated_at: new Date().toISOString() })
      .eq("id", req.params.jobId).eq("selected_provider_id", userId).eq("status", "in_progress")
      .select("id,customer_id,title,status").maybeSingle();
    if (error) throw error;
    if (!data) { res.status(409).json({ error: "Only the selected provider can complete an in-progress job" }); return; }
    try { await createNotification(data.customer_id, "Work marked complete", `Review ${data.title} and approve payment when you are satisfied.`, { jobId: data.id }); } catch { /* Job transition is already saved. */ }
    res.json({ job: data });
  } catch (error) { res.status(503).json({ error: error instanceof Error ? error.message : "Could not complete job" }); }
});

export default router;
