export const activeTrackingStatuses = ['matched', 'in_progress'];
export function validTrackingPosition(body: Record<string, unknown>) {
  return typeof body.latitude === 'number' && Number.isFinite(body.latitude)
    && body.latitude >= -90 && body.latitude <= 90
    && typeof body.longitude === 'number' && Number.isFinite(body.longitude)
    && body.longitude >= -180 && body.longitude <= 180
    && (body.accuracy == null || (typeof body.accuracy === 'number'
      && Number.isFinite(body.accuracy) && body.accuracy >= 0 && body.accuracy <= 100000))
    && ['en_route', 'arrived'].includes(String(body.travelStatus));
}
export const isUuid = (value: unknown): value is string => typeof value === 'string'
  && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
