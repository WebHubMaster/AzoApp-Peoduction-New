import React from "react";

/**
 * MembershipBadge
 * Renders the custom golden crown membership badge image supplied by AzoApp.
 * Kept API-compatible with the previous SVG badge (size / className / animate)
 * so every existing caller (navbar desktop + mobile, etc.) picks it up as-is.
 *
 * Props:
 *  - size: number (px) — rendered diameter (default 40)
 *  - className: extra classes on the wrapper
 *  - animate: kept for backward-compat (no-op)
 */
const MembershipBadge = ({ size = 40, className = "", animate = true, ...rest }) => {
  return (
    <span
      className={`inline-flex items-center justify-center shrink-0 ${className}`}
      style={{ width: size, height: size }}
      {...rest}
    >
      <img
        src="/membership-crown.png"
        alt="Membership"
        width={size}
        height={size}
        draggable={false}
        style={{ width: size, height: size, objectFit: "contain", display: "block" }}
      />
    </span>
  );
};

export default MembershipBadge;
