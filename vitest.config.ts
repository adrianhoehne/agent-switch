import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    // Explicit imports keep every test file readable on its own, and they match
    // how the extension code has to be written anyway: no ambient globals.
    globals: false,
    // The default reporter prints a summary only, and the acceptance criterion
    // is that `npm test` names the cases it ran.
    reporters: ["verbose"],
  },
});
