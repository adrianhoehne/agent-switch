import type { NormalizedBuildSystemPromptOptions } from "@earendil-works/pi-coding-agent";
import { expect, it } from "vitest";

import type { AgentDefinition } from "../src/agents";
import { applyAgentToPromptOptions } from "../src/prompt";

/**
 * Deliberately distinct, non-empty values: a field that changes to `""` or to
 * `undefined` would still show up in the deep comparison, but a field that quietly
 * becomes empty is exactly the failure this fixture is meant to catch.
 */
const PI_ROLE_PROMPT = "pi's own role prompt";
const EXISTING_ADDENDUM = "House rule from the operator's settings.";
const REVIEWER_PROMPT = "You review code.";

/**
 * A complete normalized options object: all twelve fields, written out in full so
 * that `strict` checks every one of them. Missing optional fields would be
 * invisible to the before/after comparison.
 */
function createPromptOptions(): NormalizedBuildSystemPromptOptions {
  return {
    customPrompt: PI_ROLE_PROMPT,
    forceSystemPrompt: "",
    selectedTools: ["read", "bash", "edit"],
    hiddenTools: ["todo"],
    toolSnippets: { read: "Read a file", bash: "Run a shell command" },
    toolGuidelines: { bash: ["Prefer rg over grep."] },
    promptGuidelines: ["Answer briefly."],
    appendSystemPrompt: EXISTING_ADDENDUM,
    sections: { project_context: "<project_context># Project rules</project_context>" },
    cwd: "/work/project",
    contextFiles: [{ path: "/work/project/AGENTS.md", content: "# AGENTS.md" }],
    skills: [
      {
        name: "spec-doc-review",
        description: "Reviews a specification document.",
        filePath: "/home/operator/.agents/skills/spec-doc-review/SKILL.md",
        baseDir: "/home/operator/.agents/skills/spec-doc-review",
        sourceInfo: {
          path: "/home/operator/.agents/skills/spec-doc-review/SKILL.md",
          source: "path",
          scope: "user",
          origin: "top-level",
        },
        disableModelInvocation: false,
      },
    ],
  };
}

/** The only two fields the function may read: body and mode. */
function createAgent(overrides: Pick<AgentDefinition, "prompt" | "promptMode">): AgentDefinition {
  return {
    name: "reviewer",
    description: "Reviews code",
    enabled: true,
    sourcePath: "/work/project/.pi/agents/reviewer.md",
    source: "project",
    ...overrides,
  };
}

it("main leaves the options untouched", () => {
  // GIVEN fresh options as pi normalized them for a run with no agent selected,
  const options = createPromptOptions();

  // WHEN the `Main` position is applied,
  applyAgentToPromptOptions(options, null);

  // THEN nothing has moved at all — not one field, not even the role prompt:
  expect(options).toEqual(createPromptOptions());
});

it("replace sets the role prompt only", () => {
  // GIVEN options for a run and an agent in replace mode,
  const options = createPromptOptions();

  // WHEN it is applied,
  applyAgentToPromptOptions(options, createAgent({ prompt: REVIEWER_PROMPT, promptMode: "replace" }));

  // THEN the body is the role prompt and project context, skills, cwd and tool
  // selection survive — that is what keeps AGENTS.md in the request:
  expect(options).toEqual({ ...createPromptOptions(), customPrompt: REVIEWER_PROMPT });
});

it("append extends the addendum", () => {
  // GIVEN an addendum another extension already wrote into the options,
  const options = createPromptOptions();

  // WHEN an agent in append mode is applied,
  applyAgentToPromptOptions(options, createAgent({ prompt: REVIEWER_PROMPT, promptMode: "append" }));

  // THEN the body follows that addendum instead of replacing it, and the role
  // prompt is left alone:
  expect(options).toEqual({
    ...createPromptOptions(),
    appendSystemPrompt: `${EXISTING_ADDENDUM}\n\n${REVIEWER_PROMPT}`,
  });
});

it("body is trimmed", () => {
  // GIVEN an agent body that still carries the whitespace around it,
  const options = createPromptOptions();

  // WHEN it is applied in replace mode,
  applyAgentToPromptOptions(options, createAgent({ prompt: `  \n${REVIEWER_PROMPT}\n\n`, promptMode: "replace" }));

  // THEN the request gets the prompt without the padding, and nothing else changed:
  expect(options).toEqual({ ...createPromptOptions(), customPrompt: REVIEWER_PROMPT });
});

it("append does not accumulate across runs", () => {
  // GIVEN two separately normalized options objects, the way pi hands them over —
  // one per run — and an agent in append mode:
  const firstRun = createPromptOptions();
  const secondRun = createPromptOptions();
  const agent = createAgent({ prompt: REVIEWER_PROMPT, promptMode: "append" });

  // WHEN each is applied exactly once,
  applyAgentToPromptOptions(firstRun, agent);
  applyAgentToPromptOptions(secondRun, agent);

  // THEN each run carries the body once behind a single separator, so a resumed
  // conversation does not grow a paragraph per message. Applying twice to *one*
  // object would legitimately compound; options are per run, which is the point.
  expect(firstRun.appendSystemPrompt).toEqual(`${EXISTING_ADDENDUM}\n\n${REVIEWER_PROMPT}`);
  expect(secondRun.appendSystemPrompt).toEqual(`${EXISTING_ADDENDUM}\n\n${REVIEWER_PROMPT}`);
  expect(countSeparators(firstRun.appendSystemPrompt)).toBe(1);
  expect(countSeparators(secondRun.appendSystemPrompt)).toBe(1);
});

/** How many blank lines the addendum has grown: one per apply, never more. */
function countSeparators(text: string): number {
  return text.split("\n\n").length - 1;
}
