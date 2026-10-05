import { LocateFixed, MapPin, Search, Star } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, TextInput, View } from "react-native";
import type { PlaceResult } from "@wave/map-utils";
import type { LngLat, Place, SavedLocation } from "@wave/types";
import { getPlacesClient } from "@/lib/places";
import { useWaveColors } from "@/lib/theme";
import { Text } from "./ui";

/** A few well-known places so search works in preview mode without a Mapbox token. */
const OFFLINE_PLACES: Place[] = [
  { name: "Ahmedabad", latitude: 23.0225, longitude: 72.5714, address: "Gujarat, India" },
  { name: "Gandhinagar", latitude: 23.2156, longitude: 72.6369, address: "Gujarat, India" },
  {
    name: "Sabarmati Riverfront",
    latitude: 23.0396,
    longitude: 72.5797,
    address: "Ahmedabad, Gujarat",
  },
  {
    name: "Ahmedabad Airport",
    latitude: 23.0734,
    longitude: 72.6266,
    address: "Hansol, Ahmedabad",
  },
  { name: "IIM Ahmedabad", latitude: 23.0329, longitude: 72.5357, address: "Vastrapur, Ahmedabad" },
  { name: "Kankaria Lake", latitude: 23.0063, longitude: 72.6011, address: "Maninagar, Ahmedabad" },
  { name: "Thaltej", latitude: 23.0504, longitude: 72.5013, address: "Ahmedabad, Gujarat" },
];

export interface PlaceSearchProps {
  readonly placeholder: string;
  readonly saved: readonly SavedLocation[];
  readonly proximity?: LngLat;
  readonly onSelect: (place: Place) => void;
  readonly onPickOnMap?: () => void;
  readonly autoFocus?: boolean;
}

export function PlaceSearch({
  placeholder,
  saved,
  proximity,
  onSelect,
  onPickOnMap,
  autoFocus,
}: PlaceSearchProps) {
  const colors = useWaveColors();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<(PlaceResult | Place)[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    const mine = ++seq.current;
    const handle = setTimeout(() => {
      const client = getPlacesClient();
      if (!client) {
        const lower = q.toLowerCase();
        setResults(OFFLINE_PLACES.filter((p) => p.name.toLowerCase().includes(lower)));
        return;
      }
      setSearching(true);
      client
        .searchPlaces(q, proximity ? { proximity, limit: 6 } : { limit: 6 })
        .then((found) => {
          if (mine === seq.current) {
            setResults(found);
            setError(null);
          }
        })
        .catch(() => {
          if (mine === seq.current) setError("Search is unavailable right now");
        })
        .finally(() => {
          if (mine === seq.current) setSearching(false);
        });
    }, 250);
    return () => {
      clearTimeout(handle);
    };
  }, [query, proximity]);

  const savedMatches = saved
    .filter((s) => !query || s.name.toLowerCase().includes(query.trim().toLowerCase()))
    .slice(0, 6);

  return (
    <View>
      <View className="h-12 flex-row items-center gap-2 rounded-full bg-sunken px-4">
        <Search size={18} color={colors.textMuted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={placeholder}
          placeholderTextColor={colors.textMuted}
          autoFocus={autoFocus}
          autoCorrect={false}
          returnKeyType="search"
          accessibilityLabel={placeholder}
          className="flex-1 font-sans text-[16px] text-ink"
        />
        {searching && <ActivityIndicator size="small" />}
      </View>

      {onPickOnMap && (
        <Pressable
          accessibilityRole="button"
          onPress={onPickOnMap}
          className="mt-3 flex-row items-center gap-3 py-2"
        >
          <View className="h-9 w-9 items-center justify-center rounded-full bg-tide/10">
            <LocateFixed size={18} color={colors.primary} />
          </View>
          <Text variant="label">Pick on the map</Text>
        </Pressable>
      )}

      {error ? (
        <Text variant="caption" className="mt-3 text-coral">
          {error}
        </Text>
      ) : null}

      {results.map((r, i) => (
        <Row
          key={"id" in r ? r.id : `${r.name}-${i}`}
          icon={<MapPin size={18} color={colors.text} />}
          title={r.name}
          subtitle={r.address}
          onPress={() => {
            onSelect({
              name: r.name,
              latitude: r.latitude,
              longitude: r.longitude,
              ...(r.address ? { address: r.address } : {}),
            });
          }}
        />
      ))}

      {savedMatches.length > 0 && (
        <>
          <Text variant="overline" className="mt-4 mb-1">
            Saved
          </Text>
          {savedMatches.map((s) => (
            <Row
              key={s.id}
              icon={<Star size={18} color={colors.accent} />}
              title={s.name}
              subtitle={s.address ?? undefined}
              onPress={() => {
                onSelect({
                  name: s.name,
                  latitude: s.latitude,
                  longitude: s.longitude,
                  ...(s.address ? { address: s.address } : {}),
                });
              }}
            />
          ))}
        </>
      )}
    </View>
  );
}

function Row({
  icon,
  title,
  subtitle,
  onPress,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string | undefined;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      className="flex-row items-center gap-3 py-2.5 active:opacity-70"
    >
      <View className="h-9 w-9 items-center justify-center rounded-full bg-sunken">{icon}</View>
      <View className="flex-1">
        <Text variant="label" numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="caption" numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}
