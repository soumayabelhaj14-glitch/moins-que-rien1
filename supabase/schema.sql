-- =============================================================
-- Moins que rien — Schéma PostgreSQL (Supabase Cloud)
-- Compatible avec Supabase Auth (table auth.users déjà gérée)
-- À exécuter une seule fois dans l'éditeur SQL de Supabase.
-- =============================================================

-- ---- Extensions ----
create extension if not exists "uuid-ossp";

-- ---- Profils utilisateurs (extension de auth.users) ----
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) >= 2 and char_length(display_name) <= 60),
  avatar_url  text,
  phone       text,
  is_pro      boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
comment on table public.profiles is 'Profil public des vendeurs et acheteurs.';

-- Mise à jour automatique de updated_at
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ---- Associations vérifiées ----
create table if not exists public.associations (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  name        text not null,
  rna_number  text,          -- Numéro RNA (Répertoire National des Associations)
  siret       text,
  verified_at timestamptz,   -- null = en attente de vérification manuelle
  created_at  timestamptz not null default now()
);
comment on table public.associations is 'Associations déclarées. verified_at non null = vérifiée par un admin.';
create index on public.associations(user_id);

-- ---- Annonces ----
create type public.listing_mode as enum ('particulier', 'pro', 'vehicule', 'don', 'don_association');
create type public.listing_status as enum (
  'draft',
  'pending_review',          -- annonce en cours de modération normale
  'pending_price_review',    -- valeur neuve non trouvée → admin doit fixer le prix de référence
  'published',
  'sold',
  'withdrawn',
  'rejected'
);
-- Conditions couvrant les trois moteurs de prix :
--   P2P particulier : neuf-jamais-utilise, comme-neuf, tres-bon, bon, usage, defauts
--   Pro             : neuf-emballe, neuf-deballe, occasion, defauts
--   Véhicule        : excellent, bon, moyen
create type public.item_condition as enum (
  'neuf-jamais-utilise', 'comme-neuf', 'tres-bon', 'bon', 'usage', 'defauts',
  'neuf-emballe', 'neuf-deballe', 'occasion',
  'excellent', 'moyen'
);
create type public.price_confidence as enum ('verified', 'equivalent', 'manual_admin');

create table if not exists public.listings (
  id                      uuid primary key default uuid_generate_v4(),
  seller_id               uuid not null references public.profiles(id) on delete cascade,
  association_id          uuid references public.associations(id),   -- non null si don_association

  -- Mode
  mode                    public.listing_mode not null,
  status                  public.listing_status not null default 'draft',

  -- Description de l'objet
  title                   text not null check (char_length(title) >= 5 and char_length(title) <= 120),
  description             text check (char_length(description) <= 2000),
  category                text not null,
  condition               public.item_condition not null,
  age_years               int check (age_years >= 0 and age_years <= 50),
  ean                     text,
  reference               text,

  -- Tarification (calculée côté serveur et stockée)
  reference_new_value_eur numeric(10,2),         -- valeur neuve de référence trouvée
  price_new_source        text,                  -- source de la valeur neuve
  price_new_confidence    public.price_confidence, -- fiabilité de la source (verified/equivalent/manual_admin)
  price_new_fetched_at    timestamptz,           -- horodatage de la recherche automatique
  max_price_eur           numeric(10,2),         -- plafond calculé par l'engine
  asked_price_eur         numeric(10,2),         -- prix demandé par le vendeur
  warranty_days           int default 0,

  -- Validation administrative du prix neuf (si aucune source fiable)
  admin_reference_price_eur numeric(10,2),       -- prix neuf fixé par un admin
  admin_price_set_by      uuid references public.profiles(id), -- admin qui a validé
  admin_price_set_at      timestamptz,           -- date de validation admin

  -- Garantie véhicule / pro
  pro_config              jsonb,           -- configuration spécifique au mode pro/véhicule

  -- Modération
  rejection_reason        text,
  moderated_by            uuid references public.profiles(id),
  moderated_at            timestamptz,

  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),

  -- Contrainte métier 1 : prix demandé ≤ plafond calculé
  constraint price_within_cap
    check (asked_price_eur is null or max_price_eur is null or asked_price_eur <= max_price_eur),

  -- Contrainte métier 2 : toute annonce payante publiée doit avoir un prix de référence,
  -- un plafond et un prix demandé valides. Les dons (mode 'don' / 'don_association') sont exemptés.
  constraint published_paid_requires_cap
    check (
      status <> 'published'                              -- pas encore publiée
      or mode in ('don', 'don_association')              -- dons : pas de plafond requis
      or (
        reference_new_value_eur is not null              -- prix de référence obligatoire
        and max_price_eur is not null                    -- plafond calculé obligatoire
        and asked_price_eur is not null                  -- prix vendeur obligatoire
        and asked_price_eur <= max_price_eur             -- prix ≤ plafond (redondant mais explicite)
      )
    )
);
comment on table public.listings is 'Annonces P2P, pro, véhicules et dons. Le plafond est vérifié par contrainte SQL.';
comment on column public.listings.max_price_eur is 'Calculé par computeP2P/computePro/computeVehicle côté serveur. Jamais fourni par le client.';

