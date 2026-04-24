import React, { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Lock, ArrowLeft, Shield } from "lucide-react";

export default function AdminLogin() {
  const { user, login, loading } = useAuth();
  const nav = useNavigate();

  useEffect(() => {
    if (loading) return;
    if (user && user.role !== "customer") nav("/admin");
    if (user && user.role === "customer") nav("/account");
  }, [user, loading, nav]);

  return (
    <div className="min-h-screen relative overflow-hidden bg-zinc-950 text-white grid lg:grid-cols-2">
      {/* Left side — full-bleed image with overlay */}
      <div className="hidden lg:block relative">
        <img
          src="https://images.pexels.com/photos/5843171/pexels-photo-5843171.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=900&w=1200"
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-tr from-zinc-950 via-zinc-950/60 to-transparent" />
        <div className="absolute inset-0 grain-bg" />

        <div className="relative z-10 h-full flex flex-col justify-between p-12">
          <Link to="/" className="inline-flex items-center gap-2 text-xs font-heading uppercase tracking-[0.3em] text-zinc-400 hover:text-white">
            <ArrowLeft className="h-3 w-3" /> Back to Storefront
          </Link>
          <div>
            <div className="text-[#FF3B30] text-xs font-heading uppercase tracking-[0.5em] mb-4">Threadline.</div>
            <h1 className="font-heading text-5xl xl:text-6xl font-black uppercase tracking-tighter leading-[0.9]">
              Control<br /> Room<br />
              <span className="text-[#FF3B30]">access.</span>
            </h1>
            <p className="text-zinc-400 mt-6 max-w-md">
              Restricted to brand operators &amp; staff. Inventory, orders, payroll and the rest of the empire live behind this door.
            </p>
          </div>
          <div className="text-[10px] font-heading uppercase tracking-[0.4em] text-zinc-600">
            EST. 2026 // BOLD &amp; EDGY
          </div>
        </div>
      </div>

      {/* Right side — sign in panel */}
      <div className="flex items-center justify-center p-6 sm:p-12 relative">
        <div
          className="absolute inset-0 lg:hidden opacity-20 bg-cover bg-center"
          style={{ backgroundImage: "url(https://images.pexels.com/photos/5843171/pexels-photo-5843171.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=900&w=1200)" }}
        />
        <div className="absolute inset-0 lg:hidden bg-gradient-to-b from-zinc-950/90 to-zinc-950" />

        <div className="relative z-10 w-full max-w-sm">
          <div className="border border-zinc-800 bg-zinc-950/80 backdrop-blur-xl">
            <div className="p-8 border-b border-zinc-900">
              <div className="flex items-center gap-3 mb-6">
                <div className="h-10 w-10 border-2 border-[#FF3B30] flex items-center justify-center">
                  <Shield className="h-5 w-5 text-[#FF3B30]" />
                </div>
                <div>
                  <div className="font-heading text-[10px] uppercase tracking-[0.4em] text-zinc-500">Staff Portal</div>
                  <div className="font-heading text-lg font-black uppercase tracking-tighter">Admin Sign-In</div>
                </div>
              </div>

              <Button
                onClick={login}
                data-testid="admin-login-google-btn"
                className="w-full bg-white text-black hover:bg-zinc-200 rounded-none font-bold uppercase tracking-widest py-6 flex items-center justify-center gap-3"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Sign in with Google
              </Button>

              <div className="flex items-start gap-2 mt-6 text-[11px] text-zinc-500 leading-relaxed">
                <Lock className="h-3 w-3 flex-shrink-0 mt-0.5" />
                <span>
                  Only emails registered as staff in the Control Room (or the configured ADMIN_EMAILS list) will see the admin panel. Customers will be redirected to their account.
                </span>
              </div>
            </div>

            <div className="px-8 py-4 border-t border-zinc-900 flex items-center justify-between text-[10px] font-heading uppercase tracking-[0.3em] text-zinc-600">
              <Link to="/login" className="hover:text-zinc-300">Customer Sign-In</Link>
              <Link to="/" className="hover:text-zinc-300">Storefront</Link>
            </div>
          </div>

          <div className="lg:hidden mt-6 text-center">
            <Link to="/" className="inline-flex items-center gap-2 text-xs font-heading uppercase tracking-[0.3em] text-zinc-500 hover:text-white">
              <ArrowLeft className="h-3 w-3" /> Back to Storefront
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
