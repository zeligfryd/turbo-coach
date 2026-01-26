"use client";

import React, { useEffect, useState } from "react";
import { Search, Filter } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { WorkoutProtocol } from "@/lib/workouts/protocols";
import {
  fetchAllProtocols,
  fetchProtocolsGroupedByCategory,
  searchProtocols,
  getIntensityLabel,
  formatDuration,
  calculateProtocolDuration,
  getParameterDefaults,
  type ProtocolFilters,
} from "@/lib/workouts/protocols";
import { CATEGORY_LABELS, WORKOUT_CATEGORIES } from "@/lib/workouts/types";

interface ProtocolLibraryBrowserProps {
  onSelectProtocol: (protocol: WorkoutProtocol) => void;
  onClose: () => void;
  initialCategory?: string;
  onCategoryChange?: (category: string) => void;
}

type ViewMode = "category" | "all";

export function ProtocolLibraryBrowser({
  onSelectProtocol,
  onClose,
  initialCategory,
  onCategoryChange,
}: ProtocolLibraryBrowserProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("category");
  const [selectedCategory, setSelectedCategory] = useState<string>(initialCategory || "");
  const [protocolsByCategory, setProtocolsByCategory] = useState<
    Record<string, WorkoutProtocol[]>
  >({});
  const [allProtocols, setAllProtocols] = useState<WorkoutProtocol[]>([]);
  const [filteredProtocols, setFilteredProtocols] = useState<WorkoutProtocol[]>([]);

  // Search and filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [intensityFilter, setIntensityFilter] = useState<string>("");
  const [loading, setLoading] = useState(true);

  // Load protocols
  useEffect(() => {
    async function loadProtocols() {
      setLoading(true);
      if (viewMode === "category") {
        const grouped = await fetchProtocolsGroupedByCategory();
        setProtocolsByCategory(grouped);

        // Set default selected category to first category with protocols
        if (!selectedCategory) {
          const firstCategoryWithProtocols = WORKOUT_CATEGORIES.find(
            (cat) => grouped[cat]?.length > 0
          );
          if (firstCategoryWithProtocols) {
            setSelectedCategory(firstCategoryWithProtocols);
          }
        }
      } else {
        const all = await fetchAllProtocols();
        setAllProtocols(all);
        setFilteredProtocols(all);
      }
      setLoading(false);
    }
    loadProtocols();
  }, [viewMode, selectedCategory]);

  // Apply search and filters
  useEffect(() => {
    if (viewMode !== "all") return;

    async function applyFilters() {
      const filters: ProtocolFilters = {};

      if (intensityFilter) {
        const [min, max] = intensityFilter.split("-").map(Number);
        filters.minIntensity = min;
        filters.maxIntensity = max;
      }

      const results = await searchProtocols(searchQuery, filters);
      setFilteredProtocols(results);
    }

    const debounce = setTimeout(applyFilters, 300);
    return () => clearTimeout(debounce);
  }, [searchQuery, intensityFilter, viewMode]);

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-background border rounded-lg shadow-lg w-full max-w-6xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="p-6 border-b">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold">Workout Templates</h2>
            <Button variant="ghost" onClick={onClose}>
              Close
            </Button>
          </div>

          {/* View mode toggle */}
          <div className="flex gap-2 mb-4">
            <Button
              variant={viewMode === "category" ? "default" : "outline"}
              onClick={() => setViewMode("category")}
            >
              By Category
            </Button>
            <Button
              variant={viewMode === "all" ? "default" : "outline"}
              onClick={() => setViewMode("all")}
            >
              All Templates
            </Button>
          </div>

          {/* Search and filters (for "all" view) */}
          {viewMode === "all" && (
            <div className="space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search templates..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowFilters(!showFilters)}
                >
                  <Filter className="h-4 w-4 mr-2" />
                  Filters
                </Button>
                {intensityFilter && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setIntensityFilter("");
                    }}
                  >
                    Clear filters
                  </Button>
                )}
              </div>

              {showFilters && (
                <div className="flex gap-3 flex-wrap">
                  <Select value={intensityFilter} onValueChange={setIntensityFilter}>
                    <SelectTrigger className="w-[180px]">
                      <SelectValue placeholder="Intensity" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1-4">Easy</SelectItem>
                      <SelectItem value="5-6">Moderate</SelectItem>
                      <SelectItem value="7-8">Hard</SelectItem>
                      <SelectItem value="9-10">Very Hard</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <p className="text-muted-foreground">Loading templates...</p>
            </div>
          ) : viewMode === "category" ? (
            <CategoryView
              protocolsByCategory={protocolsByCategory}
              selectedCategory={selectedCategory}
              onCategoryChange={(cat) => {
                setSelectedCategory(cat);
                if (onCategoryChange) onCategoryChange(cat);
              }}
              onSelectProtocol={onSelectProtocol}
            />
          ) : (
            <AllTemplatesView
              protocols={filteredProtocols}
              onSelectProtocol={onSelectProtocol}
            />
          )}
        </div>
      </div>
    </div>
  );
}

