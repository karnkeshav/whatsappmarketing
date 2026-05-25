import React, { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import Hero from "@/components/Hero";
import TickerRibbon from "@/components/TickerRibbon";
import RegionFilters from "@/components/RegionFilters";
import GroupCard from "@/components/GroupCard";
import SubmitGroupForm from "@/components/SubmitGroupForm";
import HowItWorks from "@/components/HowItWorks";
import { getScanStatus, getStats, listGroups, startDiscovery } from "@/lib/api";
import { ArrowsClockwise, GithubLogo } from "@phosphor-icons/react";

export default function Home() {
  const [region, setRegion] = useState("all");
  const [groups, setGroups] = useState([]);
  const [stats, setStats] = useState(null);
  const [scan, setScan] = useState(null);
  const [loading, setLoading] = useState(true);
  const pollRef = useRef(null);

  const fetchAll = useCallback(async () => {
    try {
      const [gs, st, sc] = await Promise.all([listGroups(region), getStats(), getScanStatus()]);
      setGroups(gs);
      setStats(st);
      setScan(sc);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [region]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // Poll while scan is running
  useEffect(() => {
    if (scan?.is_running) {
      pollRef.current = setInterval(fetchAll, 2500);
    } else if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    return () => pollRef.current && clearInterval(pollRef.current);
  }, [scan?.is_running, fetchAll]);

  async function onFind() {
    try {
      const res = await startDiscovery();
      if (res.status === "already_running") toast.message("A scan is already running…");
      else toast.success("Scan started — finding open groups now");
      fetchAll();
    } catch (e) {
      toast.error("Failed to start scan");
    }
  }

  const isScanning = !!scan?.is_running;

  return (
    <div>
      {/* Top nav */}
      <nav className="border-b border-black bg-white">
        <div className="max-w-7xl mx-auto px-6 md:px-10 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2 font-display font-black uppercase tracking-tight text-lg">
            <span className="inline-block w-2.5 h-2.5 bg-[#00E676] border border-black" />
            WA<span className="text-[#0047FF]">/</span>JOBS
          </div>
          <div className="hidden md:flex items-center gap-6 text-xs tracking-[0.18em] uppercase font-bold">
            <a href="#results" className="hover:underline" data-testid="nav-results">Results</a>
            <a href="#how" className="hover:underline" data-testid="nav-how">How it works</a>
            <a href="#submit" className="hover:underline" data-testid="nav-submit">Submit</a>
            <a
              href="https://github.com"
              target="_blank" rel="noreferrer"
              data-testid="nav-github"
              className="inline-flex items-center gap-1.5 hover:underline"
            >
              <GithubLogo size={16} weight="bold" /> GitHub
            </a>
          </div>
        </div>
      </nav>

      <Hero onFind={onFind} isScanning={isScanning} stats={stats} />
      <TickerRibbon />

      {/* Results section */}
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
            onClick={fetchAll}
            className="brutal-btn brutal-btn-outline px-4 py-2.5 text-xs inline-flex items-center gap-2"
          >
            <ArrowsClockwise size={14} weight="bold" />
            Refresh
          </button>
        </div>

        <RegionFilters active={region} onChange={setRegion} />

        {/* Scan status banner */}
        {isScanning && (
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
        )}

        {/* Results grid */}
        <div className="mt-8">
          {loading ? (
            <SkeletonGrid />
          ) : groups.length === 0 ? (
            <EmptyState onFind={onFind} />
          ) : (
            <div
              data-testid="groups-grid"
              className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
            >
              {groups.map(g => <GroupCard key={g.id} group={g} onChange={fetchAll} />)}
            </div>
          )}
        </div>
      </section>

      <HowItWorks />
      <SubmitGroupForm onSubmitted={fetchAll} />

      <footer className="border-t border-black bg-white">
        <div className="max-w-7xl mx-auto px-6 md:px-10 py-8 flex items-center justify-between flex-wrap gap-4 text-xs tracking-[0.18em] uppercase font-bold text-zinc-600">
          <div>© {new Date().getFullYear()} WA/Jobs · Free & open-source</div>
          <div className="flex items-center gap-4">
            <span>Made with FastAPI + React</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="brutal-card overflow-hidden">
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

function EmptyState({ onFind }) {
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
