import { lstatSync, readFileSync, readdirSync, type Stats } from "node:fs";
import { basename, join, resolve } from "node:path";

import { parseFrontmatter } from "@earendil-works/pi-coding-agent";

/**
 * Local agent files are the operator's own text, but the body goes straight into
 * the system prompt. Upstream applies this ceiling to third-party package
 * resources only; applying it to local files too is a deliberate, stricter choice.
 */
const MAX_AGENT_FILE_BYTES = 1_048_576;

/**
 * The label of pi's built-in agent. The footer label is the identity of the
 * selected agent, so an agent may not claim the reset position. Kept as a plain
 * lower-case literal because the label constant itself arrives with the cycle
 * list in a later increment.
 */
const RESERVED_AGENT_NAME = "main";

const AGENT_FILE_EXTENSION = ".md";

export interface AgentDefinition {
  /** Frontmatter `name`, else the file name. */
  name: string;
  /** Frontmatter `description`, else the name. */
  description: string;
  /** File body, trimmed. */
  prompt: string;
  /** Frontmatter `prompt_mode`, default `"replace"`. */
  promptMode: "replace" | "append";
  /** Frontmatter `enabled`, default `true`. */
  enabled: boolean;
  /** Absolute path of the `.md` file. */
  sourcePath: string;
  /** `"package"` is declared but never produced in this increment. */
  source: "project" | "workspace" | "global" | "package";
}

/** One agent file either yields a definition or a reason to leave it out. */
type AgentFileResult =
  | { readonly verdict: "loaded"; readonly agent: AgentDefinition }
  | { readonly verdict: "skipped"; readonly reason: string };

interface DiscoveryTier {
  readonly source: AgentDefinition["source"];
  readonly directory: string;
}

/**
 * Discovery order, lowest priority first: a later tier replaces an earlier entry
 * of the same name. Absolute paths are resolved here so that every `sourcePath`
 * and every `onSkip` path is absolute regardless of how the caller passed `cwd`.
 */
function discoveryTiers(cwd: string, agentDir: string): readonly DiscoveryTier[] {
  return [
    { source: "global", directory: resolve(agentDir, "agents") },
    { source: "workspace", directory: resolve(cwd, ".agents", "agents") },
    { source: "project", directory: resolve(cwd, ".pi", "agents") },
  ];
}

/**
 * Load every agent below the three local directories, name-keyed so that a
 * project agent replaces a global one instead of appearing twice.
 *
 * `options.packageDirs` is a seam, not a feature: the package tier is deferred,
 * so nothing reads those directories yet and this module never produces
 * `source: "package"`. The field exists so the follow-up increment does not have
 * to change the signature again.
 */
export function loadAgents(
  cwd: string,
  agentDir: string,
  options?: { packageDirs?: string[]; onSkip?: (path: string, reason: string) => void },
): AgentDefinition[] {
  const onSkip = options?.onSkip;
  const agentsByName = new Map<string, AgentDefinition>();

  for (const tier of discoveryTiers(cwd, agentDir)) {
    for (const agentPath of listAgentFiles(tier.directory)) {
      const result = readAgentFile(agentPath, tier.source);
      if (result.verdict === "skipped") {
        onSkip?.(agentPath, result.reason);
        continue;
      }
      // `Map.set` keeps the first insertion position and takes the later value:
      // that is exactly the upstream precedence rule.
      agentsByName.set(result.agent.name, result.agent);
    }
  }

  return [...agentsByName.values()];
}

/**
 * A missing or unreadable directory is an empty tier. pi must start and the
 * cycle must work even when a permission bit is wrong — this is discovery, not
 * a gate.
 */
function listAgentFiles(directory: string): string[] {
  let fileNames: string[];
  try {
    fileNames = readdirSync(directory);
  } catch {
    return [];
  }
  return fileNames
    .filter((fileName) => fileName.endsWith(AGENT_FILE_EXTENSION))
    .map((fileName) => join(directory, fileName));
}

/** Read and validate one agent file. Every rejection carries its own reason. */
function readAgentFile(path: string, source: AgentDefinition["source"]): AgentFileResult {
  const fileProblem = findFileProblem(path);
  if (fileProblem !== undefined) {
    return skip(fileProblem);
  }

  let content: string;
  try {
    content = readFileSync(path, "utf8");
  } catch (error) {
    return skip(`Could not be read: ${describeError(error)}`);
  }

  // Typed as `unknown` on purpose: the generic parameter of `parseFrontmatter` is
  // an unchecked assertion, and a YAML sequence or scalar really does come back
  // here. Narrowing at runtime keeps the compiler honest.
  let parsed: { readonly frontmatter: unknown; readonly body: string };
  try {
    parsed = parseFrontmatter(content);
  } catch (error) {
    return skip(`Frontmatter is not valid YAML: ${describeError(error)}`);
  }

  // A frontmatter block that is not a mapping is treated as no frontmatter at
  // all: every field then falls back to its default instead of half-loading.
  const frontmatter = isPlainRecord(parsed.frontmatter) ? parsed.frontmatter : {};
  const body = parsed.body;

  // `||`, not `??`: a quoted empty or whitespace-only `name:` would otherwise
  // make the agent unaddressable under an empty label.
  const name = readString(frontmatter, "name")?.trim() || basename(path, AGENT_FILE_EXTENSION);
  if (name.toLowerCase() === RESERVED_AGENT_NAME) {
    return skip(`The name "${name}" is reserved for pi's built-in agent.`);
  }

  const prompt = body.trim();
  if (prompt === "") {
    return skip("The body is empty, so pi would silently keep its own system prompt.");
  }

  return {
    verdict: "loaded",
    agent: {
      name,
      description: readString(frontmatter, "description") ?? name,
      prompt,
      promptMode: frontmatter["prompt_mode"] === "append" ? "append" : "replace",
      // A wrong type counts as a missing field, hence a permissive comparison.
      enabled: frontmatter["enabled"] !== false,
      sourcePath: path,
      source,
    },
  };
}

/** The checks that decide before the file is read at all: symlink, regular file, size. */
function findFileProblem(path: string): string | undefined {
  let fileStat: Stats;
  try {
    // `lstat`, not `stat`: `stat` follows links, so a committed `foo.md` pointing
    // outside the repository would look like a small regular file and its content
    // would become a system prompt. The link itself is what gets judged here.
    fileStat = lstatSync(path);
  } catch (error) {
    return `Could not be inspected: ${describeError(error)}`;
  }
  if (fileStat.isSymbolicLink()) {
    return "Is a symlink. Links are rejected so no agent file can point a system prompt at content outside these directories.";
  }
  if (!fileStat.isFile()) {
    return "Not a regular file.";
  }
  if (fileStat.size > MAX_AGENT_FILE_BYTES) {
    return `Larger than ${MAX_AGENT_FILE_BYTES} bytes, the ceiling for an agent file.`;
  }
  return undefined;
}

/** Arrays and scalars are what a non-mapping frontmatter block yields at runtime. */
function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Frontmatter is `Record<string, unknown>`, so every field needs narrowing. A
 * wrong type is treated like a missing field and the default applies.
 */
function readString(frontmatter: Record<string, unknown>, key: string): string | undefined {
  const value = frontmatter[key];
  return typeof value === "string" ? value : undefined;
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function skip(reason: string): AgentFileResult {
  return { verdict: "skipped", reason };
}
