import type { SessionEntry } from "@earendil-works/pi-coding-agent";

import type { AgentDefinition } from "./agents";

/**
 * The label of the reset position: pi's own prompt, no agent selected. It is the
 * single source of truth for the reserved name as well — `agents.ts` derives its
 * "an agent may not be called Main" check from this constant, so the footer label
 * and the skipped name cannot drift apart.
 */
export const MAIN_LABEL = "Main";

/**
 * `customType` of the session entry that remembers the selection across a resume.
 * Prefixed with the extension's name so it cannot collide with another
 * extension's state entry in the same session file.
 */
export const STATE_CUSTOM_TYPE = "agent-switch-state";

/** One stop of the cycle. `null` is `Main`: nothing selected, nothing to swap. */
export interface CycleEntry {
  readonly label: string;
  readonly agent: AgentDefinition | null;
}

/**
 * The cycle list: `Main` first, then every enabled agent sorted by name.
 *
 * Filtering happens here rather than in `loadAgents`, because `enabled: false`
 * describes whether an agent may be *offered*, not whether its file is valid —
 * a disabled agent is still a successfully discovered agent, and dropping it from
 * discovery would hide it from any future inspect/list feature.
 */
export function buildCycleList(agents: readonly AgentDefinition[]): CycleEntry[] {
  const agentEntries: CycleEntry[] = agents
    .filter((agent) => agent.enabled)
    .map((agent) => ({ label: agent.name, agent }));

  // `sort` is stable, so agents whose names differ only in case (a tie, see
  // `compareLabelsIgnoringCase`) keep the discovery order `loadAgents` produced.
  agentEntries.sort((left, right) => compareLabelsIgnoringCase(left.label, right.label));

  return [{ label: MAIN_LABEL, agent: null }, ...agentEntries];
}

/**
 * The label after `current` in the list, wrapping at the end. Returns the label
 * and not the entry: the caller stores a label and writes it to the session.
 *
 * An unknown label resolves to `MAIN_LABEL` instead of throwing. A session can be
 * resumed after its agent file was deleted, and a stale label must not freeze the
 * shortcut. An empty list is handled by the same branch — there is no cycle to
 * advance, so the reset position is the only honest answer.
 */
export function nextLabel(list: readonly CycleEntry[], current: string): string {
  const currentIndex = list.findIndex((entry) => entry.label === current);
  if (currentIndex === -1) {
    return MAIN_LABEL;
  }
  const nextIndex = (currentIndex + 1) % list.length;
  return list[nextIndex].label;
}

/** Look up one stop of the cycle by its label. Missing means "fall back to `Main`". */
export function findEntry(list: readonly CycleEntry[], label: string): CycleEntry | undefined {
  return list.find((entry) => entry.label === label);
}

/**
 * The label of the last selection stored in this session, or `null` if there is
 * none.
 *
 * Reads the whole session history, the same way `examples/extensions/preset.ts`
 * does. `docs/extensions.md` suggests `getBranch()` for branch-sensitive state; a
 * label is not branch-sensitive, and taking the last entry keeps a resumed session
 * on the agent the operator last picked.
 *
 * Every entry shape is tolerated: session files outlive extension versions, so an
 * entry of the right `customType` with a broken payload is skipped rather than
 * crashing the resume.
 */
export function lastSelectedLabel(entries: readonly SessionEntry[]): string | null {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    if (entry.type !== "custom" || entry.customType !== STATE_CUSTOM_TYPE) {
      continue;
    }
    const label = readStoredLabel(entry.data);
    if (label !== null) {
      return label;
    }
  }
  return null;
}

/**
 * The entry payload is `unknown`: it was written by an older version of this
 * extension, or by a hand-edited session file. Only a `name` string counts.
 */
function readStoredLabel(data: unknown): string | null {
  if (typeof data !== "object" || data === null || !("name" in data)) {
    return null;
  }
  return typeof data.name === "string" ? data.name : null;
}

/**
 * Case-insensitive comparison in the `en` collation.
 *
 * `sensitivity: "accent"` is what makes it case-insensitive: plain
 * `localeCompare(name, "en")` treats the case difference as a tertiary difference
 * and orders `ranger` before `Ranger`, which would reorder two agents whose names
 * differ only in case and break the "sort ties keep discovery order" rule. With
 * `"accent"` such a pair compares as equal and the stable sort keeps the order
 * `loadAgents` found them in.
 */
function compareLabelsIgnoringCase(left: string, right: string): number {
  return left.localeCompare(right, "en", { sensitivity: "accent" });
}
