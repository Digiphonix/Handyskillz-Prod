import { isPlatformAdmin } from "../lib/admin";
import { Router, type IRouter } from "express";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/requireAuth";
import { requireSupabase } from "../lib/supabase";

const router: IRouter = Router();
const allowedRoles = new Set(["customer", "artisan", "professional", "business", "admin"]);

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.trim() : fallback;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string").slice(0, 30)
    : [];
}

router.get("/profile/me", requireAuth, async (req, res) => {
  try {
    const supabase = requireSupabase();
    const userId = (req as AuthenticatedRequest).userId;
    const { data, error } = await supabase
      .from("profiles")
      .select("*, portfolio_items(*)")
      .eq("id", userId)
      .maybeSingle();
    if (error) throw error;
    const canAccessAdmin = await isPlatformAdmin(userId);
    res.json({ profile: data?.role === "admin" && !canAccessAdmin ? { ...data, role: "customer" } : data, canAccessAdmin });
  } catch (error) {
    res.status(503).json({ error: error instanceof Error ? error.message : "Profile service unavailable" });
  }
});

router.put("/profile/me", requireAuth, async (req, res) => {
  try {
    const supabase = requireSupabase();
    const body = req.body as Record<string, unknown>;
    const userId = (req as AuthenticatedRequest).userId;
    const role = asString(body.role, "customer");
    if (!allowedRoles.has(role)) {
      res.status(400).json({ error: "Unsupported role" });
      return;
    }

    // Admin is a server-authorized role; it cannot be self-assigned from the mobile client.
    if (role === "admin") {
      if (!(await isPlatformAdmin(userId))) {
        res.status(403).json({ error: "Admin access is not granted to this account" });
        return;
      }
    }

    const profile = {
      id: userId,
      role,
      display_name: asString(body.displayName),
      phone: asString(body.phone) || null,
      city: asString(body.city, "Lagos"),
      bio: asString(body.bio) || null,
      skills: asStringArray(body.skills),
      years_experience: Math.max(0, Number(body.yearsExperience) || 0),
      hourly_rate_ngn: Math.max(0, Number(body.hourlyRateNgn) || 0),
      availability: asString(body.availability, "available"),
      avatar_url: asString(body.avatarUrl) || null,
      onboarding_complete: true,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from("profiles")
      .upsert(profile, { onConflict: "id" })
      .select()
      .single();
    if (error) throw error;

    await supabase.from("portfolio_items").delete().eq("profile_id", userId);
    const portfolio = Array.isArray(body.portfolio)
      ? body.portfolio
          .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
          .map((item) => ({
            profile_id: userId,
            title: asString(item.title, "Untitled project"),
            description: asString(item.description) || null,
            image_url: asString(item.imageUrl) || null,
            project_url: asString(item.projectUrl) || null,
            sort_order: Number(item.sortOrder) || 0,
          }))
          .slice(0, 12)
      : [];
    if (portfolio.length > 0) {
      const { error: portfolioError } = await supabase.from("portfolio_items").insert(portfolio);
      if (portfolioError) throw portfolioError;
    }

    res.json({ profile: data, portfolio });
  } catch (error) {
    res.status(503).json({ error: error instanceof Error ? error.message : "Profile service unavailable" });
  }
});

router.patch("/profile/me", requireAuth, async (req, res) => {
  try {
    const supabase = requireSupabase();
    const userId = (req as AuthenticatedRequest).userId;
    const body = req.body as Record<string, unknown>;
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    const fields: Record<string, string> = {
      displayName: "display_name",
      phone: "phone",
      city: "city",
      bio: "bio",
      avatarUrl: "avatar_url",
    };
    for (const [input, column] of Object.entries(fields)) {
      if (typeof body[input] === "string") {
        const value = (body[input] as string).trim();
        updates[column] = value || (input === "phone" || input === "bio" ? null : "");
      }
    }
    if (typeof body.availability === "string") {
      const availability = body.availability.trim();
      if (!["available", "busy", "unavailable"].includes(availability)) {
        res.status(400).json({ error: "Availability must be available, busy or unavailable" });
        return;
      }
      updates.availability = availability;
    }
    if (!("avatar_url" in updates) && !("display_name" in updates) && !("phone" in updates) && !("city" in updates) && !("bio" in updates) && !("availability" in updates)) {
      res.status(400).json({ error: "No profile fields were supplied" });
      return;
    }
    const { data, error } = await supabase.from("profiles").update(updates).eq("id", userId).select().single();
    if (error) throw error;
    res.json({ profile: data });
  } catch (error) {
    res.status(503).json({ error: error instanceof Error ? error.message : "Profile service unavailable" });
  }
});

router.patch("/profile/me/role", requireAuth, async (req, res) => {
  try {
    const userId = (req as AuthenticatedRequest).userId;
    const role = asString((req.body as Record<string, unknown>).role);
    if (!allowedRoles.has(role)) { res.status(400).json({ error: "Unsupported account role" }); return; }
    if (role === "admin") {
      if (!(await isPlatformAdmin(userId))) { res.status(403).json({ error: "Admin access is not granted to this account" }); return; }
    }
    const supabase = requireSupabase();
    const { data, error } = await supabase.from("profiles").update({ role, updated_at: new Date().toISOString() })
      .eq("id", userId).select("id,role,onboarding_complete").maybeSingle();
    if (error) throw error;
    if (!data) { res.status(404).json({ error: "Complete your profile before switching roles" }); return; }
    await supabase.from("audit_logs").insert({ actor_id: userId, action: "profile.role_changed", entity_type: "profile", entity_id: userId, metadata: { role } });
    res.json({ profile: data });
  } catch (error) { res.status(503).json({ error: error instanceof Error ? error.message : "Could not change account role" }); }
});

export default router;
