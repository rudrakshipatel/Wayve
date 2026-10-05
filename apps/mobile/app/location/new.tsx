import { router } from "expo-router";
import { MapPin, Share2, X } from "lucide-react-native";
import { useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { LngLat, Place } from "@wave/types";
import { MapTopBar } from "@/components/Chrome";
import { PlaceSearch } from "@/components/PlaceSearch";
import { WaveMap } from "@/components/map/WaveMap";
import { Button, Card, Chip, Panel, Text } from "@/components/ui";
import { useDeviceCenter } from "@/hooks/useDeviceCenter";
import { track } from "@/lib/analytics";
import { getPlacesClient } from "@/lib/places";
import { getApi } from "@/lib/supabase";
import { useWaveColors } from "@/lib/theme";
import { useLibrary } from "@/stores/library";

/** Create a static simulated location: search or drop a pin, then save and/or share it. */
export default function NewStaticLocation() {
  const colors = useWaveColors();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const deviceCenter = useDeviceCenter();
  const { locations, folders, refresh, saveLocation } = useLibrary();
  const [place, setPlace] = useState<Place | null>(null);
  const [name, setName] = useState("");
  const [folderId, setFolderId] = useState<string | null>(null);
  const [busy, setBusy] = useState<"save" | "share" | null>(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const panelHeight = Math.round(height * (place ? 0.55 : 0.5));

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const choose = (p: Place) => {
    setPlace(p);
    setName(p.name);
    setSaved(false);
  };

  const drop = async (point: LngLat) => {
    let p: Place = { name: "Dropped pin", latitude: point[1], longitude: point[0] };
    try {
      const found = await getPlacesClient()?.reverseGeocode(point);
      if (found)
        p = { ...p, name: found.name, ...(found.address ? { address: found.address } : {}) };
    } catch {
      // Keep the generic name.
    }
    choose(p);
  };

  const save = async () => {
    if (!place) return;
    setBusy("save");
    setError(null);
    try {
      await saveLocation({
        name: name.trim() || place.name,
        latitude: place.latitude,
        longitude: place.longitude,
        address: place.address ?? null,
        folderId,
      });
      track("location_saved");
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save");
    } finally {
      setBusy(null);
    }
  };

  const share = async () => {
    if (!place) return;
    setBusy("share");
    setError(null);
    try {
      const api = getApi();
      const plan = await api.planJourney({
        kind: "static",
        title: name.trim() || place.name,
        location: { ...place, name: name.trim() || place.name },
      });
      await api.control(plan.journeyId, { type: "start" });
      router.replace({
        pathname: "/journey/[id]",
        params: { id: plan.journeyId, justStarted: "1" },
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't share this location");
    } finally {
      setBusy(null);
    }
  };

  const pin: LngLat | null = place ? [place.longitude, place.latitude] : null;

  return (
    <View className="flex-1 bg-bg">
      <WaveMap
        center={pin ?? deviceCenter}
        pin={pin}
        onPress={(p) => void drop(p)}
        insets={{ top: insets.top + 56, bottom: panelHeight }}
      />
      <MapTopBar
        left={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close"
            onPress={() => {
              router.back();
            }}
            className="h-11 w-11 items-center justify-center rounded-full border border-line bg-surface"
          >
            <X size={20} color={colors.text} />
          </Pressable>
        }
      />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="absolute inset-x-0 bottom-0"
        style={{ height: panelHeight }}
      >
        <Panel className="h-full">
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
          >
            <Text variant="title">Static location</Text>
            <Text variant="caption" className="mt-1">
              Search, or tap the map to drop a pin.
            </Text>
            {!place ? (
              <View className="mt-4">
                <PlaceSearch
                  placeholder="Search an address or place"
                  saved={locations}
                  proximity={deviceCenter}
                  onSelect={choose}
                  autoFocus={false}
                />
              </View>
            ) : (
              <View className="mt-4 gap-4">
                <Card className="flex-row items-center gap-3 bg-sunken">
                  <MapPin size={18} color={colors.primary} />
                  <View className="flex-1">
                    <Text variant="label">{place.address ?? place.name}</Text>
                    <Text variant="caption">
                      {place.latitude.toFixed(5)}, {place.longitude.toFixed(5)}
                    </Text>
                  </View>
                  <Button
                    size="sm"
                    variant="ghost"
                    label="Change"
                    onPress={() => {
                      setPlace(null);
                    }}
                  />
                </Card>
                <View>
                  <Text variant="overline" className="mb-2">
                    Name
                  </Text>
                  <TextInput
                    value={name}
                    onChangeText={setName}
                    maxLength={120}
                    accessibilityLabel="Location name"
                    className="h-12 rounded-full bg-sunken px-4 font-sans text-[16px] text-ink"
                  />
                </View>
                <View>
                  <Text variant="overline" className="mb-2">
                    Folder
                  </Text>
                  <View className="flex-row flex-wrap gap-2">
                    {folders.map((f) => (
                      <Chip
                        key={f.id}
                        label={f.name}
                        selected={folderId === f.id}
                        onPress={() => {
                          setFolderId(folderId === f.id ? null : f.id);
                        }}
                      />
                    ))}
                  </View>
                </View>
                {error ? (
                  <Text variant="caption" className="text-coral">
                    {error}
                  </Text>
                ) : null}
                <View className="flex-row gap-3">
                  <Button
                    className="flex-1"
                    variant="secondary"
                    label={saved ? "Saved" : "Save"}
                    disabled={saved}
                    loading={busy === "save"}
                    onPress={() => void save()}
                  />
                  <Button
                    className="flex-1"
                    variant="brand"
                    label="Share"
                    icon={<Share2 size={18} color="#fff" />}
                    loading={busy === "share"}
                    onPress={() => void share()}
                  />
                </View>
              </View>
            )}
          </ScrollView>
        </Panel>
      </KeyboardAvoidingView>
    </View>
  );
}
