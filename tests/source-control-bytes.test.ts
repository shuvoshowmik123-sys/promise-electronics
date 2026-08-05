import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * No source file may contain a raw control byte.
 *
 * This exists because the same defect was introduced three times in one phase.
 * Editing files through a non-raw Python string silently converts `\b` into an
 * actual backspace (0x08) — and unlike `\d`, which at least warns, `\b` is a
 * VALID Python escape, so nothing complains. The result looks correct in every
 * editor and diff, because a backspace renders as nothing.
 *
 * The damage is worst in tests. A regex written as
 *
 *     expect(body).not.toMatch(/\b\d{6}\b/)
 *
 * becomes `/<BS>\d{6}<BS>/`, which cannot match anything — so the assertion
 * "the driver never sees the code" passed while proving nothing at all. A
 * security proof that is green for the wrong reason is worse than no proof: it
 * stops anyone looking.
 *
 * It also broke production code once, silently disabling customer code
 * retrieval entirely.
 *
 * A checklist item was not enough — this is the machine-checkable version.
 */

const ROOT = process.cwd();
const SCAN_DIRS = ["server", "client/src", "shared", "tests"];
const SOURCE_EXT = /\.(ts|tsx|js|jsx|mjs|cjs|css|json|md|sql)$/;

/**
 * Tab, newline and carriage return are ordinary formatting. Everything else
 * below 0x20 is a control byte with no business in source.
 */
const ALLOWED = new Set([0x09, 0x0a, 0x0d]);

function collectFiles(dir: string, out: string[] = []): string[] {
    let entries: string[];
    try {
        entries = readdirSync(dir);
    } catch {
        return out;
    }
    for (const entry of entries) {
        if (entry === "node_modules" || entry === "dist" || entry === ".git") continue;
        const full = join(dir, entry);
        const stat = statSync(full);
        if (stat.isDirectory()) collectFiles(full, out);
        else if (SOURCE_EXT.test(entry)) out.push(full);
    }
    return out;
}

describe("source files contain no raw control bytes", () => {
    it("finds no backspace or other control characters in tracked source", () => {
        const offenders: string[] = [];

        for (const dir of SCAN_DIRS) {
            for (const file of collectFiles(join(ROOT, dir))) {
                const buf = readFileSync(file);
                for (let i = 0; i < buf.length; i++) {
                    const byte = buf[i]!;
                    if (byte < 0x20 && !ALLOWED.has(byte)) {
                        const line = buf.subarray(0, i).toString("utf8").split("\n").length;
                        offenders.push(
                            `${relative(ROOT, file)}:${line} contains control byte 0x${byte.toString(16).padStart(2, "0")}`,
                        );
                        break; // one report per file is enough to act on
                    }
                }
            }
        }

        expect(offenders, offenders.join("\n")).toEqual([]);
    });
});
