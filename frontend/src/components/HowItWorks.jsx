import React from "react";
import { MagnifyingGlass, Eye, UsersThree, ShieldCheck } from "@phosphor-icons/react";

const STEPS = [
  {
    icon: MagnifyingGlass,
    title: "01 · Discover",
    body: "We crawl the public web (search engines + public group directories) for chat.whatsapp.com invite links that mention jobs and one of our four regions."
  },
  {
    icon: Eye,
    title: "02 · Validate link",
    body: "Each invite is fetched to confirm the URL exists and is reachable. Group name & description are pulled from WhatsApp's public preview."
  },
  {
    icon: UsersThree,
    title: "03 · Crowd-verify",
    body: "WhatsApp loads its join page in JavaScript, so we can't auto-detect admin-approval. Instead, every visitor can tap “Worked / Needed approval” to flag the group."
  },
  {
    icon: ShieldCheck,
    title: "04 · Auto-hide",
    body: "After two “needed approval” reports a group is hidden automatically. Confirmed-working groups rise to the top. Your number is never used by us."
  },
];

export default function HowItWorks() {
  return (
    <section data-testid="how-it-works" id="how" className="border-b border-black bg-white">
      <div className="max-w-7xl mx-auto px-6 md:px-10 py-14 md:py-20">
        <div className="flex items-end justify-between flex-wrap gap-4 mb-10">
          <div>
            <div className="label-eyebrow">Process</div>
            <h2 className="font-display font-black uppercase text-3xl md:text-5xl tracking-tight mt-3">
              How the bot works.
            </h2>
          </div>
          <p className="max-w-md text-zinc-700 text-sm md:text-base">
            Built on free-tier infrastructure. No paid APIs, no WhatsApp account used for validation.
            We are upfront: WhatsApp's invite preview is rendered client-side, so admin-approval
            detection is crowd-sourced — fast, free, and accurate enough.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
          {STEPS.map((s, i) => (
            <div key={i} data-testid={`how-step-${i}`} className="brutal-card p-6 flex flex-col gap-4">
              <s.icon size={28} weight="duotone" />
              <div className="font-display font-black text-xl uppercase">{s.title}</div>
              <p className="text-sm text-zinc-700 leading-relaxed">{s.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
