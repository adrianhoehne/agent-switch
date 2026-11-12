import { chmodSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, expect, it } from "vitest";

import { loadAgents } from "../src/agents";

/**
 * Local files only, so the upstream ceiling for package resources applies here
 * as a deliberate choice. Spelled out rather than imported: the constant is an
 * implementation detail, the contract is the number.
 */
const ONE_MEGABYTE = 1_048_576;

type AgentLayer = "global" | "workspace" | "project";

interface AgentFixture {
  /** Stands in for a project working directory. */
  readonly cwd: string;
  /** Stands in for pi's agent directory (`getAgentDir()`). */
  readonly agentDir: string;
  layerDirectory(layer: AgentLayer): string;
  /** Writes one agent file and returns its absolute path. */
  write(layer: AgentLayer, fileName: string, content: string): string;
  remove(): void;
}

interface AgentSkip {
  readonly path: string;
  readonly reason: string;
}

/**
 * One `mkdtemp` root per case, laid out the way pi would find it:
 * `<root>/agent-home/agents`, `<root>/project-root/.agents/agents` and
 * `<root>/project-root/.pi/agents`.
 */
function createFixture(): AgentFixture {
  const root = mkdtempSync(join(tmpdir(), "agent-switch-agents-"));
  const cwd = join(root, "project-root");
  const agentDir = join(root, "agent-home");
  mkdirSync(cwd, { recursive: true });

  const layerDirectories: Record<AgentLayer, string> = {
    global: join(agentDir, "agents"),
    workspace: join(cwd, ".agents", "agents"),
    project: join(cwd, ".pi", "agents"),
  };

  return {
    cwd,
    agentDir,
    layerDirectory: (layer) => layerDirectories[layer],
    write(layer, fileName, content) {
      const directory = layerDirectories[layer];
      mkdirSync(directory, { recursive: true });
      const path = join(directory, fileName);
      writeFileSync(path, content, "utf8");
      return path;
    },
    remove() {
      // The unreadable-directory case leaves permissions behind that would make
      // the recursive delete itself fail, so put them back first.
      for (const directory of Object.values(layerDirectories)) {
        try {
          chmodSync(directory, 0o700);
        } catch {
          // Never created in this case — nothing to restore.
        }
      }
      rmSync(root, { recursive: true, force: true });
    },
  };
}

/** An agent file with YAML frontmatter, exactly as a user would write it. */
function agentSource(frontmatter: string, body: string): string {
  return `---\n${frontmatter}\n---\n\n${body}\n`;
}

let fixture: AgentFixture;
let skips: AgentSkip[];

const recordSkip = (path: string, reason: string): void => {
  skips.push({ path, reason });
};

beforeEach(() => {
  fixture = createFixture();
  skips = [];
});

afterEach(() => {
  fixture.remove();
});

it("parses name, description and prompt mode", () => {
  // GIVEN a project agent that fills in every frontmatter field this increment reads:
  const sourcePath = fixture.write(
    "project",
    "reviewer.md",
    agentSource("name: reviewer\ndescription: Reviews code\nprompt_mode: append", "You review code."),
  );

  // WHEN the agent directories are loaded,
  const agents = loadAgents(fixture.cwd, fixture.agentDir, { onSkip: recordSkip });

  // THEN the frontmatter has become the interface, with defaults filled in:
  expect(agents).toEqual([
    {
      name: "reviewer",
      description: "Reviews code",
      prompt: "You review code.",
      promptMode: "append",
      enabled: true,
      sourcePath,
      source: "project",
    },
  ]);
  expect(skips).toEqual([]);
});

it("name falls back to the file name", () => {
  // GIVEN an agent file without a `name:` field,
  fixture.write("workspace", "helper.md", agentSource("description: Helps out", "Helps with chores."));

  // WHEN it is loaded,
  const agents = loadAgents(fixture.cwd, fixture.agentDir, { onSkip: recordSkip });

  // THEN it is addressable under its file name, and the description survives:
  expect(agents).toHaveLength(1);
  expect(agents[0]).toMatchObject({ name: "helper", description: "Helps out", promptMode: "replace" });
  expect(skips).toEqual([]);
});

