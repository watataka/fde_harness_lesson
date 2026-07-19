import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error(
    "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (see .env.local.example)"
  );
}

// Service Role KeyはRLSを常にバイパスする。この関数は lib/services 配下からのみ呼ぶこと。
// CLAUDE.md 1.1: Client Component / Route Handler から直接呼び出してはならない。
export const supabaseServer = createClient<Database>(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    persistSession: false,
  },
});
