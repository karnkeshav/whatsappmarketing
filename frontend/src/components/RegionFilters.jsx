import React from "react";
import { REGIONS } from "@/lib/api";

export default function RegionFilters({ active, onChange }) {
  const isAll = active === "all";
  return (
    <div data-testid="region-filters" className="flex flex-wrap items-center gap-2 md:gap-3">
      <button
        data-testid="region-filter-all"
        className="chip"
        data-active={isAll}
        onClick={() => onChange("all")}
      >
        All Regions
      </button>
      {REGIONS.map(r => (
        <button
          key={r}
          data-testid={`region-filter-${r.toLowerCase()}`}
          className="chip"
          data-active={active === r}
          onClick={() => onChange(r)}
        >
          <span
            className="status-dot"
            style={{ background: active === r ? "#00E676" : "#0A0A0A" }}
          />
          {r}
        </button>
      ))}
    </div>
  );
}
