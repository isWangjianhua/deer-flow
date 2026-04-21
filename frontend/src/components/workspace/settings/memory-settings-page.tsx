"use client";

import Link from "next/link";
import { useDeferredValue, useMemo, useState } from "react";
import { Streamdown } from "streamdown";

import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useI18n } from "@/core/i18n/hooks";
import { useMemory } from "@/core/memory/hooks";
import type { UserMemory } from "@/core/memory/types";
import { streamdownPlugins } from "@/core/streamdown/plugins";
import { pathOfThread } from "@/core/threads/utils";
import { formatTimeAgo } from "@/core/utils/datetime";

import { SettingsSection } from "./settings-section";

type MemoryViewFilter = "all" | "facts" | "summaries";
type MemoryFact = UserMemory["facts"][number];

type MemorySection = {
  title: string;
  summary: string;
  updatedAt?: string;
};

type MemorySectionGroup = {
  title: string;
  sections: MemorySection[];
};

function buildMemorySectionGroups(
  memory: UserMemory,
  t: ReturnType<typeof useI18n>["t"],
): MemorySectionGroup[] {
  return [
    {
      title: t.settings.memory.markdown.userContext,
      sections: [
        {
          title: t.settings.memory.markdown.work,
          summary: memory.user.workContext.summary,
          updatedAt: memory.user.workContext.updatedAt,
        },
        {
          title: t.settings.memory.markdown.personal,
          summary: memory.user.personalContext.summary,
          updatedAt: memory.user.personalContext.updatedAt,
        },
        {
          title: t.settings.memory.markdown.topOfMind,
          summary: memory.user.topOfMind.summary,
          updatedAt: memory.user.topOfMind.updatedAt,
        },
      ],
    },
    {
      title: t.settings.memory.markdown.historyBackground,
      sections: [
        {
          title: t.settings.memory.markdown.recentMonths,
          summary: memory.history.recentMonths.summary,
          updatedAt: memory.history.recentMonths.updatedAt,
        },
        {
          title: t.settings.memory.markdown.earlierContext,
          summary: memory.history.earlierContext.summary,
          updatedAt: memory.history.earlierContext.updatedAt,
        },
        {
          title: t.settings.memory.markdown.longTermBackground,
          summary: memory.history.longTermBackground.summary,
          updatedAt: memory.history.longTermBackground.updatedAt,
        },
      ],
    },
  ];
}

function isMemorySummaryEmpty(memory: UserMemory) {
  return (
    memory.user.workContext.summary.trim() === "" &&
    memory.user.personalContext.summary.trim() === "" &&
    memory.user.topOfMind.summary.trim() === "" &&
    memory.history.recentMonths.summary.trim() === "" &&
    memory.history.earlierContext.summary.trim() === "" &&
    memory.history.longTermBackground.summary.trim() === ""
  );
}

function sourceLooksLikeThreadId(source: string) {
  return /^[0-9a-f-]{16,}$/i.test(source);
}

function matchesQuery(value: string, normalizedQuery: string) {
  return normalizedQuery === "" || value.toLowerCase().includes(normalizedQuery);
}

