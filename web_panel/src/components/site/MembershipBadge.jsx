import React from "react";

/**
 * MembershipBadge
 * Renders the custom VIP membership icon supplied by AzoApp inside a clean
 * circular chip so it visually matches the other circular icon buttons in the
 * header (cart / profile). API-compatible with the previous badge
 * (size / className / animate) so every existing caller picks it up as-is.
 *
 * Props:
 *  - size: number (px) — circle diameter (default 40, same as other nav icons)
 *  - className: extra classes on the circular wrapper
 *  - animate: kept for backward-compat (no-op)
 */
const MembershipBadge = ({ size = 40, className = "", animate = true, ...rest }) => {
  return (
    <span
      className={`inline-flex items-center justify-center shrink-0 rounded-full bg-white border border-amber-200 shadow-sm ${className}`}
      style={{ width: size, height: size }}
      {...rest}
    >
      <img
        src="/membership-crown.png?v=4"
        alt="Membership"
        draggable={false}
        style={{ width: "80%", height: "80%", objectFit: "contain", display: "block" }}
      />
    </span>
  );
};

export default MembershipBadge;
