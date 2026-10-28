import React from 'react';

/** Scalable SVG steering wheel for the bus driver's cockpit. */
export default function SteeringWheel({ size = 24, title = 'Driver steering wheel' }) {
  return <svg width={size} height={size} viewBox="0 0 100 100" role="img" aria-label={title} className="steering-wheel-svg">
    <title>{title}</title>
    <circle cx="50" cy="50" r="39" fill="#242a31" stroke="#111820" strokeWidth="5" />
    <circle cx="50" cy="50" r="27" fill="#f8fafc" stroke="#9aa3ad" strokeWidth="5" />
    <circle cx="50" cy="50" r="8" fill="#242a31" stroke="#111820" strokeWidth="3" />
    <path d="M50 42 L50 17 M43 54 L24 69 M57 54 L76 69" fill="none" stroke="#242a31" strokeWidth="8" strokeLinecap="round" />
    <circle cx="50" cy="50" r="3" fill="#ff5a00" />
  </svg>;
}
