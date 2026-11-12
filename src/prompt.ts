import type { NormalizedBuildSystemPromptOptions } from "@earendil-works/pi-coding-agent";

import type { AgentDefinition } from "./agents";

/**
 * Two prompts glued together must not read as one paragraph: pi's own prompt and
 * an agent's addendum start on separate lines.
 */
const PROMPT_SEPARATOR = "\n\n";

/**
 * Put the selected agent's body into the prompt options of the next message.
 *
 * Only two fields are ever written, and never both at once:
 * - `replace` sets `customPrompt`, so the body *becomes* pi's role prompt.
 * - `append` extends `appendSystemPrompt`, so the body follows pi's own prompt and
 *   any addendum another extension already put there.
 *
 * Everything else — `contextFiles` (which is how `AGENTS.md` reaches the prompt),
 * `cwd`, `skills`, `selectedTools`, `sections` and the tool declarations — is read
 * by pi outside the custom-prompt branch, so touching it here would silently drop
 * project context on every cycle. `null` is the `Main` position: no agent
 * selected, nothing to do.
 *
 * Returns `void` on purpose. The caller already holds the object it passed in, and
 * a returned copy would tempt a later reader into replacing the whole options
 * object — the one thing that must not happen.
 */
export function applyAgentToPromptOptions(
  options: NormalizedBuildSystemPromptOptions,
  agent: AgentDefinition | null,
): void {
  if (agent === null) {
    return;
  }

  // Trimmed here as well as in `loadAgents`: this module is the last stop before
  // the request, and a body arriving untrimmed would mean the trim upstream was
  // removed without anyone noticing.
  const prompt = agent.prompt.trim();
  if (prompt === "") {
    // pi treats a falsy `customPrompt` as "no custom prompt", so writing an empty
    // body would leave pi's own role prompt in the request while the footer names
    // an agent. `loadAgents` never lets such an agent through; should one arrive
    // anyway, doing nothing is the honest choice.
    return;
  }

  if (agent.promptMode === "append") {
    const existingAddendum = options.appendSystemPrompt;
    // Appending to what is there, not overwriting it: another extension may hold
    // that field, and handler order must not silently drop its text.
    options.appendSystemPrompt =
      existingAddendum === "" ? prompt : `${existingAddendum}${PROMPT_SEPARATOR}${prompt}`;
    return;
  }

  options.customPrompt = prompt;
}
