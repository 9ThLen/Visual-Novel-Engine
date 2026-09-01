import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { beginOutPath, OUTPUT_MARKER } from "../../../tools/lib/out-path";

const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");

function tempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "vne-out-path-"));
}

describe("safe generated output directories", () => {
  let root: string;

  beforeEach(() => {
    root = tempDir();
  });
  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("never replaces a regular file", () => {
    const output = path.join(root, "novel.zip");
    fs.writeFileSync(output, "keep");

    expect(() => beginOutPath(output, { repoRoot: REPO_ROOT })).toThrow(
      "not a directory",
    );
    expect(fs.readFileSync(output, "utf8")).toBe("keep");
  });

  it("does not trust a marker name without the marker it issued for that path", () => {
    const output = path.join(root, "source");
    fs.mkdirSync(output);
    fs.writeFileSync(
      path.join(output, OUTPUT_MARKER),
      `${JSON.stringify({
        kind: "visual-novel-engine-output",
        version: 1,
        path: path.join(root, "somewhere-else"),
      })}\n`,
    );
    fs.writeFileSync(path.join(output, "keep.png"), "keep");

    expect(() => beginOutPath(output, { repoRoot: REPO_ROOT })).toThrow(
      "valid build marker",
    );
    expect(fs.readFileSync(path.join(output, "keep.png"), "utf8")).toBe("keep");
  });

  it("refuses a symlink or junction even when its target is generated output", () => {
    const target = path.join(root, "target");
    const first = beginOutPath(target, { repoRoot: REPO_ROOT });
    fs.writeFileSync(path.join(first.workPath, "keep.png"), "keep");
    first.commit();

    const link = path.join(root, "linked-output");
    fs.symlinkSync(
      target,
      link,
      process.platform === "win32" ? "junction" : "dir",
    );

    expect(() => beginOutPath(link, { repoRoot: REPO_ROOT })).toThrow(
      "symbolic link or junction",
    );
    expect(fs.readFileSync(path.join(target, "keep.png"), "utf8")).toBe("keep");
  });

  it("refuses every ancestor, descendant, and exact overlap with an input", () => {
    const input = path.join(root, "input");
    fs.mkdirSync(path.join(input, "child"), { recursive: true });

    for (const output of [root, input, path.join(input, "child")]) {
      expect(
        () =>
          beginOutPath(output, {
            repoRoot: REPO_ROOT,
            cwd: REPO_ROOT,
            inputs: [input],
          }),
        output,
      ).toThrow(/contains input|inside input/);
    }
  });

  it("keeps the previous complete output when replacement staging fails", () => {
    const output = path.join(root, "output");
    const first = beginOutPath(output, { repoRoot: REPO_ROOT });
    fs.writeFileSync(path.join(first.workPath, "complete.txt"), "old");
    first.commit();

    const replacement = beginOutPath(output, { repoRoot: REPO_ROOT });
    fs.writeFileSync(path.join(replacement.workPath, "partial.txt"), "new");
    replacement.abort();

    expect(fs.readFileSync(path.join(output, "complete.txt"), "utf8")).toBe(
      "old",
    );
    expect(fs.existsSync(path.join(output, "partial.txt"))).toBe(false);
  });
});
