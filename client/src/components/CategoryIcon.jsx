/**
 * @fileoverview Reusable Premium Flat-Color Vector Icons for GloveBox.
 * Provides stunning, highly-detailed multi-colored vector SVG components
 * designed to replicate the visual excellence of modern premium Flaticon packs.
 * Includes precise representations for brake pads, brake rotors, ceramic spark plugs,
 * filters (cabin/engine), master cylinders, suspension struts, and tools.
 * Follows Google Coding Standards and React best practices.
 */

import React from 'react';

/**
 * Renders a premium, multi-colored flat vector SVG icon matching the requested category.
 * @param {!Object} props React component props.
 * @param {string} props.category The maintenance category key.
 * @param {number=} props.size Width and height dimension in pixels.
 * @param {string=} props.className Optional CSS class names.
 * @return {!React.ReactElement}
 */
export default function CategoryIcon({ category, size = 18, className = '' }) {
  const normCategory = category ? category.toLowerCase() : '';

  switch (normCategory) {
    case 'oil_change':
      // Revert back to original classic oil change emoji
      return (
        <span style={{ fontSize: `${size}px`, lineHeight: 1, display: 'inline-block', verticalAlign: 'middle' }}>
          🛢️
        </span>
      );

    case 'transmission_fluid':
    case 'transmission_oil':
      // Revert back to original classic transmission emoji
      return (
        <span style={{ fontSize: `${size}px`, lineHeight: 1, display: 'inline-block', verticalAlign: 'middle' }}>
          ⚙️
        </span>
      );

    case 'cabin_air_filter':
      // White paper pleated element with a modern blue frame and wind direction arrows
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 64 64"
          fill="none"
          className={className}
          style={{ display: 'inline-block', verticalAlign: 'middle' }}
        >
          <defs>
            <linearGradient id="filterFrame" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#38bdf8" />
              <stop offset="100%" stopColor="#0284c7" />
            </linearGradient>
          </defs>
          {/* Outer rectangular blue plastic frame */}
          <rect x="6" y="10" width="52" height="44" rx="3" fill="url(#filterFrame)" stroke="#0369a1" strokeWidth="2" />
          {/* Filter backing panel */}
          <rect x="10" y="14" width="44" height="36" fill="#f8fafc" />
          {/* White and grey pleat shadow folds */}
          <path d="M14 14v36M20 14v36M26 14v36M32 14v36M38 14v36M44 14v36M50 14v36" stroke="#cbd5e1" strokeWidth="3" />
          <path d="M14 14v36M20 14v36M26 14v36M32 14v36M38 14v36M44 14v36M50 14v36" stroke="#e2e8f0" strokeWidth="1.5" />
          {/* Horizontal reinforcing structural grid lines */}
          <line x1="10" y1="23" x2="54" y2="23" stroke="#0284c7" strokeWidth="1" strokeDasharray="2 3" opacity="0.4" />
          <line x1="10" y1="32" x2="54" y2="32" stroke="#0284c7" strokeWidth="1" strokeDasharray="2 3" opacity="0.4" />
          <line x1="10" y1="41" x2="54" y2="41" stroke="#0284c7" strokeWidth="1" strokeDasharray="2 3" opacity="0.4" />
          {/* Wind direction flow indicators */}
          <path d="M18 4l2 3-2 1M32 3l2 4-2 1M46 4l2 3-2 1" stroke="#0ea5e9" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M18 56l2 3-2 1M32 56l2 4-2 1M46 56l2 3-2 1" stroke="#38bdf8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );

    case 'engine_air_filter':
    case 'air_filter':
      // High-density yellow paper filter elements with an orange perimeter rubber seal
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 64 64"
          fill="none"
          className={className}
          style={{ display: 'inline-block', verticalAlign: 'middle' }}
        >
          <defs>
            <linearGradient id="rubberGasket" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#f97316" />
              <stop offset="100%" stopColor="#ea580c" />
            </linearGradient>
            <linearGradient id="pleatsYellow" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#fef08a" />
              <stop offset="50%" stopColor="#fde047" />
              <stop offset="100%" stopColor="#ca8a04" />
            </linearGradient>
          </defs>
          {/* Orange outer rubber seal frame */}
          <rect x="6" y="6" width="52" height="52" rx="5" fill="url(#rubberGasket)" stroke="#c2410c" strokeWidth="2.5" />
          {/* Yellow pleats panel */}
          <rect x="11" y="11" width="42" height="42" fill="url(#pleatsYellow)" />
          {/* Pleat shading rows */}
          <path d="M15 11v42M19 11v42M23 11v42M27 11v42M31 11v42M35 11v42M39 11v42M43 11v42M47 11v42" stroke="#a16207" strokeWidth="1.5" />
          <path d="M16 11v42M20 11v42M24 11v42M28 11v42M32 11v42M36 11v42M40 11v42M44 11v42M48 11v42" stroke="#ca8a04" strokeWidth="0.8" />
          {/* Wire reinforcement structural mesh overlay */}
          <path d="M11 15l42 28M11 29l32 24M25 11l28 28" stroke="#475569" strokeWidth="1.2" strokeLinecap="round" opacity="0.65" />
        </svg>
      );

    case 'brake_pads':
      // Detailed red painted steel backing plate, friction block pad lining, and wear indicators
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 64 64"
          fill="none"
          className={className}
          style={{ display: 'inline-block', verticalAlign: 'middle' }}
        >
          <defs>
            <linearGradient id="padBacking" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#ef4444" />
              <stop offset="100%" stopColor="#b91c1c" />
            </linearGradient>
            <linearGradient id="frictionGrad" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#4b5563" />
              <stop offset="100%" stopColor="#1f2937" />
            </linearGradient>
          </defs>
          {/* Red powder-coated steel backing plate */}
          <path d="M6 26c0-6 12-9 26-9s26 3 26 9v6c0 2-2 3.5-6 3.5S44 34 32 34S20 35.5 16 35.5S6 34 6 32v-6z" fill="url(#padBacking)" stroke="#7f1d1d" strokeWidth="1.5" />
          {/* Left & Right locator pin ears */}
          <circle cx="5" cy="26" r="2.5" fill="#94a3b8" stroke="#475569" strokeWidth="1" />
          <circle cx="59" cy="26" r="2.5" fill="#94a3b8" stroke="#475569" strokeWidth="1" />
          {/* Friction block material lining */}
          <path d="M14 24.5c0-2.5 7.5-4.5 18-4.5s18 2 18 4.5V31c0 1-5 2-18 2S14 32 14 31v-6.5z" fill="url(#frictionGrad)" stroke="#111827" strokeWidth="1.5" />
          {/* Expansion/exhaust slot in middle */}
          <rect x="31" y="21" width="2" height="11" rx="0.5" fill="#111827" />
          {/* Spring steel wear indicator bracket clip */}
          <path d="M46 32.5c0 2.5-2 3.5-3.5 3.5" stroke="#94a3b8" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      );

    case 'brake_rotor':
      // Machined metallic steel brake disc surface, ventilated, drilled, and slotted, with centershat bolt lugs!
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 64 64"
          fill="none"
          className={className}
          style={{ display: 'inline-block', verticalAlign: 'middle' }}
        >
          <defs>
            <linearGradient id="rotorGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#e2e8f0" />
              <stop offset="50%" stopColor="#cbd5e1" />
              <stop offset="100%" stopColor="#94a3b8" />
            </linearGradient>
            <linearGradient id="hatGrad" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#64748b" />
              <stop offset="100%" stopColor="#334155" />
            </linearGradient>
          </defs>
          {/* Slotted outer disc rotor */}
          <circle cx="32" cy="32" r="28" fill="url(#rotorGrad)" stroke="#475569" strokeWidth="1.5" />
          {/* Inner cooling vents detail track */}
          <circle cx="32" cy="32" r="24" stroke="#64748b" strokeWidth="1" strokeDasharray="4 4" opacity="0.65" />
          {/* Center mounting hat portion */}
          <circle cx="32" cy="32" r="13" fill="url(#hatGrad)" stroke="#1e293b" strokeWidth="1.5" />
          {/* Center center bore hole */}
          <circle cx="32" cy="32" r="4" fill="#0f172a" />
          {/* 5-hole bolt pattern gold stud lugs */}
          <circle cx="32" cy="24" r="1.8" fill="#fbbf24" stroke="#d97706" strokeWidth="0.5" />
          <circle cx="39.6" cy="29.5" r="1.8" fill="#fbbf24" stroke="#d97706" strokeWidth="0.5" />
          <circle cx="36.7" cy="38" r="1.8" fill="#fbbf24" stroke="#d97706" strokeWidth="0.5" />
          <circle cx="27.3" cy="38" r="1.8" fill="#fbbf24" stroke="#d97706" strokeWidth="0.5" />
          <circle cx="24.4" cy="29.5" r="1.8" fill="#fbbf24" stroke="#d97706" strokeWidth="0.5" />
          {/* slashes slots machined */}
          <path d="M22 22l4 4M42 42l-4-4M42 22l-4 4M22 42l4-4M16 32h6M42 32h6M32 16v6M32 42v6" stroke="#475569" strokeWidth="1.5" strokeLinecap="round" opacity="0.8" />
        </svg>
      );

    case 'brake_fluid':
      // Master cylinder fluid container showing translucent amber fluid and MAX/MIN fluid level indicators
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 64 64"
          fill="none"
          className={className}
          style={{ display: 'inline-block', verticalAlign: 'middle' }}
        >
          <defs>
            <linearGradient id="fluidGrad" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#fcd34d" />
              <stop offset="100%" stopColor="#f59e0b" />
            </linearGradient>
            <linearGradient id="capGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#1e293b" />
              <stop offset="50%" stopColor="#475569" />
              <stop offset="100%" stopColor="#0f172a" />
            </linearGradient>
          </defs>
          {/* Black fluid cap */}
          <rect x="22" y="4" width="20" height="7" rx="1.5" fill="url(#capGrad)" stroke="#0f172a" strokeWidth="1.5" />
          <rect x="25" y="11" width="14" height="4" fill="#64748b" />
          {/* Semi-translucent white plastic container tank */}
          <path d="M12 18c0-3 5-4 20-4s20 1 20 4v32c0 5-5 7-20 7s-20-2-20-7V18z" fill="#f8fafc" stroke="#cbd5e1" strokeWidth="2" />
          {/* MAX indicator line */}
          <line x1="12" y1="22" x2="22" y2="22" stroke="#94a3b8" strokeWidth="1.5" />
          <text x="14" y="21" fontSize="4.5" fontWeight="900" fill="#64748b" stroke="none" fontFamily="sans-serif">MAX</text>
          {/* MIN indicator line */}
          <line x1="12" y1="36" x2="22" y2="36" stroke="#94a3b8" strokeWidth="1.5" />
          <text x="14" y="35" fontSize="4.5" fontWeight="900" fill="#64748b" stroke="none" fontFamily="sans-serif">MIN</text>
          {/* Filled amber brake fluid volume */}
          <path d="M12 28.5c6-1 12 1.5 20 0s14-1 20 0V48c0 4.5-5 6.5-20 6.5s-20-2-20-6.5V28.5z" fill="url(#fluidGrad)" opacity="0.85" />
          {/* Light reflection highlight on tank outer corner */}
          <path d="M46 19v26" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" opacity="0.4" />
        </svg>
      );

    case 'spark_plugs':
      // Glazed white ceramic insulator ribs, threaded base cylinder, electrode tip, and a vivid purple electric spark jump
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 64 64"
          fill="none"
          className={className}
          style={{ display: 'inline-block', verticalAlign: 'middle' }}
        >
          <defs>
            <linearGradient id="ceramic" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="60%" stopColor="#f1f5f9" />
              <stop offset="100%" stopColor="#cbd5e1" />
            </linearGradient>
            <linearGradient id="hexNut" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#f59e0b" />
              <stop offset="100%" stopColor="#b45309" />
            </linearGradient>
            <linearGradient id="threadGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#94a3b8" />
              <stop offset="100%" stopColor="#475569" />
            </linearGradient>
            <linearGradient id="sparkGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#a855f7" />
              <stop offset="100%" stopColor="#6366f1" />
            </linearGradient>
          </defs>
          {/* Brass terminal connection stud */}
          <rect x="29" y="4" width="6" height="5" rx="1" fill="#f59e0b" stroke="#b45309" strokeWidth="0.8" />
          {/* Insulator ribs stacks */}
          <rect x="27" y="9" width="10" height="4" rx="0.5" fill="url(#ceramic)" stroke="#94a3b8" strokeWidth="0.8" />
          <rect x="25" y="13" width="14" height="3" rx="0.5" fill="url(#ceramic)" stroke="#94a3b8" strokeWidth="0.8" />
          <rect x="25" y="14" width="14" height="1" fill="#3b82f6" />
          <rect x="27" y="16" width="10" height="4" rx="0.5" fill="url(#ceramic)" stroke="#94a3b8" strokeWidth="0.8" />
          <rect x="25" y="20" width="14" height="3" rx="0.5" fill="url(#ceramic)" stroke="#94a3b8" strokeWidth="0.8" />
          <rect x="25" y="21" width="14" height="1" fill="#3b82f6" />
          <rect x="27" y="23" width="10" height="4" rx="0.5" fill="url(#ceramic)" stroke="#94a3b8" strokeWidth="0.8" />
          {/* Hexagonal locking metal nut section */}
          <path d="M20 27h24l-3 7H23z" fill="url(#hexNut)" stroke="#78350f" strokeWidth="1" />
          <line x1="28" y1="27" x2="29" y2="34" stroke="#78350f" strokeWidth="1" />
          <line x1="36" y1="27" x2="35" y2="34" stroke="#78350f" strokeWidth="1" />
          {/* Steel threaded engine cylinder insert shell */}
          <rect x="24" y="34" width="16" height="14" rx="0.5" fill="url(#threadGrad)" stroke="#1e293b" strokeWidth="1" />
          <line x1="24" y1="37.5" x2="40" y2="37.5" stroke="#1e293b" strokeWidth="1.5" />
          <line x1="24" y1="41" x2="40" y2="41" stroke="#1e293b" strokeWidth="1.5" />
          <line x1="24" y1="44.5" x2="40" y2="44.5" stroke="#1e293b" strokeWidth="1.5" />
          {/* Electrode pin thread terminal electrode gap */}
          <rect x="30.5" y="48" width="3" height="4" fill="#cbd5e1" stroke="#1e293b" strokeWidth="0.8" />
          <path d="M32 48v7.5h-5.5" stroke="#475569" strokeWidth="2.5" strokeLinecap="round" />
          {/* Purple Spark Ignition Flash */}
          <path d="M35 52.5l5.5 1.2-3.3 2 4.5 3-5.5-.8 1-3.2-3.3.8 1.1-3z" fill="url(#sparkGrad)" stroke="none" />
        </svg>
      );

    case 'modification':
      // Revert back to original classic mods emoji
      return (
        <span style={{ fontSize: `${size}px`, lineHeight: 1, display: 'inline-block', verticalAlign: 'middle' }}>
          🏎️
        </span>
      );

    case 'custom_maintenance':
    default:
      // Revert back to original classic wrench emoji
      return (
        <span style={{ fontSize: `${size}px`, lineHeight: 1, display: 'inline-block', verticalAlign: 'middle' }}>
          🔧
        </span>
      );
  }
}
