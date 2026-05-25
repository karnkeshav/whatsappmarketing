import React from "react";
import { GithubLogo } from "@phosphor-icons/react";

export default function TopNav() {
  return (
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
  );
}
