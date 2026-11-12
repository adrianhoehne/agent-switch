import type { AgentDefinition, ThinkingLevel } from "./agents";

/**
 * Type-only import above, on purpose: `./agents` pulls in `node:fs` and pi's
 * frontmatter parser. The decisions in this module must be testable without a pi
 * session, so nothing here may load that module at runtime.
 */

/** Structural, so the test needs no pi runtime: a real `Model` satisfies it. */
export interface ModelRef {
  readonly provider: string;
  readonly id: string;
}

/** Everything this module needs from the extension context, and nothing more. */
export interface SelectionDeps<M extends ModelRef> {
  /** `ctx.modelRegistry.getAvailable()` — the models the session may switch to. */
  available: readonly M[];
  /**
   * Resolves to `false` when pi refuses the switch; throws when the model has no
   * usable credentials. Both mean "the current model stays".
   */
  setModel(model: M): Promise<boolean>;
  setThinkingLevel(level: ThinkingLevel): void;
  /** `ctx.ui.notify(message, "warning")` in production. */
  warn(message: string): void;
}

/**
 * The provider separator. A provider id never contains a `/`; a model id may
 * (`meta-llama/llama-3.1-70b`), which is why the reference is split at the
 * *first* slash only — everything behind it is the model id, slashes included.
 */
const PROVIDER_SEPARATOR = "/";

/**
 * The seven levels pi accepts, spelled as a record so the compiler keeps it in
 * step with `ThinkingLevel`: add a level to the union and this literal fails to
 * compile until it is added here too. Deliberately not imported from `./agents`
 * (see the import note above); `agents.ts` already drops an unknown level, so this
 * table is the second line of defence for a definition built in code.
 */
const KNOWN_THINKING_LEVELS: { readonly [Level in ThinkingLevel]: true } = {
  off: true,
  minimal: true,
  low: true,
  medium: true,
  high: true,
  xhigh: true,
  max: true,
};

/**
 * Turn a frontmatter `model` into one of the models this session may use.
 *
 * An empty or whitespace-only reference is absent, not wrong: `model: ""` is how
 * YAML says "nothing here", and warning about it on every selection would train
 * the operator to ignore warnings. That also means an empty reference resolves to
 * nothing without a warning — the caller must not report one either.
 */
export function resolveModel<M extends ModelRef>(ref: string, available: readonly M[]): M | undefined {
  const reference = ref.trim();
  if (reference === "") {
    return undefined;
  }

  const separatorAt = reference.indexOf(PROVIDER_SEPARATOR);
  if (separatorAt === -1) {
    // A bare model id: first match wins. A tie rule across providers is not
    // built; `getAvailable()` order decides, as the spec records.
    return available.find((model) => model.id === reference);
  }

  const provider = reference.slice(0, separatorAt);
  const modelId = reference.slice(separatorAt + PROVIDER_SEPARATOR.length);
  const match = available.find((model) => model.provider === provider && model.id === modelId);
  return match;
}

/**
 * Adopt what the agent file names, warn about what cannot be adopted.
 *
 * The two fields fall back independently: a bad model does not stop a good level.
 * Model first, then level, and awaited — pi clamps the thinking level against the
 * model, so the order is part of the behaviour, not a style choice.
 *
 * Never throws. A `setModel` call can throw (a model without credentials) and a
 * warning is what the operator can act on; an exception out of a keypress is not.
 */
export async function applySelection<M extends ModelRef>(
  agent: AgentDefinition | null,
  deps: SelectionDeps<M>,
): Promise<{ modelApplied: boolean; thinkingApplied: boolean }> {
  // `Main` is not an agent without fields, it is no agent at all: nothing to
  // apply, nothing to report.
  if (agent === null) {
    return { modelApplied: false, thinkingApplied: false };
  }

  const modelApplied = await applyModel(agent, deps);
  const thinkingApplied = applyThinkingLevel(agent, deps);
  return { modelApplied, thinkingApplied };
}

/** The model half: absent is silent, unusable is a warning. */
async function applyModel<M extends ModelRef>(agent: AgentDefinition, deps: SelectionDeps<M>): Promise<boolean> {
  const reference = agent.model;
  if (reference === undefined || reference.trim() === "") {
    // Absence is normal — most agent files name no model — so it must not warn.
    return false;
  }

  const model = resolveModel(reference, deps.available);
  if (model === undefined) {
    deps.warn(`Agent "${agent.name}": model "${reference}" is not available — keeping the current model.`);
    return false;
  }

  try {
    if (await deps.setModel(model)) {
      return true;
    }
  } catch (error) {
    deps.warn(
      `Agent "${agent.name}": model "${reference}" could not be applied (${describeError(error)}) — keeping the current model.`,
    );
    return false;
  }

  // pi said no without an exception, which is the documented "not for you" answer.
  deps.warn(`Agent "${agent.name}": model "${reference}" was refused — keeping the current model.`);
  return false;
}

/** The thinking half: same rule, one level lower in the stack. */
function applyThinkingLevel<M extends ModelRef>(agent: AgentDefinition, deps: SelectionDeps<M>): boolean {
  const level: ThinkingLevel | undefined = agent.thinking;
  if (level === undefined) {
    return false;
  }

  if (KNOWN_THINKING_LEVELS[level] !== true) {
    // Reachable only when a definition is built in code: `readThinkingLevel`
    // already refuses to parse a level outside the seven.
    deps.warn(`Agent "${agent.name}": thinking "${String(level)}" is not a level pi knows — keeping the current thinking level.`);
    return false;
  }

  try {
    deps.setThinkingLevel(level);
    return true;
  } catch (error) {
    deps.warn(
      `Agent "${agent.name}": thinking "${level}" could not be applied (${describeError(error)}) — keeping the current thinking level.`,
    );
    return false;
  }
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
