import type { SessionEntry } from "@earendil-works/pi-coding-agent";
import { expect, it } from "vitest";

import type { AgentDefinition } from "../src/agents";
import {
  MAIN_LABEL,
  STATE_CUSTOM_TYPE,
  buildCycleList,
  findEntry,
  lastSelectedLabel,
  nextLabel,
} from "../src/state";

/**
 * Plain fixtures on purpose: these cases are list arithmetic, so no agent file has
 * to exist and no directory has to be read. Only the fields the cycle reads are
 * interesting; the rest is filler with a value distinct enough to spot in a diff.
 */
function createAgent(name: string, options: { readonly enabled?: boolean } = {}): AgentDefinition {
  return {
    name,
    description: `The ${name} agent`,
    prompt: `You are ${name}.`,
    promptMode: "replace",
    enabled: options.enabled ?? true,
    sourcePath: `/work/project/.pi/agents/${name}.md`,
    source: "project",
  };
}

/** The minimal shape of the entry the extension writes on every cycle. */
function createStateEntry(data?: unknown, customType: string = STATE_CUSTOM_TYPE): SessionEntry {
  return {
    type: "custom",
    customType,
    data,
    id: "entry-from-this-extension",
    parentId: null,
    timestamp: "2026-11-12T10:00:00.000Z",
  };
}

/** An entry of another kind, as a real session is full of them. */
function createLabelEntry(): SessionEntry {
  return {
    type: "label",
    targetId: "entry-1",
    label: "bookmark",
    id: "entry-with-another-type",
    parentId: null,
    timestamp: "2026-11-12T10:00:01.000Z",
  };
}

it("cycle starts at Main", () => {
  // GIVEN two enabled agents in discovery order,
  const agents = [createAgent("reviewer"), createAgent("architect")];

  // WHEN the cycle list is built,
  const cycle = buildCycleList(agents);

  // THEN the first stop is the reset position and carries no agent,
  expect(cycle[0]).toEqual({ label: MAIN_LABEL, agent: null });
  // and the first press of the shortcut lands on the first sorted agent.
  expect(nextLabel(cycle, MAIN_LABEL)).toBe("architect");
});

it("cycle wraps to Main", () => {
  // GIVEN a cycle at its last stop,
  const cycle = buildCycleList([createAgent("architect"), createAgent("reviewer")]);
  expect(cycle.map((entry) => entry.label)).toEqual([MAIN_LABEL, "architect", "reviewer"]);

  // WHEN the last agent is the current label,
  const wrapped = nextLabel(cycle, "reviewer");

  // THEN the next press wraps around to the reset position.
  expect(wrapped).toBe(MAIN_LABEL);
});

it("cycle sorts agents by name", () => {
  // GIVEN agents whose discovery order is not alphabetical, and one of them
  // disabled — a disabled agent stays a discovered agent, but it is not offered,
  const agents = [
    createAgent("zoe"),
    createAgent("Reviewer", { enabled: false }),
    createAgent("architect"),
    createAgent("bruno"),
  ];

  // WHEN the cycle list is built,
  const cycle = buildCycleList(agents);

  // THEN the agents are sorted by name and the disabled one is absent (the
  // discovery order above would have placed `zoe` right after `Main`):
  expect(cycle.map((entry) => entry.label)).toEqual([MAIN_LABEL, "architect", "bruno", "zoe"]);
});

it("cycle uses agent names", () => {
  // GIVEN an agent whose file name and path say nothing about its label,
  const agent = { ...createAgent("ranger-1"), sourcePath: "/home/operator/.agents/agents/x.md" };

  // WHEN it lands in the cycle,
  const entry = findEntry(buildCycleList([agent]), "ranger-1");

  // THEN the label is the agent's name, not a path, and the entry still hands out
  // the definition itself:
  expect(entry?.label).toBe("ranger-1");
  expect(entry?.agent).toBe(agent);
});

it("unknown label resolves to Main", () => {
  // GIVEN a cycle and a label whose agent file disappeared since the last resume,
  const cycle = buildCycleList([createAgent("architect"), createAgent("reviewer")]);

  // WHEN the missing label is advanced,
  const next = nextLabel(cycle, "deleted-agent");

  // THEN the cycle restarts at the reset position instead of freezing or throwing:
  expect(next).toBe(MAIN_LABEL);
  // and a label that is not in the list has no entry to look up.
  expect(findEntry(cycle, "deleted-agent")).toBeUndefined();
});

it("sort ties keep discovery order", () => {
  // GIVEN two agents whose names differ only in case, discovered in the order the
  // loader produced them — uppercase first, which is the order a plain
  // `localeCompare(other, "en")` would reverse (ICU sorts lowercase first), so the
  // expected value below can only survive a comparator that reports a tie,
  const agents = [createAgent("Ranger"), createAgent("ranger")];

  // WHEN the cycle list is built,
  const cycle = buildCycleList(agents);

  // THEN both survive as separate stops (the label is the identity), in discovery
  // order, because `{ sensitivity: "accent" }` treats the two labels as equal and
  // the sort is stable:
  expect(cycle.map((entry) => entry.label)).toEqual([MAIN_LABEL, "Ranger", "ranger"]);
});

it("last selection wins among stored entries", () => {
  // GIVEN a session containing an earlier selection, entries of other kinds, a
  // foreign extension's state entry, the latest selection, and then two entries
  // of the right `customType` whose payload is unusable,
  const entries: readonly SessionEntry[] = [
    createStateEntry({ name: "architect" }),
    createLabelEntry(),
    createStateEntry({ name: "ranger" }, "other-extension-state"),
    createStateEntry({ name: "reviewer" }),
    createStateEntry({ name: 42 }),
    createStateEntry(undefined),
  ];

  // WHEN the stored label is read,
  const label = lastSelectedLabel(entries);

  // THEN the latest usable selection is returned, earlier ones and every
  // unreadable entry are skipped rather than throwing,
  expect(label).toBe("reviewer");

  // and a session without any selection has none.
  expect(lastSelectedLabel([])).toBeNull();
});
