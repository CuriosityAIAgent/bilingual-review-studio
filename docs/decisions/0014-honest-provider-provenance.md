# 14. Honest Provider Provenance — Label What Actually Ran

Status: Accepted

## Context

`model_run` stamps which models produced a document (ADR 0008). The critic label was derived from `effectiveMode("critic")`, which only checks whether the OpenAI **key is present** — not whether it has credit or is reachable. So with an expired/empty OpenAI balance, every GPT-5 critic call failed, silently fell back to the deterministic critic, and the document **still recorded "gpt-5"**. For a compliance tool, a provenance line claiming an independent GPT-5 review that never happened is unacceptable — and it also fired ~18 doomed OpenAI calls per document (latency + noise).

## Decision

Provider **health**, not key presence, decides the label. A cached liveness probe (`criticProviderLive`, ~60s TTL — provider health is global state, so caching across requests is correct and concurrency-safe) does a tiny real call; only if it succeeds does `critique()` attempt the live critic, and only then is `model_run.critic_model_id` left as the bare model id. When the probe says the provider can't respond, `critique()` skips straight to the deterministic critic and the stamp reads `gpt-5 (deterministic fallback)`. The probe failure (and every other degrade) is logged. Topping up OpenAI credit restores the live critic and the live label automatically.

## Consequences

- The provenance footer and audit record tell the truth about which critic actually ran.
- No more ~18 failing OpenAI calls per document when the provider is down (latency win).
- The live cross-model review (ADR 0003) is contingent on a funded, reachable OpenAI key; the deterministic critic remains a legitimate, clearly-labelled fallback. Anthropic (translator) credit is likewise required — its absence fails loud per ADR 0013.
