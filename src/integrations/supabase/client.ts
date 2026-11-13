import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

const SUPABASE_URL = "https://eemhfrndpogvxkceysfz.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVlbWhmcm5kcG9ndnhrY2V5c2Z6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg2NDA5NzUsImV4cCI6MjEwNDIxNjk3NX0.oPx5HEDe6UYxlJSFnnv2J18WbiQPnOguIFMPuaE-QuU";

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY);
