import React from "react";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";

export default function Pagination({ page, pageSize, total, onChange }) {
  const totalPages = Math.max(1, Math.ceil((total || 0) / (pageSize || 50)));
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);
  if (total === 0) return null;
  return (
    <div className="flex items-center justify-between px-1 pt-3 text-xs text-zinc-500">
      <div className="font-mono">
        <span className="text-white font-bold">{start}–{end}</span> of {total}
      </div>
      <div className="flex items-center gap-2">
        <Button data-testid="page-prev" disabled={page <= 1} onClick={() => onChange(Math.max(1, page - 1))}
                className="h-8 w-8 p-0 rounded-none bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 disabled:opacity-30">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="font-heading uppercase tracking-widest text-[10px] text-zinc-400 px-2">Page {page} / {totalPages}</span>
        <Button data-testid="page-next" disabled={page >= totalPages} onClick={() => onChange(Math.min(totalPages, page + 1))}
                className="h-8 w-8 p-0 rounded-none bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 disabled:opacity-30">
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
