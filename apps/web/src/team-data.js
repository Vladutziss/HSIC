// The admin's data lives in Supabase (supabase/migrations/0012_team.sql): tables anyone can read plus the public
// `team` bucket. Only admin.html writes them.

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL?.trim() || "";
export const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() || "";
export const configured = Boolean(SUPABASE_URL && SUPABASE_KEY);

export const photoUrl = (path) => `${SUPABASE_URL}/storage/v1/object/public/team/${path}`;

// one pixel companion per member when there is no photo yet
export const PATHS = ["sport", "studiu", "bani", "minte", "creativ"];

export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
