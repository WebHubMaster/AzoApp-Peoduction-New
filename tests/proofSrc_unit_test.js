// Standalone unit test for proofSrc() logic from web_panel/src/components/WorkProof.jsx.
// Replicates the function (plus mediaSrc fallback) using an injected API origin so
// Node can run it without the CRA/babel/alias toolchain.

function makeHelpers(API_ORIGIN) {
  const API = `${API_ORIGIN}/api`;
  const mediaSrc = (u) => {
    if (!u) return u;
    const s = String(u);
    if (/^(https?:|data:|blob:)/i.test(s)) return s;
    return `${API_ORIGIN}${s.startsWith("/") ? "" : "/"}${s}`;
  };
  const proofSrc = (u) => {
    if (!u) return "";
    const s = String(u).trim();
    const m = s.match(/^https?:\/\/[^/]+(\/api\/media\/.*)$/i);
    if (m && API_ORIGIN) return `${API_ORIGIN}${m[1]}`;
    return mediaSrc(s);
  };
  return { API, mediaSrc, proofSrc };
}

const ORIGIN = "https://api.webhubmaster.shop";
const { proofSrc } = makeHelpers(ORIGIN);

const cases = [
  // [input, expected, label]
  ["/api/media/s3/jobs/x.webp", `${ORIGIN}/api/media/s3/jobs/x.webp`, "relative /api/media/s3 → prefixed"],
  ["/api/media/file/jobs/a.webp", `${ORIGIN}/api/media/file/jobs/a.webp`, "relative /api/media/file → prefixed"],
  ["https://lazy-pagination.preview.emergentagent.com/api/media/file/jobs/a.webp",
   `${ORIGIN}/api/media/file/jobs/a.webp`, "absolute old-host /api/media/... → rewritten to current origin"],
  ["https://lazy-pagination.preview.emergentagent.com/api/media/s3/kyc/u.webp",
   `${ORIGIN}/api/media/s3/kyc/u.webp`, "absolute old-host /api/media/s3 → rewritten"],
  ["https://cdn.example.com/a.webp", "https://cdn.example.com/a.webp", "external absolute non-media → unchanged"],
  ["data:image/png;base64,abc", "data:image/png;base64,abc", "data URI → unchanged"],
  ["blob:https://x/abc", "blob:https://x/abc", "blob URI → unchanged"],
  ["", "", "empty → empty"],
  [null, "", "null → empty"],
  [undefined, "", "undefined → empty"],
  ["uploads/a.webp", `${ORIGIN}/uploads/a.webp`, "bare relative path → prefixed with slash"],
  ["/static/logo.svg", `${ORIGIN}/static/logo.svg`, "relative non-media → prefixed"],
];

let pass = 0, fail = 0;
for (const [input, expected, label] of cases) {
  const got = proofSrc(input);
  const ok = got === expected;
  if (ok) { pass++; console.log(`PASS: ${label} → ${JSON.stringify(got)}`); }
  else   { fail++; console.log(`FAIL: ${label}\n  input    = ${JSON.stringify(input)}\n  expected = ${JSON.stringify(expected)}\n  got      = ${JSON.stringify(got)}`); }
}
console.log(`\n${pass}/${pass+fail} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
