import React from "react";

export function SkeletonGrid() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={`skeleton-${i}`} className="brutal-card overflow-hidden">
          <div className="border-b border-black h-10 skel" />
          <div className="p-5 space-y-3">
            <div className="h-6 skel w-3/4" />
            <div className="h-4 skel w-full" />
            <div className="h-4 skel w-2/3" />
          </div>
          <div className="h-12 skel" />
        </div>
      ))}
    </div>
  );
}

export function EmptyState({ onFind }) {
  return (
    <div data-testid="empty-state" className="brutal-card p-10 text-center">
      <div className="label-eyebrow">No groups yet</div>
      <h3 className="font-display font-black text-2xl md:text-3xl mt-3 uppercase">
        Run the bot to populate this directory.
      </h3>
      <p className="text-sm text-zinc-700 mt-3 max-w-md mx-auto">
        Click below to start the discovery scan. The bot will search the public web for WhatsApp
        invite links and validate each one.
      </p>
      <button
        onClick={onFind}
        data-testid="empty-find-button"
        className="brutal-btn brutal-btn-neon mt-6 px-7 py-4 text-sm inline-flex items-center gap-2"
      >
        Find Groups
      </button>
    </div>
  );
}

export function ScanBanner({ scan }) {
  return (
    <div data-testid="scan-banner" className="mt-6 brutal-card p-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <span className="status-dot" style={{ background: "#FFD600" }} />
          <span className="label-eyebrow">Scanning</span>
          <span className="text-sm">{scan?.message || "Searching public web…"}</span>
        </div>
        <div className="text-xs text-zinc-600">
          Found {scan?.found_count ?? 0} · Open {scan?.open_count ?? 0}
        </div>
      </div>
      <div className="beam mt-3" />
    </div>
  );
}