create index on public.listings(seller_id);
create index on public.listings(status);
create index on public.listings(category);
create index on public.listings(mode);

create trigger listings_updated_at
  before update on public.listings
  for each row execute function public.set_updated_at();

-- ---- Verrouillage des champs sensibles côté utilisateur ----
-- Un utilisateur (rôle "authenticated") ne peut jamais écrire directement
-- les champs de tarification, de modération ou d'administration.
-- Seul le service_role (actions serveur Node.js) peut y écrire.
--
-- Champs protégés :
--   reference_new_value_eur, price_new_source, price_new_confidence,
--   price_new_fetched_at, max_price_eur,
--   admin_reference_price_eur, admin_price_set_by, admin_price_set_at,
--   status (transitions vers published/rejected gérées par service_role),
--   moderated_by, moderated_at, rejection_reason
create or replace function public.listings_protect_sensitive_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Autoriser sans restriction pour le service_role (actions serveur)
  if current_setting('role', true) = 'service_role'
     or current_setting('request.jwt.claims', true)::jsonb->>'role' = 'service_role' then
    return new;
  end if;

  -- Pour tout autre rôle (authenticated, anon) : interdire la modification des champs sensibles
  if TG_OP = 'INSERT' then
    if new.reference_new_value_eur is not null
       or new.price_new_source is not null
       or new.price_new_confidence is not null
       or new.price_new_fetched_at is not null
       or new.max_price_eur is not null
       or new.admin_reference_price_eur is not null
       or new.admin_price_set_by is not null
       or new.admin_price_set_at is not null
       or new.moderated_by is not null
       or new.moderated_at is not null
       or new.rejection_reason is not null then
      raise exception 'SECURITY: Les champs de tarification et de modération ne peuvent pas être définis directement par un utilisateur. Code: PROTECTED_FIELDS';
    end if;
  end if;

  if TG_OP = 'UPDATE' then
    if new.reference_new_value_eur is distinct from old.reference_new_value_eur
       or new.price_new_source is distinct from old.price_new_source
       or new.price_new_confidence is distinct from old.price_new_confidence
       or new.price_new_fetched_at is distinct from old.price_new_fetched_at
       or new.max_price_eur is distinct from old.max_price_eur
       or new.admin_reference_price_eur is distinct from old.admin_reference_price_eur
       or new.admin_price_set_by is distinct from old.admin_price_set_by
       or new.admin_price_set_at is distinct from old.admin_price_set_at
       or new.moderated_by is distinct from old.moderated_by
       or new.moderated_at is distinct from old.moderated_at
       or new.rejection_reason is distinct from old.rejection_reason then
      raise exception 'SECURITY: Les champs de tarification et de modération ne peuvent pas être modifiés directement par un utilisateur. Code: PROTECTED_FIELDS';
    end if;
  end if;

  return new;
end;
$$;

create trigger listings_protect_sensitive_fields
  before insert or update on public.listings
  for each row execute function public.listings_protect_sensitive_fields();

