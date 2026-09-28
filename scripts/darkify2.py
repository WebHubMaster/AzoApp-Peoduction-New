"""Pass 2: convert ternary fallbacks like `? X : "#fff"` / `: SLATE[200]` to TC tokens."""
import re, sys, pathlib

RULES = [
    (r': "#fff"(?=[,\s}])', ': TC.surface'),
    (r': SLATE\[(?:200|300)\](?=[,\s}])', ': TC.border'),
    (r': SLATE\[100\](?=[,\s}])', ': TC.surfaceAlt'),
    (r': SLATE\[50\](?=[,\s}])', ': TC.bg'),
    (r': SLATE\[(?:900|800)\](?=[,\s}])', ': TC.text'),
    (r': SLATE\[700\](?=[,\s}])', ': TC.text2'),
    (r': SLATE\[(?:600|500)\](?=[,\s}])', ': TC.textMuted'),
    (r': SLATE\[400\](?=[,\s}])', ': TC.textFaint'),
]

def ensure_import(s: str) -> str:
    if re.search(r'import \{[^}]*\bTC\b[^}]*\} from "[^"]*theme"', s):
        return s
    m = re.search(r'import \{([^}]*)\} from "([^"]*theme)";', s)
    if m:
        return s.replace(m.group(0), f'import {{{m.group(1).rstrip()}, TC }} from "{m.group(2)}";', 1)
    return 'import { TC } from "@/src/theme";\n' + s

for f in sys.argv[1:]:
    p = pathlib.Path(f); src = p.read_text(); lines = src.split("\n")
    for i, l in enumerate(lines):
        if " ? " not in l:
            continue
        for pat, rep in RULES:
            l = re.sub(pat, rep, l)
        l = l.replace('color: TC.surface', 'color: "#fff"')
        lines[i] = l
    out = "\n".join(lines)
    if out != src:
        p.write_text(ensure_import(out)); print("updated", f)
