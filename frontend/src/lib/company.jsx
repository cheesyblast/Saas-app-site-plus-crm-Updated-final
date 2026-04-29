import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import api, { BACKEND_URL, setCurrency } from "./api";

const CompanyContext = createContext(null);
const COMPANY_CACHE_KEY = "threadline_company_cache";

function readCache() {
  try {
    const raw = localStorage.getItem(COMPANY_CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function CompanyProvider({ children }) {
  // Hydrate immediately from cache so the logo / brand renders on first paint
  // (no flash of the default brand text on every reload).
  const cached = readCache();
  const [company, setCompany] = useState(cached);
  const [loading, setLoading] = useState(!cached);

  const refresh = useCallback(async () => {
    try {
      const { data } = await api.get("/company");
      setCompany(data);
      if (data?.currency) setCurrency(data.currency);
      try { localStorage.setItem(COMPANY_CACHE_KEY, JSON.stringify(data)); } catch { /* quota */ }
    } catch {
      setCompany((prev) => prev || null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  return (
    <CompanyContext.Provider value={{ company, loading, refresh }}>
      {children}
    </CompanyContext.Provider>
  );
}

export const useCompany = () => useContext(CompanyContext) || { company: null, loading: false, refresh: () => {} };

export const logoUrl = (id) => (id ? `${BACKEND_URL}/api/media/${id}` : null);
