"use client";

/**
 * Dancing robot loader for warehouse pages.
 *
 * Sheets API reads are usually 1-3 seconds — long enough that a
 * silent 'Ielādē…' feels broken. The animated robot tells the
 * user something is happening AND something is alive. The robot
 * also matches the WORKMANIS sidebar mascot (a small robot
 * icon), so the wait feels on-brand instead of generic.
 *
 * Pure CSS animations — no canvas, no third-party libraries.
 * SVG paths are inline so the robot is part of the bundle and
 * doesn't trigger an additional HTTP request.
 *
 * Rotating message: 'Ielādē noliktavu…' switches to a different
 * tip every 2.5s so the user has something fresh to read while
 * waiting. The tips are warehouse-related ('Skaitām komponentes',
 * 'Sakārtojam plauktus', etc.) so they reinforce what the system
 * is doing.
 */

import { useEffect, useState } from "react";

const TIPS = [
  "Ielādē noliktavu…",
  "Skaitām komponentes…",
  "Sakārtojam plauktus…",
  "Pārbaudām atlikumus…",
  "Robots dejo, dati tūlīt būs…",
  "Vēl mazliet pacietības…",
];

export function LoadingRobot() {
  const [tipIndex, setTipIndex] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setTipIndex((i) => (i + 1) % TIPS.length);
    }, 2500);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="flex flex-col items-center justify-center gap-4 py-16">
      <div className="robot-dance">
        <svg
          width="80"
          height="80"
          viewBox="0 0 80 80"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Antenna */}
          <line
            x1="40"
            y1="6"
            x2="40"
            y2="14"
            stroke="#374151"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <circle cx="40" cy="6" r="2.5" fill="#EA580C" className="robot-antenna" />

          {/* Head */}
          <rect
            x="20"
            y="14"
            width="40"
            height="30"
            rx="6"
            fill="#1F2937"
            stroke="#111827"
            strokeWidth="1.5"
          />

          {/* Eyes */}
          <circle cx="32" cy="28" r="3" fill="#60A5FA" className="robot-eye" />
          <circle cx="48" cy="28" r="3" fill="#60A5FA" className="robot-eye" />

          {/* Mouth — small smile */}
          <path
            d="M 32 36 Q 40 40 48 36"
            stroke="#FCD34D"
            strokeWidth="2"
            fill="none"
            strokeLinecap="round"
          />

          {/* Body */}
          <rect
            x="24"
            y="46"
            width="32"
            height="22"
            rx="3"
            fill="#374151"
            stroke="#111827"
            strokeWidth="1.5"
          />

          {/* Chest light */}
          <circle cx="40" cy="57" r="2.5" fill="#10B981" className="robot-chest" />

          {/* Arms */}
          <rect
            x="12"
            y="48"
            width="6"
            height="14"
            rx="2"
            fill="#4B5563"
            className="robot-arm-left"
          />
          <rect
            x="62"
            y="48"
            width="6"
            height="14"
            rx="2"
            fill="#4B5563"
            className="robot-arm-right"
          />

          {/* Legs */}
          <rect x="28" y="68" width="8" height="8" rx="2" fill="#1F2937" />
          <rect x="44" y="68" width="8" height="8" rx="2" fill="#1F2937" />
        </svg>
      </div>

      <p className="text-sm text-graphite-500 transition-opacity duration-500">
        {TIPS[tipIndex]}
      </p>

      <style jsx>{`
        .robot-dance {
          animation: bounce 1s ease-in-out infinite;
          transform-origin: center bottom;
        }
        @keyframes bounce {
          0%,
          100% {
            transform: translateY(0) rotate(-2deg);
          }
          50% {
            transform: translateY(-8px) rotate(2deg);
          }
        }
        :global(.robot-antenna) {
          animation: blink 1.2s ease-in-out infinite;
        }
        :global(.robot-eye) {
          animation: eyeBlink 2.4s ease-in-out infinite;
        }
        :global(.robot-chest) {
          animation: chestPulse 1.2s ease-in-out infinite;
        }
        :global(.robot-arm-left) {
          transform-origin: 15px 50px;
          animation: swing-left 1s ease-in-out infinite;
        }
        :global(.robot-arm-right) {
          transform-origin: 65px 50px;
          animation: swing-right 1s ease-in-out infinite;
        }
        @keyframes blink {
          0%,
          100% {
            opacity: 1;
          }
          50% {
            opacity: 0.4;
          }
        }
        @keyframes eyeBlink {
          0%,
          90%,
          100% {
            transform: scaleY(1);
          }
          95% {
            transform: scaleY(0.1);
          }
        }
        @keyframes chestPulse {
          0%,
          100% {
            opacity: 0.6;
            transform: scale(1);
          }
          50% {
            opacity: 1;
            transform: scale(1.2);
          }
        }
        @keyframes swing-left {
          0%,
          100% {
            transform: rotate(-10deg);
          }
          50% {
            transform: rotate(10deg);
          }
        }
        @keyframes swing-right {
          0%,
          100% {
            transform: rotate(10deg);
          }
          50% {
            transform: rotate(-10deg);
          }
        }
      `}</style>
    </div>
  );
}
