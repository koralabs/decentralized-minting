import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

// Exercise the actual lib/ publication layout without installing,
// publishing, deleting the checkout's lib/, or contacting any service.
process.umask(0o077);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifacts = await mkdtemp(path.join(tmpdir(), "demi-sdk-package-"));
console.log(`Retained SDK package validation artifacts: ${artifacts}`);
const packageRoot = path.join(artifacts, "package");
const compiled = path.join(packageRoot, "lib");
const tsc = path.join(root, "node_modules", ".bin", "tsc");
const run = (command, args, cwd) => execFileSync(command, args, { cwd, stdio: "pipe" });

try {
  run(tsc, ["--project", path.join(root, "tsconfig.json"), "--outDir", compiled], root);
  for (const file of ["package.json", "README.md", "CHANGELOG.md"]) {
    await cp(path.join(root, file), path.join(packageRoot, file));
  }
  await mkdir(path.join(packageRoot, "docs", "spec"), { recursive: true });
  await cp(path.join(root, "docs", "spec", "sdk-4-migration.md"), path.join(packageRoot, "docs", "spec", "sdk-4-migration.md"));
  // npm <= 11 prints an array of packs; npm 12 prints an object keyed by package name.
  const [packed] = Object.values(JSON.parse(run("npm", ["pack", "--json", "--ignore-scripts", "--pack-destination", artifacts], packageRoot).toString()));
  const tarball = path.join(artifacts, packed.filename);
  const consumer = path.join(artifacts, "consumer");
  const modules = path.join(consumer, "node_modules");
  const packageDir = path.join(modules, "@koralabs", "handles-decentralized-minting");
  await mkdir(packageDir, { recursive: true });
  run("tar", ["-xzf", tarball, "--strip-components=1", "-C", packageDir], consumer);

  // Expose only declared runtime dependencies. Linking the entire development
  // node_modules tree could hide an undeclared runtime import in the package.
  const sourcePackage = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
  for (const name of [...Object.keys(sourcePackage.dependencies), "@types/node"]) {
    const destination = path.join(modules, name);
    await mkdir(path.dirname(destination), { recursive: true });
    await symlink(path.join(root, "node_modules", name), destination);
  }
  const packedPackage = JSON.parse(await readFile(path.join(packageDir, "package.json"), "utf8"));
  assert.equal(packedPackage.version, sourcePackage.version);
  assert.equal(packedPackage.types, "lib/index.d.ts");
  await writeFile(path.join(consumer, "package.json"), '{"private":true,"type":"module"}\n');
  await writeFile(path.join(consumer, "consumer.ts"), `
import { buildTrie, fillHandles, type HandleRegistryEntry } from "@koralabs/handles-decentralized-minting";
import * as cardano from "@koralabs/handles-decentralized-minting/helpers/cardano-sdk/index.js";
import * as txPlan from "@koralabs/handles-decentralized-minting/txs/txPlan.js";
import * as context from "@koralabs/handles-decentralized-minting/helpers/cardano-sdk/blockfrostContext.js";
const entries: readonly HandleRegistryEntry[] = Object.freeze([{ name: "alice", labels: "00001070" }]);
const trie = await buildTrie(entries);
await fillHandles(trie, [], () => {});
void [cardano, txPlan, context];
// @ts-expect-error SDK 4 requires an explicit label set.
await buildTrie(["alice"]);
// @ts-expect-error Missing labels must never default to the empty set.
await buildTrie([{ name: "alice" }]);
// @ts-expect-error Incremental callers have the same migration requirement.
await fillHandles(trie, ["alice"], () => {});
`);
  run(tsc, ["--noEmit", "--strict", "--skipLibCheck", "--module", "NodeNext", "--target", "ES2022", "consumer.ts"], consumer);
  await writeFile(path.join(consumer, "consumer.mjs"), `
import assert from "node:assert/strict";
import { buildTrie, fillHandles } from "@koralabs/handles-decentralized-minting";
import * as cardano from "@koralabs/handles-decentralized-minting/helpers/cardano-sdk/index.js";
import * as txPlan from "@koralabs/handles-decentralized-minting/txs/txPlan.js";
import * as context from "@koralabs/handles-decentralized-minting/helpers/cardano-sdk/blockfrostContext.js";
assert.ok(Object.keys(cardano).length && Object.keys(txPlan).length && Object.keys(context).length);
const entries = [{ name: "alice", labels: "00001070000020e0" }, { name: "bob", labels: "" }];
const trie = await buildTrie(entries);
assert.equal(trie.hash.toString("hex"), "ef84f39903c46336be5bc9ff8c873be7445551f45b4cefac27dbc8151754f2fd");
assert.deepEqual(await trie.get("alice"), Buffer.from(entries[0].labels, "hex"));
assert.deepEqual((await trie.prove("alice")).verify(), trie.hash);
const filled = await buildTrie([]);
let progress = 0;
console.log = () => {};
await fillHandles(filled, entries, () => progress++);
assert.equal(progress, 2);
assert.deepEqual(filled.hash, trie.hash);
for (const invalid of [["alice"], [{ name: "alice" }], [{ name: "alice", labels: "0000107g" }], [{ name: "alice", labels: "000020e000001070" }], [{ name: "alice", labels: "0000107000001070" }]]) {
  await assert.rejects(buildTrie(invalid), /registry|labels/i);
}
const initialRoot = Buffer.from(trie.hash);
await assert.rejects(fillHandles(trie, [{ name: "charlie", labels: "" }, { name: "dana", labels: "0000107g" }], () => progress++), /labels/i);
assert.deepEqual(trie.hash, initialRoot);
assert.equal(progress, 2);
`);
  run(process.execPath, ["consumer.mjs"], consumer);
  // A persisted file: dependency points at the checkout, not at the tarball.
  // It must resolve the same public API after the checkout has been built.
  const workspace = path.join(artifacts, "workspace-consumer");
  await mkdir(path.join(workspace, "node_modules", "@koralabs"), { recursive: true });
  await symlink(root, path.join(workspace, "node_modules", "@koralabs", "handles-decentralized-minting"));
  await symlink(path.join(root, "node_modules", "@types"), path.join(workspace, "node_modules", "@types"));
  for (const file of ["package.json", "consumer.ts", "consumer.mjs"]) {
    await cp(path.join(consumer, file), path.join(workspace, file));
  }
  run(tsc, ["--noEmit", "--strict", "--skipLibCheck", "--module", "NodeNext", "--target", "ES2022", "consumer.ts"], workspace);
  run(process.execPath, ["consumer.mjs"], workspace);
  console.log(`Validated SDK ${packedPackage.version}: packed and workspace public types, deep imports, roots, proofs and runtime rejection.`);
  console.log(`Packed SDK artifact: ${tarball}`);
} catch (error) {
  // Compiler/test output contains only this public source and synthetic inputs.
  if (error.stdout) process.stderr.write(error.stdout);
  if (error.stderr) process.stderr.write(error.stderr);
  throw error;
}
