// Supabase removed for local-only mode.

const createNullObject = (): any => new Proxy({}, { get: () => null });

const nullResult = createNullObject();
const userStub = createNullObject();

const thenResolve = (r: (v: any) => void) => r(nullResult);
const thenCatch = () => ({ then: (r: (v: any) => void) => r(nullResult) });

// Explicit chain with all known PostgREST methods so TypeScript
// can resolve type arguments on .returns<T>, .single<T>, etc.
const chain = {
  insert: (..._args: unknown[]) => chain,
  delete: (..._args: unknown[]) => chain,
  upsert: (..._args: unknown[]) => chain,
  update: (..._args: unknown[]) => chain,
  select: (..._args: unknown[]) => chain,
  eq: (..._args: unknown[]) => chain,
  neq: (..._args: unknown[]) => chain,
  gt: (..._args: unknown[]) => chain,
  gte: (..._args: unknown[]) => chain,
  lt: (..._args: unknown[]) => chain,
  lte: (..._args: unknown[]) => chain,
  like: (..._args: unknown[]) => chain,
  ilike: (..._args: unknown[]) => chain,
  is: (..._args: unknown[]) => chain,
  in: (..._args: unknown[]) => chain,
  not: (..._args: unknown[]) => chain,
  or: (..._args: unknown[]) => chain,
  order: (..._args: unknown[]) => chain,
  limit: (..._args: unknown[]) => chain,
  range: (..._args: unknown[]) => chain,
  match: (..._args: unknown[]) => chain,
  filter: (..._args: unknown[]) => chain,
  containedBy: (..._args: unknown[]) => chain,
  textSearch: (..._args: unknown[]) => chain,
  csv: (..._args: unknown[]) => chain,
  returns<_T = unknown>(): any {
    return chain;
  },
  single<_T = unknown>(): any {
    return chain;
  },
  maybeSingle<_T = unknown>(): any {
    return chain;
  },
  then: thenResolve,
  catch: thenCatch,
};

export const supabase = {
  supabaseUrl: '',
  supabaseKey: '',
  authUrl: '',
  storageUrl: '',
  functionsUrl: '',
  realtimeUrl: '',
  restUrlPrefix: '',
  rest: { url: '' },
  realtime: { onClose: () => {} },
  channel: (..._args: unknown[]) => ({
    on: (..._args: unknown[]) => ({ subscribe: () => {} }),
    subscribe: () => {},
    unsubscribe: () => {},
    send: () => {},
    track: () => {},
  }),
  removeChannel: () => {},
  removeAllChannels: () => {},
  getChannels: () => [],
  functions: { invoke: async () => ({ data: null, error: null }) },
  schema: (..._args: unknown[]) => supabase,
  auth: {
    getSession: async (..._args: unknown[]) => ({ data: { session: userStub } }),
    getUser: async (..._args: unknown[]) => ({ data: { user: userStub }, error: null }),
    refreshSession: async (..._args: unknown[]) => ({ data: { session: userStub } }),
    signOut: async (..._args: unknown[]) => ({ error: null }),
    onAuthStateChange: (..._args: unknown[]) => ({
      data: { subscription: { unsubscribe: () => {} } },
    }),
    signInWithOAuth: async (..._args: unknown[]) => ({ data: { url: '' }, error: null }),
    signInWithIdToken: async (..._args: unknown[]) => ({ data: userStub, error: null }),
    setSession: async (..._args: unknown[]) => ({ error: null }),
    updateUser: async (..._args: unknown[]) => ({ data: { user: userStub }, error: null }),
    admin: {
      deleteUser: async (..._args: unknown[]) => ({ data: userStub, error: null }),
      listUsers: async (..._args: unknown[]) => ({ data: { users: [] }, error: null }),
    },
  },
  rpc: (..._args: unknown[]) => chain,
  from: (..._args: unknown[]) => chain,
  storage: {
    from: (..._args: unknown[]) => ({
      upload: async (..._args: unknown[]) => ({ data: null, error: null }),
      download: async (..._args: unknown[]) => ({ data: null, error: null }),
      getPublicUrl: (..._args: unknown[]) => ({ data: { publicUrl: '' } }),
      remove: async (..._args: unknown[]) => ({ data: null, error: null }),
      list: async (..._args: unknown[]) => ({ data: [], error: null }),
      createSignedUrl: async (..._args: unknown[]) => ({ data: { signedUrl: '' }, error: null }),
      createSignedUrls: async (..._args: unknown[]) => ({ data: [], error: null }),
    }),
  },
};

export const createSupabaseClient = (..._args: unknown[]) => supabase;
export const createSupabaseAdminClient = (..._args: unknown[]) => supabase;
