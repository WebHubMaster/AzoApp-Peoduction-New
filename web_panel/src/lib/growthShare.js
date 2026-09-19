// Builds a branded, share-ready referral PNG on a canvas and provides share helpers.

function rounded(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Draw the referral card onto a canvas. Returns the canvas. */
export function drawReferralCard(canvas, opts) {
  const { code = "AZO0000", reward = 100, discount = 100, card = {} } = opts || {};
  const W = 1080, H = 1080;
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d");
  const bg = card.bg || "#0D47A1";
  const grad = ctx.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, bg);
  grad.addColorStop(1, "#1565C0");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // soft decorative circles
  ctx.fillStyle = "rgba(255,255,255,0.07)";
  ctx.beginPath(); ctx.arc(920, 160, 220, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(140, 980, 260, 0, Math.PI * 2); ctx.fill();

  ctx.textAlign = "center";
  // brand
  ctx.fillStyle = "#ffffff";
  ctx.font = "800 46px Inter, Arial, sans-serif";
  ctx.fillText("AzoApp", W / 2, 130);
  ctx.fillStyle = "rgba(255,255,255,0.75)";
  ctx.font = "500 26px Inter, Arial, sans-serif";
  ctx.fillText("Home services at your doorstep", W / 2, 176);

  // heading
  ctx.fillStyle = "#ffffff";
  ctx.font = "800 66px Inter, Arial, sans-serif";
  ctx.fillText(card.heading || "Refer a Friend & Earn", W / 2, 330);
  ctx.fillStyle = "#FDE68A";
  ctx.font = "800 96px Inter, Arial, sans-serif";
  ctx.fillText(`₹${reward}`, W / 2, 440);

  // subheading
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.font = "500 30px Inter, Arial, sans-serif";
  ctx.fillText(card.subheading || "Share AzoApp — you both win", W / 2, 500);

  // code chip
  ctx.fillStyle = "rgba(255,255,255,0.14)";
  rounded(ctx, W / 2 - 300, 560, 600, 170, 34); ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.font = "600 26px Inter, Arial, sans-serif";
  ctx.fillText("YOUR REFERRAL CODE", W / 2, 616);
  ctx.fillStyle = "#ffffff";
  ctx.font = "800 84px Inter, Arial, sans-serif";
  ctx.fillText(code, W / 2, 700);

  // benefit lines
  ctx.fillStyle = "#ffffff";
  ctx.font = "600 30px Inter, Arial, sans-serif";
  ctx.fillText(`Your friend gets ₹${discount} OFF their first booking`, W / 2, 800);
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.font = "500 27px Inter, Arial, sans-serif";
  ctx.fillText(`You earn ₹${reward} when they complete it`, W / 2, 848);

  // CTA pill
  ctx.fillStyle = "#F59E0B";
  rounded(ctx, W / 2 - 230, 920, 460, 90, 45); ctx.fill();
  ctx.fillStyle = "#1e293b";
  ctx.font = "800 36px Inter, Arial, sans-serif";
  ctx.fillText(card.cta_text || "Book Now & Save", W / 2, 978);
  return canvas;
}

export function canvasToBlob(canvas) {
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/png", 0.92));
}

export function shareText({ code, reward, discount, link }) {
  return `🎁 Get ₹${discount} OFF your first AzoApp home service!\n\nUse my referral code *${code}* when you book. I'll earn ₹${reward} too — we both win!\n\n👉 ${link}`;
}

export function whatsappUrl(text) {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

/** Try native share with the generated image; falls back to text share. */
export async function shareReferral(canvas, payload) {
  const text = shareText(payload);
  try {
    const blob = await canvasToBlob(canvas);
    const file = new File([blob], "azoapp-referral.png", { type: "image/png" });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: "AzoApp Referral", text });
      return "shared";
    }
  } catch (e) { if (e && e.name === "AbortError") return "cancelled"; }
  if (navigator.share) {
    try { await navigator.share({ title: "AzoApp Referral", text, url: payload.link }); return "shared"; }
    catch (e) { if (e && e.name === "AbortError") return "cancelled"; }
  }
  window.open(whatsappUrl(text), "_blank");
  return "whatsapp";
}

export async function downloadCard(canvas) {
  const blob = await canvasToBlob(canvas);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "azoapp-referral.png";
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
