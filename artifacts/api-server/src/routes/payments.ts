import { isPlatformAdmin } from "../lib/admin";
import { Router, type IRouter } from "express";
import crypto from "node:crypto";
import { getAuth } from "@clerk/express";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/requireAuth";
import { requireSupabase } from "../lib/supabase";
import { createNotification } from "../lib/notifications";

const router: IRouter = Router();
type PaystackPayload = {
  status?: boolean;
  message?: string;
  data?: {
    authorization_url?: string;
    access_code?: string;
  };
};
type PaystackRecipientPayload = {
  status?: boolean;
  message?: string;
  data?: { recipient_code?: string; details?: { account_name?: string | null; account_number?: string; bank_name?: string } };
};

router.get("/payments/paystack/banks", requireAuth, async (_req, res) => {
  try {
    const secret = process.env.PAYSTACK_SECRET_KEY;
    if (!secret || /replace_me|your_/i.test(secret)) { res.status(503).json({ error: "Paystack secret key is not configured" }); return; }
    const response = await fetch("https://api.paystack.co/bank?country=nigeria&perPage=100", { headers: { Authorization: `Bearer ${secret}` } });
    const payload = await response.json() as any;
    if (!response.ok || !payload.status) { res.status(502).json({ error: payload.message || "Could not load banks" }); return; }
    res.json({ banks: payload.data });
  } catch (error) { res.status(502).json({ error: error instanceof Error ? error.message : "Could not load banks" }); }
});

router.get("/payouts/me", requireAuth, async (req, res) => {
  try {
    const userId = (req as AuthenticatedRequest).userId;
    const { data, error } = await requireSupabase().from("payout_accounts")
      .select("bank_name,account_name,account_last4,created_at").eq("user_id", userId).maybeSingle();
    if (error) throw error;
    res.json({ payoutAccount: data });
  } catch (error) { res.status(503).json({ error: error instanceof Error ? error.message : "Could not load payout account" }); }
});

router.get("/payments/me", requireAuth, async (req, res) => {
  try {
    const userId = (req as AuthenticatedRequest).userId;
    const { data, error } = await requireSupabase().from("escrow_transactions")
      .select("id,job_id,amount_ngn,amount_released_ngn,status,funded_at,released_at,created_at,jobs(title)")
      .or(`payer_id.eq.${userId},payee_id.eq.${userId}`).order("created_at", { ascending: false }).limit(100);
    if (error) throw error;
    res.json({ payments: data ?? [] });
  } catch (error) { res.status(503).json({ error: error instanceof Error ? error.message : "Could not load payment history" }); }
});

