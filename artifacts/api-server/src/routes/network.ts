import { Router, type IRouter } from "express";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/requireAuth";
import { requireSupabase } from "../lib/supabase";

const router: IRouter = Router();
const providerRoles = new Set(["artisan", "professional", "business"]);
const providerFields = "id,role,display_name,city,bio,skills,avatar_url,completed_jobs,hourly_rate_ngn";

router.get("/network/providers", requireAuth, async (req, res) => {
  try {
    const role = typeof req.query.role === "string" ? req.query.role : "";
    const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
    const supabase = requireSupabase();
    let query = supabase.from("profiles").select(providerFields).eq("onboarding_complete", true).in("role", providerRoles.has(role) ? [role] : [...providerRoles]).neq("id", (req as AuthenticatedRequest).userId).order("completed_jobs", { ascending: false }).limit(50);
    if (search) query = query.ilike("display_name", `%${search}%`);
    const { data, error } = await query;
    if (error) throw error;
    res.json({ providers: data });
  } catch (error) {
    res.status(503).json({ error: error instanceof Error ? error.message : "Provider search unavailable" });
  }
});

router.get("/network/providers/:profileId", requireAuth, async (req, res) => {
  try {
    const supabase = requireSupabase();
    const { data, error } = await supabase.from("profiles")
      .select("id,role,display_name,city,bio,skills,avatar_url,completed_jobs,hourly_rate_ngn,years_experience,onboarding_complete,portfolio_items(id,title,description,image_url,project_url,sort_order)")
      .eq("id", String(req.params.profileId)).maybeSingle();
    if (error) throw error;
    if (!data) { res.status(404).json({ error: "Provider profile not found" }); return; }
    // A provider may change their current account role after publishing a service.
    // Keep the public service profile available while they still have an open offer.
    if (!providerRoles.has(data.role) || !data.onboarding_complete) {
      const { data: serviceOffer, error: serviceError } = await supabase.from("jobs")
        .select("id").eq("customer_id", data.id).eq("listing_type", "service_offer").eq("status", "open").limit(1).maybeSingle();
      if (serviceError) throw serviceError;
      if (!serviceOffer) { res.status(404).json({ error: "Provider profile not found" }); return; }
    }
    res.json({ profile: data });
  } catch (error) {
    res.status(503).json({ error: error instanceof Error ? error.message : "Provider profile unavailable" });
  }
});

router.get("/network/saved", requireAuth, async (req, res) => {
  try {
    const userId = (req as AuthenticatedRequest).userId;
    const supabase = requireSupabase();
    const { data: saved, error } = await supabase.from("saved_profiles").select("profile_id,created_at").eq("saved_by", userId).order("created_at", { ascending: false });
    if (error) throw error;
    const ids = (saved ?? []).map((row) => row.profile_id);
    if (!ids.length) { res.json({ providers: [] }); return; }
    const { data: providers, error: profilesError } = await supabase.from("profiles").select(providerFields).in("id", ids);
    if (profilesError) throw profilesError;
    const byId = new Map((providers ?? []).map((profile) => [profile.id, profile]));
    res.json({ providers: ids.map((id) => byId.get(id)).filter(Boolean) });
  } catch (error) {
    res.status(503).json({ error: error instanceof Error ? error.message : "Saved providers unavailable" });
  }
});

router.post("/network/saved/:profileId", requireAuth, async (req, res) => {
  try {
    const userId = (req as AuthenticatedRequest).userId;
    const profileId = String(req.params.profileId);
    if (profileId === userId) { res.status(400).json({ error: "You cannot save your own profile" }); return; }
    const supabase = requireSupabase();
    const { data: profile, error: profileError } = await supabase.from("profiles").select("id,role").eq("id", profileId).maybeSingle();
    if (profileError) throw profileError;
    if (!profile || !providerRoles.has(profile.role)) { res.status(404).json({ error: "Provider profile not found" }); return; }
    const { error } = await supabase.from("saved_profiles").upsert({ profile_id: profileId, saved_by: userId }, { onConflict: "profile_id,saved_by" });
    if (error) throw error;
    res.status(201).json({ saved: true });
  } catch (error) {
    res.status(503).json({ error: error instanceof Error ? error.message : "Could not save provider" });
  }
});

router.delete("/network/saved/:profileId", requireAuth, async (req, res) => {
  try {
    const userId = (req as AuthenticatedRequest).userId;
    const supabase = requireSupabase();
    const { error } = await supabase.from("saved_profiles").delete().eq("profile_id", String(req.params.profileId)).eq("saved_by", userId);
    if (error) throw error;
    res.json({ saved: false });
  } catch (error) {
    res.status(503).json({ error: error instanceof Error ? error.message : "Could not remove saved provider" });
  }
});

export default router;
