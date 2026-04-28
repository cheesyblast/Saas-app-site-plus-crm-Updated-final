import React, { useState } from "react";
import Coupons from "./Coupons";
import Discounts from "./Discounts";

export default function CouponsAndDiscounts() {
  const [tab, setTab] = useState("coupons");
  return (
    <div className="space-y-6 text-white" data-testid="admin-coupons-discounts">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-heading text-3xl sm:text-4xl font-black uppercase tracking-tighter">Coupon &amp; Discount</h1>
          <p className="text-sm text-zinc-500 mt-1">Codes that customers redeem at checkout vs. site-wide promotions with marquee & badges.</p>
        </div>
        <div className="flex gap-1 border border-zinc-800">
          <button data-testid="tab-coupons" onClick={() => setTab("coupons")} className={`px-4 py-2 text-xs uppercase tracking-widest font-heading ${tab === "coupons" ? "bg-[#FF3B30] text-white" : "text-zinc-400 hover:text-white"}`}>Coupons</button>
          <button data-testid="tab-discounts" onClick={() => setTab("discounts")} className={`px-4 py-2 text-xs uppercase tracking-widest font-heading ${tab === "discounts" ? "bg-[#FF3B30] text-white" : "text-zinc-400 hover:text-white"}`}>Discounts</button>
        </div>
      </div>
      {tab === "coupons" ? <Coupons /> : <Discounts />}
    </div>
  );
}
