// Dev-server middleware:
//  - `/api/*`, root robots.txt and sitemaps → FastAPI backend.
//  - HTML navigations → index.html with the server-rendered SEO <head>, crawlable
//    fallback content and the real HTTP status (200 / 301 / 404) from the SEO engine.
const { createProxyMiddleware } = require("http-proxy-middleware");

const BACKEND = "http://localhost:8001";
const SELF = `http://localhost:${process.env.PORT || 3000}`;
const SKIP = /^\/(api|static|sockjs-node|ws|__webpack|assets)(\/|$)/;
let tpl = { html: "", at: 0 };

const STRIP = [
  /<title>[\s\S]*?<\/title>/i,
  /<meta[^>]+name="(description|robots|twitter:[a-z:]+)"[^>]*>/gi,
  /<meta[^>]+property="og:[a-z:_]+"[^>]*>/gi,
  /<link[^>]+rel="canonical"[^>]*>/gi,
];

async function template() {
  if (tpl.html && Date.now() - tpl.at < 5000) return tpl.html;
  const r = await fetch(`${SELF}/index.html`, { headers: { accept: "text/html" } });
  tpl = { html: await r.text(), at: Date.now() };
  return tpl.html;
}

function seoHtml(req, res, next) {
  const path = req.path || "/";
  const ua = req.headers["user-agent"] || "";
  // Only crawlers/scrapers get the pre-rendered crawlable body. Real browsers get the
  // SPA shell with a lightweight loader so there's no flash of the static fallback list
  // on reload — React controls first paint (smooth even on slow networks).
  const isBot = /bot|crawl|spider|slurp|facebookexternalhit|whatsapp|telegram|slackbot|linkedinbot|embedly|pinterest|redditbot|discordbot|bingpreview|vkshare|skypeuripreview|googlebot|applebot|yandex|baiduspider|duckduckbot/i.test(ua);
  const wantsHtml = (req.headers.accept || "").includes("text/html") || isBot;
  if (req.method !== "GET" || !wantsHtml || SKIP.test(path) || /\.[a-z0-9]{2,5}$/i.test(path)) return next();
  (async () => {
    const [html, meta] = await Promise.all([
      template(),
      fetch(`${BACKEND}/api/seo/render?path=${encodeURIComponent(path)}`).then((r) => (r.ok ? r.json() : null)),
    ]);
    if (!meta || !html.includes("</head>")) return next();
    if (meta.location) {
      const qs = req.originalUrl.includes("?") ? req.originalUrl.slice(req.originalUrl.indexOf("?")) : "";
      return res.redirect(meta.status, meta.location + qs);
    }
    let out = html;
    STRIP.forEach((rx) => { out = out.replace(rx, ""); });
    out = out.replace(/<html lang="[^"]*"/i, `<html lang="${meta.lang}"`)
      .replace("</head>", `${meta.head}\n</head>`);
    if (isBot) {
      out = out.replace(/<div id="root">[\s\S]*?<\/div>\s*<\/div>/i, `<div id="root">${meta.body}</div>`);
    }
    res.status(meta.status).set({ "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache" }).send(out);
  })().catch(() => next());
}

module.exports = function (app) {
  app.use("/api", createProxyMiddleware({ target: BACKEND, changeOrigin: true, ws: true, logLevel: "warn" }));
  app.use(["/robots.txt", "/sitemap.xml", "/sitemaps"], createProxyMiddleware({
    target: BACKEND, changeOrigin: true, logLevel: "warn", pathRewrite: (p) => "/api" + p,
  }));
  app.use(seoHtml);
};
