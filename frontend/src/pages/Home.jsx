import React, { useState } from "react";
import { toast } from "sonner";
import Hero from "@/components/Hero";
import TickerRibbon from "@/components/TickerRibbon";
import SubmitGroupForm from "@/components/SubmitGroupForm";
import HowItWorks from "@/components/HowItWorks";
import TopNav from "@/components/TopNav";
import ResultsSection from "@/components/ResultsSection";
import useDirectory from "@/hooks/useDirectory";
import { startDiscovery } from "@/lib/api";

export default function Home() {
  const [region, setRegion] = useState("all");
  const { groups, stats, scan, loading, isScanning, fetchAll } = useDirectory(region);

  async function onFind() {
    try {
      const res = await startDiscovery();
      if (res.status === "already_running") {
        toast.message("A scan is already running…");
      } else {
        toast.success("Scan started — finding open groups now");
      }
      fetchAll();
    } catch {
      toast.error("Failed to start scan");
    }
  }

  return (
    <div>
      <TopNav />
      <Hero onFind={onFind} isScanning={isScanning} stats={stats} />
      <TickerRibbon />
      <ResultsSection
        region={region}
        setRegion={setRegion}
        groups={groups}
        loading={loading}
        scan={scan}
        isScanning={isScanning}
        onRefresh={fetchAll}
        onFind={onFind}
      />
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