export function MemorySettingsPage() {
  const { t } = useI18n();
  const { memory, isLoading, error } = useMemory();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<MemoryViewFilter>("all");
  const deferredQuery = useDeferredValue(query);
  const normalizedQuery = deferredQuery.trim().toLowerCase();

  const isUnauthenticated =
    error instanceof Error &&
    /sign in required|authenticated bff user required|invalid token/i.test(
      error.message,
    );

  const sectionGroups = useMemo(
    () => (memory ? buildMemorySectionGroups(memory, t) : []),
    [memory, t],
  );

  const visibleSectionGroups = useMemo(
    () =>
      sectionGroups
        .map((group) => ({
          ...group,
          sections: group.sections.filter(
            (section) =>
              matchesQuery(section.title, normalizedQuery) ||
              matchesQuery(section.summary, normalizedQuery),
          ),
        }))
        .filter((group) => group.sections.length > 0),
    [normalizedQuery, sectionGroups],
  );

  const visibleFacts = useMemo(
    () =>
      memory?.facts.filter(
        (fact) =>
          matchesQuery(fact.content, normalizedQuery) ||
          matchesQuery(fact.category, normalizedQuery) ||
          matchesQuery(fact.source, normalizedQuery),
      ) ?? [],
    [memory, normalizedQuery],
  );

  const showSummaries = filter === "all" || filter === "summaries";
  const showFacts = filter === "all" || filter === "facts";

  return (
    <SettingsSection
      title={t.settings.sections.memory}
      description={t.settings.memory.description}
    >
      {isLoading ? (
        <div className="text-muted-foreground text-sm">{t.common.loading}</div>
      ) : isUnauthenticated ? (
        <div className="space-y-2 rounded-lg border border-dashed p-6">
          <div className="font-medium">{t.auth.signedOut}</div>
          <div className="text-muted-foreground text-sm">
            {t.auth.browserSummarySignedOut}
          </div>
        </div>
      ) : error ? (
        <div className="rounded-lg border border-destructive/30 p-6 text-sm text-destructive">
          {error.message}
        </div>
      ) : !memory ? (
        <div className="text-muted-foreground text-sm">{t.settings.memory.empty}</div>
      ) : (
        <div className="space-y-6">
          <div className="space-y-3 rounded-lg border p-4">
            <div className="text-muted-foreground text-sm">
              {t.common.lastUpdated}: {formatTimeAgo(memory.lastUpdated)}
            </div>
            <div className="text-muted-foreground text-sm">
              {t.settings.memory.summaryReadOnly}
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t.settings.memory.searchPlaceholder}
                className="sm:max-w-sm"
              />
              <ToggleGroup
                type="single"
                value={filter}
                onValueChange={(value) => {
                  if (value === "all" || value === "facts" || value === "summaries") {
                    setFilter(value);
                  }
                }}
              >
                <ToggleGroupItem value="all">
                  {t.settings.memory.filterAll}
                </ToggleGroupItem>
                <ToggleGroupItem value="facts">
                  {t.settings.memory.filterFacts}
                </ToggleGroupItem>
                <ToggleGroupItem value="summaries">
                  {t.settings.memory.filterSummaries}
                </ToggleGroupItem>
              </ToggleGroup>
            </div>
          </div>

          {showSummaries && (
            <div className="space-y-4">
              {visibleSectionGroups.map((group) => (
                <section key={group.title} className="space-y-3 rounded-lg border p-4">
                  <h3 className="font-medium">{group.title}</h3>
                  <div className="space-y-3">
                    {group.sections.map((section) => (
                      <div key={section.title} className="space-y-2 rounded-md border p-3">
                        <div className="flex items-center justify-between gap-3">
                          <div className="font-medium">{section.title}</div>
                          {section.updatedAt ? (
                            <div className="text-muted-foreground text-xs">
                              {formatTimeAgo(section.updatedAt)}
                            </div>
                          ) : null}
                        </div>
                        {section.summary.trim() ? (
                          <Streamdown {...streamdownPlugins}>{section.summary}</Streamdown>
                        ) : (
                          <div className="text-muted-foreground text-sm">
                            {t.settings.memory.markdown.empty}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              ))}
              {visibleSectionGroups.length === 0 && !showFacts && (
                <div className="text-muted-foreground text-sm">
                  {t.settings.memory.noMatches}
                </div>
              )}
            </div>
          )}

          {showFacts && (
            <section className="space-y-3 rounded-lg border p-4">
              <h3 className="font-medium">{t.settings.memory.filterFacts}</h3>
              {visibleFacts.length === 0 ? (
                <div className="text-muted-foreground text-sm">
                  {normalizedQuery ? t.settings.memory.noMatches : t.settings.memory.noFacts}
                </div>
              ) : (
                <div className="space-y-3">
                  {visibleFacts.map((fact: MemoryFact) => (
                    <div key={fact.id} className="space-y-2 rounded-md border p-3">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="rounded-full border px-2 py-0.5">{fact.category}</span>
                        <span className="text-muted-foreground">
                          {formatTimeAgo(fact.createdAt)}
                        </span>
                        <span className="text-muted-foreground">
                          {Math.round(fact.confidence * 100)}%
                        </span>
                      </div>
                      <div className="text-sm leading-6">{fact.content}</div>
                      <div className="text-muted-foreground text-xs">
                        {sourceLooksLikeThreadId(fact.source) ? (
                          <Link href={pathOfThread(fact.source)} className="underline underline-offset-4">
                            {fact.source}
                          </Link>
                        ) : (
                          fact.source
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {showSummaries &&
          showFacts &&
          visibleSectionGroups.length === 0 &&
          visibleFacts.length === 0 ? (
            <div className="text-muted-foreground text-sm">
              {normalizedQuery
                ? t.settings.memory.noMatches
                : isMemorySummaryEmpty(memory)
                  ? t.settings.memory.memoryFullyEmpty
                  : t.settings.memory.empty}
            </div>
          ) : null}
        </div>
      )}
    </SettingsSection>
  );
}