-- ---- Photos des annonces ----
create table if not exists public.listing_photos (
  id          uuid primary key default uuid_generate_v4(),
  listing_id  uuid not null references public.listings(id) on delete cascade,
  storage_path text not null,   -- chemin dans Supabase Storage bucket "photos"
  position    smallint not null default 0,
  is_main     boolean not null default false,
  created_at  timestamptz not null default now()
);
create index on public.listing_photos(listing_id);

-- ---- Dons immédiats : réservation ----
create type public.donation_status as enum ('open', 'reserved', 'completed', 'cancelled');

create table if not exists public.donations (
  id              uuid primary key default uuid_generate_v4(),
  listing_id      uuid not null references public.listings(id) on delete cascade,
  beneficiary_id  uuid references public.profiles(id),   -- null si don public
  association_id  uuid references public.associations(id),
  status          public.donation_status not null default 'open',
  reserved_until  timestamptz,
  completed_at    timestamptz,
  created_at      timestamptz not null default now()
);
create index on public.donations(listing_id);
create index on public.donations(beneficiary_id);

-- =============================================================
-- RLS (Row Level Security) — Accès minimaux
-- =============================================================

alter table public.profiles       enable row level security;
alter table public.associations    enable row level security;
alter table public.listings        enable row level security;
alter table public.listing_photos  enable row level security;
alter table public.donations       enable row level security;

-- Profils : lisibles par tous, modifiables uniquement par le propriétaire
create policy "profiles_public_read" on public.profiles for select using (true);
create policy "profiles_owner_write" on public.profiles for all using (auth.uid() = id);

-- Associations : visibles par tous
create policy "assoc_public_read" on public.associations for select using (true);

-- Le propriétaire peut créer et modifier son association, SAUF le champ verified_at
-- (verified_at est contrôlé exclusivement par le service_role côté admin — jamais via RLS utilisateur)
create policy "assoc_owner_insert" on public.associations
  for insert with check (auth.uid() = user_id and verified_at is null);

-- Fonction SECURITY DEFINER : lit verified_at sans passer par RLS (évite la récursion).
-- Appelée depuis la politique assoc_owner_update uniquement.
create or replace function public.get_association_verified_at(assoc_id uuid)
returns timestamptz
language sql
security definer
set search_path = public
as $$
  select verified_at from public.associations where id = assoc_id;
$$;
revoke all on function public.get_association_verified_at(uuid) from public;
grant execute on function public.get_association_verified_at(uuid) to authenticated;

-- Le propriétaire peut modifier son association, mais verified_at est gelé via la fonction SECURITY DEFINER.
-- (Sans SECURITY DEFINER, la sous-requête sur associations déclencherait une récursion RLS infinie.)
create policy "assoc_owner_update" on public.associations
  for update using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and verified_at is not distinct from public.get_association_verified_at(id)
  );

-- Annonces publiées : visibles par tous
create policy "listings_published_read" on public.listings
  for select using (status = 'published' or auth.uid() = seller_id);

-- Le vendeur peut créer ses propres annonces, UNIQUEMENT avec les statuts autorisés.
-- Un utilisateur ne peut jamais s'attribuer directement le statut 'published'.
-- Les transitions de statut (pending_review → published) sont faites par le service_role admin.
create policy "listings_owner_insert" on public.listings
  for insert with check (
    auth.uid() = seller_id
    and status in ('draft', 'pending_review', 'pending_price_review')
  );

-- Le vendeur peut modifier son annonce uniquement quand elle est encore en brouillon
create policy "listings_owner_update" on public.listings
  for update using (auth.uid() = seller_id and status = 'draft')
  with check (
    auth.uid() = seller_id
    -- Le statut reste contrôlé : le vendeur ne peut pas auto-valider son annonce
    and status in ('draft', 'pending_review', 'pending_price_review', 'withdrawn')
  );

-- Le vendeur peut retirer (withdrawn) sa propre annonce publiée
create policy "listings_owner_withdraw" on public.listings
  for update using (auth.uid() = seller_id and status = 'published')
  with check (auth.uid() = seller_id and status = 'withdrawn');

