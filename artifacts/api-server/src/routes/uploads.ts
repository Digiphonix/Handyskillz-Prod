import { Router, type IRouter } from "express";
import multer from "multer";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/requireAuth";
import { requireSupabase } from "../lib/supabase";

const router: IRouter = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
});

router.post("/uploads/profile", requireAuth, upload.single("file"), async (req, res) => {
  try {
    const file = req.file;
    if (!file) {
      res.status(400).json({ error: "No image file supplied" });
      return;
    }
    if (!file.mimetype.startsWith("image/")) {
      res.status(415).json({ error: "Only image uploads are supported" });
      return;
    }

    const supabase = requireSupabase();
    const userId = (req as AuthenticatedRequest).userId;
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "-").slice(-80);
    const path = `profiles/${userId}/${Date.now()}-${safeName || "upload.jpg"}`;
    const bucket = process.env.SUPABASE_PROFILE_BUCKET || "profile-media";
    const { error } = await supabase.storage.from(bucket).upload(path, file.buffer, {
      contentType: file.mimetype,
      upsert: false,
    });
    if (error) throw error;

    const { data } = supabase.storage.from(bucket).getPublicUrl(path);
    res.json({ path, url: data.publicUrl });
  } catch (error) {
    res.status(503).json({ error: error instanceof Error ? error.message : "Upload service unavailable" });
  }
});

export default router;