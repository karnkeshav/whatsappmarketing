import React, { useState } from "react";
import { toast } from "sonner";
import { submitGroup, REGIONS } from "@/lib/api";
import { PaperPlaneTilt, LinkSimple } from "@phosphor-icons/react";

export default function SubmitGroupForm({ onSubmitted }) {
  const [link, setLink] = useState("");
  const [region, setRegion] = useState(REGIONS[0]);
  const [busy, setBusy] = useState(false);

  async function handle(e) {
    e.preventDefault();
    if (!link.includes("chat.whatsapp.com")) {
      toast.error("Please paste a valid chat.whatsapp.com invite link");
      return;
    }
    setBusy(true);
    try {
      const grp = await submitGroup(link.trim(), region);
      toast.success(`Added: ${grp.name}`);
      setLink("");
      onSubmitted?.(grp);
    } catch (err) {
      const msg = err?.response?.data?.detail || "Could not add this group";
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      id="submit"
      data-testid="submit-group-section"
      className="border-y border-black bg-white"
    >
      <div className="max-w-7xl mx-auto px-6 md:px-10 py-14 md:py-16 grid lg:grid-cols-12 gap-10">
        <div className="lg:col-span-5">
          <div className="label-eyebrow">Crowdsource</div>
          <h2 className="font-display font-black uppercase text-3xl md:text-5xl tracking-tight mt-3">
            Know an open group?<br />Submit it.
          </h2>
          <p className="mt-4 text-zinc-700 max-w-md">
            Paste a <code className="bg-zinc-100 px-1">chat.whatsapp.com</code> link below.
            Our bot validates instantly — admin-approval groups are rejected automatically.
          </p>
        </div>

        <form
          onSubmit={handle}
          data-testid="submit-group-form"
          className="lg:col-span-7 brutal-card p-6 md:p-8 space-y-5"
        >
          <div>
            <label className="label-eyebrow block mb-2">WhatsApp invite link</label>
            <div className="flex items-center gap-2 border border-black bg-[#FAFAFA] px-3 py-3">
              <LinkSimple size={18} weight="bold" />
              <input
                data-testid="submit-group-link-input"
                type="url"
                value={link}
                onChange={e => setLink(e.target.value)}
                placeholder="https://chat.whatsapp.com/XXXXXXXXXXXXXXXX"
                className="bg-transparent w-full outline-none text-sm md:text-base"
                required
              />
            </div>
          </div>

          <div>
            <label className="label-eyebrow block mb-2">Region</label>
            <div className="flex flex-wrap gap-2">
              {REGIONS.map(r => (
                <button
                  type="button"
                  key={r}
                  data-testid={`submit-region-${r.toLowerCase()}`}
                  onClick={() => setRegion(r)}
                  className="chip"
                  data-active={region === r}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          <button
            type="submit"
            disabled={busy}
            data-testid="submit-group-button"
            className="brutal-btn px-7 py-4 text-sm inline-flex items-center gap-3 disabled:opacity-60"
          >
            <PaperPlaneTilt size={18} weight="bold" />
            {busy ? "Validating…" : "Validate & Submit"}
          </button>
          <p className="text-xs text-zinc-500">
            By submitting you confirm the group is public and lawful. We re-check every link before listing.
          </p>
        </form>
      </div>
    </section>
  );
}
