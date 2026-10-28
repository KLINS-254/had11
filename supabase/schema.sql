-- ENA Coach booking/payment schema upgrade. Safe to re-run on the existing prototype.
create extension if not exists pgcrypto;

create table if not exists public.bookings (
 id uuid primary key default gen_random_uuid(),
 user_id uuid references auth.users(id) on delete set null,
 ticket_number text not null unique,
 passenger_name text not null,
 mobile_number text not null,
 email text,
 from_county text not null,
 to_county text not null,
 departure_stage text not null,
 arrival_stage text not null,
 travel_date date not null,
 return_date date,
 trip_type text not null check (trip_type in ('one_way','round_trip')),
 vehicle_type text not null check (vehicle_type in ('Shuttle','Luxo','Luxury')),
 seat_count integer not null,
 status text not null default 'requested' check (status in ('requested','confirmed','cancelled')),
 created_at timestamptz not null default now()
);

alter table public.bookings add column if not exists selected_seats jsonb not null default '[]'::jsonb;
alter table public.bookings add column if not exists total_amount numeric(10,2);
alter table public.bookings add column if not exists payment_status text not null default 'PENDING';
alter table public.bookings add column if not exists updated_at timestamptz not null default now();
create index if not exists bookings_user_idx on public.bookings(user_id);
create index if not exists bookings_ticket_mobile_idx on public.bookings(ticket_number,mobile_number);

