// Development-only reverse proxy: routes `/api/*` from the frontend dev server
// (which the platform ingress dispatches all traffic to) to the FastAPI
// backend running on localhost:8001. Without this, external `/api/*` requests
// are 404'd by React Router because the ingress isn't splitting traffic.
//
// This file is auto-loaded by Create React App / CRACO — no wiring required.
const { createProxyMiddleware } = require("http-proxy-middleware");

module.exports = function (app) {
  app.use(
    "/api",
    createProxyMiddleware({
      target: "http://localhost:8001",
      changeOrigin: true,
      ws: true, // preserve SSE / websocket upgrade for realtime
      // The backend already listens on /api/*, so no rewrite is needed.
      logLevel: "warn",
    })
  );
};