-- Photos : mêmes règles que l'annonce parente
create policy "photos_read" on public.listing_photos
  for select using (
    exists (
      select 1 from public.listings l
      where l.id = listing_id and (l.status = 'published' or l.seller_id = auth.uid())
    )
  );
create policy "photos_owner_write" on public.listing_photos
  for all using (
    exists (
      select 1 from public.listings l
      where l.id = listing_id and l.seller_id = auth.uid()
    )
  );

-- =============================================================
-- Sécurité donations : accès strictement contrôlé
-- =============================================================
--
-- PRINCIPES :
--   1. La table donations est FERMÉE aux clients (anon/authenticated).
--      Toute lecture et toute écriture passent par le service_role (Node.js).
--   2. Une vue publique donations_public expose UNIQUEMENT listing_id et status.
--      Elle ne contient JAMAIS beneficiary_id ni association_id.
--   3. L'update (réservation) est effectué par une fonction SECURITY DEFINER
--      reserve_donation() qui vérifie l'authentification, les droits et l'atomicité.
--      Aucun client ne peut appeler INSERT ou UPDATE directement.

-- Révoquer tout accès direct des rôles anon et authenticated
revoke all on public.donations from anon, authenticated;

-- Le service_role garde un accès complet (Node.js uniquement)
grant all on public.donations to service_role;

-- Vue publique : uniquement listing_id et status (aucune PII)
create or replace view public.donations_public
  with (security_invoker = false)   -- exécutée en tant que propriétaire du schéma
as
  select
    d.listing_id,
    d.status
  from public.donations d
  join public.listings l on l.id = d.listing_id
  where l.status = 'published';

-- Accorder la lecture sur la vue (pas sur la table)
grant select on public.donations_public to anon, authenticated;

-- =============================================================
-- Fonction SECURITY DEFINER : réservation atomique d'un don
-- =============================================================
--
-- Paramètres :
--   p_listing_id    UUID de l'annonce don
--   p_user_id       UUID de l'utilisateur authentifié (vérifié par Node.js avant l'appel)
--   p_association_id UUID de l'association (nullable — requis si don_association)
--
-- Retour : JSON { ok, donation_id?, error? }
--
-- Atomicité :
--   UPDATE … WHERE status = 'open' est atomique : PostgreSQL pose un verrou
--   exclusif sur la ligne pendant la transaction. Deux appels concurrents ne
--   peuvent pas tous les deux réussir — le second UPDATE ne trouve plus status='open'.
--
-- NE PAS exposer cette fonction à anon. Seul authenticated peut l'appeler,
-- et Node.js vérifie l'identité avant de transmettre p_user_id.
create or replace function public.reserve_donation(
  p_listing_id    uuid,
  p_user_id       uuid,
  p_association_id uuid default null
)
returns json
language plpgsql
security definer   -- exécutée avec les droits du propriétaire, pas du client
set search_path = public
as $$
declare
  v_listing    record;
  v_donation   record;
  v_assoc      record;
  v_updated_id uuid;
