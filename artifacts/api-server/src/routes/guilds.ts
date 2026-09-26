import { Router, type IRouter } from "express";
import { requireAdmin } from "../lib/admin";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/requireAuth";
import { requireSupabase } from "../lib/supabase";

const router: IRouter = Router();

router.get("/guilds", requireAuth, async (req, res) => {
  try {
    const userId = (req as AuthenticatedRequest).userId;
    const supabase = requireSupabase();
    const [{ data: guilds, error: guildError }, { data: memberships, error: memberError }] = await Promise.all([
      supabase.from("guilds").select("id,name,description,category,city,created_at").order("name").limit(200),
      supabase.from("guild_members").select("guild_id,membership_role").eq("profile_id", userId),
    ]);
    if (guildError) throw guildError;
    if (memberError) throw memberError;
    const ownMemberships = new Map((memberships ?? []).map((item) => [item.guild_id, item.membership_role]));
    res.json({ guilds: (guilds ?? []).map((guild) => ({ ...guild, joined: ownMemberships.has(guild.id), membershipRole: ownMemberships.get(guild.id) ?? null })) });
  } catch (error) { res.status(503).json({ error: error instanceof Error ? error.message : "Could not load guilds" }); }
});

router.post("/guilds", requireAuth, requireAdmin, async (req, res) => {
  try {
    const body = req.body as Record<string, unknown>;
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const description = typeof body.description === "string" ? body.description.trim() : "";
    const category = typeof body.category === "string" ? body.category.trim() : "";
    const city = typeof body.city === "string" ? body.city.trim() : "";
    if (!name || name.length > 100 || description.length > 1000 || category.length > 80 || city.length > 80) {
      res.status(400).json({ error: "Enter a guild name and keep each field within its character limit" }); return;
    }
    const userId = (req as AuthenticatedRequest).userId;
    const { data, error } = await requireSupabase().from("guilds").insert({ name, description: description || null, category: category || null, city: city || null, created_by: userId })
      .select("id,name,description,category,city,created_at").single();
    if (error) throw error;
    res.status(201).json({ guild: data });
  } catch (error) { res.status(503).json({ error: error instanceof Error ? error.message : "Could not create guild" }); }
});

router.post("/guilds/:id/join", requireAuth, async (req, res) => {
  try {
    const userId = (req as AuthenticatedRequest).userId;
    const supabase = requireSupabase();
    const [{ data: profile, error: profileError }, { data: guild, error: guildError }] = await Promise.all([
      supabase.from("profiles").select("role,onboarding_complete").eq("id", userId).maybeSingle(),
      supabase.from("guilds").select("id").eq("id", req.params.id).maybeSingle(),
    ]);
    if (profileError) throw profileError;
    if (guildError) throw guildError;
    if (!guild) { res.status(404).json({ error: "Guild not found" }); return; }
    if (!profile || !profile.onboarding_complete || !["artisan", "professional"].includes(profile.role)) {
      res.status(403).json({ error: "Complete an artisan or professional profile to join guilds" }); return;
    }
    const { error } = await supabase.from("guild_members").upsert({ guild_id: guild.id, profile_id: userId, membership_role: "member" }, { onConflict: "guild_id,profile_id" });
    if (error) throw error;
    res.status(201).json({ joined: true, guildId: guild.id });
  } catch (error) { res.status(503).json({ error: error instanceof Error ? error.message : "Could not join guild" }); }
});

router.delete("/guilds/:id/membership", requireAuth, async (req, res) => {
  try {
    const userId = (req as AuthenticatedRequest).userId;
    const { error } = await requireSupabase().from("guild_members").delete().eq("guild_id", req.params.id).eq("profile_id", userId);
    if (error) throw error;
    res.json({ joined: false, guildId: req.params.id });
  } catch (error) { res.status(503).json({ error: error instanceof Error ? error.message : "Could not leave guild" }); }
});

export default router;
