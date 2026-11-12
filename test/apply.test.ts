import { expect, it } from "vitest";

import type { AgentDefinition, ThinkingLevel } from "../src/agents";
import { applySelection, resolveModel, type ModelRef, type SelectionDeps } from "../src/apply";

/**
 * Three shapes that matter: a plain provider/id pair, a provider whose model ids
 * carry a slash of their own, and a provider that hosts the same id under a
 * different name. The last one is what makes a wrong-provider reference fail.
 */
const AVAILABLE_MODELS: readonly ModelRef[] = [
  { provider: "anthropic", id: "claude-sonnet-4" },
  { provider: "openrouter", id: "meta-llama/llama-3.1-70b" },
  { provider: "openrouter", id: "claude-sonnet-4" },
];

/** Records what the extension would do, so a test can assert what did *not* happen. */
interface StubDeps<M extends ModelRef> extends SelectionDeps<M> {
  calls: string[];
  warnings: string[];
  appliedModels: M[];
  appliedLevels: ThinkingLevel[];
}

interface StubOptions {
  /** What `setModel` resolves to: pi refuses a switch without throwing. Default `true`. */
  readonly acceptModel?: boolean;
  /** `setModel` throws for a model without usable credentials; simulate that. */
  readonly setModelThrows?: boolean;
  readonly setThinkingLevelThrows?: boolean;
}

function createDeps(options: StubOptions = {}): StubDeps<ModelRef> {
  const deps: StubDeps<ModelRef> = {
    available: AVAILABLE_MODELS,
    calls: [],
    warnings: [],
    appliedModels: [],
    appliedLevels: [],
    async setModel(model) {
      deps.calls.push("setModel");
      if (options.setModelThrows === true) {
        throw new Error("No API key for this model.");
      }
      deps.appliedModels.push(model);
      return options.acceptModel ?? true;
    },
    setThinkingLevel(level) {
      deps.calls.push("setThinkingLevel");
      if (options.setThinkingLevelThrows === true) {
        throw new Error("Thinking level rejected.");
      }
      deps.appliedLevels.push(level);
    },
    warn(message) {
      deps.warnings.push(message);
    },
  };
  return deps;
}

/** An agent file as `loadAgents` would hand it over, minus the fields under test. */
function createAgent(overrides: Partial<AgentDefinition> = {}): AgentDefinition {
  return {
    name: "architect",
    description: "Plans the increment",
    prompt: "You plan the increment.",
    promptMode: "replace",
    enabled: true,
    sourcePath: "/work/project/.pi/agents/architect.md",
    source: "project",
    ...overrides,
  };
}

it("resolves provider and id", () => {
  // GIVEN a reference whose provider and model id are both slashed and explicit,
  // and the model id itself contains a slash:
  // WHEN it is resolved,
  const model = resolveModel("openrouter/meta-llama/llama-3.1-70b", AVAILABLE_MODELS);

  // THEN it is split at the first slash only, so the model id survives whole —
  // splitting at the last slash would look for the provider `meta-llama`:
  expect(model).toEqual({ provider: "openrouter", id: "meta-llama/llama-3.1-70b" });
});

it("resolves a bare model id", () => {
  // GIVEN a reference with no provider, naming an id two available models carry,
  // WHEN it is resolved,
  // THEN the first match wins, so `getAvailable()` order decides; a tie rule
  // across providers is not built:
  expect(resolveModel("claude-sonnet-4", AVAILABLE_MODELS)).toEqual({
    provider: "anthropic",
    id: "claude-sonnet-4",
  });
});

it("unknown model resolves to nothing", () => {
  // GIVEN references that name a provider or an id no available model carries,
  // or a slashed model id without its provider in front,
  // WHEN they are resolved,
  // THEN the answer is `undefined` — never a neighbouring model. The slashed id
  // reads as provider `meta-llama`, because every reference is split before it is
  // matched; it is reachable only by its full `openrouter/...` reference:
  expect(resolveModel("nope/model", AVAILABLE_MODELS)).toBeUndefined();
  expect(resolveModel("openai/claude-sonnet-4", AVAILABLE_MODELS)).toBeUndefined();
  expect(resolveModel("claude-sonnet-5", AVAILABLE_MODELS)).toBeUndefined();
  expect(resolveModel("meta-llama/llama-3.1-70b", AVAILABLE_MODELS)).toBeUndefined();
});

