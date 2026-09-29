-- ============================================================
-- SnapAssure — Supabase Database Schema
-- ------------------------------------------------------------
-- Run this script in your Supabase SQL Editor:
-- Supabase Dashboard → SQL Editor → New Query → Run
-- ============================================================

-- 1. Create Enquiries Table
CREATE TABLE IF NOT EXISTS public.enquiries (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT NOT NULL,
    subject TEXT,
    mode TEXT DEFAULT 'enquiry',
    event_type TEXT,
    event_date TEXT,
    city TEXT,
    guests TEXT,
    experience TEXT,
    message TEXT,
    email_status TEXT DEFAULT 'pending',
    email_error TEXT,
    sent_at TIMESTAMPTZ,
    submitted_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
    formatted_date TEXT,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now())
);

-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_enquiries_submitted_at ON public.enquiries (submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_enquiries_email ON public.enquiries (email);
CREATE INDEX IF NOT EXISTS idx_enquiries_mode ON public.enquiries (mode);
CREATE INDEX IF NOT EXISTS idx_enquiries_email_status ON public.enquiries (email_status);

-- 2. Optional SOMA AI Chat Logs Table (Conversational Analytics)
CREATE TABLE IF NOT EXISTS public.chat_logs (
    id BIGSERIAL PRIMARY KEY,
    session_id TEXT,
    user_message TEXT NOT NULL,
    reply TEXT NOT NULL,
    action JSONB,
    client_ip TEXT,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_chat_logs_created_at ON public.chat_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_logs_session_id ON public.chat_logs (session_id);

-- 3. Row Level Security (RLS)
ALTER TABLE public.enquiries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_logs ENABLE ROW LEVEL SECURITY;

-- Backend Service Role has full administrative access (read, write, update, delete)
DROP POLICY IF EXISTS "Service role full access on enquiries" ON public.enquiries;
CREATE POLICY "Service role full access on enquiries"
    ON public.enquiries
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access on chat_logs" ON public.chat_logs;
CREATE POLICY "Service role full access on chat_logs"
    ON public.chat_logs
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Allow authenticated or anon insert directly from frontend if ever needed
DROP POLICY IF EXISTS "Allow anon insert to enquiries" ON public.enquiries;
CREATE POLICY "Allow anon insert to enquiries"
    ON public.enquiries
    FOR INSERT
    TO anon, authenticated
    WITH CHECK (true);

-- Allow anon to insert chat logs
DROP POLICY IF EXISTS "Allow anon insert to chat_logs" ON public.chat_logs;
CREATE POLICY "Allow anon insert to chat_logs"
    ON public.chat_logs
    FOR INSERT
    TO anon, authenticated
    WITH CHECK (true);
