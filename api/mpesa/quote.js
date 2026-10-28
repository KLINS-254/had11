import { createClient } from '@supabase/supabase-js';
const json = (res, status, body) => res.status(status).setHeader('Content-Type', 'application/json').json(body);
const env = key => process.env[key]?.trim();
const sandbox = () => (env('DARAJA_ENV') || 'sandbox').toLowerCase() === 'sandbox';
export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed.' });
  const url = env('SUPABASE_URL') || env('VITE_SUPABASE_URL');
  const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY');
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!url || !serviceKey) return json(res, 503, { error: 'Server booking database is not configured.' });
  if (!token) return json(res, 401, { error: 'Sign in before reviewing payment.' });
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: auth, error: authError } = await admin.auth.getUser(token);
  if (authError || !auth?.user) return json(res, 401, { error: 'Your session is invalid or expired.' });
  const bookingId = req.body?.booking_id;
  const { data: booking, error } = await admin.from('bookings').select('id,user_id,ticket_number,status,from_county,to_county,vehicle_type,trip_type,total_amount').eq('id', bookingId).eq('user_id', auth.user.id).maybeSingle();
  if (error || !booking) return json(res, 404, { error: 'Booking not found.' });
  let amount;
  if (sandbox()) amount = Number(env('DARAJA_SANDBOX_TEST_AMOUNT_KES') || 1);
  else {
    const { data: fare, error: fareError } = await admin.from('route_fares').select('fare_kes').eq('from_county', booking.from_county).eq('to_county', booking.to_county).eq('vehicle_type', booking.vehicle_type).eq('trip_type', booking.trip_type).eq('active', true).maybeSingle();
    if (fareError || !fare) return json(res, 400, { error: 'No verified fare is configured for this route, bus type and trip type.' });
    amount = Number(fare.fare_kes);
  }
  if (!Number.isFinite(amount) || amount < 1) return json(res, 400, { error: 'The configured amount is invalid.' });
  await admin.from('bookings').update({ total_amount: amount }).eq('id', booking.id).eq('user_id', auth.user.id);
  return json(res, 200, { ok: true, booking_reference: booking.ticket_number, amount, currency: 'KES', mode: sandbox() ? 'sandbox' : 'production', test_amount: sandbox() });
}
