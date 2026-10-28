# ENA Coach-style booking website — existing project upgrade

Mobile-first React + Vite project with the original home/search, English/Kiswahili toggle, 47 county selectors, account page, booking lookup, and print-ticket experience retained. This is an independent prototype and is not an official ENA Coach service.

## New in this upgrade
- Separate top-down seat maps for Shuttle (10 seats), Luxo (13 seats), and configurable Luxury capacity.
- Custom SVG steering-wheel illustration in the driver's cockpit.
- Blue available, red selected, and grey unavailable seat states.
- Selected seat numbers are saved with booking requests.
- M-Pesa payment page with a server-side quote endpoint, Daraja STK Push initiation endpoint, callback endpoint, and authenticated payment-status endpoint.
- Payment status is server-controlled. Ticket lookup only returns confirmed bookings with `payment_status = 'PAID'`.
- Sandbox test amount is server-only and defaults to KSh 1. Production payments require a configured fare and the merchant/API configuration approved by Safaricom.

## Important seating note
The current seat positions are **temporary layout placeholders**, not verified reproductions of the actual three ENA Coach vehicles. Replace them with the user's reference screenshots before calling the layouts exact. LUXO is configured for 13 seats and Shuttle for 10. Luxury uses `VITE_LUXURY_SEAT_CAPACITY` (currently 49 as a provisional value); confirm and configure the same capacity in `public.bus_types` before launch.

## Run locally
1. Use Node.js 20 or later.
2. Run `npm install`.
3. Copy `.env.example` to `.env`.
4. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` for frontend authentication.
5. Run `npm run dev`.

Vercel Functions require deployment to Vercel (or a compatible local Vercel dev environment) for `/api/mpesa/*` endpoints.

## Supabase setup
1. Open the Supabase SQL Editor.
2. Run `supabase/schema.sql`. It adds the payment fields/table to the existing prototype and can be re-run.
3. Configure Authentication URL settings for your local and deployed URLs.
4. In Vercel Environment Variables, set both frontend variables and server-only variables below.
5. Redeploy after changing environment variables.

## Vercel environment variables
Required frontend variables:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Required server-only variables:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` (never prefix with `VITE_`, never expose in browser code)
- `DARAJA_ENV=sandbox`
- `DARAJA_CONSUMER_KEY`
- `DARAJA_CONSUMER_SECRET`
- `DARAJA_SHORTCODE`
- `DARAJA_PASSKEY`
- `DARAJA_CALLBACK_URL=https://YOUR-DEPLOYMENT.vercel.app/api/mpesa/callback`
- `DARAJA_TRANSACTION_TYPE` set to the transaction type supported by your Daraja merchant product
- Optional `DARAJA_SANDBOX_TEST_AMOUNT_KES=1` (sandbox only)
- Optional `VITE_LUXURY_SEAT_CAPACITY` (provisional default 49; keep it aligned with `public.bus_types.passenger_capacity`)

## M-Pesa / Daraja caution
A standard STK Push setup is not automatically valid for every Buy Goods Till. Confirm the merchant shortcode, transaction type, credentials, callback requirements, and supported payment product with Safaricom Daraja for the actual merchant account. This project defaults to `CustomerPayBillOnline` as a sandbox example; change it only to the transaction type supported by the approved integration. The interface does not claim a live payment is working until sandbox end-to-end tests succeed.

The callback matches the stored CheckoutRequestID, checks the successful result code, requires an M-Pesa receipt, and compares the callback amount with the payment record before marking the booking paid. Production deployment should also add provider-side reconciliation, callback monitoring, rate limiting, and operational alerts. A manually entered receipt code is never accepted as payment proof.

## Current limitations before real launch
- The user must upload actual bus-seat screenshots so row positions can be matched exactly.
- The current county-stage list is illustrative, not a verified ENA Coach office directory.
- Routes, schedules, and operator inventory are not connected to an official ENA Coach system. Server-side seat holds prevent duplicate reservations for a selected route/date/bus type, but do not represent live operator inventory. Verify all operational data before accepting real travel bookings.
- Round-trip seat reservations are intentionally blocked until separate return-leg seat holds and fares are implemented. Sandbox payment test amount is not a travel fare. Configure production fares server-side before production payments.
- Review privacy notice, terms, branding permissions, ticket validation, and customer support details before public launch.

## GitHub + Vercel
1. Download the upgraded source ZIP and extract it.
2. Upload/commit the project contents to the **existing** GitHub repository, preserving the correct repository root.
3. Confirm the Vercel project is linked to that repository and that the Root Directory points to the folder containing `package.json`.
4. Build command: `npm run build`; output directory: `dist`.
5. Add the environment variables above in Vercel and redeploy.
6. If the deployment still fails, share the full final error lines from the Vercel build log (not only “Build failed”).
