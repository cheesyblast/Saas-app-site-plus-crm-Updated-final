import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import api, { BACKEND_URL, setCurrency } from "./api";

const CompanyContext = createContext(null);

export function CompanyProvider({ children }) {
  const [company, setCompany] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const { data } = await api.get("/company");
      setCompany(data);
      if (data?.currency) setCurrency(data.currency);
    } catch {
      setCompany(null);
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
