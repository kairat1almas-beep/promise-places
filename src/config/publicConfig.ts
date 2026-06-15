export type PublicConfig = {
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  twoGisApiKey?: string;
  webPushPublicKey?: string;
};

function readBuildTimeConfig(): PublicConfig {
  return {
    supabaseUrl: import.meta.env.VITE_SUPABASE_URL as string | undefined,
    supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined,
    twoGisApiKey: import.meta.env.VITE_2GIS_API_KEY as string | undefined,
    webPushPublicKey: import.meta.env.VITE_WEB_PUSH_PUBLIC_KEY as string | undefined,
  };
}

function normalizeConfig(value: unknown): PublicConfig {
  if (!value || typeof value !== "object") return {};

  const record = value as Record<string, unknown>;

  return {
    supabaseUrl: typeof record.supabaseUrl === "string" ? record.supabaseUrl.trim() : undefined,
    supabaseAnonKey: typeof record.supabaseAnonKey === "string" ? record.supabaseAnonKey.trim() : undefined,
    twoGisApiKey: typeof record.twoGisApiKey === "string" ? record.twoGisApiKey.trim() : undefined,
    webPushPublicKey: typeof record.webPushPublicKey === "string" ? record.webPushPublicKey.trim() : undefined,
  };
}

let publicConfig: PublicConfig = readBuildTimeConfig();
let configLoadPromise: Promise<PublicConfig> | null = null;

export function getPublicConfig() {
  return publicConfig;
}

export async function initializePublicConfig() {
  if (configLoadPromise) return configLoadPromise;

  configLoadPromise = (async () => {
    const buildTimeConfig = readBuildTimeConfig();
    let runtimeConfig: PublicConfig = {};

    const needsRuntimeFallback =
      !buildTimeConfig.supabaseUrl ||
      !buildTimeConfig.supabaseAnonKey ||
      !buildTimeConfig.twoGisApiKey ||
      !buildTimeConfig.webPushPublicKey;

    if (typeof window !== "undefined" && needsRuntimeFallback) {
      try {
        const response = await fetch("/api/public-config", { cache: "no-store" });
        if (response.ok) {
          runtimeConfig = normalizeConfig(await response.json());
        }
      } catch {
        runtimeConfig = {};
      }
    }

    publicConfig = {
      ...buildTimeConfig,
      ...runtimeConfig,
    };

    return publicConfig;
  })();

  return configLoadPromise;
}
