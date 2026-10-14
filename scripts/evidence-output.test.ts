import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createEvidenceRun } from "../frontend/e2e/evidence-output.ts";

function workspace() {
  const temporary = mkdtempSync(join(tmpdir(), "hanbit-evidence-test-"));
  const checkout = join(temporary, "checkout");
  mkdirSync(checkout);
  return {
    temporary,
    checkout: realpathSync(checkout),
    cleanup: () => rmSync(temporary, { recursive: true, force: true }),
  };
}

test("unset capture performs no filesystem reads or writes", () => {
  // Even an absent root is not touched when the caller only wants assertions.
  assert.equal(
    createEvidenceRun("/not-a-real-worktree/readonly", {}),
    undefined,
  );
});

test("each configured plan and run gets new output without overwriting its predecessor", () => {
  const w = workspace();
  try {
    const first = createEvidenceRun(w.checkout, {
      plan: "student-plan",
      run: "first",
    });
    assert.ok(first);
    const original = first.file("layout.jsonl");
    writeFileSync(original, "first-run-evidence\n");
    assert.throws(() =>
      createEvidenceRun(w.checkout, { plan: "student-plan", run: "first" }),
    );
    const next = createEvidenceRun(w.checkout, {
      plan: "teacher-plan",
      run: "combined-1",
    });
    assert.ok(next);
    assert.equal(
      next.file("result-360.png"),
      join(
        w.checkout,
        ".superpowers",
        "sdd",
        "teacher-plan",
        "evidence",
        "combined-1",
        "result-360.png",
      ),
    );
    writeFileSync(next.file("layout.jsonl"), "teacher-run-evidence\n");
    assert.equal(readFileSync(original, "utf8"), "first-run-evidence\n");
  } finally {
    w.cleanup();
  }
});

test("unsafe or partial configuration is rejected before creating any directory", () => {
  const w = workspace();
  try {
    for (const bad of [
      "",
      "..",
      "/tmp/outside",
      "one/../two",
      "one/two",
      "one\\two",
      "safe\n",
      "x".repeat(101),
    ]) {
      assert.throws(() =>
        createEvidenceRun(w.checkout, { plan: bad, run: "run-1" }),
      );
      assert.throws(() =>
        createEvidenceRun(w.checkout, { plan: "teacher-plan", run: bad }),
      );
    }
    assert.throws(() =>
      createEvidenceRun(w.checkout, { plan: "teacher-plan" }),
    );
    assert.throws(() => createEvidenceRun(w.checkout, { run: "run-1" }));
    assert.deepEqual(readdirSync(w.checkout), []);
  } finally {
    w.cleanup();
  }
});

test("existing symlinks cannot redirect any ancestor or artifact outside the checkout", () => {
  const segments = [".superpowers", "sdd", "teacher-plan", "evidence", "run-1"];
  for (let index = 0; index < segments.length; index++) {
    const w = workspace();
    try {
      const outside = join(w.temporary, "outside");
      mkdirSync(outside);
      const parent = join(w.checkout, ...segments.slice(0, index));
      mkdirSync(parent, { recursive: true });
      symlinkSync(outside, join(parent, segments[index]));
      assert.throws(() => createEvidenceRun(w.checkout, { plan: "teacher-plan", run: "run-1" }));
      assert.deepEqual(readdirSync(outside), []);
    } finally {
      w.cleanup();
    }
  }
});

test("artifact traversal and symlink leaves are rejected before a writer receives a path", () => {
  const w = workspace();
  try {
    const output = createEvidenceRun(w.checkout, {
      plan: "teacher-plan",
      run: "run-1",
    });
    assert.ok(output);
    for (const name of [
      "../student-plan/layout.jsonl",
      "/tmp/escape.png",
      "nested/result.png",
      "bad\\result.png",
      "result.png\n",
    ])
      assert.throws(() => output.file(name));
    const outside = join(w.temporary, "outside.txt");
    writeFileSync(outside, "unchanged");
    symlinkSync(outside, output.file("result-360.png"));
    assert.throws(() => output.file("result-360.png"));
    assert.equal(readFileSync(outside, "utf8"), "unchanged");
  } finally {
    w.cleanup();
  }
});
