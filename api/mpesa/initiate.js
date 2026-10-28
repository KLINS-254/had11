import { createClient } from '@supabase/supabase-js';

const json = (res, status, body) => res.status(status).setHeader('Content-Type', 'application/json').json(body);
const env = (key) => process.env[key]?.trim();
const isSandbox = () => (env('DARAJA_ENV') || 'sandbox').toLowerCase() === 'sandbox';
const apiBase = () => isSandbox() ? 'https://sandbox.safaricom.co.ke' : 'https://api.safaricom.co.ke';
function normalizePhone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.startsWith('254') && digits.length === 12) return digits;
  if (digits.startsWith('0') && digits.length === 10) return `254${digits.slice(1)}`;
  if (digits.startsWith('7') && digits.length === 9) return `254${digits}`;
  return null;
}
function timestamp() {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}${String(d.getHours()).padStart(2,'0')}${String(d.getMinutes()).padStart(2,'0')}${String(d.getSeconds()).padStart(2,'0')}`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed.' });
  const url = env('SUPABASE_URL') || env('VITE_SUPABASE_URL');
  const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY');
  const consumerKey = env('DARAJA_CONSUMER_KEY');
  const consumerSecret = env('DARAJA_CONSUMER_SECRET');
  const shortcode = env('DARAJA_SHORTCODE');
  const passkey = env('DARAJA_PASSKEY');
  const callbackUrl = env('DARAJA_CALLBACK_URL');
  if (!url || !serviceKey) return json(res, 503, { error: 'Server booking database is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.' });
  if (!consumerKey || !consumerSecret || !shortcode || !passkey || !callbackUrl) return json(res, 503, { error: 'Daraja is not configured. Add the sandbox credentials, shortcode, passkey and public callback URL in Vercel environment variables.' });
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return json(res, 401, { error: 'Sign in before requesting payment.' });
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: authData, error: authError } = await admin.auth.getUser(token);
  if (authError || !authData?.user) return json(res, 401, { error: 'Your session is invalid or expired. Sign in again.' });
  const bookingId = req.body?.booking_id;
  if (typeof bookingId !== 'string' || !/^[0-9a-f-]{36}$/i.test(bookingId)) return json(res, 400, { error: 'A valid booking ID is required.' });
  const { data: booking, error: bookingError } = await admin.from('bookings').select('id,user_id,ticket_number,mobile_number,status,total_amount,from_county,to_county,vehicle_type,trip_type').eq('id', bookingId).eq('user_id', authData.user.id).maybeSingle();
  if (bookingError || !booking) return json(res, 404, { error: 'Booking was not found for this account.' });
  if (booking.status === 'confirmed') return json(res, 409, { error: 'This booking is already confirmed.' });
  const phone = normalizePhone(booking.mobile_number);
  if (!phone) return json(res, 400, { error: 'Enter a valid Kenyan mobile number such as 0712345678.' });
  let amount = Number(booking.total_amount || 0);
  if (isSandbox()) {
    amount = Number(env('DARAJA_SANDBOX_TEST_AMOUNT_KES') || 1);
  } else {
    const { data: fare } = await admin.from('route_fares').select('fare_kes').eq('from_county', booking.from_county).eq('to_county', booking.to_county).eq('vehicle_type', booking.vehicle_type).eq('trip_type', booking.trip_type).eq('active', true).maybeSingle();
    amount = Number(fare?.fare_kes || 0);
  }
  if (!Number.isInteger(amount) || amount < 1) return json(res, 400, { error: 'No verified fare is configured for this route, bus type and trip type. Add it to route_fares before requesting a production payment.' });
  await admin.from('bookings').update({ total_amount: amount }).eq('id', booking.id).eq('user_id', authData.user.id);

  const ts = timestamp();
  const password = Buffer.from(`${shortcode}${passkey}${ts}`).toString('base64');
  const authResponse = await fetch(`${apiBase()}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64')}` }
  });
  const authJson = await authResponse.json().catch(() => ({}));
  if (!authResponse.ok || !authJson.access_token) return json(res, 502, { error: 'Daraja could not issue an access token. Check sandbox credentials and environment.' });

  const { data: payment, error: paymentError } = await admin.from('payments').insert({
    booking_id: booking.id, payment_reference: booking.ticket_number, amount,
    phone_number: phone, payment_status: 'PENDING', provider: 'DARAJA', environment: isSandbox() ? 'sandbox' : 'production'
  }).select('id').single();
  if (paymentError) return json(res, 500, { error: 'Could not create the payment record.' });

  const transactionType = env('DARAJA_TRANSACTION_TYPE') || 'CustomerPayBillOnline';
  const stkPayload = {
    BusinessShortCode: shortcode,
    Password: password,
    Timestamp: ts,
    TransactionType: transactionType,
    Amount: amount,
    PartyA: phone,
    PartyB: shortcode,
    PhoneNumber: phone,
    CallBackURL: callbackUrl,
    AccountReference: booking.ticket_number,
    TransactionDesc: `ENA Coach booking ${booking.ticket_number}`
  };
  const stkResponse = await fetch(`${apiBase()}/mpesa/stkpush/v1/processrequest`, {
    method: 'POST', headers: { Authorization: `Bearer ${authJson.access_token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(stkPayload)
  });
  const stkJson = await stkResponse.json().catch(() => ({}));
  if (!stkResponse.ok || stkJson.ResponseCode !== '0') {
    await admin.from('payments').update({ payment_status: 'FAILED', provider_response: stkJson, updated_at: new Date().toISOString() }).eq('id', payment.id);
    return json(res, 502, { error: stkJson.errorMessage || stkJson.ResponseDescription || 'Daraja rejected the payment request.' });
  }
  await admin.from('payments').update({ merchant_request_id: stkJson.MerchantRequestID, checkout_request_id: stkJson.CheckoutRequestID, provider_response: stkJson, payment_status: 'PROCESSING', updated_at: new Date().toISOString() }).eq('id', payment.id);
  return json(res, 200, { ok: true, payment_id: payment.id, amount, currency: 'KES', checkout_request_id: stkJson.CheckoutRequestID, customer_message: stkJson.CustomerMessage || 'Check your phone and enter your M-Pesa PIN.' });
}
