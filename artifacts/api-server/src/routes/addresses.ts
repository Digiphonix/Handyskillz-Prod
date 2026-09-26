import { Router, type IRouter } from "express";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/requireAuth";
import { requireSupabase } from "../lib/supabase";

const router: IRouter = Router();

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function addressValues(body: Record<string, unknown>) {
  return {
    label: stringValue(body.label) || "Home",
    recipient_name: stringValue(body.recipientName),
    phone: stringValue(body.phone),
    address_line_1: stringValue(body.addressLine1),
    address_line_2: stringValue(body.addressLine2) || null,
    city: stringValue(body.city),
    state: stringValue(body.state),
    postal_code: stringValue(body.postalCode) || null,
    country: stringValue(body.country) || "Nigeria",
    is_default: body.isDefault === true,
  };
}

router.get("/addresses", requireAuth, async (req, res) => {
  try {
    const userId = (req as AuthenticatedRequest).userId;
    const { data, error } = await requireSupabase()
      .from("customer_addresses")
      .select("*")
      .eq("user_id", userId)
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: false });
    if (error) throw error;
    res.json({ addresses: data });
  } catch (error) {
    res.status(503).json({ error: error instanceof Error ? error.message : "Address service unavailable" });
  }
});

router.post("/addresses", requireAuth, async (req, res) => {
  try {
    const userId = (req as AuthenticatedRequest).userId;
    const values = addressValues(req.body as Record<string, unknown>);
    if (!values.recipient_name || !values.phone || !values.address_line_1 || !values.city || !values.state) {
      res.status(400).json({ error: "Name, phone, street address, city and state are required" });
      return;
    }

    const supabase = requireSupabase();
    const { count, error: countError } = await supabase
      .from("customer_addresses").select("id", { count: "exact", head: true }).eq("user_id", userId);
    if (countError) throw countError;
    values.is_default = values.is_default || count === 0;
    if (values.is_default) {
      const { error } = await supabase.from("customer_addresses").update({ is_default: false }).eq("user_id", userId);
      if (error) throw error;
    }
    const { data, error } = await supabase
      .from("customer_addresses")
      .insert({ ...values, user_id: userId })
      .select("*")
      .single();
    if (error) throw error;
    res.status(201).json({ address: data });
  } catch (error) {
    res.status(503).json({ error: error instanceof Error ? error.message : "Could not save address" });
  }
});

router.put("/addresses/:id", requireAuth, async (req, res) => {
  try {
    const userId = (req as AuthenticatedRequest).userId;
    const values = addressValues(req.body as Record<string, unknown>);
    if (!values.recipient_name || !values.phone || !values.address_line_1 || !values.city || !values.state) {
      res.status(400).json({ error: "Name, phone, street address, city and state are required" });
      return;
    }
    const supabase = requireSupabase();
    if (values.is_default) {
      const { error } = await supabase.from("customer_addresses").update({ is_default: false }).eq("user_id", userId);
      if (error) throw error;
    }
    const { data, error } = await supabase
      .from("customer_addresses")
      .update({ ...values, updated_at: new Date().toISOString() })
      .eq("id", req.params.id)
      .eq("user_id", userId)
      .select("*")
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      res.status(404).json({ error: "Address not found" });
      return;
    }
    res.json({ address: data });
  } catch (error) {
    res.status(503).json({ error: error instanceof Error ? error.message : "Could not update address" });
  }
});

router.delete("/addresses/:id", requireAuth, async (req, res) => {
  try {
    const userId = (req as AuthenticatedRequest).userId;
    const supabase = requireSupabase();
    const { data: removed, error } = await supabase
      .from("customer_addresses")
      .delete()
      .eq("id", req.params.id)
      .eq("user_id", userId)
      .select("is_default")
      .maybeSingle();
    if (error) throw error;
    if (!removed) {
      res.status(404).json({ error: "Address not found" });
      return;
    }
    if (removed.is_default) {
      const { data: next, error: nextError } = await supabase
        .from("customer_addresses").select("id").eq("user_id", userId)
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (nextError) throw nextError;
      if (next) {
        const { error: promoteError } = await supabase.from("customer_addresses").update({ is_default: true }).eq("id", next.id).eq("user_id", userId);
        if (promoteError) throw promoteError;
      }
    }
    res.json({ success: true });
  } catch (error) {
    res.status(503).json({ error: error instanceof Error ? error.message : "Could not delete address" });
  }
});

export default router;
