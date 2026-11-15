-- =========================================================
-- Tattoo House: структура бази для Supabase (Postgres).
-- Виконати один раз: Supabase → SQL Editor → вставити весь файл → Run.
-- Потім supabase/seed.sql (стартові дані сайту).
-- Повторний запуск безпечний: таблиці не перестворюються, політики й функції оновлюються.
--
-- Хто що може (RLS):
--   відвідувач сайту (anon): читає видимі послуги, майстрів, фото, відгуки, settings;
--     пише ЛИШЕ через функції create_booking() і join_giveaway() з перевірками;
--     записів і учасників розіграшу не бачить;
--   адмін (є рядок у admins): читає й змінює все, обирає переможця, скидає розіграш.
-- Основа (admins, is_admin, бакет photos) узята з референсу admin-panel.
-- =========================================================

create extension if not exists pgcrypto; -- gen_random_uuid()

-- ---------- адміністратори ----------
-- Паролі зберігає й перевіряє Supabase Auth (bcrypt на сервері).
-- Тут лише список, хто з користувачів Auth має доступ до адмінки.
create table if not exists admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  name    text not null default 'Адміністратор'
);

create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from admins where user_id = auth.uid());
$$;

-- ---------- послуги (головна, крок 1 запису, чек) ----------
create table if not exists services (
  id         text primary key,
  name       text not null check (length(name) between 1 and 80),
  icon       text not null default 'dagger' check (icon in ('dagger', 'star', 'flame', 'bolt', 'horns', 'skull')),
  price      int  not null check (price between 0 and 1000000),
  unit       text not null default '' check (length(unit) <= 20),
  text       text not null default '' check (length(text) <= 400),
  visible    boolean not null default true,
  sort       int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- майстри ----------
-- id = slug (latin): на ньому тримаються посилання booking.html?master=... і masters.html#...
create table if not exists masters (
  -- 'any' зайнятий: так сайт позначає «Будь-який вільний»
  id         text primary key check (id ~ '^[a-z0-9][a-z0-9-]{1,39}$' and id <> 'any'),
  name       text not null check (length(name) between 2 and 80),
  nick       text not null default '' check (length(nick) <= 40),
  style      text not null default '' check (length(style) <= 80),
  tags       text[] not null default '{}',
  exp        int  not null default 0 check (exp between 0 and 80),
  price      text not null default '' check (length(price) <= 60),
  about      text not null default '' check (length(about) <= 800),
  photo      text not null default '',
  photo_pos  text not null default 'top' check (photo_pos in ('top', 'wide')),
  visible    boolean not null default true,
  sort       int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- галерея робіт ----------
create table if not exists gallery (
  id         text primary key default gen_random_uuid()::text,
  src        text not null,
  w          int  not null check (w > 0),
  h          int  not null check (h > 0),
  alt        text not null check (length(alt) between 3 and 200),
  style      text not null default '' check (length(style) <= 40),
  master_id  text references masters (id) on delete set null on update cascade,
  visible    boolean not null default true,
  sort       int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- відгуки ----------
create table if not exists reviews (
  id         text primary key default gen_random_uuid()::text,
  text       text not null check (length(text) between 5 and 600),
  author     text not null check (length(author) between 1 and 60),
  caption    text not null default '' check (length(caption) <= 80),
  visible    boolean not null default true,
  sort       int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- налаштування-одинаки: info (контакти, статистика), giveaway (розіграш) ----------
create table if not exists settings (
  id         text primary key check (id in ('info', 'giveaway')),
  data       jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- записи клієнтів (лише адмін) ----------
-- services, master_name, total: знімок на момент запису, щоб історія не ламалась після правок довідника
create table if not exists bookings (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  services    jsonb not null,
  master_id   text,
  master_name text not null,
  date        date not null,
  time        text not null,
  client_name text not null check (length(client_name) <= 60),
  phone       text not null check (length(phone) <= 20),
  comment     text not null default '' check (length(comment) <= 1000),
  total       int  not null default 0,
  status      text not null default 'new' check (status in ('new', 'confirmed', 'cancelled')),
  admin_note  text not null default '' check (length(admin_note) <= 1000),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists bookings_status_idx on bookings (status);
create index if not exists bookings_phone_idx on bookings (phone);

-- ---------- учасники розіграшу (лише адмін) ----------
create table if not exists giveaway_entries (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(name) <= 60),
  contact     text not null check (length(contact) <= 40),
  contact_key text not null unique, -- нормалізований контакт: один учасник = один телефон / нік
  is_winner   boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- =========================================================
-- Права на таблиці (поверх них працює RLS)
-- =========================================================
grant usage on schema public to anon, authenticated;
grant select on services, masters, gallery, reviews, settings to anon, authenticated;
grant insert, update, delete on services, masters, gallery, reviews, settings to authenticated;
grant select, insert, update, delete on bookings, giveaway_entries to authenticated;
grant select on admins to authenticated;
revoke all on bookings, giveaway_entries, admins from anon;

alter table admins           enable row level security;
alter table services         enable row level security;
alter table masters          enable row level security;
alter table gallery          enable row level security;
alter table reviews          enable row level security;
alter table settings         enable row level security;
alter table bookings         enable row level security;
alter table giveaway_entries enable row level security;

drop policy if exists "admins: свій рядок" on admins;
create policy "admins: свій рядок" on admins for select using (user_id = auth.uid());

drop policy if exists "публічне читання" on services;
create policy "публічне читання" on services for select using (visible or is_admin());
drop policy if exists "публічне читання" on masters;
create policy "публічне читання" on masters for select using (visible or is_admin());
drop policy if exists "публічне читання" on gallery;
create policy "публічне читання" on gallery for select using (visible or is_admin());
drop policy if exists "публічне читання" on reviews;
create policy "публічне читання" on reviews for select using (visible or is_admin());
drop policy if exists "публічне читання" on settings;
create policy "публічне читання" on settings for select using (true);

drop policy if exists "адмін змінює" on services;
create policy "адмін змінює" on services for all using (is_admin()) with check (is_admin());
drop policy if exists "адмін змінює" on masters;
create policy "адмін змінює" on masters for all using (is_admin()) with check (is_admin());
drop policy if exists "адмін змінює" on gallery;
create policy "адмін змінює" on gallery for all using (is_admin()) with check (is_admin());
drop policy if exists "адмін змінює" on reviews;
create policy "адмін змінює" on reviews for all using (is_admin()) with check (is_admin());
drop policy if exists "адмін змінює" on settings;
create policy "адмін змінює" on settings for all using (is_admin()) with check (is_admin());
drop policy if exists "лише адмін" on bookings;
create policy "лише адмін" on bookings for all using (is_admin()) with check (is_admin());
drop policy if exists "лише адмін" on giveaway_entries;
create policy "лише адмін" on giveaway_entries for all using (is_admin()) with check (is_admin());

-- =========================================================
-- Запис із сайту. Ціну, імена й номер рахує сервер, а не сторінка.
-- Повертає {"code": "TH-12345"}. Помилки (текст exception):
--   bad_name, bad_phone, bad_comment, bad_services, bad_master, bad_date, bad_time,
--   too_many_phone (3 нові записи на номер), too_many_global (30 за 10 хв), spam, code_busy
-- Повторне надсилання тієї самої заявки (зв'язок обірвався після вставки) повертає той самий код.
-- =========================================================
create or replace function create_booking(
  p_services text[], p_master text, p_date date, p_time text,
  p_name text, p_phone text, p_comment text default '', p_hp text default ''
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_today  date := (now() at time zone 'Europe/Kyiv')::date;
  v_name   text := btrim(coalesce(p_name, ''));
  v_digits text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  v_phone  text;
  v_snap   jsonb;
  v_total  int;
  v_count  int;
  v_master text;
  v_mname  text;
  v_code   text;
  i        int;
begin
  -- приховане поле-пастка: люди його не бачать, боти заповнюють
  if coalesce(p_hp, '') <> '' then raise exception 'spam'; end if;

  if length(v_name) < 2 or length(v_name) > 60 then raise exception 'bad_name'; end if;
  if v_digits ~ '^0\d{9}$' then v_digits := '38' || v_digits; end if;
  if v_digits !~ '^380\d{9}$' then raise exception 'bad_phone'; end if;
  v_phone := '+380 ' || substr(v_digits, 4, 2) || ' ' || substr(v_digits, 6, 3) || ' ' || substr(v_digits, 9, 2) || ' ' || substr(v_digits, 11, 2);
  if length(coalesce(p_comment, '')) > 1000 then raise exception 'bad_comment'; end if;

  -- послуги: 1..10 різних, усі існують і видимі
  if p_services is null or cardinality(p_services) < 1 or cardinality(p_services) > 10 then raise exception 'bad_services'; end if;
  select count(*), coalesce(sum(price), 0),
         jsonb_agg(jsonb_build_object('id', id, 'name', name, 'price', price, 'unit', unit) order by sort)
    into v_count, v_total, v_snap
    from services where id = any (p_services) and visible;
  if v_count <> (select count(distinct s) from unnest(p_services) s) then raise exception 'bad_services'; end if;

  -- майстер: конкретний видимий або «будь-який»
  if p_master = 'any' then
    v_master := null;
    v_mname := 'Будь-який вільний';
  else
    select id, name || case when nick <> '' then ' «' || nick || '»' else '' end
      into v_master, v_mname from masters where id = p_master and visible;
    if v_master is null then raise exception 'bad_master'; end if;
  end if;

  -- ті самі правила, що й календар на сайті: від завтра на 60 днів, понеділок вихідний, 5 слотів
  if p_date is null or p_date < v_today + 1 or p_date > v_today + 60 or extract(isodow from p_date) = 1 then
    raise exception 'bad_date';
  end if;
  if p_time is null or p_time not in ('11:00', '13:00', '15:00', '17:00', '19:00') then raise exception 'bad_time'; end if;

  -- та сама заявка щойно вже прийшла (клієнт натиснув ще раз після обриву зв'язку): віддаємо її код
  select code into v_code from bookings
   where phone = v_phone and date = p_date and time = p_time and master_id is not distinct from v_master
     and status = 'new' and created_at > now() - interval '30 minutes'
   limit 1;
  if v_code is not null then return jsonb_build_object('code', v_code); end if;

  -- проти спаму: не більше 3 нових записів на один номер і 30 записів за 10 хвилин загалом
  if (select count(*) from bookings where phone = v_phone and status = 'new') >= 3 then raise exception 'too_many_phone'; end if;
  if (select count(*) from bookings where created_at > now() - interval '10 minutes') >= 30 then raise exception 'too_many_global'; end if;

  for i in 1..8 loop
    v_code := 'TH-' || (10000 + floor(random() * 90000))::int;
    begin
      insert into bookings (code, services, master_id, master_name, date, time, client_name, phone, comment, total)
      values (v_code, v_snap, v_master, v_mname, p_date, p_time, v_name, v_phone, btrim(coalesce(p_comment, '')), v_total);
      return jsonb_build_object('code', v_code);
    exception when unique_violation then
      null; -- такий номер уже є: пробуємо інший
    end;
  end loop;
  raise exception 'code_busy';
end;
$$;

-- =========================================================
-- Розіграш
-- =========================================================

-- Участь із сайту. Повертає 'ok' або 'already'. Помилки: bad_name, bad_contact, closed, too_many, spam
create or replace function join_giveaway(p_name text, p_contact text, p_hp text default '')
returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_cfg    jsonb;
  v_name   text := btrim(coalesce(p_name, ''));
  v_raw    text := btrim(coalesce(p_contact, ''));
  v_digits text := regexp_replace(coalesce(p_contact, ''), '\D', '', 'g');
  v_key    text;
  v_store  text;
begin
  if coalesce(p_hp, '') <> '' then raise exception 'spam'; end if;
  select data into v_cfg from settings where id = 'giveaway';
  if v_cfg is null
     or coalesce((v_cfg ->> 'enabled')::boolean, false) = false
     or (v_cfg ->> 'ends_at') is null
     or (v_cfg ->> 'ends_at')::timestamptz <= now()
     or (v_cfg -> 'winner') is not null and jsonb_typeof(v_cfg -> 'winner') = 'object' then
    raise exception 'closed';
  end if;
  if length(v_name) < 2 or length(v_name) > 60 then raise exception 'bad_name'; end if;
  if length(v_raw) > 40 then raise exception 'bad_contact'; end if;

  if v_raw ~ '^@[A-Za-z0-9._]{2,30}$' then
    v_key := lower(v_raw);
    v_store := v_raw;
  else
    if v_raw !~ '^[0-9+()\s-]+$' then raise exception 'bad_contact'; end if;
    if v_digits ~ '^0\d{9}$' then v_digits := '38' || v_digits; end if;
    if v_digits !~ '^380\d{9}$' then raise exception 'bad_contact'; end if;
    v_key := '+' || v_digits;
    -- зберігаємо нормалізований номер, а не те, що ввели
    v_store := '+380 ' || substr(v_digits, 4, 2) || ' ' || substr(v_digits, 6, 3) || ' ' || substr(v_digits, 9, 2) || ' ' || substr(v_digits, 11, 2);
  end if;

  if (select count(*) from giveaway_entries where created_at > now() - interval '10 minutes') >= 60 then
    raise exception 'too_many';
  end if;

  insert into giveaway_entries (name, contact, contact_key) values (v_name, v_store, v_key)
  on conflict (contact_key) do nothing;
  return case when found then 'ok' else 'already' end;
end;
$$;

-- Маска контакту для сайту: "@olena_ink" -> "@ole***", "+380671234567" -> "+380*******67"
create or replace function mask_contact(p text) returns text
language sql immutable as $$
  select case
    when p like '@%' then left(p, 4) || '***'
    else '+380*******' || right(regexp_replace(p, '\D', '', 'g'), 2)
  end;
$$;

-- Випадковий переможець (лише адмін). Поточного переможця пропускаємо: повторний виклик = перевибір.
create or replace function draw_giveaway() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_row giveaway_entries;
begin
  if not is_admin() then raise exception 'forbidden'; end if;
  select * into v_row from giveaway_entries where not is_winner order by random() limit 1;
  if v_row.id is null then
    select * into v_row from giveaway_entries order by random() limit 1;
  end if;
  if v_row.id is null then raise exception 'no_entries'; end if;

  update giveaway_entries set is_winner = (id = v_row.id), updated_at = now() where is_winner or id = v_row.id;
  insert into settings (id, data) values ('giveaway', '{}'::jsonb) on conflict (id) do nothing;
  update settings
     set data = jsonb_set(data, '{winner}', jsonb_build_object(
           'name', split_part(v_row.name, ' ', 1),
           'contact_masked', mask_contact(v_row.contact_key),
           'drawn_at', now())),
         updated_at = now()
   where id = 'giveaway';
  return jsonb_build_object('id', v_row.id, 'name', v_row.name, 'contact', v_row.contact);
end;
$$;

-- Налаштування розіграшу з адмінки (лише адмін). Поле winner ігнорується:
-- його пише тільки draw_giveaway, тож паралельний вибір переможця не затреться.
create or replace function update_giveaway_settings(p_patch jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_data jsonb;
begin
  if not is_admin() then raise exception 'forbidden'; end if;
  insert into settings (id, data) values ('giveaway', '{}'::jsonb) on conflict (id) do nothing;
  update settings set data = data || (coalesce(p_patch, '{}'::jsonb) - 'winner'), updated_at = now()
   where id = 'giveaway' returning data into v_data;
  return v_data;
end;
$$;

-- Скинути розіграш (лише адмін): видалити всіх учасників і переможця
create or replace function reset_giveaway() returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not is_admin() then raise exception 'forbidden'; end if;
  delete from giveaway_entries where true;
  update settings set data = data - 'winner', updated_at = now() where id = 'giveaway';
end;
$$;

-- Прибрати переможця з сайту, не чіпаючи учасників (лише адмін)
create or replace function clear_giveaway_winner() returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not is_admin() then raise exception 'forbidden'; end if;
  update giveaway_entries set is_winner = false, updated_at = now() where is_winner;
  update settings set data = data - 'winner', updated_at = now() where id = 'giveaway';
end;
$$;

revoke all on function create_booking(text[], text, date, text, text, text, text, text) from public;
revoke all on function join_giveaway(text, text, text) from public;
revoke all on function draw_giveaway() from public;
revoke all on function reset_giveaway() from public;
revoke all on function clear_giveaway_winner() from public;
revoke all on function update_giveaway_settings(jsonb) from public;
revoke all on function mask_contact(text) from public;
-- Supabase видає anon права на нові функції через default privileges: знімаємо явно (захист у глибину,
-- усередині функцій і так перевіряється is_admin())
revoke execute on function draw_giveaway() from anon;
revoke execute on function reset_giveaway() from anon;
revoke execute on function clear_giveaway_winner() from anon;
revoke execute on function update_giveaway_settings(jsonb) from anon;
revoke execute on function mask_contact(text) from anon;
grant execute on function create_booking(text[], text, date, text, text, text, text, text) to anon, authenticated;
grant execute on function join_giveaway(text, text, text) to anon, authenticated;
grant execute on function draw_giveaway() to authenticated;
grant execute on function reset_giveaway() to authenticated;
grant execute on function clear_giveaway_winner() to authenticated;
grant execute on function update_giveaway_settings(jsonb) to authenticated;
grant execute on function is_admin() to anon, authenticated;

-- =========================================================
-- Фото: Storage → бакет "photos" (Public). Завантажувати й видаляти може лише адмін.
-- Ліміт 5 МБ і лише картинки (адмінка й так стискає фото до WebP).
-- =========================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', true, 5242880, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do update
  set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "photos: адмін завантажує" on storage.objects;
create policy "photos: адмін завантажує" on storage.objects for insert
  with check (bucket_id = 'photos' and public.is_admin());
drop policy if exists "photos: адмін змінює" on storage.objects;
create policy "photos: адмін змінює" on storage.objects for update
  using (bucket_id = 'photos' and public.is_admin());
drop policy if exists "photos: адмін видаляє" on storage.objects;
create policy "photos: адмін видаляє" on storage.objects for delete
  using (bucket_id = 'photos' and public.is_admin());