begin
  -- 1. Vérifier que l'annonce existe, est publiée et est un don
  select id, mode, status into v_listing
  from public.listings
  where id = p_listing_id;

  if not found then
    return json_build_object('ok', false, 'message', 'Annonce introuvable.', 'code', 'not_found');
  end if;
  if v_listing.status <> 'published' then
    return json_build_object('ok', false, 'message', 'Cette annonce n''est plus disponible.', 'code', 'not_found');
  end if;
  if v_listing.mode not in ('don', 'don_association') then
    return json_build_object('ok', false, 'message', 'Cette annonce n''est pas un don.', 'code', 'not_found');
  end if;

  -- 2. Pour les dons d'association : vérifier que l'association est vérifiée et appartient à l'utilisateur
  if v_listing.mode = 'don_association' then
    if p_association_id is null then
      return json_build_object('ok', false, 'message', 'Ce don est réservé aux associations vérifiées.', 'code', 'not_verified_assoc');
    end if;
    select id, verified_at, user_id into v_assoc
    from public.associations
    where id = p_association_id;

    if not found then
      return json_build_object('ok', false, 'message', 'Association introuvable.', 'code', 'not_verified_assoc');
    end if;
    if v_assoc.verified_at is null then
      return json_build_object('ok', false, 'message', 'Votre association n''est pas encore vérifiée.', 'code', 'not_verified_assoc');
    end if;
    if v_assoc.user_id <> p_user_id then
      return json_build_object('ok', false, 'message', 'Vous n''êtes pas le représentant de cette association.', 'code', 'auth');
    end if;
  end if;

  -- 3. Réservation atomique : UPDATE conditionnel sur status = 'open'
  --    PostgreSQL verrouille la ligne (FOR UPDATE implicite dans UPDATE).
  --    Si status <> 'open', aucune ligne n'est mise à jour → doublon détecté.
  update public.donations
  set
    beneficiary_id  = p_user_id,
    association_id  = p_association_id,
    status          = 'reserved',
    reserved_until  = now() + interval '7 days'
  where
    listing_id = p_listing_id
    and status = 'open'
  returning id into v_updated_id;

  if v_updated_id is null then
    -- Vérifier si c'est parce que c'est déjà réservé
    select id into v_donation from public.donations
    where listing_id = p_listing_id and status in ('reserved', 'completed');
    if found then
      return json_build_object('ok', false, 'message', 'Ce don a déjà été réservé.', 'code', 'already_reserved');
    end if;
    -- Aucune ligne 'open' n'existe (don sans initialisation)
    return json_build_object('ok', false, 'message', 'Ce don n''est pas disponible.', 'code', 'not_found');
  end if;

  return json_build_object('ok', true, 'donation_id', v_updated_id);
end;
$$;

-- Révoquer l'accès public, accorder uniquement à authenticated
revoke all on function public.reserve_donation(uuid, uuid, uuid) from public;
grant execute on function public.reserve_donation(uuid, uuid, uuid) to authenticated;

-- Note : la politique donations_insert ci-dessous est SUPPRIMÉE.
-- Les insertions (création de la ligne 'open' à la publication) ne se font
-- QUE via service_role depuis Node.js (submit-listing.ts).
-- Les mises à jour (réservation) se font UNIQUEMENT via reserve_donation().
-- Un client authentifié ne peut ni insérer ni mettre à jour directement.

-- =============================================================
-- Trigger : créer un profil automatiquement à l'inscription
-- =============================================================
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =============================================================
-- Storage : bucket "photos" pour les photos d'annonces
-- =============================================================
-- À exécuter dans l'éditeur SQL Supabase (nécessite le schéma "storage").
-- Le bucket est privé par défaut — les URLs signées sont utilisées pour l'accès public.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'photos',
  'photos',
  false,  -- Accès contrôlé par RLS et URL signées
  5242880,  -- 5 Mo max par fichier
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

-- Les vendeurs peuvent uploader dans leur propre dossier (listing_id/*)
create policy "photos_upload" on storage.objects
  for insert with check (
    bucket_id = 'photos'
    and auth.role() = 'authenticated'
    -- Le chemin doit commencer par l'ID d'une annonce appartenant à l'utilisateur
    and exists (
      select 1 from public.listings l
      where l.id::text = split_part(name, '/', 1)
        and l.seller_id = auth.uid()
        and l.status in ('draft', 'pending_review', 'pending_price_review')
    )
  );

-- Lecture accessible aux propriétaires et aux acheteurs potentiels (via URL signée)
create policy "photos_read_owner" on storage.objects
  for select using (
    bucket_id = 'photos'
    and (
      auth.role() = 'service_role'
      or exists (
        select 1 from public.listings l
        where l.id::text = split_part(name, '/', 1)
          and (l.status = 'published' or l.seller_id = auth.uid())
      )
    )
  );

-- Suppression réservée au propriétaire
create policy "photos_delete_owner" on storage.objects
  for delete using (
    bucket_id = 'photos'
    and auth.role() = 'authenticated'
    and exists (
      select 1 from public.listings l
      where l.id::text = split_part(name, '/', 1)
        and l.seller_id = auth.uid()
    )
  );
