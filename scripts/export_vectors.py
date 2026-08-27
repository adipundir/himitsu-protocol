#!/usr/bin/env python3
"""Capture `snforge test` output on stdin, relay it unchanged, and write
epochs/vectors.json from any `VECTOR key value` lines printed by
contracts/tests/test_vectors.cairo.

This exists because snforge_std has no file-write cheatcode (fs.cairo is
read-only) — println! + stdout capture is the only way to get data out of a
Cairo test. Used by `make contracts-test`; see Makefile.
"""
import re
import sys
from pathlib import Path

VECTOR_RE = re.compile(r"^VECTOR (\S+) (\S+)$")
REPO_ROOT = Path(__file__).resolve().parent.parent
OUT_PATH = REPO_ROOT / "epochs" / "vectors.json"


def main() -> int:
    vectors: dict[str, str] = {}
    saw_fail = False

    for line in sys.stdin:
        sys.stdout.write(line)
        sys.stdout.flush()
        stripped = line.rstrip("\n")
        if stripped.startswith("[FAIL]"):
            saw_fail = True
        match = VECTOR_RE.match(stripped)
        if match:
            vectors[match.group(1)] = match.group(2)

    if saw_fail:
        print("export_vectors: snforge reported a failing test, not writing epochs/vectors.json", file=sys.stderr)
        return 1

    if not vectors:
        print("export_vectors: no VECTOR lines captured from snforge output — tests must print them", file=sys.stderr)
        return 1

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with OUT_PATH.open("w") as f:
        import json

        json.dump(vectors, f, indent=2, sort_keys=True)
        f.write("\n")

    print(f"export_vectors: wrote {OUT_PATH.relative_to(REPO_ROOT)} ({len(vectors)} values)", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
