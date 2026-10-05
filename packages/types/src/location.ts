export const LOCATION_FOLDER_KINDS = [
  "home",
  "work",
  "college",
  "favorites",
  "travel",
  "custom",
] as const;
export type LocationFolderKind = (typeof LOCATION_FOLDER_KINDS)[number];

export interface LocationFolder {
  readonly id: string;
  readonly name: string;
  readonly kind: LocationFolderKind;
  readonly sortOrder: number;
}

export interface SavedLocation {
  readonly id: string;
  readonly folderId: string | null;
  readonly name: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly address: string | null;
  readonly createdAt: string;
}
