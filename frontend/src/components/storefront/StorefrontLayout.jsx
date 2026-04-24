import React, { useEffect } from "react";
import { Outlet } from "react-router-dom";
import api from "@/lib/api";
import Navbar from "./Navbar";
import Footer from "./Footer";
import CartDrawer from "./CartDrawer";
import { applyTheme } from "@/lib/page";

export default function StorefrontLayout() {
  useEffect(() => {
    api.get("/theme").then(({ data }) => applyTheme(data)).catch(() => {});
  }, []);
  return (
    <div className="min-h-screen flex flex-col bg-zinc-950 text-white">
      <Navbar />
      <main className="flex-1">
        <Outlet />
      </main>
      <Footer />
      <CartDrawer />
    </div>
  );
}
