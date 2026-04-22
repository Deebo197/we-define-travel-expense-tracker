export function SkeletonCard({ className = "" }) {
  return (
    <div
      className={`rounded-[20px] p-5 overflow-hidden relative ${className}`}
      style={{ backgroundColor: "#14141B", border: "1px solid rgba(255,255,255,0.06)" }}
    >
      <div className="shimmer-line w-1/3 h-3 rounded-full mb-4" />
      <div className="shimmer-line w-2/3 h-8 rounded-full mb-2" />
      <div className="shimmer-line w-1/2 h-3 rounded-full" />
      <style>{`
        .shimmer-line {
          background: linear-gradient(90deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.1) 50%, rgba(255,255,255,0.04) 100%);
          background-size: 200% 100%;
          animation: shimmer 1.8s linear infinite;
        }
        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
      `}</style>
    </div>
  );
}

export function SkeletonRow() {
  return (
    <div className="flex items-center gap-4 px-5 py-4" style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
      <div className="shimmer-line w-20 h-4 rounded-full" />
      <div className="shimmer-line flex-1 h-4 rounded-full" />
      <div className="shimmer-line w-16 h-4 rounded-full" />
      <style>{`
        .shimmer-line {
          background: linear-gradient(90deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.1) 50%, rgba(255,255,255,0.04) 100%);
          background-size: 200% 100%;
          animation: shimmer 1.8s linear infinite;
        }
        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
      `}</style>
    </div>
  );
}