router.put("/payouts/me", requireAuth, async (req, res) => {
  try {
    const secret = process.env.PAYSTACK_SECRET_KEY;
    if (!secret || /replace_me|your_/i.test(secret)) { res.status(503).json({ error: "Paystack secret key is not configured on the API server" }); return; }
    const body = req.body as Record<string, unknown>;
    const accountNumber = typeof body.accountNumber === "string" ? body.accountNumber.replace(/\D/g, "") : "";
    const bankCode = typeof body.bankCode === "string" ? body.bankCode.trim() : "";
    const accountName = typeof body.accountName === "string" ? body.accountName.trim() : "";
    if (!/^\d{10}$/.test(accountNumber) || !bankCode || !accountName) {
      res.status(400).json({ error: "Enter the account holder name, 10-digit account number and bank" });
      return;
    }
    const paystackResponse = await fetch("https://api.paystack.co/transferrecipient", {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
      body: JSON.stringify({ type: "nuban", name: accountName, account_number: accountNumber, bank_code: bankCode, currency: "NGN" }),
    });
    const recipient = await paystackResponse.json() as PaystackRecipientPayload;
    if (!paystackResponse.ok || !recipient.status || !recipient.data?.recipient_code) {
      res.status(502).json({ error: recipient.message || "Paystack could not verify this bank account" });
      return;
    }
    const details = recipient.data.details;
    const userId = (req as AuthenticatedRequest).userId;
    const { data, error } = await requireSupabase().from("payout_accounts").upsert({
      user_id: userId,
      paystack_recipient_code: recipient.data.recipient_code,
      bank_name: details?.bank_name || "Bank account",
      account_name: details?.account_name || accountName,
      account_last4: accountNumber.slice(-4),
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" }).select("bank_name,account_name,account_last4,created_at").single();
    if (error) throw error;
    res.json({ payoutAccount: data });
  } catch (error) { res.status(503).json({ error: error instanceof Error ? error.message : "Could not save payout account" }); }
});

router.get("/jobs/:jobId/payment", requireAuth, async (req, res) => {
  try {
    const userId = (req as AuthenticatedRequest).userId;
    const supabase = requireSupabase();
    const { data: job, error: jobError } = await supabase.from("jobs").select("id,customer_id,selected_provider_id").eq("id", req.params.jobId).maybeSingle();
    if (jobError) throw jobError;
    if (!job) { res.status(404).json({ error: "Job not found" }); return; }
    if (job.customer_id !== userId && job.selected_provider_id !== userId) { res.status(403).json({ error: "Only job participants can view payment status" }); return; }
    const { data, error } = await supabase.from("escrow_transactions")
      .select("id,amount_ngn,amount_released_ngn,status,release_status,funded_at,released_at")
      .eq("job_id", job.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (error) throw error;
    res.json({ payment: data });
  } catch (error) { res.status(503).json({ error: error instanceof Error ? error.message : "Could not load job payment" }); }
});

router.post("/jobs/:jobId/fund", requireAuth, async (req, res) => {
  try {
    const secret = process.env.PAYSTACK_SECRET_KEY;
    if (!secret || /replace_me|your_/i.test(secret)) { res.status(503).json({ error: "Paystack secret key is not configured on the API server" }); return; }
    const userId = (req as AuthenticatedRequest).userId;
    const email = typeof req.body?.email === "string" ? req.body.email.trim() : "";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { res.status(400).json({ error: "A valid account email is required to start Paystack checkout" }); return; }
    const supabase = requireSupabase();
    const { data: job, error: jobError } = await supabase.from("jobs").select("id,customer_id,selected_provider_id,status").eq("id", req.params.jobId).maybeSingle();
    if (jobError) throw jobError;
    if (!job) { res.status(404).json({ error: "Job not found" }); return; }
    if (job.customer_id !== userId) { res.status(403).json({ error: "Only the customer who posted the job can fund it" }); return; }
    if (job.status !== "matched" || !job.selected_provider_id) { res.status(409).json({ error: "Choose a provider proposal before funding this job" }); return; }
    const { data: bid, error: bidError } = await supabase.from("job_bids").select("amount_ngn")
      .eq("job_id", job.id).eq("provider_id", job.selected_provider_id).eq("status", "accepted").maybeSingle();
    if (bidError) throw bidError;
    const amountNgn = Number(bid?.amount_ngn);
    if (!Number.isFinite(amountNgn) || amountNgn < 100) { res.status(400).json({ error: "The accepted proposal must be at least ₦100 to use Paystack checkout" }); return; }

    const { data: prior, error: priorError } = await supabase.from("escrow_transactions")
      .select("id,status,paystack_authorization_url").eq("job_id", job.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (priorError) throw priorError;
    if (prior?.status === "pending" && prior.paystack_authorization_url) { res.json({ authorizationUrl: prior.paystack_authorization_url, reference: null, reused: true }); return; }
    if (prior && ["pending", "funded", "partially_released", "released"].includes(prior.status)) {
      res.status(409).json({ error: prior.status === "pending" ? "A checkout is already being created. Refresh payment status shortly." : "This job payment has already been funded" }); return;
    }

    const reference = `hs_${Date.now()}_${crypto.randomBytes(8).toString("hex")}`;
    const { data: escrow, error: escrowError } = await supabase.from("escrow_transactions").insert({
      job_id: job.id, payer_id: userId, payee_id: job.selected_provider_id, amount_ngn: amountNgn,
      status: "pending", paystack_reference: reference,
    }).select("id").single();
    if (escrowError) {
      if (escrowError.code === "23505") { res.status(409).json({ error: "A payment checkout has already been started for this job" }); return; }
      throw escrowError;
    }

    const callbackUrl = process.env.PAYSTACK_CALLBACK_URL || undefined;
    let response: Response;
    let payload: PaystackPayload;
    try {
      response = await fetch("https://api.paystack.co/transaction/initialize", {
        method: "POST", headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
        body: JSON.stringify({ email, amount: Math.round(amountNgn * 100), reference, callback_url: callbackUrl,
          metadata: { clerk_user_id: userId, job_id: job.id, escrow_id: escrow.id, purpose: "job_funding" } }),
      });
      payload = await response.json() as PaystackPayload;
    } catch (error) {
      await supabase.from("escrow_transactions").delete().eq("id", escrow.id).eq("status", "pending");
      throw error;
    }
    const authorizationUrl = payload.data?.authorization_url;
    if (!response.ok || !payload.status || !authorizationUrl) {
      await supabase.from("escrow_transactions").delete().eq("id", escrow.id).eq("status", "pending");
      res.status(502).json({ error: payload.message || "Paystack could not start checkout" }); return;
    }
    await supabase.from("escrow_transactions").update({ paystack_authorization_url: authorizationUrl, paystack_access_code: payload.data?.access_code ?? null }).eq("id", escrow.id);
    res.status(201).json({ authorizationUrl, reference });
  } catch (error) { res.status(503).json({ error: error instanceof Error ? error.message : "Could not start job payment" }); }
});

router.post("/jobs/:jobId/release-payment", requireAuth, async (req, res) => {
  try {
    const secret = process.env.PAYSTACK_SECRET_KEY;
    if (!secret || /replace_me|your_/i.test(secret)) { res.status(503).json({ error: "Paystack secret key is not configured on the API server" }); return; }
    const userId = (req as AuthenticatedRequest).userId;
    const supabase = requireSupabase();
    const { data: job, error: jobError } = await supabase.from("jobs").select("id,customer_id,status").eq("id", req.params.jobId).maybeSingle();
    if (jobError) throw jobError;
    if (!job) { res.status(404).json({ error: "Job not found" }); return; }
    if (job.customer_id !== userId) { res.status(403).json({ error: "Only the customer who posted the job can approve payment" }); return; }
    if (job.status !== "completed") { res.status(409).json({ error: "The provider must mark this job complete before payment can be approved" }); return; }
    const reference = `hsrel_${Date.now()}_${crypto.randomBytes(6).toString("hex")}`;
    const { data: release, error: releaseError } = await supabase.rpc("begin_escrow_release", { p_job_id: job.id, p_reference: reference });
    if (releaseError) {
      if (releaseError.message?.includes("not ready")) { res.status(409).json({ error: "A funded payment and provider payout account are required before release" }); return; }
      throw releaseError;
    }
    const amountKobo = Math.round(Number(release.amount_ngn) * 100);
    const response = await fetch("https://api.paystack.co/transfer", {
      method: "POST", headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
      body: JSON.stringify({ source: "balance", amount: amountKobo, recipient: release.recipient_code, reference, currency: "NGN", reason: `Handyskillz job ${job.id}` }),
    });
    const payload = await response.json() as any;
    if (response.ok && payload.status && payload.data?.status === "otp") {
      await supabase.from("escrow_transactions").update({ release_status: "awaiting_otp", paystack_transfer_code: payload.data.transfer_code ?? null }).eq("id", release.escrow_id).eq("release_status", "processing");
      res.json({ releaseStatus: "awaiting_otp", message: "Paystack requires a platform administrator to verify this transfer." }); return;
    }
    if (!response.ok || !payload.status) {
      await supabase.from("escrow_transactions").update({ release_status: "ready", paystack_transfer_reference: null }).eq("id", release.escrow_id).eq("release_status", "processing");
      res.status(502).json({ error: payload.message || "Paystack could not start the provider transfer" }); return;
    }
    res.json({ releaseStatus: "processing", reference, message: "Transfer submitted. The payment status will update when Paystack confirms it." });
  } catch (error) { res.status(503).json({ error: error instanceof Error ? error.message : "Could not release payment" }); }
});

router.get("/admin/payments/pending", requireAuth, async (req, res) => {
  try {
    const userId = getAuth(req).userId;
    if (!userId || !(await isPlatformAdmin(userId))) { res.status(403).json({ error: "Admin access is required" }); return; }
    const { data, error } = await requireSupabase().from("escrow_transactions")
      .select("id,job_id,amount_ngn,created_at,jobs(title)").eq("release_status", "awaiting_otp").order("created_at", { ascending: true }).limit(100);
    if (error) throw error;
    res.json({ transfers: data ?? [] });
  } catch (error) { res.status(503).json({ error: error instanceof Error ? error.message : "Could not load pending transfers" }); }
});

router.post("/admin/jobs/:jobId/finalize-payment", requireAuth, async (req, res) => {
  try {
    const userId = getAuth(req).userId;
    if (!userId || !(await isPlatformAdmin(userId))) { res.status(403).json({ error: "Admin access is required" }); return; }
    const otp = typeof req.body?.otp === "string" ? req.body.otp.trim() : "";
    if (!/^\d{4,8}$/.test(otp)) { res.status(400).json({ error: "Enter the transfer verification code" }); return; }
    const supabase = requireSupabase();
    const { data: escrow, error } = await supabase.from("escrow_transactions")
      .select("id,paystack_transfer_code").eq("job_id", req.params.jobId).eq("release_status", "awaiting_otp").maybeSingle();
    if (error) throw error;
    if (!escrow?.paystack_transfer_code) { res.status(409).json({ error: "No transfer is waiting for OTP verification" }); return; }
    const secret = process.env.PAYSTACK_SECRET_KEY;
    if (!secret || /replace_me|your_/i.test(secret)) { res.status(503).json({ error: "Paystack is not configured" }); return; }
    const response = await fetch("https://api.paystack.co/transfer/finalize_transfer", {
      method: "POST", headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
      body: JSON.stringify({ transfer_code: escrow.paystack_transfer_code, otp }),
    });
    const payload = await response.json() as any;
    if (!response.ok || !payload.status) { res.status(502).json({ error: payload.message || "Paystack could not finalize the transfer" }); return; }
    await supabase.from("escrow_transactions").update({ release_status: "processing", paystack_transfer_code: null, updated_at: new Date().toISOString() }).eq("id", escrow.id).eq("release_status", "awaiting_otp");
    res.json({ releaseStatus: "processing", message: "Paystack accepted the OTP. Awaiting transfer confirmation." });
  } catch (error) { res.status(503).json({ error: error instanceof Error ? error.message : "Could not finalize Paystack transfer" }); }
});

router.get("/payments/paystack/verify/:reference", requireAuth, async (req, res) => {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret || /replace_me|your_/i.test(secret)) {
    res.status(503).json({ error: "Paystack is not configured" });
    return;
  }
  const reference = String(req.params.reference);
  const userId = (req as AuthenticatedRequest).userId;
  const { data: escrow, error } = await requireSupabase().from("escrow_transactions")
    .select("id,payer_id,payee_id,amount_ngn,status").eq("paystack_reference", reference).maybeSingle();
  if (error) { res.status(503).json({ error: "Could not find payment record" }); return; }
  if (!escrow || (escrow.payer_id !== userId && escrow.payee_id !== userId)) { res.status(404).json({ error: "Payment not found" }); return; }
  const response = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: { Authorization: `Bearer ${secret}` },
  });
  const payload = await response.json() as any;
  res.status(response.ok ? 200 : 502).json({
    reference, status: payload.data?.status || escrow.status,
    amountNgn: escrow.amount_ngn, currency: payload.data?.currency || "NGN",
  });
});

router.post("/payments/paystack/webhook", async (req, res) => {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  const signature = req.header("x-paystack-signature");
  const raw = (req as typeof req & { rawBody?: Buffer }).rawBody;
  const expected = secret && raw ? crypto.createHmac("sha512", secret).update(raw).digest("hex") : "";
  const signatureBuffer = signature ? Buffer.from(signature) : null;
  const expectedBuffer = Buffer.from(expected);
  if (
    !secret ||
    !signatureBuffer ||
    signatureBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)
  ) {
    res.status(401).json({ error: "Invalid webhook signature" });
    return;
  }
  try {
    const event = req.body as { event?: string; data?: { reference?: string; status?: string; amount?: number; currency?: string } };
    const reference = event.data?.reference;
    const supabase = requireSupabase();
    if (event.event === "charge.success" && reference) {
      const { data: escrow, error } = await supabase.from("escrow_transactions")
        .select("id,job_id,payer_id,payee_id,amount_ngn,status").eq("paystack_reference", reference).maybeSingle();
      if (error) throw error;
      if (escrow && escrow.status === "pending") {
        const verifiedResponse = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, { headers: { Authorization: `Bearer ${secret}` } });
        const verified = await verifiedResponse.json() as any;
        const expectedKobo = Math.round(Number(escrow.amount_ngn) * 100);
        if (!verifiedResponse.ok || !verified.status || verified.data?.status !== "success" || verified.data?.currency !== "NGN" || Number(verified.data?.amount) !== expectedKobo) {
          res.status(502).json({ error: "Paystack payment verification did not match the job amount" }); return;
        }
        const { error: updateError } = await supabase.from("escrow_transactions").update({ status: "funded", release_status: "ready", funded_at: new Date().toISOString(), updated_at: new Date().toISOString() })
          .eq("id", escrow.id).eq("status", "pending");
        if (updateError) throw updateError;
        const { data: job } = await supabase.from("jobs").select("title").eq("id", escrow.job_id).maybeSingle();
        for (const recipient of [escrow.payer_id, escrow.payee_id]) {
          try { await createNotification(recipient, "Job payment funded", `${job?.title || "Your job"} has been funded through Paystack.`, { jobId: escrow.job_id }); } catch { /* Payment state remains authoritative if notification delivery fails. */ }
        }
      }
    } else if (["transfer.success", "transfer.failed", "transfer.reversed"].includes(event.event || "") && reference) {
      const success = event.event === "transfer.success";
      const { data: transfer, error: lookupError } = await supabase.from("escrow_transactions").select("id,amount_ngn")
        .eq("paystack_transfer_reference", reference).eq("release_status", "processing").maybeSingle();
      if (lookupError) throw lookupError;
      if (transfer && success && Number(event.data?.amount) !== Math.round(Number(transfer.amount_ngn) * 100)) {
        res.status(502).json({ error: "Paystack transfer amount does not match the job payment" }); return;
      }
      if (transfer) {
        const { error } = await supabase.from("escrow_transactions").update(success
          ? { status: "released", release_status: "released", amount_released_ngn: transfer.amount_ngn, released_at: new Date().toISOString(), updated_at: new Date().toISOString() }
          : { status: "funded", release_status: "ready", paystack_transfer_reference: null, paystack_transfer_code: null, updated_at: new Date().toISOString() })
          .eq("id", transfer.id).eq("release_status", "processing");
        if (error) throw error;
        if (success) {
          const { data: escrowDetails } = await supabase.from("escrow_transactions").select("job_id,payer_id,payee_id,amount_ngn").eq("id", transfer.id).single();
          if (escrowDetails) {
            for (const recipient of [escrowDetails.payer_id, escrowDetails.payee_id]) {
              try { await createNotification(recipient, "Job payment released", `₦${Number(escrowDetails.amount_ngn).toLocaleString()} has been transferred for the completed job.`, { jobId: escrowDetails.job_id }); } catch { /* Payment state remains authoritative. */ }
            }
          }
        }
      }
    }
    res.json({ received: true });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Could not process Paystack webhook" });
  }
});

export default router;
