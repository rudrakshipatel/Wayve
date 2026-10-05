import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { FlatList, Modal, Pressable, RefreshControl, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ScreenHeader } from "@/components/Chrome";
import { JourneyRow } from "@/components/JourneyRow";
import { Button, Chip, Text } from "@/components/ui";
import { useWaveColors } from "@/lib/theme";
import { useLibrary } from "@/stores/library";

type Filter = "all" | "completed" | "scheduled" | "live";

export default function History() {
  const colors = useWaveColors();
  const insets = useSafeAreaInsets();
  const { journeys, refresh, loading, renameJourney, deleteJourney, duplicateJourney } =
    useLibrary();
  const [filter, setFilter] = useState<Filter>("all");
  const [selected, setSelected] = useState<(typeof journeys)[number] | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  const list = journeys.filter((j) =>
    filter === "all"
      ? true
      : filter === "live"
        ? j.status === "active" || j.status === "paused"
        : filter === "completed"
          ? j.status === "completed" || j.status === "cancelled"
          : j.status === "scheduled",
  );

  const close = () => {
    setSelected(null);
    setRenaming(false);
    setConfirmDelete(false);
  };

  return (
    <View className="flex-1 bg-bg">
      <ScreenHeader title="Journey history" subtitle={`${journeys.length} journeys`} />
      <View className="flex-row gap-2 px-5 pb-3">
        {(["all", "live", "scheduled", "completed"] as const).map((f) => (
          <Chip
            key={f}
            label={f[0]!.toUpperCase() + f.slice(1)}
            selected={filter === f}
            onPress={() => {
              setFilter(f);
            }}
          />
        ))}
      </View>
      <FlatList
        data={list}
        keyExtractor={(j) => j.id}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 24 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void refresh()} />}
        ListEmptyComponent={
          <Text variant="caption" className="mt-8 text-center">
            {loading ? "Loading…" : "No journeys here yet."}
          </Text>
        }
        renderItem={({ item }) => (
          <JourneyRow
            journey={item}
            onOptions={() => {
              setSelected(item);
              setName(item.title);
            }}
          />
        )}
      />

      <Modal visible={selected !== null} transparent animationType="fade" onRequestClose={close}>
        <Pressable className="flex-1 justify-end bg-black/40" onPress={close}>
          <Pressable
            className="rounded-t-panel bg-surface p-5"
            style={{ paddingBottom: insets.bottom + 20 }}
            onPress={() => undefined}
          >
            <Text variant="heading" numberOfLines={1}>
              {selected?.title}
            </Text>
            {renaming ? (
              <View className="mt-4 gap-3">
                <TextInput
                  value={name}
                  onChangeText={setName}
                  autoFocus
                  maxLength={120}
                  accessibilityLabel="Journey name"
                  placeholderTextColor={colors.textMuted}
                  className="h-12 rounded-full bg-sunken px-4 font-sans text-[16px] text-ink"
                />
                <Button
                  label="Save name"
                  disabled={name.trim().length === 0}
                  onPress={() => {
                    if (selected) void renameJourney(selected.id, name.trim()).finally(close);
                  }}
                />
              </View>
            ) : confirmDelete ? (
              <View className="mt-4 gap-3">
                <Text variant="caption">
                  This deletes the journey and turns off all of its share links.
                </Text>
                <Button
                  variant="danger"
                  label="Delete journey"
                  onPress={() => {
                    if (selected) void deleteJourney(selected.id).finally(close);
                  }}
                />
                <Button variant="ghost" label="Cancel" onPress={close} />
              </View>
            ) : (
              <View className="mt-4 gap-2">
                <Button
                  variant="secondary"
                  label="View"
                  onPress={() => {
                    if (selected)
                      router.push({ pathname: "/journey/[id]", params: { id: selected.id } });
                    close();
                  }}
                />
                {selected?.kind !== "static" && (
                  <Button
                    variant="secondary"
                    label="Replay"
                    onPress={() => {
                      if (selected)
                        router.push({
                          pathname: "/journey/[id]/replay",
                          params: { id: selected.id },
                        });
                      close();
                    }}
                  />
                )}
                <Button
                  variant="secondary"
                  label="Duplicate"
                  onPress={() => {
                    if (selected) {
                      void duplicateJourney(selected.id).then((copyId) => {
                        close();
                        router.push({ pathname: "/journey/[id]", params: { id: copyId } });
                      });
                    }
                  }}
                />
                <Button
                  variant="secondary"
                  label="Rename"
                  onPress={() => {
                    setRenaming(true);
                  }}
                />
                <Button
                  variant="danger"
                  label="Delete"
                  onPress={() => {
                    setConfirmDelete(true);
                  }}
                />
              </View>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
