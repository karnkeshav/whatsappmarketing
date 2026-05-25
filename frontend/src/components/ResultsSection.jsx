import React from "react";
import { ArrowsClockwise } from "@phosphor-icons/react";
import GroupCard from "@/components/GroupCard";
import RegionFilters from "@/components/RegionFilters";
import { ScanBanner, SkeletonGrid, EmptyState } from "@/components/ResultsExtras";

function ResultsBody({ loading, groups, onFind, onChange }) {
  if (loading) return <SkeletonGrid />;
  if (groups.length === 0) return <EmptyState onFind={onFind} />;
  return (
    <div
      data-testid="groups-grid"
      className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
    >
      {groups.map(g => <GroupCard key={g.id} group={g} onChange={onChange} />)}
    </div>
  );
}

export default function ResultsSection({
  region, setRegion, groups, loading, scan, isScanning, onRefresh, onFind,
}) {
  return (
    <section id="results" className="max-w-7xl mx-auto px-6 md:px-10 py-12 md:py-16">
      <div className="flex items-end justify-between flex-wrap gap-6 mb-6">
        <div>
          <div className="label-eyebrow">Directory</div>
          <h2 className="font-display font-black uppercase text-3xl md:text-5xl tracking-tight mt-3">
            Public open groups
          </h2>
        </div>
        <button
          data-testid="refresh-button"
          onClick={onRefresh}
          className="brutal-btn brutal-btn-outline px-4 py-2.5 text-xs inline-flex items-center gap-2"
        >
          <ArrowsClockwise size={14} weight="bold" />
          Refresh
        </button>
      </div>

      <RegionFilters active={region} onChange={setRegion} />

      {isScanning && <ScanBanner scan={scan} />}

      <div className="mt-8">
        <ResultsBody loading={loading} groups={groups} onFind={onFind} onChange={onRefresh} />
      </div>
    </section>
  );
}