create table if not exists public.payments (
 id uuid primary key default gen_random_uuid(),
 booking_id uuid not null references public.bookings(id) on delete restrict,
 payment_reference text not null,
 merchant_request_id text,
 checkout_request_id text unique,
 mpesa_receipt_number text unique,
 amount numeric(10,2) not null check (amount > 0),
 phone_number text not null,
 payment_status text not null default 'PENDING' check (payment_status in ('PENDING','PROCESSING','PAID','FAILED','CANCELLED','EXPIRED','REVIEW')),
 provider text not null default 'DARAJA',
 environment text not null default 'sandbox' check (environment in ('sandbox','production')),
 provider_response jsonb,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists payments_booking_idx on public.payments(booking_id,created_at desc);
create index if not exists payments_status_idx on public.payments(payment_status);

-- Fleet capacity is configurable in the database; the Luxury value is provisional until verified.
create table if not exists public.bus_types (
 bus_type text primary key check (bus_type in ('Shuttle','Luxo','Luxury')),
 passenger_capacity integer not null check (passenger_capacity > 0),
 seat_layout jsonb not null default '{}'::jsonb,
 updated_at timestamptz not null default now()
);
insert into public.bus_types(bus_type,passenger_capacity) values ('Shuttle',10),('Luxo',13),('Luxury',49)
on conflict (bus_type) do nothing;

-- Configure verified production fares here before enabling live payments.
create table if not exists public.route_fares (
 id uuid primary key default gen_random_uuid(),
 from_county text not null,
 to_county text not null,
 vehicle_type text not null check (vehicle_type in ('Shuttle','Luxo','Luxury')),
 trip_type text not null check (trip_type in ('one_way','round_trip')),
 fare_kes numeric(10,2) not null check (fare_kes > 0),
 active boolean not null default true,
 updated_at timestamptz not null default now(),
 unique(from_county,to_county,vehicle_type,trip_type)
);

create table if not exists public.booking_seats (
 id uuid primary key default gen_random_uuid(),
 booking_id uuid not null references public.bookings(id) on delete cascade,
 trip_key text not null,
 seat_number integer not null check (seat_number > 0),
 reservation_status text not null default 'HELD' check (reservation_status in ('HELD','BOOKED','RELEASED')),
 reservation_expires_at timestamptz not null default (now() + interval '10 minutes'),
 created_at timestamptz not null default now()
);
create index if not exists booking_seats_booking_idx on public.booking_seats(booking_id);
create unique index if not exists booking_seats_active_unique on public.booking_seats(trip_key,seat_number) where reservation_status in ('HELD','BOOKED');
alter table public.bus_types enable row level security;
alter table public.route_fares enable row level security;
alter table public.booking_seats enable row level security;
drop policy if exists "public can read bus types" on public.bus_types;
create policy "public can read bus types" on public.bus_types for select to anon,authenticated using (true);
drop policy if exists "public can read active route fares" on public.route_fares;
create policy "public can read active route fares" on public.route_fares for select to anon,authenticated using (active = true);
drop policy if exists "read own booking seats" on public.booking_seats;
create policy "read own booking seats" on public.booking_seats for select to authenticated using (exists (select 1 from public.bookings b where b.id=booking_id and b.user_id=auth.uid()));
revoke insert, update, delete on public.booking_seats from anon, authenticated;
revoke insert, update, delete on public.bus_types from anon, authenticated;
revoke insert, update, delete on public.route_fares from anon, authenticated;

create or replace function public.hold_booking_seats()
returns trigger language plpgsql security definer set search_path=public as $$
declare cap integer; seat_json jsonb; seat_no integer; trip text;
begin
 if new.status <> 'requested' or new.payment_status <> 'PENDING' then
   raise exception 'New bookings must begin pending';
 end if;
 if jsonb_typeof(new.selected_seats) <> 'array' or jsonb_array_length(new.selected_seats) < 1 then
   raise exception 'Select at least one passenger seat';
 end if;
 if jsonb_array_length(new.selected_seats) <> new.seat_count then
   raise exception 'Selected seat count does not match booking';
 end if;
 select passenger_capacity into cap from public.bus_types where bus_type=new.vehicle_type;
 if cap is null then raise exception 'Bus capacity is not configured'; end if;
 trip := concat(new.travel_date::text,'|',new.from_county,'|',new.to_county,'|',new.vehicle_type);
 -- Remove only expired holds. Paid/booked seats remain protected.
 delete from public.booking_seats where trip_key=trip and reservation_status='HELD' and reservation_expires_at <= now();
 for seat_json in select value from jsonb_array_elements(new.selected_seats) loop
   if jsonb_typeof(seat_json) <> 'number' then raise exception 'Invalid seat number'; end if;
   seat_no := (seat_json #>> '{}')::integer;
   if seat_no < 1 or seat_no > cap then raise exception 'Seat number is outside this bus capacity'; end if;
   insert into public.booking_seats(booking_id,trip_key,seat_number,reservation_status,reservation_expires_at)
   values(new.id,trip,seat_no,'HELD',now()+interval '10 minutes');
 end loop;
 return new;
end $$;
drop trigger if exists bookings_hold_seats on public.bookings;
create trigger bookings_hold_seats after insert on public.bookings for each row execute function public.hold_booking_seats();

create or replace function public.get_seat_availability(p_travel_date date,p_from_county text,p_to_county text,p_vehicle_type text)
returns table(seat_number integer)
language sql security definer set search_path=public as $$
 select bs.seat_number from public.booking_seats bs
 where bs.trip_key=concat(p_travel_date::text,'|',p_from_county,'|',p_to_county,'|',p_vehicle_type)
   and (bs.reservation_status='BOOKED' or (bs.reservation_status='HELD' and bs.reservation_expires_at > now()))
 order by bs.seat_number;
$$;
revoke all on function public.get_seat_availability(date,text,text,text) from public;
grant execute on function public.get_seat_availability(date,text,text,text) to anon,authenticated;

create or replace function public.sync_booking_seat_status()
returns trigger language plpgsql security definer set search_path=public as $$
begin
 if new.status='confirmed' and new.payment_status='PAID' then
   if exists (select 1 from public.booking_seats bs where bs.booking_id=new.id and bs.reservation_status='HELD' and bs.reservation_expires_at > now())
      and not exists (select 1 from public.booking_seats bs where bs.booking_id=new.id and (bs.reservation_status <> 'HELD' or bs.reservation_expires_at <= now())) then
     update public.booking_seats set reservation_status='BOOKED' where booking_id=new.id;
   end if;
 elsif new.status='cancelled' then
   update public.booking_seats set reservation_status='RELEASED' where booking_id=new.id and reservation_status='HELD';
 end if;
 return new;
end $$;
drop trigger if exists bookings_sync_seats on public.bookings;
create trigger bookings_sync_seats after update of status,payment_status on public.bookings for each row execute function public.sync_booking_seat_status();


alter table public.bookings enable row level security;
alter table public.payments enable row level security;
drop policy if exists "read own bookings" on public.bookings;
create policy "read own bookings" on public.bookings for select to authenticated using (auth.uid() = user_id);
drop policy if exists "insert own bookings" on public.bookings;
create policy "insert own pending bookings" on public.bookings for insert to authenticated
 with check (auth.uid() = user_id and status = 'requested' and payment_status = 'PENDING');
-- No client UPDATE policy is intentionally provided: payment status is server-controlled.
drop policy if exists "read own payments" on public.payments;
create policy "read own payments" on public.payments for select to authenticated
 using (exists (select 1 from public.bookings b where b.id = booking_id and b.user_id = auth.uid()));
revoke insert, update, delete on public.payments from anon, authenticated;

create or replace function public.confirm_daraja_payment(
 p_checkout_request_id text,
 p_receipt text,
 p_amount numeric,
 p_phone text,
 p_provider_response jsonb
) returns text
language plpgsql security definer set search_path=public as $$
declare pay public.payments%rowtype; book public.bookings%rowtype; held_count integer; valid_count integer;
begin
 select * into pay from public.payments where checkout_request_id=p_checkout_request_id for update;
 if not found then return 'NOT_FOUND'; end if;
 if pay.payment_status='PAID' then return 'ALREADY_PAID'; end if;
 if p_receipt is null or length(trim(p_receipt))=0 or p_amount is null or p_amount <> pay.amount then
   update public.payments set payment_status='REVIEW', provider_response=p_provider_response, updated_at=now() where id=pay.id;
   return 'REVIEW_AMOUNT_OR_RECEIPT';
 end if;
 select * into book from public.bookings where id=pay.booking_id for update;
 if not found then return 'BOOKING_NOT_FOUND'; end if;
 select count(*),count(*) filter (where reservation_status='HELD' and reservation_expires_at>now())
 into held_count,valid_count from public.booking_seats where booking_id=book.id;
 if held_count <> book.seat_count or valid_count <> book.seat_count then
   update public.payments set payment_status='REVIEW', mpesa_receipt_number=p_receipt, provider_response=p_provider_response, updated_at=now() where id=pay.id;
   return 'REVIEW_SEAT_HOLD';
 end if;
 update public.payments set payment_status='PAID', mpesa_receipt_number=p_receipt, phone_number=coalesce(nullif(p_phone,''),phone_number), provider_response=p_provider_response, updated_at=now() where id=pay.id;
 update public.bookings set status='confirmed', payment_status='PAID', total_amount=p_amount, updated_at=now() where id=book.id;
 return 'PAID';
end $$;
revoke all on function public.confirm_daraja_payment(text,text,numeric,text,jsonb) from public;
grant execute on function public.confirm_daraja_payment(text,text,numeric,text,jsonb) to service_role;

create or replace function public.lookup_ticket(p_ticket_number text,p_mobile_number text)
returns table(ticket_number text,passenger_name text,from_county text,to_county text,departure_stage text,arrival_stage text,travel_date date,return_date date,trip_type text,vehicle_type text,status text)
language sql security definer set search_path=public as $$
 select b.ticket_number,b.passenger_name,b.from_county,b.to_county,b.departure_stage,b.arrival_stage,b.travel_date,b.return_date,b.trip_type,b.vehicle_type,b.status
 from public.bookings b
 where upper(b.ticket_number)=upper(trim(p_ticket_number))
   and regexp_replace(b.mobile_number,'\s+','','g')=regexp_replace(trim(p_mobile_number),'\s+','','g')
   and b.status='confirmed' and b.payment_status='PAID'
 limit 1;
$$;
revoke all on function public.lookup_ticket(text,text) from public;
grant execute on function public.lookup_ticket(text,text) to anon,authenticated;
