"""One-off: convert hardcoded light palette tokens in Customer site files to TC.* theme tokens."""
import re, sys, pathlib

RULES = [
    (r'backgroundColor: "#fff"', 'backgroundColor: TC.surface'),
    (r'backgroundColor: "#FFFFFF"', 'backgroundColor: TC.surface'),
    (r'backgroundColor: "rgba\(248,250,252,0\.[0-9]+\)"', 'backgroundColor: TC.bg'),
    (r'backgroundColor: "rgba\(255,255,255,0\.9[0-9]?\)"', 'backgroundColor: TC.surface'),
    (r'backgroundColor: SLATE\[50\]', 'backgroundColor: TC.bg'),
    (r'backgroundColor: SLATE\[100\]', 'backgroundColor: TC.surfaceAlt'),
    (r'backgroundColor: SLATE\[200\]', 'backgroundColor: TC.border'),
    (r'backgroundColor: PRIMARY\[50\]', 'backgroundColor: TC.primarySoft'),
    (r'(border(?:Top|Bottom|Left|Right)?Color): SLATE\[(?:200|300)\]', r'\1: TC.border'),
    (r'(border(?:Top|Bottom|Left|Right)?Color): SLATE\[100\]', r'\1: TC.borderSoft'),
    (r'(border(?:Top|Bottom|Left|Right)?Color): "#E2E8F0"', r'\1: TC.border'),
    (r'(border(?:Top|Bottom|Left|Right)?Color): "#F1F5F9"', r'\1: TC.borderSoft'),
    (r'color: SLATE\[(?:900|800)\]', 'color: TC.text'),
    (r'color: SLATE\[700\]', 'color: TC.text2'),
    (r'color: SLATE\[(?:600|500)\]', 'color: TC.textMuted'),
    (r'color: SLATE\[(?:400|300)\]', 'color: TC.textFaint'),
    (r'color: "#0F172A"', 'color: TC.text'),
    (r'color: "#1E293B"', 'color: TC.text'),
    (r'color: "#334155"', 'color: TC.text2'),
    (r'color: "#64748B"', 'color: TC.textMuted'),
    (r'color: "#94A3B8"', 'color: TC.textFaint'),
    (r'color=\{SLATE\[(?:900|800)\]\}', 'color={TC.text}'),
    (r'color=\{SLATE\[700\]\}', 'color={TC.text2}'),
    (r'color=\{SLATE\[(?:600|500)\]\}', 'color={TC.textMuted}'),
    (r'color=\{SLATE\[(?:400|300)\]\}', 'color={TC.textFaint}'),
    (r'placeholderTextColor=\{SLATE\[[0-9]+\]\}', 'placeholderTextColor={TC.textFaint}'),
    (r'placeholderTextColor="#94A3B8"', 'placeholderTextColor={TC.textFaint}'),
    (r'color: PRIMARY\[700\]', 'color: TC.primaryText'),
    (r'color=\{PRIMARY\[700\]\}', 'color={TC.primaryText}'),
]

def process(p: pathlib.Path):
    src = p.read_text()
    out = src
    for pat, rep in RULES:
        out = re.sub(pat, rep, out)
    if out == src:
        return
    if "TC" not in re.findall(r'import \{([^}]*)\} from "(?:@/src|\.\./\.\./src|\.\./src|\.\./\.\./\.\./src)/theme"', out).__str__():
        m = re.search(r'import \{([^}]*)\} from "((?:@/src|\.\./\.\./src|\.\./src|\.\./\.\./\.\./src)/theme)";', out)
        if m:
            out = out.replace(m.group(0), f'import {{{m.group(1).rstrip()}, TC }} from "{m.group(2)}";', 1)
        else:
            out = 'import { TC } from "@/src/theme";\n' + out
    p.write_text(out)
    print("updated", p, sum(1 for a, b in zip(src.splitlines(), out.splitlines()) if a != b), "lines")

for f in sys.argv[1:]:
    process(pathlib.Path(f))