interface CategoryViewProps {
  protocolsByCategory: Record<string, WorkoutProtocol[]>;
  selectedCategory: string;
  onCategoryChange: (category: string) => void;
  onSelectProtocol: (protocol: WorkoutProtocol) => void;
}

function CategoryView({
  protocolsByCategory,
  selectedCategory,
  onCategoryChange,
  onSelectProtocol,
}: CategoryViewProps) {
  const categories = WORKOUT_CATEGORIES.filter(
    (cat) => protocolsByCategory[cat]?.length > 0
  );

  const handleCategoryChange = (category: string) => {
    onCategoryChange(category);
  };

  return (
    <div className="space-y-6">
      {/* Category tabs */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        {categories.map((category) => (
          <Button
            key={category}
            variant={selectedCategory === category ? "default" : "outline"}
            onClick={() => handleCategoryChange(category)}
            className="whitespace-nowrap"
          >
            {CATEGORY_LABELS[category]}
            <Badge variant="secondary" className="ml-2">
              {protocolsByCategory[category]?.length || 0}
            </Badge>
          </Button>
        ))}
      </div>

      {/* Protocols grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {protocolsByCategory[selectedCategory]?.map((protocol) => (
          <ProtocolCard
            key={protocol.id}
            protocol={protocol}
            onSelect={onSelectProtocol}
          />
        ))}
      </div>

      {protocolsByCategory[selectedCategory]?.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          No templates found in this category.
        </div>
      )}
    </div>
  );
}

interface AllTemplatesViewProps {
  protocols: WorkoutProtocol[];
  onSelectProtocol: (protocol: WorkoutProtocol) => void;
}

function AllTemplatesView({ protocols, onSelectProtocol }: AllTemplatesViewProps) {
  if (protocols.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        No templates found matching your criteria.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {protocols.map((protocol) => (
        <ProtocolCard
          key={protocol.id}
          protocol={protocol}
          onSelect={onSelectProtocol}
        />
      ))}
    </div>
  );
}

interface ProtocolCardProps {
  protocol: WorkoutProtocol;
  onSelect: (protocol: WorkoutProtocol) => void;
}

function ProtocolCard({ protocol, onSelect }: ProtocolCardProps) {
  // Calculate duration on-the-fly using default parameters
  const durationSeconds = calculateProtocolDuration(
    protocol,
    getParameterDefaults(protocol)
  );
  const durationMinutes = Math.ceil(durationSeconds / 60);

  return (
    <button
      onClick={() => onSelect(protocol)}
      className="p-4 border rounded-lg hover:bg-muted/50 transition-colors text-left w-full"
    >
      <div className="space-y-2">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-semibold leading-tight">{protocol.name}</h3>
          {protocol.intensity_level && (
            <Badge variant="secondary" className="text-xs shrink-0">
              {getIntensityLabel(protocol.intensity_level)}
            </Badge>
          )}
        </div>

        <p className="text-sm text-muted-foreground line-clamp-2">
          {protocol.description}
        </p>

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Badge variant="outline">{CATEGORY_LABELS[protocol.category]}</Badge>
          <span>{formatDuration(durationMinutes)}</span>
        </div>

        {protocol.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {protocol.tags.slice(0, 3).map((tag) => (
              <Badge key={tag} variant="secondary" className="text-xs">
                {tag}
              </Badge>
            ))}
          </div>
        )}
      </div>
    </button>
  );
}
