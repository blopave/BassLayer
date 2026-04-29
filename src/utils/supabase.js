import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "";
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || "";

function createStub() {
  if (typeof console !== "undefined") {
    console.warn(
      "[supabase] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY missing — venue/project features disabled"
    );
  }
  const noAuth = () => Promise.resolve({ data: null, error: { message: "Supabase no configurado" } });
  const authChain = {
    getSession: () => Promise.resolve({ data: { session: null }, error: null }),
    getUser: () => Promise.resolve({ data: { user: null }, error: null }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    signUp: noAuth,
    signInWithPassword: noAuth,
    signOut: () => Promise.resolve({ error: null }),
  };
  const queryStub = {
    insert: noAuth, select: noAuth, update: noAuth, delete: noAuth,
    eq() { return this; }, single: noAuth,
  };
  const storageBucket = {
    upload: noAuth,
    getPublicUrl: () => ({ data: { publicUrl: "" } }),
  };
  return {
    auth: authChain,
    from: () => queryStub,
    storage: { from: () => storageBucket },
  };
}

export const supabase =
  supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : createStub();
