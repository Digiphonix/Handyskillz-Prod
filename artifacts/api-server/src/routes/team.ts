import { Router, type IRouter } from "express";
import { clerkClient, getAuth } from "@clerk/express";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/requireAuth";
import { requireSupabase } from "../lib/supabase";

const router: IRouter = Router();
const ORG_KEY = "handyskillzOrganizationId";
const adminRole = "org:admin";

async function getOrganization(userId: string) {
  const user = await clerkClient.users.getUser(userId);
  const privateMetadata = user.privateMetadata as Record<string, unknown>;
  const id = typeof privateMetadata[ORG_KEY] === "string" ? privateMetadata[ORG_KEY] as string : null;
  return { user, id };
}

async function ensureOwner(userId: string, organizationId: string) {
  const membership = await clerkClient.organizations.getOrganizationMembershipList({ organizationId, userId: [userId], limit: 1 });
  return membership.data.some((item) => item.role === adminRole);
}

router.get("/business/team", requireAuth, async (req, res) => {
  try {
    const userId = (req as AuthenticatedRequest).userId;
    const { id: organizationId } = await getOrganization(userId);
    if (!organizationId) { res.json({ organization: null, members: [], invitations: [] }); return; }
    const membership = await clerkClient.organizations.getOrganizationMembershipList({ organizationId, userId: [userId], limit: 1 });
    if (!membership.data.length) { res.status(403).json({ error: "You are not a member of this business team" }); return; }
    const [org, members, invitations] = await Promise.all([
      clerkClient.organizations.getOrganization({ organizationId }),
      clerkClient.organizations.getOrganizationMembershipList({ organizationId, limit: 100, orderBy: "+created_at" }),
      clerkClient.organizations.getOrganizationInvitationList({ organizationId, status: ["pending"], limit: 100 }),
    ]);
    res.json({
      organization: { id: org.id, name: org.name, role: membership.data[0].role },
      members: members.data.map((item) => ({ userId: item.publicUserData?.userId, name: [item.publicUserData?.firstName, item.publicUserData?.lastName].filter(Boolean).join(" ") || item.publicUserData?.identifier || "Team member", email: item.publicUserData?.identifier || "", role: item.role, createdAt: item.createdAt })),
      invitations: invitations.data.map((item) => ({ id: item.id, email: item.emailAddress, role: item.role, createdAt: item.createdAt })),
    });
  } catch (error) { res.status(503).json({ error: error instanceof Error ? error.message : "Could not load business team" }); }
});

router.post("/business/team", requireAuth, async (req, res) => {
  try {
    const userId = (req as AuthenticatedRequest).userId;
    const { user, id } = await getOrganization(userId);
    if (id) { res.status(409).json({ error: "A business team already exists for this account" }); return; }
    const supabase = requireSupabase();
    const { data: profile, error } = await supabase.from("profiles").select("role,display_name,onboarding_complete").eq("id", userId).maybeSingle();
    if (error) throw error;
    if (profile?.role !== "business" || !profile.onboarding_complete) { res.status(403).json({ error: "Complete a business profile before creating a team" }); return; }
    const organization = await clerkClient.organizations.createOrganization({ name: profile.display_name || "My business", createdBy: userId });
    await clerkClient.users.updateUserMetadata(userId, { privateMetadata: { [ORG_KEY]: organization.id } });
    res.status(201).json({ organization: { id: organization.id, name: organization.name, role: adminRole }, members: [], invitations: [] });
  } catch (error) { res.status(503).json({ error: error instanceof Error ? error.message : "Could not create business team" }); }
});

router.post("/business/team/invitations", requireAuth, async (req, res) => {
  try {
    const userId = (req as AuthenticatedRequest).userId;
    const { id: organizationId } = await getOrganization(userId);
    if (!organizationId || !(await ensureOwner(userId, organizationId))) { res.status(403).json({ error: "Only the business team owner can invite members" }); return; }
    const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { res.status(400).json({ error: "Enter a valid team member email" }); return; }
    const { userId: inviterUserId } = getAuth(req);
    const invitation = await clerkClient.organizations.createOrganizationInvitation({ organizationId, emailAddress: email, role: "org:member", inviterUserId: inviterUserId || userId, redirectUrl: process.env.CLERK_ORGANIZATION_INVITATION_REDIRECT_URL || undefined });
    res.status(201).json({ invitation: { id: invitation.id, email: invitation.emailAddress, role: invitation.role, createdAt: invitation.createdAt } });
  } catch (error) { res.status(503).json({ error: error instanceof Error ? error.message : "Could not invite team member" }); }
});

router.delete("/business/team/members/:memberId", requireAuth, async (req, res) => {
  try {
    const userId = (req as AuthenticatedRequest).userId;
    const { id: organizationId } = await getOrganization(userId);
    if (!organizationId || !(await ensureOwner(userId, organizationId))) { res.status(403).json({ error: "Only the business team owner can remove members" }); return; }
    const memberId = Array.isArray(req.params.memberId) ? req.params.memberId[0] : req.params.memberId;
    if (memberId === userId) { res.status(400).json({ error: "The team owner cannot remove their own access" }); return; }
    const membership = await clerkClient.organizations.getOrganizationMembershipList({ organizationId, userId: [memberId], limit: 1 });
    if (!membership.data.length || membership.data[0].role === adminRole) { res.status(404).json({ error: "Team member not found" }); return; }
    await clerkClient.organizations.deleteOrganizationMembership({ organizationId, userId: memberId });
    res.json({ removed: true });
  } catch (error) { res.status(503).json({ error: error instanceof Error ? error.message : "Could not remove team member" }); }
});

router.delete("/business/team/invitations/:invitationId", requireAuth, async (req, res) => {
  try {
    const userId = (req as AuthenticatedRequest).userId;
    const { id: organizationId } = await getOrganization(userId);
    if (!organizationId || !(await ensureOwner(userId, organizationId))) { res.status(403).json({ error: "Only the business team owner can revoke invitations" }); return; }
    const pending = await clerkClient.organizations.getOrganizationInvitationList({ organizationId, status: ["pending"], limit: 100 });
    const invitationId = Array.isArray(req.params.invitationId) ? req.params.invitationId[0] : req.params.invitationId;
    if (!pending.data.some((item) => item.id === invitationId)) { res.status(404).json({ error: "Pending invitation not found" }); return; }
    await clerkClient.organizations.revokeOrganizationInvitation({ organizationId, invitationId, requestingUserId: userId });
    res.json({ revoked: true });
  } catch (error) { res.status(503).json({ error: error instanceof Error ? error.message : "Could not revoke invitation" }); }
});

export default router;
