// Supabase removed for local-only mode

export const supabase = {
  auth: {
    getSession: async () => ({ data: { session: null } }),
    getUser: async () => ({ data: { user: null }, error: null }),
    refreshSession: async () => ({ data: { session: null } }),
    signOut: async () => ({ error: null }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    signInWithOAuth: async () => ({ data: { url: '' }, error: null }),
    signInWithIdToken: async () => ({ data: {}, error: null }),
    setSession: async () => ({ error: null }),
  },
};

export const createSupabaseClient = () => supabase;

export const createSupabaseAdminClient = () => supabase;
