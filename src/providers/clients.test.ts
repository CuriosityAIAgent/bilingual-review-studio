import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildModelRun, getModels } from "@/src/lib/config";
import { criticProviderLiveCached, markCriticUnavailable } from "./clients";

/**
 * Provenance honesty (ADR 0014): when a critic call that was probed healthy
 * fails mid-run (rate-limited under concurrent load), markCriticUnavailable()
 * must degrade the cached critic health so (a) later segments skip the doomed
 * live call and (b) buildModelRun() stamps "(deterministic fallback)" instead of
 * dishonestly claiming the configured model reviewed segments it never saw.
 *
 * In the default test env there is no OPENAI_API_KEY, so criticProviderLiveCached()
 * short-circuits to false on key-absence — which would mask the degrade path. We
 * set a dummy key (no network: markCriticUnavailable only mutates in-memory state,
 * never calls the provider) so the assertion exercises the CACHED-HEALTH branch,
 * not the no-key early return. The key is restored after each test.
 */
describe("markCriticUnavailable (critic provenance degrade, ADR 0014)", () => {
  const prevKey = process.env.OPENAI_API_KEY;

  beforeEach(() => {
    process.env.OPENAI_API_KEY = "sk-test-no-network";
    // Silence the intentional [critic] degrade log so the suite output stays clean.
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    if (prevKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = prevKey;
    vi.restoreAllMocks();
  });

  it("flips the cached critic health to false after a mid-run failure", () => {
    markCriticUnavailable("429 rate_limit_exceeded");
    // With a key present, false here can only come from the degrade, not key-absence.
    expect(criticProviderLiveCached()).toBe(false);
  });

  it("logs the degrade reason once (diagnose-from-logs, never silent)", () => {
    markCriticUnavailable("transient 503");
    expect(console.error).toHaveBeenCalledTimes(1);
    expect((console.error as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][0]).toContain("transient 503");
  });

  it("makes buildModelRun() stamp the configured critic as a deterministic fallback", () => {
    const criticModel = getModels().critic.model;
    markCriticUnavailable("429 rate_limit_exceeded");
    const run = buildModelRun();
    // Honest provenance: never claim the live model ran once a real call failed.
    expect(run.critic_model_id).toBe(`${criticModel} (deterministic fallback)`);
    expect(run.critic_model_id).toContain("(deterministic fallback)");
  });
});
