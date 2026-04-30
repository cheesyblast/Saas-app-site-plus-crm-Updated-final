import React, { useEffect } from "react";
import { Outlet } from "react-router-dom";
import api from "@/lib/api";
import Navbar from "./Navbar";
import Footer from "./Footer";
import CartDrawer from "./CartDrawer";
import DiscountMarquee from "./DiscountMarquee";
import { applyTheme } from "@/lib/page";
import { BACKEND_URL } from "@/lib/api";

function injectMeta(name, content, attr = "name") {
  if (!content) return;
  let el = document.head.querySelector(`meta[${attr}="${name}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, name);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function injectLink(rel, href) {
  if (!href) return;
  let el = document.head.querySelector(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", rel);
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
}

function applyCompanyHead(c) {
  if (!c) return;
  // Title
  const title = c.meta_title || (c.company_name ? `${c.company_name}` : null);
  if (title) document.title = title;
  injectMeta("description", c.meta_description);
  injectMeta("keywords", c.meta_keywords);
  injectMeta("og:title", title, "property");
  injectMeta("og:description", c.meta_description, "property");
  injectMeta("og:type", "website", "property");
  if (c.og_image_id) injectMeta("og:image", `${BACKEND_URL}/api/media/${c.og_image_id}`, "property");
  injectMeta("twitter:card", "summary_large_image");
  if (c.google_site_verification) injectMeta("google-site-verification", c.google_site_verification);
  if (c.favicon_id) injectLink("icon", `${BACKEND_URL}/api/media/${c.favicon_id}`);

  // Google Analytics (GA4)
  if (c.google_analytics_id && !document.getElementById("ga4-script")) {
    const s1 = document.createElement("script");
    s1.id = "ga4-script";
    s1.async = true;
    s1.src = `https://www.googletagmanager.com/gtag/js?id=${c.google_analytics_id}`;
    document.head.appendChild(s1);
    const s2 = document.createElement("script");
    s2.id = "ga4-init";
    s2.text = `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js', new Date());gtag('config', '${c.google_analytics_id}');`;
    document.head.appendChild(s2);
  }
  // Facebook Pixel
  if (c.facebook_pixel_id && !document.getElementById("fb-pixel")) {
    const s = document.createElement("script");
    s.id = "fb-pixel";
    s.text = `!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init', '${c.facebook_pixel_id}');fbq('track', 'PageView');`;
    document.head.appendChild(s);
  }
}

export default function StorefrontLayout() {
  useEffect(() => {
    api.get("/theme").then(({ data }) => applyTheme(data)).catch(() => {});
    api.get("/company").then(({ data }) => applyCompanyHead(data)).catch(() => {});
  }, []);
  return (
    <div className="storefront-shell min-h-screen flex flex-col">
      <Navbar />
      <DiscountMarquee />
      <main className="flex-1">
        <Outlet />
      </main>
      <Footer />
      <CartDrawer />
    </div>
  );
}
