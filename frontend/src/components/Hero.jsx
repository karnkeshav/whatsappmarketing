import React from "react";
import { MagnifyingGlass, ArrowRight } from "@phosphor-icons/react";

export default function Hero({ onFind, isScanning, stats }) {
  return (
    <section
      data-testid="hero-section"
      className="relative border-b border-black"
    >
      <div className="absolute inset-0 grid-bg opacity-60 pointer-events-none" />
      <div className="relative max-w-7xl mx-auto px-6 md:px-10 py-16 md:py-24 grid lg:grid-cols-12 gap-10">
        {/* Left — headline */}
        <div className="lg:col-span-8">
          <div className="label-eyebrow mb-4">
            <span data-testid="hero-eyebrow">WhatsApp · Jobs · India</span>
          </div>
          <h1
            data-testid="hero-headline"
            className="font-display font-black uppercase tracking-tighter text-5xl sm:text-6xl md:text-7xl lg:text-[88px] leading-[0.92]"
          >
            Find <span className="bg-black text-white px-2">open</span> WhatsApp<br />
            jobs groups<br />
            across <span className="underline decoration-[4px] decoration-[#0047FF] underline-offset-[6px]">India.</span>
          </h1>
          <p data-testid="hero-subtext" className="mt-6 max-w-2xl text-zinc-700 text-base md:text-lg leading-relaxed">
            We crawl the public web for <code className="bg-zinc-100 px-1">chat.whatsapp.com</code> invite links across
            Hyderabad, Bihar, Delhi & Jharkhand. Visitors crowd-verify each one with a single tap —
            groups needing admin approval are auto-hidden after two reports.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-4">
            <button
              data-testid="find-groups-button"
              onClick={onFind}
              disabled={isScanning}
              className="brutal-btn brutal-btn-neon inline-flex items-center gap-3 px-7 py-4 text-sm md:text-base disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <MagnifyingGlass size={20} weight="bold" />
              {isScanning ? "Scanning…" : "Find Groups"}
              <ArrowRight size={18} weight="bold" />
            </button>

            <a
              data-testid="hero-jump-results"
              href="#results"
              className="brutal-btn brutal-btn-outline inline-flex items-center gap-2 px-6 py-4 text-xs md:text-sm"
            >
              Browse validated groups
            </a>
          </div>
        </div>

        {/* Right — bento stats */}
        <div className="lg:col-span-4 grid grid-cols-2 gap-3" data-testid="hero-stats">
          <StatCard label="Open groups" value={stats?.total_open ?? 0} testId="stat-total-open" big />
          <StatCard label="Regions" value={4} testId="stat-regions" />
          <StatCard label="Hyderabad" value={stats?.per_region?.Hyderabad ?? 0} testId="stat-hyderabad" />
          <StatCard label="Delhi" value={stats?.per_region?.Delhi ?? 0} testId="stat-delhi" />
          <StatCard label="Bihar" value={stats?.per_region?.Bihar ?? 0} testId="stat-bihar" />
          <StatCard label="Jharkhand" value={stats?.per_region?.Jharkhand ?? 0} testId="stat-jharkhand" />
        </div>
      </div>
    </section>
  );
}

function StatCard({ label, value, testId, big }) {
  return (
    <div
      data-testid={testId}
      className={`brutal-card p-4 flex flex-col justify-between ${big ? "col-span-2 row-span-1" : ""}`}
    >
      <div className="label-eyebrow">{label}</div>
      <div className={`font-display font-black ${big ? "text-6xl" : "text-3xl"} mt-2`}>
        {value}
      </div>
    </div>
  );
}
