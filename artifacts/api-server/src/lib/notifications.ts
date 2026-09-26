import { requireSupabase } from "./supabase";

export async function createNotification(userId: string, title: string, body: string, data: Record<string, unknown> = {}) {
  const { error } = await requireSupabase().from("user_notifications").insert({ user_id: userId, title, body, data });
  if (error) throw error;
  try {
    const { data: tokens, error: tokenError } = await requireSupabase().from("expo_push_tokens").select("expo_push_token").eq("user_id", userId);
    if (tokenError) throw tokenError;
    if (!tokens?.length) return;
    for (let offset = 0; offset < tokens.length; offset += 100) {
      const batch = tokens.slice(offset, offset + 100);
      const response = await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          ...(process.env.EXPO_ACCESS_TOKEN ? { Authorization: `Bearer ${process.env.EXPO_ACCESS_TOKEN}` } : {}),
        },
        body: JSON.stringify(batch.map(({ expo_push_token }) => ({ to: expo_push_token, title, body: title === "New message" ? "Open Handyskillz to read your message." : body, data, sound: "default", priority: "high" }))),
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) throw new Error(`Expo push service returned HTTP ${response.status}`);
      const result = await response.json() as { data?: Array<{ status?: string; details?: { error?: string } }> };
      const staleTokens = batch.filter((_, index) => result.data?.[index]?.details?.error === "DeviceNotRegistered").map(({ expo_push_token }) => expo_push_token);
      if (staleTokens.length) await requireSupabase().from("expo_push_tokens").delete().in("expo_push_token", staleTokens);
    }
  } catch (pushError) {
    // The in-app notification is persisted; remote delivery is best effort.
    console.error("Expo push notification delivery failed", pushError);
  }
}
