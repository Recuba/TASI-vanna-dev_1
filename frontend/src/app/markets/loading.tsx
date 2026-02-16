'use client';

export default function MarketsLoading() {
  return (
    <div className="flex-1 px-4 sm:px-6 py-6 overflow-y-auto">
      {/* Shimmer keyframes */}
      <style>{`
        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        @keyframes hubPulse {
          0%, 100% { transform: translate(-50%, -50%) scale(1); opacity: 0.6; }
          50% { transform: translate(-50%, -50%) scale(1.04); opacity: 0.3; }
        }
        @keyframes edgeDash {
          to { stroke-dashoffset: -20; }
        }
        .skeleton-shimmer {
          background: linear-gradient(
            90deg,
            #2A2A2A 0%,
            #333333 40%,
            #2A2A2A 80%
          );
          background-size: 200% 100%;
          animation: shimmer 1.8s ease-in-out infinite;
        }
      `}</style>

      <div className="max-w-content-lg mx-auto space-y-6">
        {/* Header skeleton */}
        <div>
          <div className="h-8 w-48 rounded skeleton-shimmer" />
          <div className="h-4 w-72 rounded skeleton-shimmer mt-2" />
          <div className="h-3 w-96 rounded skeleton-shimmer mt-3" />
        </div>

        {/* Desktop constellation skeleton */}
        <div className="hidden lg:block">
          <div
            className="relative mx-auto"
            style={{ height: 500, width: '100%', maxWidth: 900 }}
          >
            {/* Orbit ring skeletons */}
            <svg
              width="100%"
              height="100%"
              viewBox="0 0 900 500"
              className="absolute inset-0 pointer-events-none"
              aria-hidden="true"
            >
              {/* Orbit rings */}
              {[0.5, 0.72, 0.92].map((r, i) => (
                <circle
                  key={`orbit-${i}`}
                  cx={450}
                  cy={250}
                  r={200 * r}
                  fill="none"
                  stroke="#2A2A2A"
                  strokeWidth="0.5"
                  strokeDasharray="3 8"
                  opacity={0.2}
                  style={{ animation: `edgeDash ${18 + i * 5}s linear infinite` }}
                />
              ))}

              {/* Shimmer edge lines connecting node positions */}
              {Array.from({ length: 6 }).map((_, i) => {
                const fromIdx = i;
                const toIdx = (i + 3) % 8;
                const fromAngle = ((fromIdx / 8) * 360 - 90) * (Math.PI / 180);
                const toAngle = ((toIdx / 8) * 360 - 90) * (Math.PI / 180);
                const radius = 190;
                return (
                  <line
                    key={`edge-${i}`}
                    x1={450 + Math.cos(fromAngle) * radius}
                    y1={250 + Math.sin(fromAngle) * radius}
                    x2={450 + Math.cos(toAngle) * radius}
                    y2={250 + Math.sin(toAngle) * radius}
                    stroke="#D4A84B"
                    strokeWidth="0.5"
                    strokeDasharray="4 10"
                    opacity={0.08}
                    style={{ animation: `edgeDash ${12 + i * 2}s linear infinite` }}
                  />
                );
              })}

              {/* Radial lines from center to each node position */}
              {Array.from({ length: 8 }).map((_, i) => {
                const angle = ((i / 8) * 360 - 90) * (Math.PI / 180);
                const radius = 190;
                return (
                  <line
                    key={`radial-${i}`}
                    x1={450}
                    y1={250}
                    x2={450 + Math.cos(angle) * radius}
                    y2={250 + Math.sin(angle) * radius}
                    stroke="#707070"
                    strokeWidth="0.3"
                    strokeDasharray="2 7"
                    opacity={0.06}
                  />
                );
              })}
            </svg>

            {/* Central hub skeleton */}
            <div
              className="absolute rounded-full"
              style={{
                left: '50%',
                top: '50%',
                width: 130,
                height: 130,
                transform: 'translate(-50%, -50%)',
                background: 'radial-gradient(circle, #1A1A1A 0%, #0E0E0E 100%)',
                border: '1px solid #2A2A2A',
                boxShadow: '0 0 60px rgba(212,168,75,0.04)',
                animation: 'hubPulse 3s ease-in-out infinite',
              }}
            >
              {/* Inner shimmer elements */}
              <div className="flex flex-col items-center justify-center h-full gap-2">
                <div className="h-5 w-16 rounded skeleton-shimmer" />
                <div className="h-4 w-12 rounded skeleton-shimmer" />
                <div className="flex gap-2 mt-1">
                  <div className="h-3 w-8 rounded skeleton-shimmer" />
                  <div className="h-3 w-8 rounded skeleton-shimmer" />
                </div>
              </div>
            </div>

            {/* Node skeletons around circle */}
            {Array.from({ length: 8 }).map((_, i) => {
              const angle = (i / 8) * 360 - 90;
              const rad = (angle * Math.PI) / 180;
              const r = 190;
              return (
                <div
                  key={i}
                  className="absolute rounded-xl"
                  style={{
                    left: `calc(50% + ${Math.cos(rad) * r}px)`,
                    top: `calc(50% + ${Math.sin(rad) * r}px)`,
                    transform: 'translate(-50%, -50%)',
                    width: 170,
                    padding: '12px 14px',
                    background: '#1A1A1A',
                    border: '1px solid #2A2A2A',
                    boxShadow: '0 2px 10px rgba(0,0,0,0.3)',
                    animationDelay: `${i * 0.1}s`,
                  }}
                >
                  {/* Header row */}
                  <div className="flex justify-between items-center mb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full skeleton-shimmer" />
                      <div className="h-3.5 w-16 rounded skeleton-shimmer" />
                    </div>
                    <div className="h-3.5 w-10 rounded skeleton-shimmer" />
                  </div>
                  {/* Price row */}
                  <div className="flex justify-between items-center mb-2">
                    <div className="h-5 w-20 rounded skeleton-shimmer" />
                    <div className="h-3.5 w-14 rounded skeleton-shimmer" />
                  </div>
                  {/* Sparkline placeholder */}
                  <div className="h-6 w-full rounded skeleton-shimmer my-2" />
                  {/* Stats row */}
                  <div
                    className="flex justify-between items-center pt-2"
                    style={{ borderTop: '1px solid #2A2A2A' }}
                  >
                    <div className="h-3 w-10 rounded skeleton-shimmer" />
                    <div className="h-3 w-10 rounded skeleton-shimmer" />
                    <div className="h-3 w-10 rounded skeleton-shimmer" />
                  </div>
                </div>
              );
            })}

            {/* Correlation label skeletons on edges */}
            {Array.from({ length: 6 }).map((_, i) => {
              const fromIdx = i;
              const toIdx = (i + 3) % 8;
              const fromAngle = ((fromIdx / 8) * 360 - 90) * (Math.PI / 180);
              const toAngle = ((toIdx / 8) * 360 - 90) * (Math.PI / 180);
              const radius = 190;
              const mx = (Math.cos(fromAngle) + Math.cos(toAngle)) * radius * 0.5;
              const my = (Math.sin(fromAngle) + Math.sin(toAngle)) * radius * 0.5;
              return (
                <div
                  key={`corr-${i}`}
                  className="absolute rounded-md skeleton-shimmer"
                  style={{
                    left: `calc(50% + ${mx}px)`,
                    top: `calc(50% + ${my}px)`,
                    transform: 'translate(-50%, -50%)',
                    width: 52,
                    height: 22,
                  }}
                />
              );
            })}
          </div>
        </div>

        {/* Mobile cards skeleton */}
        <div className="lg:hidden">
          {/* Mobile summary card skeleton */}
          <div
            className="rounded-xl p-4 mb-4"
            style={{ background: '#1A1A1A', border: '1px solid #2A2A2A' }}
          >
            <div className="flex justify-between items-center mb-3">
              <div className="h-4 w-24 rounded skeleton-shimmer" />
              <div className="h-4 w-16 rounded skeleton-shimmer" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="text-center space-y-1">
                  <div className="h-4 w-12 rounded skeleton-shimmer mx-auto" />
                  <div className="h-2.5 w-16 rounded skeleton-shimmer mx-auto" />
                </div>
              ))}
            </div>
          </div>

          {/* Mobile instrument cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="rounded-xl p-3.5"
                style={{
                  background: '#1A1A1A',
                  border: '1px solid #2A2A2A',
                  animationDelay: `${i * 0.06}s`,
                }}
              >
                <div className="flex justify-between items-center mb-2">
                  <div className="flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full skeleton-shimmer" />
                    <div className="h-3.5 w-20 rounded skeleton-shimmer" />
                  </div>
                  <div className="h-3 w-10 rounded skeleton-shimmer" />
                </div>
                <div className="flex justify-between items-center mb-2">
                  <div className="h-4 w-20 rounded skeleton-shimmer" />
                  <div className="h-3 w-14 rounded skeleton-shimmer" />
                </div>
                <div className="h-7 w-full rounded skeleton-shimmer mb-2" />
                <div
                  className="flex justify-between items-center pt-2"
                  style={{ borderTop: '1px solid #2A2A2A' }}
                >
                  <div className="h-2.5 w-10 rounded skeleton-shimmer" />
                  <div className="h-2.5 w-10 rounded skeleton-shimmer" />
                  <div className="h-2.5 w-10 rounded skeleton-shimmer" />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Legend skeleton */}
        <div className="flex gap-4 justify-center flex-wrap">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <div className="w-[7px] h-[7px] rounded-sm skeleton-shimmer" />
              <div className="h-3 w-16 rounded skeleton-shimmer" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
