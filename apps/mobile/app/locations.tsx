import { router, useFocusEffect } from "expo-router";
import { MapPin, Route, Trash2 } from "lucide-react-native";
import { useCallback, useState } from "react";
import { FlatList, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ScreenHeader } from "@/components/Chrome";
import { Button, Card, Chip, Text } from "@/components/ui";
import { useWaveColors } from "@/lib/theme";
import { useBuilder } from "@/stores/builder";
import { useLibrary } from "@/stores/library";

export default function Locations() {
  const colors = useWaveColors();
  const insets = useSafeAreaInsets();
  const { locations, folders, refresh, deleteLocation } = useLibrary();
  const [folder, setFolder] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  const list = folder ? locations.filter((l) => l.folderId === folder) : locations;

  return (
    <View className="flex-1 bg-bg">
      <ScreenHeader
        title="Saved locations"
        right={
          <Button
            size="sm"
            variant="secondary"
            label="New"
            icon={<MapPin size={14} color={colors.text} />}
            onPress={() => {
              router.push("/location/new");
            }}
          />
        }
      />
      <FlatList
        horizontal
        data={[{ id: null, name: "All" }, ...folders]}
        keyExtractor={(f) => f.id ?? "all"}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8, paddingHorizontal: 20, paddingBottom: 12 }}
        style={{ flexGrow: 0 }}
        renderItem={({ item }) => (
          <Chip
            label={item.name}
            selected={folder === item.id}
            onPress={() => {
              setFolder(item.id);
            }}
          />
        )}
      />
      <FlatList
        data={list}
        keyExtractor={(l) => l.id}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 24 }}
        ListEmptyComponent={
          <Text variant="caption" className="mt-8 text-center">
            No saved places{folder ? " in this folder" : ""} yet.
          </Text>
        }
        renderItem={({ item }) => (
          <Card className="mb-2.5 flex-row items-center gap-3">
            <View className="h-10 w-10 items-center justify-center rounded-2xl bg-surf/15">
              <MapPin size={18} color={colors.accent} />
            </View>
            <View className="flex-1">
              <Text variant="label" numberOfLines={1}>
                {item.name}
              </Text>
              <Text variant="caption" numberOfLines={1}>
                {item.address ?? `${item.latitude.toFixed(4)}, ${item.longitude.toFixed(4)}`}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Start a journey from ${item.name}`}
              onPress={() => {
                router.push("/journey/new");
                // The builder resets on mount; prefill on the next tick.
                setTimeout(() => {
                  const b = useBuilder.getState();
                  b.setStop(0, {
                    name: item.name,
                    latitude: item.latitude,
                    longitude: item.longitude,
                  });
                  b.next();
                }, 50);
              }}
              className="h-9 w-9 items-center justify-center rounded-full bg-sunken"
            >
              <Route size={16} color={colors.text} />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Delete ${item.name}`}
              onPress={() => void deleteLocation(item.id)}
              className="h-9 w-9 items-center justify-center rounded-full bg-sunken"
            >
              <Trash2 size={16} color={colors.danger} />
            </Pressable>
          </Card>
        )}
      />
    </View>
  );
}
