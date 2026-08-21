-- ---------------------------------------------------------------------------
-- Baseline schema, captured from production on 2026-08-21.
--
-- WHY THIS EXISTS
--
-- The files in ../migrations do not describe this database. Replaying them into
-- an empty Postgres produces a schema that differs from production in 66
-- columns: age_groups gets min_age/max_age where production has
-- min_age_months/max_age_months/description/icon_url, admin_users gets
-- user_id/permissions where production has email/name/password_hash, and
-- registrations has no child_name or child_dob at all.
--
-- 001_all_tables.sql is the root of it. It belongs to a different repository
-- and arrived here with the commits that also brought 027_site_branding and
-- 028_page_headings. It describes a different application.
--
-- Several early migrations (002_admin_extras, 002_chatbot, 006_chatbot_analytics)
-- also reference columns production no longer has, so the history cannot be
-- replayed even from a correct starting point.
--
-- HOW TO REBUILD
--
--   createdb littlesmarties
--   psql -v ON_ERROR_STOP=1 -f apps/backend/baseline/000_baseline_schema.sql
--   # then restore data from a backup.sh dump, or apply migrations numbered
--   # above 049 as they are written
--
-- Verified: this file alone reproduces production's 439 columns across 45
-- tables exactly - nothing missing, nothing extra.
--
-- NOT IN ../migrations DELIBERATELY. infra/scripts/deploy.sh applies
-- migrations/*.sql on every deploy; this file uses bare CREATE TABLE and would
-- fail against the live database every time.
--
-- Schema only. No rows, no roles, no ownership.
-- ---------------------------------------------------------------------------
--
-- PostgreSQL database dump
--

\restrict INGy15iynAi8Ul8U2l36y6xRZcmUnvo01p9zIPm42rysbecrt597bmyYBBgiCrj

-- Dumped from database version 16.14
-- Dumped by pg_dump version 16.14

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: pg_trgm; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;


--
-- Name: EXTENSION pg_trgm; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION pg_trgm IS 'text similarity measurement and index searching based on trigrams';


--
-- Name: grant_new_permission_to_admin(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.grant_new_permission_to_admin() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  INSERT INTO role_permissions (role_id, permission_id)
  SELECT r.id, NEW.id FROM roles r WHERE r.name = 'admin'
  ON CONFLICT DO NOTHING;
  RETURN NULL;
END;
$$;


--
-- Name: sync_event_registration_count(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_event_registration_count() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF TG_OP <> 'INSERT' AND OLD.event_id IS NOT NULL THEN
    UPDATE news_events SET current_registrations = (
      SELECT COUNT(*) FROM registrations r WHERE r.event_id = OLD.event_id AND COALESCE(r.status, 'pending') <> 'cancelled'
    ) WHERE id = OLD.event_id;
  END IF;

  IF TG_OP <> 'DELETE' AND NEW.event_id IS NOT NULL THEN
    UPDATE news_events SET current_registrations = (
      SELECT COUNT(*) FROM registrations r WHERE r.event_id = NEW.event_id AND COALESCE(r.status, 'pending') <> 'cancelled'
    ) WHERE id = NEW.event_id;
  END IF;

  RETURN NULL;
END;
$$;


--
-- Name: update_events_timestamp(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_events_timestamp() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: update_news_timestamp(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_news_timestamp() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: update_page_content_sections_timestamp(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_page_content_sections_timestamp() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: update_testimonials_timestamp(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_testimonials_timestamp() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: update_video_uploads_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_video_uploads_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: admin_activity_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admin_activity_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    admin_id uuid,
    action character varying(50),
    entity_type character varying(50),
    entity_id uuid,
    old_values jsonb,
    new_values jsonb,
    ip_address character varying(45),
    user_agent text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    admin_user_id uuid,
    details jsonb
);


--
-- Name: admin_users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admin_users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email character varying(255) NOT NULL,
    password_hash character varying(255) NOT NULL,
    name character varying(255) NOT NULL,
    role character varying(50) DEFAULT 'admin'::character varying,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: age_group_images; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.age_group_images (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    age_group_slug character varying(100) NOT NULL,
    media_id uuid,
    image_type character varying(50) DEFAULT 'gallery'::character varying NOT NULL,
    sort_order integer DEFAULT 0,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    deleted_at timestamp without time zone
);


--
-- Name: age_groups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.age_groups (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(100) NOT NULL,
    description text,
    min_age_months integer,
    max_age_months integer,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    slug character varying(100),
    image_url character varying(512),
    sort_order integer DEFAULT 0 NOT NULL,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    deleted_at timestamp without time zone,
    capacity integer,
    icon_url character varying(500),
    CONSTRAINT age_groups_capacity_positive CHECK (((capacity IS NULL) OR (capacity > 0)))
);


--
-- Name: COLUMN age_groups.capacity; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.age_groups.capacity IS 'Maximum children this room can hold. NULL means not yet recorded, which is
   not the same as unlimited — the capacity treemap skips these rather than
   treating them as having room.';


--
-- Name: anomalies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.anomalies (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    metric character varying(64) NOT NULL,
    observed_on date NOT NULL,
    expected_value numeric(12,3) NOT NULL,
    actual_value numeric(12,3) NOT NULL,
    score numeric(12,3) NOT NULL,
    direction character varying(8) NOT NULL,
    severity character varying(8) NOT NULL,
    sample_days integer NOT NULL,
    acknowledged_at timestamp without time zone,
    acknowledged_by uuid,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    CONSTRAINT anomalies_direction_check CHECK (((direction)::text = ANY ((ARRAY['above'::character varying, 'below'::character varying])::text[]))),
    CONSTRAINT anomalies_severity_check CHECK (((severity)::text = ANY ((ARRAY['low'::character varying, 'medium'::character varying, 'high'::character varying])::text[])))
);


--
-- Name: COLUMN anomalies.score; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.anomalies.score IS 'Distance from the median in MADs, not a standard z-score. Counts this small
   are dominated by single events, and a mean/stddev score reports the first
   booking a nursery ever takes as a critical anomaly.';


--
-- Name: chatbot_analytics; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chatbot_analytics (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    conversation_id uuid,
    event_type character varying(50) NOT NULL,
    event_data jsonb,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: chatbot_appointment_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chatbot_appointment_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    conversation_id uuid,
    visitor_name character varying(255) NOT NULL,
    visitor_email character varying(255) NOT NULL,
    visitor_phone character varying(20) NOT NULL,
    preferred_date date,
    preferred_time time without time zone,
    child_age character varying(50),
    message text,
    status character varying(50) DEFAULT 'pending'::character varying,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: chatbot_conversations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chatbot_conversations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    visitor_name character varying(255),
    visitor_email character varying(255),
    visitor_phone character varying(20),
    status character varying(50) DEFAULT 'active'::character varying,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: chatbot_faq; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chatbot_faq (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    category character varying(100) NOT NULL,
    question text NOT NULL,
    answer text NOT NULL,
    keywords character varying(500),
    priority integer DEFAULT 0,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: chatbot_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chatbot_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    conversation_id uuid NOT NULL,
    sender character varying(50) NOT NULL,
    message text NOT NULL,
    message_type character varying(50) DEFAULT 'text'::character varying,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: chatbot_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chatbot_settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    setting_key character varying(255) NOT NULL,
    setting_value text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: dashboard_preferences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dashboard_preferences (
    user_id uuid NOT NULL,
    widget_order jsonb DEFAULT '[]'::jsonb NOT NULL,
    hidden_widgets jsonb DEFAULT '[]'::jsonb NOT NULL,
    theme character varying(10) DEFAULT 'dark'::character varying NOT NULL,
    updated_at timestamp without time zone DEFAULT now(),
    CONSTRAINT dashboard_preferences_arrays CHECK (((jsonb_typeof(widget_order) = 'array'::text) AND (jsonb_typeof(hidden_widgets) = 'array'::text))),
    CONSTRAINT dashboard_preferences_theme CHECK (((theme)::text = ANY ((ARRAY['light'::character varying, 'dark'::character varying, 'system'::character varying])::text[])))
);


--
-- Name: facilities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.facilities (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    icon character varying(50),
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    image_url character varying(512),
    location character varying(255),
    meta_title character varying(255),
    meta_description text,
    sort_order integer DEFAULT 0 NOT NULL,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    deleted_at timestamp without time zone,
    detailed_description text
);


--
-- Name: facility_features; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.facility_features (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    facility_id uuid NOT NULL,
    feature_text character varying(255) NOT NULL,
    feature_type character varying(20) DEFAULT 'feature'::character varying NOT NULL,
    display_order integer DEFAULT 0 NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: facility_images; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.facility_images (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    facility_id uuid NOT NULL,
    media_id uuid,
    is_primary boolean DEFAULT false NOT NULL,
    display_order integer DEFAULT 0 NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    deleted_at timestamp without time zone
);


--
-- Name: faqs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.faqs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    question text NOT NULL,
    answer text NOT NULL,
    category character varying(50),
    display_order integer DEFAULT 0 NOT NULL,
    published boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_by uuid,
    deleted_at timestamp without time zone,
    CONSTRAINT faqs_answer_not_blank CHECK ((btrim(answer) <> ''::text)),
    CONSTRAINT faqs_question_not_blank CHECK ((btrim(question) <> ''::text))
);


--
-- Name: filter_presets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.filter_presets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    screen character varying(50) NOT NULL,
    name character varying(80) NOT NULL,
    filters jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp without time zone DEFAULT now(),
    CONSTRAINT filter_presets_object CHECK ((jsonb_typeof(filters) = 'object'::text))
);


--
-- Name: gallery_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gallery_categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(100) NOT NULL,
    description text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    slug character varying(120),
    sort_order integer DEFAULT 0 NOT NULL,
    deleted_at timestamp without time zone
);


--
-- Name: gallery_images; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gallery_images (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    category_id uuid,
    image_url character varying(500) NOT NULL,
    title character varying(255),
    description text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    alt_text character varying(255),
    sort_order integer DEFAULT 0 NOT NULL,
    is_featured boolean DEFAULT false NOT NULL,
    deleted_at timestamp without time zone,
    is_video boolean DEFAULT false
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email character varying(255) NOT NULL,
    password_hash character varying(255) NOT NULL,
    name character varying(255) NOT NULL,
    role character varying(50) DEFAULT 'user'::character varying NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    phone character varying(20),
    is_active boolean DEFAULT true,
    password_reset_required boolean DEFAULT false NOT NULL,
    last_login_at timestamp without time zone
);


--
-- Name: grafana_users; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.grafana_users AS
 SELECT id,
    role,
    is_active,
    last_login_at,
    created_at
   FROM public.users;


--
-- Name: login_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.login_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    succeeded boolean DEFAULT true NOT NULL,
    failure_reason character varying(40),
    ip_address character varying(64),
    user_agent text,
    device_type character varying(20),
    browser character varying(40),
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: media; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.media (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title character varying(255) NOT NULL,
    description text,
    url character varying(512) NOT NULL,
    cloudinary_id character varying(255),
    cloudinary_public_id character varying(255),
    file_size integer,
    mime_type character varying(100),
    width integer,
    height integer,
    alt_text character varying(255),
    category character varying(50) DEFAULT 'pages'::character varying NOT NULL,
    uploaded_by uuid,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    deleted_at timestamp without time zone
);


--
-- Name: news; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.news (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title character varying(255) NOT NULL,
    description text NOT NULL,
    published_date date NOT NULL,
    is_published boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    deleted_at timestamp without time zone,
    image_url character varying(2048),
    cloudinary_id character varying(500),
    uploaded_by uuid
);


--
-- Name: news_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.news_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title character varying(255) NOT NULL,
    description text,
    event_date date,
    event_time time without time zone,
    location character varying(255),
    image_url character varying(500),
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    end_time time without time zone,
    event_type character varying(40) DEFAULT 'General'::character varying NOT NULL,
    age_groups character varying(255),
    is_published boolean DEFAULT true NOT NULL,
    deleted_at timestamp without time zone,
    capacity integer,
    current_registrations integer DEFAULT 0 NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    cloudinary_id character varying(500),
    latitude numeric(10,8),
    longitude numeric(11,8),
    created_by uuid,
    uploaded_by uuid,
    CONSTRAINT news_events_capacity_positive CHECK (((capacity IS NULL) OR (capacity >= 0))),
    CONSTRAINT news_events_registrations_positive CHECK ((current_registrations >= 0))
);


--
-- Name: notification_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notification_settings (
    id boolean DEFAULT true NOT NULL,
    email_parent_registration boolean DEFAULT true NOT NULL,
    email_parent_booking boolean DEFAULT true NOT NULL,
    email_admin_registration boolean DEFAULT true NOT NULL,
    email_admin_booking boolean DEFAULT true NOT NULL,
    sms_admin_registration boolean DEFAULT false NOT NULL,
    sms_admin_booking boolean DEFAULT false NOT NULL,
    digest_frequency character varying(20) DEFAULT 'immediate'::character varying NOT NULL,
    updated_at timestamp without time zone DEFAULT now(),
    updated_by uuid,
    CONSTRAINT notification_settings_digest_frequency CHECK (((digest_frequency)::text = ANY ((ARRAY['immediate'::character varying, 'hourly'::character varying, 'daily'::character varying, 'weekly'::character varying])::text[]))),
    CONSTRAINT notification_settings_single_row CHECK (id)
);


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    type character varying(50) NOT NULL,
    title character varying(255) NOT NULL,
    message text,
    related_id uuid,
    action_url character varying(500),
    read_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now(),
    CONSTRAINT notifications_action_url_relative CHECK (((action_url IS NULL) OR ((action_url)::text ~ '^/[a-zA-Z0-9/_?=&.-]*$'::text)))
);


--
-- Name: page_analytics; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.page_analytics (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    page_path character varying(500) NOT NULL,
    visitor_id character varying(255),
    user_agent text,
    referrer text,
    country character varying(100),
    device_type character varying(50),
    browser character varying(100),
    session_duration integer,
    page_id uuid,
    visitor_ip character varying(64),
    referer text,
    session_id character varying(64),
    visited_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: page_content_sections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.page_content_sections (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    page_id uuid NOT NULL,
    section_key character varying(100) NOT NULL,
    title character varying(255),
    content text,
    is_visible boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    deleted_at timestamp without time zone,
    created_by uuid,
    updated_by uuid,
    published_at timestamp without time zone,
    scheduled_publish_at timestamp without time zone,
    CONSTRAINT page_content_sections_schedule_after_publish CHECK (((published_at IS NULL) OR (scheduled_publish_at IS NULL) OR (scheduled_publish_at >= published_at)))
);


--
-- Name: page_media; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.page_media (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    page_slug character varying(100) NOT NULL,
    media_id uuid,
    media_section character varying(100) DEFAULT 'hero'::character varying NOT NULL,
    sort_order integer DEFAULT 0,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    deleted_at timestamp without time zone
);


--
-- Name: pages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title character varying(255) NOT NULL,
    slug character varying(255) NOT NULL,
    content text,
    meta_title character varying(255),
    meta_description text,
    meta_keywords text,
    og_image text,
    status character varying(20) DEFAULT 'draft'::character varying NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_by uuid,
    updated_by uuid,
    description text,
    path character varying(500),
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    deleted_at timestamp without time zone
);


--
-- Name: partners; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.partners (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(255) NOT NULL,
    logo_url character varying(512),
    cloudinary_id character varying(255),
    website_url character varying(512),
    description text,
    sort_order integer DEFAULT 0,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    deleted_at timestamp without time zone
);


--
-- Name: permissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.permissions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(100) NOT NULL,
    description text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: refresh_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.refresh_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    token character varying(500) NOT NULL,
    expires_at timestamp without time zone NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: registrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.registrations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    child_name character varying(255) NOT NULL,
    child_dob date NOT NULL,
    parent_name character varying(255) NOT NULL,
    parent_email character varying(255) NOT NULL,
    parent_phone character varying(20) NOT NULL,
    age_group_id uuid,
    message text,
    status character varying(50) DEFAULT 'pending'::character varying,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    event_id uuid,
    deleted_at timestamp without time zone
);


--
-- Name: role_permissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.role_permissions (
    role_id uuid NOT NULL,
    permission_id uuid NOT NULL
);


--
-- Name: roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.roles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(50) NOT NULL,
    description text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: site_branding; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.site_branding (
    id integer DEFAULT 1 NOT NULL,
    site_name character varying(200) DEFAULT 'Little Smarties'::character varying NOT NULL,
    tagline character varying(300),
    primary_color character varying(7) DEFAULT '#1e40af'::character varying NOT NULL,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_by uuid,
    font_family character varying(40) DEFAULT 'default'::character varying NOT NULL,
    base_font_size integer DEFAULT 16 NOT NULL,
    CONSTRAINT site_branding_base_font_size_check CHECK (((base_font_size >= 12) AND (base_font_size <= 24))),
    CONSTRAINT site_branding_font_family_check CHECK (((font_family)::text = ANY ((ARRAY['default'::character varying, 'system'::character varying, 'georgia'::character varying, 'times'::character varying, 'arial'::character varying, 'verdana'::character varying, 'trebuchet'::character varying, 'comic'::character varying])::text[]))),
    CONSTRAINT site_branding_id_check CHECK ((id = 1)),
    CONSTRAINT site_branding_primary_color_check CHECK (((primary_color)::text ~ '^#[0-9a-fA-F]{6}$'::text))
);


--
-- Name: site_footer; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.site_footer (
    id integer DEFAULT 1 NOT NULL,
    company_name character varying(200) DEFAULT 'Little Smarties'::character varying NOT NULL,
    logo_url character varying(2048),
    phone character varying(50),
    email text,
    address text,
    hours text,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_by uuid,
    CONSTRAINT site_footer_company_name_not_blank CHECK ((btrim((company_name)::text) <> ''::text)),
    CONSTRAINT site_footer_singleton CHECK ((id = 1))
);


--
-- Name: site_media; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.site_media (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    media_key character varying(100) NOT NULL,
    media_id uuid,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: social_links; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.social_links (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    platform character varying(30) NOT NULL,
    url text NOT NULL,
    display_order integer DEFAULT 0 NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at timestamp without time zone,
    CONSTRAINT social_links_platform_check CHECK (((platform)::text = ANY ((ARRAY['facebook'::character varying, 'instagram'::character varying, 'linkedin'::character varying, 'tiktok'::character varying, 'snapchat'::character varying, 'twitter'::character varying, 'youtube'::character varying, 'whatsapp'::character varying])::text[])))
);


--
-- Name: staff; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.staff (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(200) NOT NULL,
    role character varying(100),
    bio text,
    photo_url character varying(500),
    display_order integer DEFAULT 0 NOT NULL,
    published boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_by uuid,
    deleted_at timestamp without time zone,
    CONSTRAINT staff_name_not_blank CHECK ((btrim((name)::text) <> ''::text))
);


--
-- Name: testimonials; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.testimonials (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    author_name character varying(255) NOT NULL,
    author_title character varying(255),
    author_image_url character varying(2048),
    cloudinary_id character varying(500),
    quote text NOT NULL,
    rating integer,
    is_published boolean DEFAULT false NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    page_slug character varying(100),
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    deleted_at timestamp without time zone,
    created_by uuid,
    uploaded_by uuid,
    CONSTRAINT testimonials_rating_check CHECK (((rating >= 1) AND (rating <= 5)))
);


--
-- Name: tour_bookings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tour_bookings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    visitor_name character varying(255) NOT NULL,
    visitor_email character varying(255) NOT NULL,
    visitor_phone character varying(20) NOT NULL,
    preferred_date date NOT NULL,
    preferred_time time without time zone NOT NULL,
    number_of_children integer,
    message text,
    status character varying(50) DEFAULT 'pending'::character varying,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    deleted_at timestamp without time zone
);


--
-- Name: video_uploads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.video_uploads (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title character varying(255) NOT NULL,
    description text,
    video_url character varying(500) NOT NULL,
    thumbnail_url character varying(500),
    cloudinary_public_id character varying(255) NOT NULL,
    cloudinary_signature character varying(255),
    duration_seconds integer,
    uploaded_by uuid,
    status character varying(50) DEFAULT 'active'::character varying,
    view_count integer DEFAULT 0,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    deleted_at timestamp without time zone
);


--
-- Name: youtube_videos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.youtube_videos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title character varying(255) NOT NULL,
    description text,
    youtube_url text NOT NULL,
    youtube_id character varying(20) NOT NULL,
    thumbnail_url text,
    display_order integer DEFAULT 0 NOT NULL,
    uploaded_by uuid,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at timestamp without time zone
);


--
-- Name: admin_activity_log admin_activity_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_activity_log
    ADD CONSTRAINT admin_activity_log_pkey PRIMARY KEY (id);


--
-- Name: admin_users admin_users_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_users
    ADD CONSTRAINT admin_users_email_key UNIQUE (email);


--
-- Name: admin_users admin_users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_users
    ADD CONSTRAINT admin_users_pkey PRIMARY KEY (id);


--
-- Name: age_group_images age_group_images_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.age_group_images
    ADD CONSTRAINT age_group_images_pkey PRIMARY KEY (id);


--
-- Name: age_groups age_groups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.age_groups
    ADD CONSTRAINT age_groups_pkey PRIMARY KEY (id);


--
-- Name: anomalies anomalies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.anomalies
    ADD CONSTRAINT anomalies_pkey PRIMARY KEY (id);


--
-- Name: chatbot_analytics chatbot_analytics_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chatbot_analytics
    ADD CONSTRAINT chatbot_analytics_pkey PRIMARY KEY (id);


--
-- Name: chatbot_appointment_requests chatbot_appointment_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chatbot_appointment_requests
    ADD CONSTRAINT chatbot_appointment_requests_pkey PRIMARY KEY (id);


--
-- Name: chatbot_conversations chatbot_conversations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chatbot_conversations
    ADD CONSTRAINT chatbot_conversations_pkey PRIMARY KEY (id);


--
-- Name: chatbot_faq chatbot_faq_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chatbot_faq
    ADD CONSTRAINT chatbot_faq_pkey PRIMARY KEY (id);


--
-- Name: chatbot_messages chatbot_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chatbot_messages
    ADD CONSTRAINT chatbot_messages_pkey PRIMARY KEY (id);


--
-- Name: chatbot_settings chatbot_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chatbot_settings
    ADD CONSTRAINT chatbot_settings_pkey PRIMARY KEY (id);


--
-- Name: chatbot_settings chatbot_settings_setting_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chatbot_settings
    ADD CONSTRAINT chatbot_settings_setting_key_key UNIQUE (setting_key);


--
-- Name: dashboard_preferences dashboard_preferences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dashboard_preferences
    ADD CONSTRAINT dashboard_preferences_pkey PRIMARY KEY (user_id);


--
-- Name: facilities facilities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.facilities
    ADD CONSTRAINT facilities_pkey PRIMARY KEY (id);


--
-- Name: facility_features facility_features_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.facility_features
    ADD CONSTRAINT facility_features_pkey PRIMARY KEY (id);


--
-- Name: facility_images facility_images_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.facility_images
    ADD CONSTRAINT facility_images_pkey PRIMARY KEY (id);


--
-- Name: faqs faqs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.faqs
    ADD CONSTRAINT faqs_pkey PRIMARY KEY (id);


--
-- Name: filter_presets filter_presets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.filter_presets
    ADD CONSTRAINT filter_presets_pkey PRIMARY KEY (id);


--
-- Name: gallery_categories gallery_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gallery_categories
    ADD CONSTRAINT gallery_categories_pkey PRIMARY KEY (id);


--
-- Name: gallery_images gallery_images_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gallery_images
    ADD CONSTRAINT gallery_images_pkey PRIMARY KEY (id);


--
-- Name: login_history login_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.login_history
    ADD CONSTRAINT login_history_pkey PRIMARY KEY (id);


--
-- Name: media media_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media
    ADD CONSTRAINT media_pkey PRIMARY KEY (id);


--
-- Name: news_events news_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.news_events
    ADD CONSTRAINT news_events_pkey PRIMARY KEY (id);


--
-- Name: news news_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.news
    ADD CONSTRAINT news_pkey PRIMARY KEY (id);


--
-- Name: notification_settings notification_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_settings
    ADD CONSTRAINT notification_settings_pkey PRIMARY KEY (id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: page_analytics page_analytics_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.page_analytics
    ADD CONSTRAINT page_analytics_pkey PRIMARY KEY (id);


--
-- Name: page_content_sections page_content_sections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.page_content_sections
    ADD CONSTRAINT page_content_sections_pkey PRIMARY KEY (id);


--
-- Name: page_media page_media_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.page_media
    ADD CONSTRAINT page_media_pkey PRIMARY KEY (id);


--
-- Name: pages pages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pages
    ADD CONSTRAINT pages_pkey PRIMARY KEY (id);


--
-- Name: partners partners_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.partners
    ADD CONSTRAINT partners_pkey PRIMARY KEY (id);


--
-- Name: permissions permissions_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.permissions
    ADD CONSTRAINT permissions_name_key UNIQUE (name);


--
-- Name: permissions permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.permissions
    ADD CONSTRAINT permissions_pkey PRIMARY KEY (id);


--
-- Name: refresh_tokens refresh_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refresh_tokens
    ADD CONSTRAINT refresh_tokens_pkey PRIMARY KEY (id);


--
-- Name: refresh_tokens refresh_tokens_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refresh_tokens
    ADD CONSTRAINT refresh_tokens_token_key UNIQUE (token);


--
-- Name: registrations registrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.registrations
    ADD CONSTRAINT registrations_pkey PRIMARY KEY (id);


--
-- Name: role_permissions role_permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_permissions
    ADD CONSTRAINT role_permissions_pkey PRIMARY KEY (role_id, permission_id);


--
-- Name: roles roles_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_name_key UNIQUE (name);


--
-- Name: roles roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_pkey PRIMARY KEY (id);


--
-- Name: site_branding site_branding_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.site_branding
    ADD CONSTRAINT site_branding_pkey PRIMARY KEY (id);


--
-- Name: site_footer site_footer_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.site_footer
    ADD CONSTRAINT site_footer_pkey PRIMARY KEY (id);


--
-- Name: site_media site_media_media_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.site_media
    ADD CONSTRAINT site_media_media_key_key UNIQUE (media_key);


--
-- Name: site_media site_media_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.site_media
    ADD CONSTRAINT site_media_pkey PRIMARY KEY (id);


--
-- Name: social_links social_links_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.social_links
    ADD CONSTRAINT social_links_pkey PRIMARY KEY (id);


--
-- Name: staff staff_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff
    ADD CONSTRAINT staff_pkey PRIMARY KEY (id);


--
-- Name: testimonials testimonials_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testimonials
    ADD CONSTRAINT testimonials_pkey PRIMARY KEY (id);


--
-- Name: tour_bookings tour_bookings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tour_bookings
    ADD CONSTRAINT tour_bookings_pkey PRIMARY KEY (id);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: video_uploads video_uploads_cloudinary_public_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.video_uploads
    ADD CONSTRAINT video_uploads_cloudinary_public_id_key UNIQUE (cloudinary_public_id);


--
-- Name: video_uploads video_uploads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.video_uploads
    ADD CONSTRAINT video_uploads_pkey PRIMARY KEY (id);


--
-- Name: youtube_videos youtube_videos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.youtube_videos
    ADD CONSTRAINT youtube_videos_pkey PRIMARY KEY (id);


--
-- Name: idx_admin_activity_log_action; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_admin_activity_log_action ON public.admin_activity_log USING btree (action);


--
-- Name: idx_admin_activity_log_admin_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_admin_activity_log_admin_user ON public.admin_activity_log USING btree (admin_user_id);


--
-- Name: idx_age_group_images_live; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_age_group_images_live ON public.age_group_images USING btree (age_group_slug, image_type, sort_order) WHERE (deleted_at IS NULL);


--
-- Name: idx_age_group_images_single_slot; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_age_group_images_single_slot ON public.age_group_images USING btree (age_group_slug, image_type) WHERE ((deleted_at IS NULL) AND ((image_type)::text <> 'gallery'::text));


--
-- Name: idx_age_group_images_slug; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_age_group_images_slug ON public.age_group_images USING btree (age_group_slug);


--
-- Name: idx_age_group_images_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_age_group_images_type ON public.age_group_images USING btree (image_type);


--
-- Name: idx_age_groups_live; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_age_groups_live ON public.age_groups USING btree (sort_order) WHERE (deleted_at IS NULL);


--
-- Name: idx_age_groups_slug_live; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_age_groups_slug_live ON public.age_groups USING btree (slug) WHERE ((deleted_at IS NULL) AND (slug IS NOT NULL));


--
-- Name: idx_analytics_created_month; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_analytics_created_month ON public.page_analytics USING btree (date_trunc('month'::text, created_at));


--
-- Name: idx_analytics_visitor_first_seen; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_analytics_visitor_first_seen ON public.page_analytics USING btree (visitor_id, created_at);


--
-- Name: idx_anomalies_metric_day; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_anomalies_metric_day ON public.anomalies USING btree (metric, observed_on);


--
-- Name: idx_anomalies_open; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_anomalies_open ON public.anomalies USING btree (created_at DESC) WHERE (acknowledged_at IS NULL);


--
-- Name: idx_anomalies_recent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_anomalies_recent ON public.anomalies USING btree (created_at DESC);


--
-- Name: idx_events_deleted; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_events_deleted ON public.news_events USING btree (deleted_at);


--
-- Name: idx_events_live; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_events_live ON public.news_events USING btree (event_date, sort_order) WHERE ((deleted_at IS NULL) AND is_published);


--
-- Name: idx_events_published; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_events_published ON public.news_events USING btree (is_published);


--
-- Name: idx_events_sort; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_events_sort ON public.news_events USING btree (sort_order);


--
-- Name: idx_events_start_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_events_start_date ON public.news_events USING btree (event_date);


--
-- Name: idx_facilities_deleted_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_facilities_deleted_at ON public.facilities USING btree (deleted_at);


--
-- Name: idx_facilities_live; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_facilities_live ON public.facilities USING btree (sort_order, created_at DESC) WHERE (deleted_at IS NULL);


--
-- Name: idx_facilities_name_live; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_facilities_name_live ON public.facilities USING btree (lower((name)::text)) WHERE (deleted_at IS NULL);


--
-- Name: idx_facility_features_facility; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_facility_features_facility ON public.facility_features USING btree (facility_id, feature_type, display_order);


--
-- Name: idx_facility_features_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_facility_features_unique ON public.facility_features USING btree (facility_id, feature_type, lower((feature_text)::text));


--
-- Name: idx_facility_images_facility; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_facility_images_facility ON public.facility_images USING btree (facility_id, display_order) WHERE (deleted_at IS NULL);


--
-- Name: idx_facility_images_primary; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_facility_images_primary ON public.facility_images USING btree (facility_id) WHERE (is_primary AND (deleted_at IS NULL));


--
-- Name: idx_faqs_display_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_faqs_display_order ON public.faqs USING btree (display_order) WHERE (deleted_at IS NULL);


--
-- Name: idx_filter_presets_lookup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_filter_presets_lookup ON public.filter_presets USING btree (user_id, screen);


--
-- Name: idx_filter_presets_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_filter_presets_unique ON public.filter_presets USING btree (user_id, screen, lower((name)::text));


--
-- Name: idx_gallery_categories_live; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gallery_categories_live ON public.gallery_categories USING btree (sort_order) WHERE (deleted_at IS NULL);


--
-- Name: idx_gallery_categories_slug; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_gallery_categories_slug ON public.gallery_categories USING btree (slug) WHERE (deleted_at IS NULL);


--
-- Name: idx_gallery_categories_sort; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gallery_categories_sort ON public.gallery_categories USING btree (sort_order, name);


--
-- Name: idx_gallery_images_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gallery_images_category ON public.gallery_images USING btree (category_id, sort_order);


--
-- Name: idx_gallery_images_featured; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gallery_images_featured ON public.gallery_images USING btree (is_featured);


--
-- Name: idx_gallery_images_is_video; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gallery_images_is_video ON public.gallery_images USING btree (is_video) WHERE (deleted_at IS NULL);


--
-- Name: idx_gallery_images_live; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gallery_images_live ON public.gallery_images USING btree (category_id, sort_order) WHERE (deleted_at IS NULL);


--
-- Name: idx_login_history_failures; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_login_history_failures ON public.login_history USING btree (created_at DESC) WHERE (NOT succeeded);


--
-- Name: idx_login_history_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_login_history_user ON public.login_history USING btree (user_id, created_at DESC);


--
-- Name: idx_media_category_live; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_media_category_live ON public.media USING btree (category, created_at DESC) WHERE (deleted_at IS NULL);


--
-- Name: idx_media_cloudinary_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_media_cloudinary_id ON public.media USING btree (cloudinary_public_id);


--
-- Name: idx_media_deleted_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_media_deleted_at ON public.media USING btree (deleted_at);


--
-- Name: idx_news_events_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_news_events_date ON public.news_events USING btree (event_date DESC);


--
-- Name: idx_news_events_live; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_news_events_live ON public.news_events USING btree (event_date DESC) WHERE (deleted_at IS NULL);


--
-- Name: idx_news_events_published; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_news_events_published ON public.news_events USING btree (is_published);


--
-- Name: idx_news_events_title; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_news_events_title ON public.news_events USING btree (title) WHERE (deleted_at IS NULL);


--
-- Name: idx_news_live; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_news_live ON public.news USING btree (published_date DESC) WHERE (deleted_at IS NULL);


--
-- Name: idx_news_public; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_news_public ON public.news USING btree (published_date DESC) WHERE ((deleted_at IS NULL) AND (is_published = true));


--
-- Name: idx_notifications_unread; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_unread ON public.notifications USING btree (user_id, created_at DESC) WHERE (read_at IS NULL);


--
-- Name: idx_notifications_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_user ON public.notifications USING btree (user_id, created_at DESC);


--
-- Name: idx_page_analytics_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_page_analytics_created_at ON public.page_analytics USING btree (created_at DESC);


--
-- Name: idx_page_analytics_dedupe; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_page_analytics_dedupe ON public.page_analytics USING btree (session_id, page_path, visited_at DESC);


--
-- Name: idx_page_analytics_device_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_page_analytics_device_type ON public.page_analytics USING btree (device_type);


--
-- Name: idx_page_analytics_page_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_page_analytics_page_id ON public.page_analytics USING btree (page_id);


--
-- Name: idx_page_analytics_page_path; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_page_analytics_page_path ON public.page_analytics USING btree (page_path);


--
-- Name: idx_page_analytics_session_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_page_analytics_session_id ON public.page_analytics USING btree (session_id);


--
-- Name: idx_page_analytics_visited_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_page_analytics_visited_at ON public.page_analytics USING btree (visited_at DESC);


--
-- Name: idx_page_analytics_visitor_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_page_analytics_visitor_id ON public.page_analytics USING btree (visitor_id);


--
-- Name: idx_page_content_sections_deleted; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_page_content_sections_deleted ON public.page_content_sections USING btree (deleted_at);


--
-- Name: idx_page_content_sections_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_page_content_sections_key ON public.page_content_sections USING btree (page_id, section_key) WHERE (deleted_at IS NULL);


--
-- Name: idx_page_content_sections_live; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_page_content_sections_live ON public.page_content_sections USING btree (page_id, sort_order) WHERE (deleted_at IS NULL);


--
-- Name: idx_page_content_sections_page_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_page_content_sections_page_id ON public.page_content_sections USING btree (page_id);


--
-- Name: idx_page_media_live; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_page_media_live ON public.page_media USING btree (page_slug, media_section, sort_order) WHERE (deleted_at IS NULL);


--
-- Name: idx_page_media_section; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_page_media_section ON public.page_media USING btree (media_section);


--
-- Name: idx_page_media_single_slot; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_page_media_single_slot ON public.page_media USING btree (page_slug, media_section) WHERE (deleted_at IS NULL);


--
-- Name: idx_page_media_slot; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_page_media_slot ON public.page_media USING btree (page_slug, media_section) WHERE (deleted_at IS NULL);


--
-- Name: idx_page_media_slug; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_page_media_slug ON public.page_media USING btree (page_slug);


--
-- Name: idx_pages_deleted_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pages_deleted_at ON public.pages USING btree (deleted_at);


--
-- Name: idx_pages_slug_live; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_pages_slug_live ON public.pages USING btree (slug) WHERE (deleted_at IS NULL);


--
-- Name: idx_pages_sort_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pages_sort_order ON public.pages USING btree (sort_order);


--
-- Name: idx_pages_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pages_status ON public.pages USING btree (status);


--
-- Name: idx_partners_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_partners_active ON public.partners USING btree (is_active, sort_order) WHERE (deleted_at IS NULL);


--
-- Name: idx_partners_deleted_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_partners_deleted_at ON public.partners USING btree (deleted_at);


--
-- Name: idx_partners_sort_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_partners_sort_order ON public.partners USING btree (sort_order);


--
-- Name: idx_refresh_tokens_token; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_refresh_tokens_token ON public.refresh_tokens USING btree (token);


--
-- Name: idx_refresh_tokens_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_refresh_tokens_user_id ON public.refresh_tokens USING btree (user_id);


--
-- Name: idx_registrations_age_group; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_registrations_age_group ON public.registrations USING btree (age_group_id) WHERE (deleted_at IS NULL);


--
-- Name: idx_registrations_event; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_registrations_event ON public.registrations USING btree (event_id);


--
-- Name: idx_registrations_live; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_registrations_live ON public.registrations USING btree (created_at DESC) WHERE (deleted_at IS NULL);


--
-- Name: idx_role_permissions_role; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_role_permissions_role ON public.role_permissions USING btree (role_id);


--
-- Name: idx_search_media; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_search_media ON public.media USING gin (((((COALESCE(title, ''::character varying))::text || ' '::text) || (COALESCE(alt_text, ''::character varying))::text)) public.gin_trgm_ops);


--
-- Name: idx_search_news_events; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_search_news_events ON public.news_events USING gin (((((((COALESCE(title, ''::character varying))::text || ' '::text) || COALESCE(description, ''::text)) || ' '::text) || (COALESCE(location, ''::character varying))::text)) public.gin_trgm_ops);


--
-- Name: idx_search_page_sections; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_search_page_sections ON public.page_content_sections USING gin (((((COALESCE(title, ''::character varying))::text || ' '::text) || regexp_replace(COALESCE(content, ''::text), '<[^>]*>'::text, ' '::text, 'g'::text))) public.gin_trgm_ops);


--
-- Name: idx_search_pages; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_search_pages ON public.pages USING gin (((((COALESCE(title, ''::character varying))::text || ' '::text) || (COALESCE(slug, ''::character varying))::text)) public.gin_trgm_ops);


--
-- Name: idx_search_registrations; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_search_registrations ON public.registrations USING gin (((((((((COALESCE(child_name, ''::character varying))::text || ' '::text) || (COALESCE(parent_name, ''::character varying))::text) || ' '::text) || (COALESCE(parent_email, ''::character varying))::text) || ' '::text) || (COALESCE(parent_phone, ''::character varying))::text)) public.gin_trgm_ops);


--
-- Name: idx_search_tour_bookings; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_search_tour_bookings ON public.tour_bookings USING gin (((((((COALESCE(visitor_name, ''::character varying))::text || ' '::text) || (COALESCE(visitor_email, ''::character varying))::text) || ' '::text) || (COALESCE(visitor_phone, ''::character varying))::text)) public.gin_trgm_ops);


--
-- Name: idx_search_users; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_search_users ON public.users USING gin (((((COALESCE(name, ''::character varying))::text || ' '::text) || (COALESCE(email, ''::character varying))::text)) public.gin_trgm_ops);


--
-- Name: idx_sections_public_live; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sections_public_live ON public.page_content_sections USING btree (page_id, sort_order) WHERE ((deleted_at IS NULL) AND is_visible);


--
-- Name: idx_sections_published_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sections_published_at ON public.page_content_sections USING btree (published_at);


--
-- Name: idx_sections_scheduled_publish_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sections_scheduled_publish_at ON public.page_content_sections USING btree (scheduled_publish_at);


--
-- Name: idx_social_links_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_social_links_order ON public.social_links USING btree (display_order) WHERE (deleted_at IS NULL);


--
-- Name: idx_social_links_platform_live; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_social_links_platform_live ON public.social_links USING btree (platform) WHERE (deleted_at IS NULL);


--
-- Name: idx_staff_display_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_staff_display_order ON public.staff USING btree (display_order) WHERE (deleted_at IS NULL);


--
-- Name: idx_testimonials_deleted; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_testimonials_deleted ON public.testimonials USING btree (deleted_at);


--
-- Name: idx_testimonials_live; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_testimonials_live ON public.testimonials USING btree (page_slug, sort_order) WHERE ((deleted_at IS NULL) AND is_published);


--
-- Name: idx_testimonials_page; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_testimonials_page ON public.testimonials USING btree (page_slug);


--
-- Name: idx_testimonials_published; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_testimonials_published ON public.testimonials USING btree (is_published);


--
-- Name: idx_testimonials_sort; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_testimonials_sort ON public.testimonials USING btree (sort_order);


--
-- Name: idx_tour_bookings_live; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tour_bookings_live ON public.tour_bookings USING btree (preferred_date DESC) WHERE (deleted_at IS NULL);


--
-- Name: idx_tour_bookings_slot_live; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tour_bookings_slot_live ON public.tour_bookings USING btree (preferred_date, preferred_time) WHERE ((deleted_at IS NULL) AND ((status)::text <> 'cancelled'::text));


--
-- Name: idx_users_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_email ON public.users USING btree (email);


--
-- Name: idx_users_role; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_role ON public.users USING btree (role) WHERE ((role)::text <> 'user'::text);


--
-- Name: idx_video_uploads_cloudinary_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_video_uploads_cloudinary_id ON public.video_uploads USING btree (cloudinary_public_id);


--
-- Name: idx_video_uploads_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_video_uploads_created_at ON public.video_uploads USING btree (created_at DESC);


--
-- Name: idx_video_uploads_deleted_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_video_uploads_deleted_at ON public.video_uploads USING btree (deleted_at);


--
-- Name: idx_video_uploads_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_video_uploads_status ON public.video_uploads USING btree (status);


--
-- Name: idx_video_uploads_uploaded_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_video_uploads_uploaded_by ON public.video_uploads USING btree (uploaded_by);


--
-- Name: idx_youtube_videos_id_live; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_youtube_videos_id_live ON public.youtube_videos USING btree (youtube_id) WHERE (deleted_at IS NULL);


--
-- Name: idx_youtube_videos_live; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_youtube_videos_live ON public.youtube_videos USING btree (display_order, created_at DESC) WHERE (deleted_at IS NULL);


--
-- Name: news_events events_update_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER events_update_trigger BEFORE UPDATE ON public.news_events FOR EACH ROW EXECUTE FUNCTION public.update_events_timestamp();


--
-- Name: news news_update_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER news_update_trigger BEFORE UPDATE ON public.news FOR EACH ROW EXECUTE FUNCTION public.update_news_timestamp();


--
-- Name: page_content_sections page_content_sections_update_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER page_content_sections_update_trigger BEFORE UPDATE ON public.page_content_sections FOR EACH ROW EXECUTE FUNCTION public.update_page_content_sections_timestamp();


--
-- Name: permissions permissions_grant_admin; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER permissions_grant_admin AFTER INSERT ON public.permissions FOR EACH ROW EXECUTE FUNCTION public.grant_new_permission_to_admin();


--
-- Name: registrations registrations_event_count_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER registrations_event_count_trigger AFTER INSERT OR DELETE OR UPDATE OF event_id, status ON public.registrations FOR EACH ROW EXECUTE FUNCTION public.sync_event_registration_count();


--
-- Name: testimonials testimonials_update_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER testimonials_update_trigger BEFORE UPDATE ON public.testimonials FOR EACH ROW EXECUTE FUNCTION public.update_testimonials_timestamp();


--
-- Name: video_uploads trigger_video_uploads_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_video_uploads_updated_at BEFORE UPDATE ON public.video_uploads FOR EACH ROW EXECUTE FUNCTION public.update_video_uploads_updated_at();


--
-- Name: admin_activity_log admin_activity_log_admin_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_activity_log
    ADD CONSTRAINT admin_activity_log_admin_id_fkey FOREIGN KEY (admin_id) REFERENCES public.admin_users(id) ON DELETE SET NULL;


--
-- Name: age_group_images age_group_images_media_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.age_group_images
    ADD CONSTRAINT age_group_images_media_id_fkey FOREIGN KEY (media_id) REFERENCES public.media(id) ON DELETE SET NULL;


--
-- Name: anomalies anomalies_acknowledged_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.anomalies
    ADD CONSTRAINT anomalies_acknowledged_by_fkey FOREIGN KEY (acknowledged_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: chatbot_appointment_requests chatbot_appointment_requests_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chatbot_appointment_requests
    ADD CONSTRAINT chatbot_appointment_requests_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.chatbot_conversations(id) ON DELETE SET NULL;


--
-- Name: chatbot_messages chatbot_messages_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chatbot_messages
    ADD CONSTRAINT chatbot_messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.chatbot_conversations(id) ON DELETE CASCADE;


--
-- Name: dashboard_preferences dashboard_preferences_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dashboard_preferences
    ADD CONSTRAINT dashboard_preferences_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: facility_features facility_features_facility_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.facility_features
    ADD CONSTRAINT facility_features_facility_id_fkey FOREIGN KEY (facility_id) REFERENCES public.facilities(id) ON DELETE CASCADE;


--
-- Name: facility_images facility_images_facility_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.facility_images
    ADD CONSTRAINT facility_images_facility_id_fkey FOREIGN KEY (facility_id) REFERENCES public.facilities(id) ON DELETE CASCADE;


--
-- Name: facility_images facility_images_media_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.facility_images
    ADD CONSTRAINT facility_images_media_id_fkey FOREIGN KEY (media_id) REFERENCES public.media(id) ON DELETE SET NULL;


--
-- Name: faqs faqs_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.faqs
    ADD CONSTRAINT faqs_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: filter_presets filter_presets_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.filter_presets
    ADD CONSTRAINT filter_presets_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: page_analytics fk_page_analytics_page; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.page_analytics
    ADD CONSTRAINT fk_page_analytics_page FOREIGN KEY (page_id) REFERENCES public.pages(id) ON DELETE SET NULL;


--
-- Name: gallery_images gallery_images_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gallery_images
    ADD CONSTRAINT gallery_images_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.gallery_categories(id) ON DELETE CASCADE;


--
-- Name: login_history login_history_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.login_history
    ADD CONSTRAINT login_history_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: media media_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media
    ADD CONSTRAINT media_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: news_events news_events_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.news_events
    ADD CONSTRAINT news_events_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: news_events news_events_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.news_events
    ADD CONSTRAINT news_events_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: news news_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.news
    ADD CONSTRAINT news_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: notification_settings notification_settings_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_settings
    ADD CONSTRAINT notification_settings_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: notifications notifications_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: page_content_sections page_content_sections_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.page_content_sections
    ADD CONSTRAINT page_content_sections_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: page_content_sections page_content_sections_page_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.page_content_sections
    ADD CONSTRAINT page_content_sections_page_id_fkey FOREIGN KEY (page_id) REFERENCES public.pages(id) ON DELETE CASCADE;


--
-- Name: page_content_sections page_content_sections_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.page_content_sections
    ADD CONSTRAINT page_content_sections_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: page_media page_media_media_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.page_media
    ADD CONSTRAINT page_media_media_id_fkey FOREIGN KEY (media_id) REFERENCES public.media(id) ON DELETE SET NULL;


--
-- Name: pages pages_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pages
    ADD CONSTRAINT pages_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: pages pages_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pages
    ADD CONSTRAINT pages_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: refresh_tokens refresh_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refresh_tokens
    ADD CONSTRAINT refresh_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: registrations registrations_age_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.registrations
    ADD CONSTRAINT registrations_age_group_id_fkey FOREIGN KEY (age_group_id) REFERENCES public.age_groups(id);


--
-- Name: registrations registrations_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.registrations
    ADD CONSTRAINT registrations_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.news_events(id) ON DELETE SET NULL;


--
-- Name: role_permissions role_permissions_permission_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_permissions
    ADD CONSTRAINT role_permissions_permission_id_fkey FOREIGN KEY (permission_id) REFERENCES public.permissions(id) ON DELETE CASCADE;


--
-- Name: role_permissions role_permissions_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_permissions
    ADD CONSTRAINT role_permissions_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.roles(id) ON DELETE CASCADE;


--
-- Name: site_branding site_branding_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.site_branding
    ADD CONSTRAINT site_branding_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: site_footer site_footer_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.site_footer
    ADD CONSTRAINT site_footer_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: site_media site_media_media_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.site_media
    ADD CONSTRAINT site_media_media_id_fkey FOREIGN KEY (media_id) REFERENCES public.media(id) ON DELETE SET NULL;


--
-- Name: staff staff_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff
    ADD CONSTRAINT staff_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: testimonials testimonials_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testimonials
    ADD CONSTRAINT testimonials_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: testimonials testimonials_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testimonials
    ADD CONSTRAINT testimonials_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: video_uploads video_uploads_uploaded_by_users_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.video_uploads
    ADD CONSTRAINT video_uploads_uploaded_by_users_fkey FOREIGN KEY (uploaded_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: youtube_videos youtube_videos_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.youtube_videos
    ADD CONSTRAINT youtube_videos_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- PostgreSQL database dump complete
--

\unrestrict INGy15iynAi8Ul8U2l36y6xRZcmUnvo01p9zIPm42rysbecrt597bmyYBBgiCrj