it("list frontmatter falls back to defaults", () => {
  // GIVEN a file whose frontmatter is a YAML sequence instead of a mapping —
  // the parser hands back an array at runtime, even though its generic claims a
  // record,
  const listPath = fixture.write("project", "listy.md", agentSource("- a\n- b", "Listy text."));

  // WHEN it is loaded,
  const agents = loadAgents(fixture.cwd, fixture.agentDir, { onSkip: recordSkip });

  // THEN the non-mapping block counts as no frontmatter at all: the file still
  // loads, named after itself, with every other field at its default:
  expect(agents).toEqual([
    {
      name: "listy",
      description: "listy",
      prompt: "Listy text.",
      promptMode: "replace",
      enabled: true,
      sourcePath: listPath,
      source: "project",
    },
  ]);
  expect(skips).toEqual([]);
});

it("project agent overrides global", () => {
  // GIVEN one agent name claimed by both the global and the project tier,
  fixture.write("global", "reviewer.md", agentSource("name: reviewer", "Global text."));
  fixture.write("project", "reviewer.md", agentSource("name: reviewer", "Project text."));

  // WHEN both tiers are loaded,
  const agents = loadAgents(fixture.cwd, fixture.agentDir, { onSkip: recordSkip });

  // THEN the project agent is the only survivor:
  expect(agents).toHaveLength(1);
  expect(agents[0]).toMatchObject({ name: "reviewer", source: "project", prompt: "Project text." });
});

it("duplicate name: later tier wins", () => {
  // GIVEN three differently named files that declare the same agent name,
  fixture.write("global", "audit-global.md", agentSource("name: auditor", "Global text."));
  fixture.write("workspace", "audit-workspace.md", agentSource("name: auditor", "Workspace text."));
  fixture.write("project", "audit-project.md", agentSource("name: auditor", "Project text."));

  // WHEN discovery runs over all three tiers,
  const agents = loadAgents(fixture.cwd, fixture.agentDir, { onSkip: recordSkip });

  // THEN discovery stays name-keyed — one entry, from the highest tier:
  expect(agents).toHaveLength(1);
  expect(agents[0]).toMatchObject({ name: "auditor", source: "project", prompt: "Project text." });
});

it("workspace agent is read", () => {
  // GIVEN an agent in the shared workspace directory,
  fixture.write("workspace", "support.md", agentSource("name: support", "Support text."));

  // WHEN discovery runs,
  const agents = loadAgents(fixture.cwd, fixture.agentDir, { onSkip: recordSkip });

  // THEN `.agents/agents` is a tier of its own:
  expect(agents).toHaveLength(1);
  expect(agents[0]).toMatchObject({ name: "support", source: "workspace" });
});

it("disabled agent is skipped", () => {
  // GIVEN an agent that is switched off in its frontmatter,
  fixture.write("project", "retired.md", agentSource("name: retired\nenabled: false", "Retired text."));

  // WHEN it is loaded,
  const agents = loadAgents(fixture.cwd, fixture.agentDir, { onSkip: recordSkip });

  // THEN the definition keeps the flag, and nothing is offered for the cycle.
  // Filtering here instead would make `enabled` in `AgentDefinition` pointless.
  expect(agents).toMatchObject([{ name: "retired", enabled: false }]);
  expect(agents.filter((agent) => agent.enabled)).toEqual([]);
});

it("broken file is skipped", () => {
  // GIVEN one file with unparseable frontmatter next to a healthy one,
  const brokenPath = fixture.write("project", "broken.md", agentSource("name: [unclosed", "Body."));
  fixture.write("project", "healthy.md", agentSource("name: healthy", "Healthy text."));

  // WHEN discovery runs,
  const agents = loadAgents(fixture.cwd, fixture.agentDir, { onSkip: recordSkip });

  // THEN the broken file is reported, not thrown, and the cycle still has an entry:
  expect(agents.map((agent) => agent.name)).toEqual(["healthy"]);
  expect(skips).toHaveLength(1);
  expect(skips[0]?.path).toBe(brokenPath);
  expect(skips[0]?.reason).toContain("YAML");
});

it("empty body is skipped", () => {
  // GIVEN an agent file whose body is only whitespace,
  const emptyPath = fixture.write("project", "empty.md", agentSource("name: empty", "   "));

  // WHEN it is loaded,
  const agents = loadAgents(fixture.cwd, fixture.agentDir, { onSkip: recordSkip });

  // THEN it is skipped: an empty custom prompt would silently keep pi's own prompt.
  expect(agents).toEqual([]);
  expect(skips).toHaveLength(1);
  expect(skips[0]?.path).toBe(emptyPath);
  expect(skips[0]?.reason).toContain("empty");
});

