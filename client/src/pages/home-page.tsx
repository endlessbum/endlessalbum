import React, { useCallback, useMemo, useState } from "react";
const monthNom = [
  "январь","февраль","март","апрель","май","июнь",
  "июль","август","сентябрь","октябрь","ноябрь","декабрь"
];
const monthGen = [
  "января","февраля","марта","апреля","мая","июня",
  "июля","августа","сентября","октября","ноября","декабря"
];
const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
function formatMonthBucket(bucket: string): string {
  const [year, month] = bucket.split('-').map(Number);
  if (!year || !month || month < 1 || month > 12) return bucket;
  return `${monthNom[month - 1]} ${year}`;
}
function dateMatchesToken(d: Date, token: string): boolean {
  const q = token.toLowerCase();
  const day = d.getDate();
  const month = d.getMonth();
  const year = d.getFullYear();
  const variants: string[] = [
    `${pad(day)}.${pad(month + 1)}.${year}`,
    `${year}-${pad(month + 1)}-${pad(day)}`,
    `${day} ${monthGen[month]} ${year}`.toLowerCase(),
    `${monthNom[month]} ${year}`.toLowerCase(),
    `${monthGen[month]} ${year}`.toLowerCase(),
    `${day} ${monthGen[month]}`.toLowerCase(),
    `${year}`,
    monthNom[month],
    monthGen[month],
  ];
  for (let i = 0; i < variants.length; i++) {
    if (variants[i].includes(q)) return true;
  }
  return false;
}
import { useQuery } from "@tanstack/react-query";
import MemoryCard from "@/components/memory-card";
import MemoryModal from "@/components/memory-modal";
import CreateMemoryModal from "@/components/create-memory-modal";
import SearchInput from "@/components/layout/search-input";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import type { Memory, Counter } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";

