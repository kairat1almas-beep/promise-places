export const onRequestGet = async ({ env }: { env: Record<string, string | undefined> }) => {
  return new Response(
    JSON.stringify({
      supabaseUrl: env.VITE_SUPABASE_URL,
      supabaseAnonKey: env.VITE_SUPABASE_ANON_KEY,
      twoGisApiKey: env.VITE_2GIS_API_KEY,
      webPushPublicKey: env.VITE_WEB_PUSH_PUBLIC_KEY,
    }),
    {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store, max-age=0",
      },
    }
  );
};
