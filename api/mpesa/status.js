import { createClient } from '@supabase/supabase-js';
const json = (res, status, body) => res.status(status).setHeader('Content-Type', 'application/json').json(body);
export default async function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed.' });
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!token) return json(res, 401, { error: 'Sign in required.' });
  if (!url || !key) return json(res, 503, { error: 'Server database is not configured.' });
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: auth, error: authError } = await admin.auth.getUser(token);
  if (authError || !auth?.user) return json(res, 401, { error: 'Session expired.' });
  const bookingId = String(req.query?.booking_id || '');
  const { data: booking } = await admin.from('bookings').select('id,ticket_number,status,payment_status').eq('id', bookingId).eq('user_id', auth.user.id).maybeSingle();
  if (!booking) return json(res, 404, { error: 'Booking not found.' });
  const { data: payment } = await admin.from('payments').select('payment_status,amount,mpesa_receipt_number,updated_at').eq('booking_id', booking.id).order('created_at', { ascending: false }).limit(1).maybeSingle();
  return json(res, 200, { booking, payment: payment || null });
}