it("an empty model reference is treated as absent", async () => {
  // GIVEN the empty reference YAML produces for a `model:` key with no value,
  // WHEN it is resolved and applied to a selection,
  const deps = createDeps();
  await applySelection(createAgent({ model: "   " }), deps);

  // THEN it is absent, not wrong: nothing resolves, and nothing warns — warning
  // on every selection of such an agent would train the operator to ignore warnings:
  expect(resolveModel("", AVAILABLE_MODELS)).toBeUndefined();
  expect(resolveModel("   ", AVAILABLE_MODELS)).toBeUndefined();
  expect(deps.warnings).toEqual([]);
  expect(deps.calls).toEqual([]);
});

it("no fields leaves model and thinking alone", async () => {
  // GIVEN an agent file that names neither field, which is the common case,
  const deps = createDeps();

  // WHEN it is applied,
  const result = await applySelection(createAgent(), deps);

  // THEN neither setter runs and no warning is raised — absence is normal:
  expect(result).toEqual({ modelApplied: false, thinkingApplied: false });
  expect(deps.calls).toEqual([]);
  expect(deps.warnings).toEqual([]);
});

it("applies model before thinking", async () => {
  // GIVEN an agent naming both a usable model and a usable level,
  const deps = createDeps();

  // WHEN it is applied,
  const result = await applySelection(createAgent({ model: "anthropic/claude-sonnet-4", thinking: "high" }), deps);

  // THEN both land, and the model goes first: pi clamps the level against the
  // model, so setting the level first would clamp it against the old one:
  expect(result).toEqual({ modelApplied: true, thinkingApplied: true });
  expect(deps.calls).toEqual(["setModel", "setThinkingLevel"]);
  expect(deps.appliedModels).toEqual([{ provider: "anthropic", id: "claude-sonnet-4" }]);
  expect(deps.appliedLevels).toEqual(["high"]);
});

it("bad model keeps the model and applies thinking", async () => {
  // GIVEN an agent whose model reference is a typo but whose level is fine,
  const deps = createDeps();

  // WHEN it is applied,
  const result = await applySelection(createAgent({ model: "nope/model", thinking: "high" }), deps);

  // THEN the two fields fall back independently: the model stays, the level is
  // applied, and one warning names agent, field and value:
  expect(result).toEqual({ modelApplied: false, thinkingApplied: true });
  expect(deps.calls).toEqual(["setThinkingLevel"]);
  expect(deps.appliedLevels).toEqual(["high"]);
  expect(deps.warnings).toHaveLength(1);
  expect(deps.warnings[0]).toContain('Agent "architect"');
  expect(deps.warnings[0]).toContain('model "nope/model"');
});

it("refused model keeps the current one and warns", async () => {
  // GIVEN a model that resolves but that pi declines without an exception,
  const deps = createDeps({ acceptModel: false });

  // WHEN it is applied,
  const result = await applySelection(createAgent({ model: "anthropic/claude-sonnet-4" }), deps);

  // THEN `false` is a warning and not a silent shrug: the current model stays:
  expect(result).toEqual({ modelApplied: false, thinkingApplied: false });
  expect(deps.warnings).toHaveLength(1);
  expect(deps.warnings[0]).toContain('model "anthropic/claude-sonnet-4"');
});

it("unusable level warns and keeps the level", async () => {
  // GIVEN a definition carrying a level outside the seven — only reachable when
  // one is built in code, because `readThinkingLevel` drops it while parsing. The
  // cast is the point: this guard is the second line of defence.
  const deps = createDeps();

  // WHEN it is applied,
  const result = await applySelection(createAgent({ thinking: "ultra" as ThinkingLevel }), deps);

  // THEN nothing is set and the warning names the value, instead of clamping to a
  // guess about how much the model should think:
  expect(result).toEqual({ modelApplied: false, thinkingApplied: false });
  expect(deps.calls).toEqual([]);
  expect(deps.warnings).toHaveLength(1);
  expect(deps.warnings[0]).toContain('thinking "ultra"');
});

it("a throwing setter warns instead of crashing", async () => {
  // GIVEN setters that throw — pi does that for a model without an API key,
  const deps = createDeps({ setModelThrows: true, setThinkingLevelThrows: true });

  // WHEN the selection is applied,
  const result = await applySelection(createAgent({ model: "anthropic/claude-sonnet-4", thinking: "high" }), deps);

  // THEN the promise resolves: "never throws" is the contract, because an
  // exception escaping a keypress leaves the session with no explanation. Two
  // fields, two independent warnings:
  expect(result).toEqual({ modelApplied: false, thinkingApplied: false });
  expect(deps.warnings).toHaveLength(2);
  expect(deps.warnings[0]).toContain("could not be applied");
  expect(deps.warnings[1]).toContain("could not be applied");
});
