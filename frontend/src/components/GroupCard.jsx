import React, { useState } from "react";
import { WhatsappLogo, ArrowUpRight, ShieldCheck, Clock, ThumbsUp, ThumbsDown, Warning } from "@phosphor-icons/react";
import { toast } from "sonner";
import { reportGroup } from "@/lib/api";

function timeAgo(iso) {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  const s = Math.floor((Date.now() - t) / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const REPORT_MESSAGES = {
  works: "Thanks! Marked as working.",
  approval: "Thanks — flagged as admin-approval. Will hide after another report.",
  invalid: "Thanks — flagged as invalid.",
};

function CardHeader({ group }) {
  return (
    <div className="flex items-center justify-between border-b border-black px-4 py-2.5 bg-[#FAFAFA]">
      <span className="label-eyebrow" data-testid={`group-region-${group.id}`}>{group.region}</span>
      <span className="inline-flex items-center gap-2 text-[10px] tracking-[0.18em] uppercase font-bold">
        <span className="status-dot" style={{ background: "#00E676" }} />
        Open
      </span>
    </div>
  );
}

function CardMeta({ group }) {
  const works = group.reports_works || 0;
  const verifiedLabel = works > 0 ? `${works} confirmed` : "Unverified";
  const sourceLabel = group.discovered_via === "user" ? "Submitted" : "Auto-found";
  return (
    <div className="mt-4 flex flex-wrap gap-3 text-[11px] tracking-[0.15em] uppercase font-bold text-zinc-600">
      <span className="inline-flex items-center gap-1.5">
        <ShieldCheck size={14} weight="bold" />
        {verifiedLabel}
      </span>
      <span className="inline-flex items-center gap-1.5">
        <Clock size={14} weight="bold" /> {timeAgo(group.last_checked)}
      </span>
      <span className="inline-flex items-center gap-1.5">{sourceLabel}</span>
    </div>
  );
}

function ReportButtons({ groupId, reported, onReport }) {
  return (
    <div className="mt-4 flex items-center gap-2">
      <span className="label-eyebrow mr-1">Did it work?</span>
      <button
        data-testid={`report-works-${groupId}`}
        onClick={() => onReport("works")}
        disabled={!!reported}
        className="chip text-[10px] disabled:opacity-50"
        data-active={reported === "works"}
        title="I joined without admin approval"
      >
        <ThumbsUp size={12} weight="bold" /> Yes
      </button>
      <button
        data-testid={`report-approval-${groupId}`}
        onClick={() => onReport("approval")}
        disabled={!!reported}
        className="chip text-[10px] disabled:opacity-50"
        data-active={reported === "approval"}
        title="Needed admin approval — flag this group"
      >
        <ThumbsDown size={12} weight="bold" /> Needed approval
      </button>
      <button
        data-testid={`report-invalid-${groupId}`}
        onClick={() => onReport("invalid")}
        disabled={!!reported}
        className="chip text-[10px] disabled:opacity-50"
        data-active={reported === "invalid"}
        title="Link expired/invalid"
      >
        <Warning size={12} weight="bold" />
      </button>
    </div>
  );
}

export default function GroupCard({ group, onChange }) {
  const [reported, setReported] = useState(null);

  async function handleReport(kind) {
    if (reported) return;
    setReported(kind);
    try {
      const res = await reportGroup(group.id, kind);
      toast.success(REPORT_MESSAGES[kind]);
      if (res.status && res.status !== "open") onChange?.();
    } catch {
      toast.error("Could not record your report");
      setReported(null);
    }
  }

  return (
    <article data-testid={`group-card-${group.id}`} className="brutal-card flex flex-col">
      <CardHeader group={group} />
      <div className="px-4 py-5 flex-1">
        <h3
          data-testid={`group-name-${group.id}`}
          className="font-display font-bold text-lg md:text-xl leading-tight line-clamp-2"
        >
          {group.name}
        </h3>
        <p className="mt-2 text-sm text-zinc-700 line-clamp-1">{group.description || "Public WhatsApp group"}</p>
        <CardMeta group={group} />
        <ReportButtons groupId={group.id} reported={reported} onReport={handleReport} />
      </div>
      <a
        data-testid={`join-group-link-${group.id}`}
        href={group.invite_link}
        target="_blank"
        rel="noreferrer"
        className="brutal-btn brutal-btn-neon w-full text-center py-4 inline-flex items-center justify-center gap-2 text-sm"
      >
        <WhatsappLogo size={18} weight="bold" />
        Open in WhatsApp
        <ArrowUpRight size={16} weight="bold" />
      </a>
    </article>
  );
}