export default function HomePage() {
  const [selectedMemory, setSelectedMemory] = useState<Memory | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingMemory, setEditingMemory] = useState<Memory | null>(null);
  const [query, setQuery] = useState("");

  const { data: memories = [], isLoading: memoriesLoading } = useQuery<Memory[]>({
    queryKey: ["/api/memories"],
  });

  const { data: counters = [], isLoading: countersLoading } = useQuery<Counter[]>({
    queryKey: ["/api/counters"],
  });

  const { data: me } = useQuery<{ id: string; username: string } | null>({
    queryKey: ["/api/user"],
    queryFn: async () => {
      const res = await apiRequest("/api/user", "GET");
      if (!res.ok) return null;
      return await res.json();
    },
  });
  const { data: partnerResp } = useQuery<{ partner: { id: string; username: string } | null}>({
    queryKey: ["/api/partner"],
    queryFn: async () => {
      const res = await apiRequest("/api/partner", "GET");
      if (!res.ok) return { partner: null };
      return await res.json();
    },
  });

  const resolveAuthorUsername = useCallback((m: Memory): string | null => {
    if (me && m.authorId === me.id) return me.username;
    const p = partnerResp?.partner;
    if (p && m.authorId === p.id) return p.username;
    return null;
  }, [me, partnerResp?.partner]);

  const filteredMemories = useMemo(() => {
    const q = (query || "").trim();
    if (!q) return memories;
    const tokens = q.split(/\s+/).filter(Boolean);
    const tokenPredicates = tokens.map((t) => {
      const isAt = t.startsWith("@") && t.length > 1;
      const isHash = t.startsWith("#") && t.length > 1;
      const needle = (isAt || isHash) ? t.slice(1).toLowerCase() : t.toLowerCase();
      return (m: Memory) => {
        const title = (m.title || "").toLowerCase();
        const content = (m.content || "").toLowerCase();
        const tags = (m.tags || []).map((x) => (x || "").toLowerCase());

        if (isAt) {
          const uname = (resolveAuthorUsername(m) || "").toLowerCase();
          if (uname.includes(needle)) return true;
        }
        if (isHash) {
          if (tags.some((tg) => tg.replace(/^#/, "").includes(needle))) return true;
        }
        const created = m.createdAt ? new Date(m.createdAt) : null;
        if (created && dateMatchesToken(created, t)) return true;
        if (title.includes(needle) || content.includes(needle)) return true;
        return false;
      };
    });

    return memories.filter((m) => tokenPredicates.every((p) => p(m)));
  }, [memories, query, resolveAuthorUsername]);

  const handleCreateMemory = () => {
    setIsCreateModalOpen(true);
  };

  const handleEditMemory = (memory: Memory) => {
    setSelectedMemory(null);
    setEditingMemory(memory);
    setIsCreateModalOpen(true);
  };

  const handleCloseCreateModal = () => {
    setIsCreateModalOpen(false);
    setEditingMemory(null);
  };

  if (memoriesLoading || countersLoading) {
    return (
      <div className="flex min-h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-accent-strong"></div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:py-10" data-testid="home-page">
      <header className="flex flex-col gap-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-text-primary sm:text-3xl" data-testid="page-title">
              Наша история
            </h1>
            <p className="mt-1 text-sm text-text-secondary">Альбом воспоминаний двоих</p>
          </div>
          <Button
            onClick={handleCreateMemory}
            className="btn-gradient rounded-lg"
            data-testid="button-create-memory"
          >
            <Plus className="mr-2 h-4 w-4" />
            Создать
          </Button>
        </div>

        <div className="mx-auto w-full max-w-xl">
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="Поиск по хэштегу и ключевым словам"
            testId="search-input-desktop"
            className="hidden md:block"
          />
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="Поиск"
            testId="search-input-mobile"
            className="md:hidden"
          />
        </div>

        {counters.length > 0 && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 md:grid-cols-3" data-testid="counters-section">
            {counters.slice(0, 3).map((counter, index) => (
              <div key={counter.id} className="rounded-xl border border-border-subtle bg-surface p-3 text-center transition-colors hover:bg-surface-hover sm:p-4">
                <div
                  className={`mb-1 text-xl font-semibold sm:text-2xl ${
                    index === 0 ? 'text-accent-strong' : 'text-text-primary'
                  }`}
                  data-testid={`counter-value-${index}`}
                >
                  {counter.value}
                </div>
                <div className="text-xs text-text-secondary sm:text-sm" data-testid={`counter-name-${index}`}>
                  {counter.name}
                </div>
              </div>
            ))}
          </div>
        )}
      </header>

      <div
        className={`masonry-grid gap-3 sm:gap-4 md:gap-5 grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 ${
          filteredMemories.length === 0 ? 'mt-8' : 'mt-10'
        }`}
        data-testid="memories-grid"
      >
        {filteredMemories.length === 0 ? (
          <div className="col-span-full rounded-xl border border-dashed border-border-subtle bg-surface p-10 text-center">
            <p className="text-text-secondary" data-testid="empty-state">
              У вас пока нет воспоминаний. Создайте первое!
            </p>
          </div>
        ) : (
          Object.entries(
            filteredMemories.reduce((acc, m) => {
              const d = m.createdAt ? new Date(m.createdAt) : null;
              const ym = d ? `${d.getFullYear()}-${(d.getMonth()+1).toString().padStart(2,'0')}` : 'unknown';
              (acc[ym] ||= []).push(m);
              return acc;
            }, {} as Record<string, typeof filteredMemories>)
          ).sort(([a],[b]) => a < b ? 1 : -1).map(([bucket, list]) => (
            <React.Fragment key={`grp-${bucket}`}>
              <div className="col-span-full sticky top-0 z-0 py-2">
                <div className="text-xs font-medium uppercase tracking-widest text-text-muted">
                  {bucket === 'unknown' ? 'Без даты' : formatMonthBucket(bucket)}
                </div>
              </div>
              {list.map((memory) => (
                <MemoryCard
                  key={memory.id}
                  memory={memory}
                  onClick={() => setSelectedMemory(memory)}
                  data-testid={`memory-card-${memory.id}`}
                />
              ))}
            </React.Fragment>
          ))
        )}
      </div>

      {selectedMemory && (
        <MemoryModal
          memory={selectedMemory}
          isOpen={!!selectedMemory}
          onClose={() => setSelectedMemory(null)}
          onEdit={handleEditMemory}
          data-testid="memory-modal"
        />
      )}

      <CreateMemoryModal
        isOpen={isCreateModalOpen}
        onClose={handleCloseCreateModal}
        editMemory={editingMemory}
        data-testid="create-memory-modal"
      />
    </div>
  );
}
