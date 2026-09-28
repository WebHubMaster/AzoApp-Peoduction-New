const ngrok = require("@expo/ngrok");
(async () => {
  try {
    const url = await ngrok.connect({ addr: 3002, proto: "http" });
    console.log("ADMIN_TUNNEL_URL=" + url);
    // keep alive
    setInterval(() => {}, 1 << 30);
  } catch (e) {
    console.error("TUNNEL_ERROR", e && e.message ? e.message : e);
    process.exit(1);
  }
})();
