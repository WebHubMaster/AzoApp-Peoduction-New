// Development-only reverse proxy: routes `/api/*` (plus root-level robots.txt and
// sitemaps, which crawlers expect at the domain root) to the FastAPI backend.
const { createProxyMiddleware } = require("http-proxy-middleware");

module.exports = function (app) {
  app.use(
    "/api",
    createProxyMiddleware({
      target: "http://localhost:8001",
      changeOrigin: true,
      ws: true,
      logLevel: "warn",
    })
  );
  app.use(
    ["/robots.txt", "/sitemap.xml", "/sitemaps"],
    createProxyMiddleware({
      target: "http://localhost:8001",
      changeOrigin: true,
      logLevel: "warn",
      pathRewrite: (path) => "/api" + path,
    })
  );
};
