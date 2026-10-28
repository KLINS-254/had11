import { createClient } from '@supabase/supabase-js';
const json = (res, status, body) => res.status(status).setHeader('Content-Type', 'application/json').json(body);
export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { ResultCode: 1, ResultDesc: 'Method not allowed' });
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return json(res, 503, { ResultCode: 1, ResultDesc: 'Database not configured' });
  const callback = req.body?.Body?.stkCallback;
  const checkoutId = callback?.CheckoutRequestID;
  if (!callback || !checkoutId) return json(res, 400, { ResultCode: 1, ResultDesc: 'Invalid callback payload' });
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: payment, error } = await admin.from('payments').select('id,booking_id,amount,payment_status').eq('checkout_request_id', checkoutId).maybeSingle();
  if (error || !payment) {
    // Callback may arrive before the initiating function persists CheckoutRequestID; acknowledge safely and reconcile from provider logs.
    return json(res, 200, { ResultCode: 0, ResultDesc: 'Callback received for reconciliation' });
  }
  if (payment.payment_status === 'PAID') return json(res, 200, { ResultCode: 0, ResultDesc: 'Duplicate callback acknowledged' });
  if (Number(callback.ResultCode) !== 0) {
    await admin.from('payments').update({ payment_status: 'FAILED', provider_response: req.body, updated_at: new Date().toISOString() }).eq('id', payment.id);
    return json(res, 200, { ResultCode: 0, ResultDesc: 'Payment failure recorded' });
  }
  const items = callback.CallbackMetadata?.Item || [];
  const value = (name) => items.find(x => x.Name === name)?.Value;
  const amount = Number(value('Amount'));
  const receipt = String(value('MpesaReceiptNumber') || '');
  const phone = String(value('PhoneNumber') || '');
  if (!receipt || !Number.isFinite(amount) || amount !== Number(payment.amount)) {
    await admin.from('payments').update({ payment_status: 'REVIEW', provider_response: req.body, updated_at: new Date().toISOString() }).eq('id', payment.id);
    return json(res, 200, { ResultCode: 0, ResultDesc: 'Payment requires reconciliation' });
  }
  const { data: confirmation, error: confirmationError } = await admin.rpc('confirm_daraja_payment', {
    p_checkout_request_id: checkoutId,
    p_receipt: receipt,
    p_amount: amount,
    p_phone: phone,
    p_provider_response: req.body
  });
  if (confirmationError) return json(res, 500, { ResultCode: 1, ResultDesc: 'Could not atomically confirm payment and booking' });
  if (confirmation === 'PAID' || confirmation === 'ALREADY_PAID') return json(res, 200, { ResultCode: 0, ResultDesc: 'Payment confirmed' });
  return json(res, 200, { ResultCode: 0, ResultDesc: `Payment received; reconciliation required (${confirmation || 'UNKNOWN'})` });
}