it("agent named Main is skipped", () => {
  // GIVEN an agent that claims the reset label, in mixed casing,
  const reservedPath = fixture.write("project", "reset.md", agentSource("name: mAiN", "Body."));

  // WHEN it is loaded,
  const agents = loadAgents(fixture.cwd, fixture.agentDir, { onSkip: recordSkip });

  // THEN it is skipped — the label is the identity of the selection:
  expect(agents).toEqual([]);
  expect(skips).toHaveLength(1);
  expect(skips[0]?.path).toBe(reservedPath);
  expect(skips[0]?.reason).toContain("reserved");
});

it("oversized file is skipped", () => {
  // GIVEN an agent file just above the one-megabyte ceiling,
  const oversizedPath = fixture.write(
    "project",
    "huge.md",
    agentSource("name: huge", "x".repeat(ONE_MEGABYTE + 1)),
  );

  // WHEN it is loaded,
  const agents = loadAgents(fixture.cwd, fixture.agentDir, { onSkip: recordSkip });

  // THEN it never reaches the system prompt:
  expect(agents).toEqual([]);
  expect(skips).toHaveLength(1);
  expect(skips[0]?.path).toBe(oversizedPath);
  expect(skips[0]?.reason).toContain("Larger than");
});

it("non-regular file is skipped", () => {
  // GIVEN a directory that is named like an agent file,
  const directoryPath = join(fixture.layerDirectory("project"), "folder.md");
  mkdirSync(directoryPath, { recursive: true });

  // WHEN it is loaded,
  const agents = loadAgents(fixture.cwd, fixture.agentDir, { onSkip: recordSkip });

  // THEN it is skipped instead of being read as a file:
  expect(agents).toEqual([]);
  expect(skips).toHaveLength(1);
  expect(skips[0]?.path).toBe(directoryPath);
  expect(skips[0]?.reason).toContain("Not a regular file");
});

it("symlinked file is skipped", () => {
  // GIVEN a real agent file outside the fixture — the kind of thing a committed
  // `*.md` link could point at — and a project agent file that is a link to it,
  // outsideRoot is a sibling temp directory, so the target is not inside the
  // tier directory at all:
  const outsideRoot = mkdtempSync(join(tmpdir(), "agent-switch-outside-"));
  try {
    const outsidePath = join(outsideRoot, "elsewhere.md");
    writeFileSync(outsidePath, agentSource("name: smuggled", "Text from outside."), "utf8");

    const linkPath = join(fixture.layerDirectory("project"), "linked.md");
    mkdirSync(fixture.layerDirectory("project"), { recursive: true });
    symlinkSync(outsidePath, linkPath);

    // WHEN discovery runs,
    const agents = loadAgents(fixture.cwd, fixture.agentDir, { onSkip: recordSkip });

    // THEN the link is rejected rather than followed, and the user is told why:
    expect(agents).toEqual([]);
    expect(skips).toHaveLength(1);
    expect(skips[0]?.path).toBe(linkPath);
    expect(skips[0]?.reason).toContain("symlink");
  } finally {
    rmSync(outsideRoot, { recursive: true, force: true });
  }
});

// Root ignores permission bits, so the premise of this case cannot be established.
it.skipIf(process.getuid?.() === 0)("unreadable directory counts as empty", () => {
  // GIVEN a tier directory holding a valid agent and the process may not even
  // list it — the file would be found if the permission error were swallowed
  // as "readable but empty":
  fixture.write("project", "hidden.md", agentSource("name: hidden", "Hidden text."));
  const projectDirectory = fixture.layerDirectory("project");
  chmodSync(projectDirectory, 0o000);

  // WHEN discovery runs,
  let agents: ReturnType<typeof loadAgents> | undefined;
  try {
    agents = loadAgents(fixture.cwd, fixture.agentDir, { onSkip: recordSkip });
  } finally {
    chmodSync(projectDirectory, 0o700);
  }

  // THEN it counts as empty: no throw, no crash, no warning storm:
  expect(agents).toEqual([]);
  expect(skips).toEqual([]);
});
