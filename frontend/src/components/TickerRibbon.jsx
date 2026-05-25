import React from "react";
import Marquee from "react-fast-marquee";

export default function TickerRibbon() {
  const items = [
    "VALIDATED WHATSAPP GROUPS",
    "JOBS ACROSS INDIA",
    "OPEN-JOIN ONLY",
    "NO ADMIN APPROVAL",
    "HYDERABAD",
    "BIHAR",
    "DELHI",
    "JHARKHAND",
    "FREE • OPEN-SOURCE",
  ];
  return (
    <div
      data-testid="ticker-ribbon"
      className="border-y border-black bg-black text-white py-3 select-none"
    >
      <Marquee gradient={false} speed={48} pauseOnHover>
        {items.concat(items).map((t, i) => (
          <span key={`${t}-${i}`} className="font-display font-black tracking-tight uppercase text-sm">
            <span className="ticker-sep">+</span>{t}
          </span>
        ))}
      </Marquee>
    </div>
  );
}
