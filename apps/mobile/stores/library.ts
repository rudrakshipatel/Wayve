import { create } from "zustand";
import type { JourneySummary, LocationFolder, SavedLocation } from "@wave/types";
import { getApi } from "@/lib/supabase";

type Journey = JourneySummary & { readonly kind: "journey" | "static" };

interface LibraryState {
  readonly journeys: readonly Journey[];
  readonly locations: readonly SavedLocation[];
  readonly folders: readonly LocationFolder[];
  readonly loading: boolean;
  readonly error: string | null;
  readonly refresh: () => Promise<void>;
  readonly renameJourney: (id: string, title: string) => Promise<void>;
  readonly deleteJourney: (id: string) => Promise<void>;
  readonly duplicateJourney: (id: string) => Promise<string>;
  readonly saveLocation: (
    input: Parameters<ReturnType<typeof getApi>["saveLocation"]>[0],
  ) => Promise<SavedLocation>;
  readonly deleteLocation: (id: string) => Promise<void>;
}

const message = (e: unknown): string => (e instanceof Error ? e.message : "Something went wrong");

export const useLibrary = create<LibraryState>((set, get) => ({
  journeys: [],
  locations: [],
  folders: [],
  loading: false,
  error: null,

  async refresh() {
    set({ loading: true, error: null });
    try {
      const api = getApi();
      const [journeys, locations, folders] = await Promise.all([
        api.listJourneys({ limit: 100 }),
        api.listLocations(),
        api.listFolders(),
      ]);
      set({ journeys, locations, folders, loading: false });
    } catch (e) {
      set({ loading: false, error: message(e) });
    }
  },

  async renameJourney(id, title) {
    const previous = get().journeys;
    set({ journeys: previous.map((j) => (j.id === id ? { ...j, title } : j)) });
    try {
      await getApi().renameJourney(id, title);
    } catch (e) {
      set({ journeys: previous, error: message(e) });
      throw e;
    }
  },

  async deleteJourney(id) {
    const previous = get().journeys;
    set({ journeys: previous.filter((j) => j.id !== id) });
    try {
      await getApi().deleteJourney(id);
    } catch (e) {
      set({ journeys: previous, error: message(e) });
      throw e;
    }
  },

  async duplicateJourney(id) {
    const copyId = await getApi().duplicateJourney(id);
    await get().refresh();
    return copyId;
  },

  async saveLocation(input) {
    const saved = await getApi().saveLocation(input);
    set({ locations: [saved, ...get().locations] });
    return saved;
  },

  async deleteLocation(id) {
    const previous = get().locations;
    set({ locations: previous.filter((l) => l.id !== id) });
    try {
      await getApi().deleteLocation(id);
    } catch (e) {
      set({ locations: previous, error: message(e) });
      throw e;
    }
  },
}));
