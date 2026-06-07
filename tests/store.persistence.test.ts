import { execFile } from "child_process";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { promisify } from "util";

import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);

const runStoreScript = async (folder: string, script: string): Promise<string> => {
  const { stdout } = await execFileAsync(
    process.execPath,
    ["--import", "tsx", "--eval", script],
    {
      cwd: process.cwd(),
      env: { ...process.env, STORE_FOLDER: folder },
    },
  );
  return stdout.trim();
};

describe("store persistence", () => {
  it("reopens the saved trie root instead of starting from an empty root", async () => {
    const folder = await fs.mkdtemp(path.join(os.tmpdir(), "demi-mpt-"));

    try {
      const savedHash = await runStoreScript(
        folder,
        `
          import { init } from "./src/store/index.ts";

          const db = await init(process.env.STORE_FOLDER);
          await db.insert("alice", "");
          await new Promise((resolve) => setTimeout(resolve, 50));
          console.log(db.hash.toString("hex"));
        `,
      );

      const reopenedHash = await runStoreScript(
        folder,
        `
          import { init } from "./src/store/index.ts";

          const db = await init(process.env.STORE_FOLDER);
          console.log(db.hash.toString("hex"));
        `,
      );

      expect(reopenedHash).toBe(savedHash);
    } finally {
      await fs.rm(folder, { recursive: true, force: true });
    }
  });
});
