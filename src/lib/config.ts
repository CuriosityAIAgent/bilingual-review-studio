/**
 * Typed configuration loader (spec §6). Server-side only.
 *
 * Reads config/*.yml, resolves the EFFECTIVE provider mode against the API keys
 * actually present in the environment (so the app runs with no keys at all), and
 * exposes a `config_hash` for reproducibility in `model_run` (spec §8).
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";

const CONFIG_DIR = join(process.cwd(), "config");

export type ProviderName = "anthropic" | "openai" | "local" | "fixture";
export type EffectiveMode = "live" | "fixture" | "deterministic" | "heuristic";

export interface StageConfig {
  provider: ProviderName;
  model: string;
  prompt_version?: string;
  temperature?: number;
  max_tokens?: number;
  fallback?: string;
  runs_on?: string;
  runs_in?: string;
  dtype?: string;
  service_url_env?: string;
}

export interface ModelsConfig {
  translator: StageConfig;
  critic: StageConfig;
  qe: StageConfig;
  versions: { glossary_version: string; rules_version: string };
}

export interface ThresholdsConfig {
  qe_threshold: number;
  human_floor: number;
  max_iters: number;
  min_qe_gain: number;
  disclaimer_exact_match: number;
  disclaimer_fuzzy_low: number;
}

export interface LocaleConfig {
  locale: string;
  name: string;
  number_format: { thousands_separator: string; decimal_separator: string; example: string };
  scale_terms: { billion: string; trillion: string; basis_points: string };
  style: Record<string, string>;
  regional_flags: { peninsular: string[]; mexican: string[] };
}

export interface PermissionsConfig {
  actions: Record<string, Record<string, boolean | string>>;
  reviewer_can_approve_rules: boolean;
}

let _cache: {
  models: ModelsConfig;
  thresholds: ThresholdsConfig;
  permissions: PermissionsConfig;
  locales: Record<string, LocaleConfig>;
  configHash: string;
} | null = null;

function readYaml<T>(rel: string): T {
  return parseYaml(readFileSync(join(CONFIG_DIR, rel), "utf8")) as T;
}

function loadAll() {
  if (_cache) return _cache;
  const models = readYaml<ModelsConfig>("models.yml");
  const thresholds = readYaml<ThresholdsConfig>("thresholds.yml");
  const permissions = readYaml<PermissionsConfig>("permissions.yml");
  const es419 = readYaml<LocaleConfig>("locales/es-419.yml");
  const locales: Record<string, LocaleConfig> = { "es-419": es419 };

  const configHash = createHash("sha256")
    .update(JSON.stringify({ models, thresholds, permissions, locales }))
    .digest("hex")
    .slice(0, 16);

  _cache = { models, thresholds, permissions, locales, configHash };
  return _cache;
}

/** Resolve whether a stage can run live given the keys present in the env. */
export function effectiveMode(stage: "translator" | "critic" | "qe"): EffectiveMode {
  const { models } = loadAll();
  const cfg = models[stage];
  if (stage === "qe") return "heuristic"; // prototype: QE is always a heuristic stub
  if (cfg.provider === "anthropic") {
    return process.env.ANTHROPIC_API_KEY ? "live" : "fixture";
  }
  if (cfg.provider === "openai") {
    return process.env.OPENAI_API_KEY ? "live" : "deterministic";
  }
  if (cfg.provider === "fixture") return "fixture";
  return "deterministic";
}

export function getModels(): ModelsConfig {
  return loadAll().models;
}
export function getThresholds(): ThresholdsConfig {
  return loadAll().thresholds;
}
export function getPermissions(): PermissionsConfig {
  return loadAll().permissions;
}
export function getLocale(locale = "es-419"): LocaleConfig {
  const { locales } = loadAll();
  return locales[locale] ?? locales["es-419"];
}
export function getConfigHash(): string {
  return loadAll().configHash;
}

/** Build the provenance block stamped onto every document run (spec §8). */
export function buildModelRun(targetLocale = "es-419") {
  const { models, thresholds, configHash } = loadAll();
  return {
    translator_model_id:
      effectiveMode("translator") === "live" ? models.translator.model : `${models.translator.model} (fixture)`,
    critic_model_id:
      effectiveMode("critic") === "live" ? models.critic.model : `${models.critic.model} (deterministic)`,
    qe_model_id: process.env.QE_SERVICE_URL ? `${models.qe.model} (sidecar)` : `${models.qe.model} (in-container)`,
    prompt_version: `${models.translator.prompt_version} | ${models.critic.prompt_version}`,
    glossary_version: models.versions.glossary_version,
    rules_version: models.versions.rules_version,
    thresholds: {
      qe_threshold: thresholds.qe_threshold,
      human_floor: thresholds.human_floor,
      max_iters: thresholds.max_iters,
    },
    config_hash: configHash,
  };
}
