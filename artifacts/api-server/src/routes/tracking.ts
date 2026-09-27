import { Router, type IRouter } from 'express';
import { requireAuth, type AuthenticatedRequest } from '../middlewares/requireAuth';
import { requireSupabase } from '../lib/supabase';
import { isPlatformAdmin } from '../lib/admin';
import { activeTrackingStatuses, isUuid, validTrackingPosition } from '../lib/tracking';

const router: IRouter = Router();
router.use('/tracking', requireAuth, (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

router.get('/tracking/jobs', async (req, res) => {
  try {
    const userId = (req as unknown as AuthenticatedRequest).userId;
    const admin = await isPlatformAdmin(userId);
    let query = requireSupabase().from('jobs')
      .select('id,title,location,status,customer_id,selected_provider_id')
      .in('status', activeTrackingStatuses).not('selected_provider_id', 'is', null)
      .order('updated_at', { ascending: false }).limit(100);
    if (!admin) query = query.or(`customer_id.eq.${userId},selected_provider_id.eq.${userId}`);
    const { data, error } = await query;
    if (error) throw error;
    res.json({ jobs: data ?? [] });
  } catch { res.status(503).json({ error: 'Could not load tracking jobs. Please try again.' }); }
});

router.get('/tracking/jobs/:jobId', async (req, res) => {
  if (!isUuid(req.params.jobId)) { res.status(400).json({ error: 'Invalid job ID' }); return; }
  try {
    const userId = (req as unknown as AuthenticatedRequest).userId;
    const db = requireSupabase();
    const { data: job, error } = await db.from('jobs')
      .select('id,title,location,status,customer_id,selected_provider_id').eq('id', req.params.jobId).maybeSingle();
    if (error) throw error;
    if (!job || (job.customer_id !== userId && job.selected_provider_id !== userId && !(await isPlatformAdmin(userId)))) {
      res.status(404).json({ error: 'Tracking job not found' }); return;
    }
    const active = activeTrackingStatuses.includes(job.status);
    const { data: provider, error: providerError } = job.selected_provider_id
      ? await db.from('profiles').select('display_name,avatar_url').eq('id', job.selected_provider_id).maybeSingle()
      : { data: null, error: null };
    if (providerError) throw providerError;
    const { data: position, error: trackingError } = active
      ? await db.from('job_tracking').select('latitude,longitude,accuracy,travel_status,updated_at,expires_at')
        .eq('job_id', job.id).eq('provider_id', job.selected_provider_id).eq('sharing', true)
        .gt('expires_at', new Date().toISOString()).maybeSingle()
      : { data: null, error: null };
    if (trackingError) throw trackingError;
    res.json({ job, provider, canShare: active && job.selected_provider_id === userId,
      position: position?.latitude != null && position?.longitude != null ? position : null });
  } catch { res.status(503).json({ error: 'Tracking is unavailable. Please try again.' }); }
});

router.post('/tracking/jobs/:jobId', async (req, res) => {
  const body = req.body as Record<string, unknown> | undefined;
  if (!isUuid(req.params.jobId) || !body || !['start', 'update', 'stop'].includes(String(body.action))) {
    res.status(400).json({ error: 'Invalid tracking request' }); return;
  }
  if (body.action !== 'start' && !isUuid(body.sessionId)) {
    res.status(400).json({ error: 'A sharing session is required' }); return;
  }
  if (body.action === 'update' && !validTrackingPosition(body)) {
    res.status(400).json({ error: 'Invalid coordinates, accuracy or travel status' }); return;
  }
  try {
    const { data, error } = await requireSupabase().rpc('update_job_tracking', {
      p_job_id: req.params.jobId, p_provider_id: (req as unknown as AuthenticatedRequest).userId,
      p_action: body.action, p_session_id: body.sessionId ?? null,
      p_latitude: body.latitude ?? null, p_longitude: body.longitude ?? null,
      p_accuracy: body.accuracy ?? null, p_travel_status: body.travelStatus ?? 'en_route',
    });
    if (error) {
      if (error.code === '42501' || error.code === '22023') {
        res.status(error.code === '42501' ? 403 : 409).json({ error: error.message }); return;
      }
      throw error;
    }
    res.json({ sessionId: data });
  } catch { res.status(503).json({ error: 'Could not update location sharing. Please try again.' }); }
});

export default router;
