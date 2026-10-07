import * as Clipboard from "expo-clipboard";
import { router, useLocalSearchParams } from "expo-router";
import {
  Check,
  Copy,
  Link2Off,
  Mail,
  MessageCircle,
  MessageSquare,
  Send,
  Share2,
  X,
} from "lucide-react-native";
import { useCallback, useEffect, useState } from "react";
import { Linking, Platform, Pressable, ScrollView, Share, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { buildShareUrl, type CreateShareLinkResult, type ShareLinkInfo } from "@wave/types";
import { Button, Card, Chip, Text } from "@/components/ui";
import { track } from "@/lib/analytics";
import { env, isBackendConfigured } from "@/lib/env";
import { formatDay, formatTime } from "@/lib/format";
import {
  SHARE_TTL_OPTIONS,
  shareMessage,
  shareTargetUrl,
  type ShareTarget,
} from "@/lib/share-targets";
import { getApi } from "@/lib/supabase";
import { useWaveColors } from "@/lib/theme";

const TARGETS: { target: ShareTarget; label: string; Icon: typeof Send }[] = [
  { target: "whatsapp", label: "WhatsApp", Icon: MessageCircle },
  { target: "sms", label: "Messages", Icon: MessageSquare },
  { target: "telegram", label: "Telegram", Icon: Send },
  { target: "email", label: "Email", Icon: Mail },
];

export default function ShareJourney() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useWaveColors();
  const insets = useSafeAreaInsets();
  const [title, setTitle] = useState("");
  const [ttl, setTtl] = useState<number>(24);
  const [link, setLink] = useState<CreateShareLinkResult | null>(null);
  const [links, setLinks] = useState<ShareLinkInfo[]>([]);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const api = getApi();
    const [detail, list] = await Promise.all([api.getJourney(id), api.listShareLinks(id)]);
    setTitle(detail.journey.title);
    setLinks(list);
  }, [id]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const created = await getApi().createShareLink(id, ttl);
      // Links open on the web viewer this app is configured with (e.g. the Vercel URL).
      setLink(
        env.shareBaseUrl
          ? { ...created, url: buildShareUrl(env.shareBaseUrl, created.token) }
          : created,
      );
      track("share_link_created", { ttlHours: ttl });
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't create a link");
    } finally {
      setBusy(false);
    }
  };

  const open = async (target: ShareTarget) => {
    if (!link) return;
    track("share_target_opened", { target });
    const os = Platform.OS === "android" ? "android" : Platform.OS === "web" ? "web" : "ios";
    try {
      await Linking.openURL(shareTargetUrl(target, link.url, title, os));
    } catch {
      setError("That app isn't available on this device");
    }
  };

  const revoke = async (linkId: string) => {
    await getApi().revokeShareLink(linkId);
    if (link?.id === linkId) setLink(null);
    await reload();
  };

  const live = links.filter((l) => !l.revokedAt && Date.parse(l.expiresAt) > Date.now());

  return (
    <View
      className="flex-1 bg-bg"
      style={{ paddingTop: Platform.OS === "android" ? insets.top : 12 }}
    >
      <View className="flex-row items-center justify-between px-5 pb-2">
        <Text variant="title">Share live link</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          onPress={() => {
            router.back();
          }}
          className="h-10 w-10 items-center justify-center rounded-full bg-sunken"
        >
          <X size={18} color={colors.text} />
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 32 }}>
        <Text variant="caption">
          Anyone with the link can watch “{title}” move on a live map in their browser — no app or
          account. They can't control it, and you can turn the link off at any time.
        </Text>

        {!link ? (
          <>
            <Text variant="overline" className="mt-6 mb-2">
              Link expires after
            </Text>
            <View className="flex-row flex-wrap gap-2">
              {SHARE_TTL_OPTIONS.map((o) => (
                <Chip
                  key={o.hours}
                  label={o.label}
                  selected={ttl === o.hours}
                  onPress={() => {
                    setTtl(o.hours);
                  }}
                />
              ))}
            </View>
            <Button
              className="mt-6"
              size="lg"
              variant="brand"
              label="Create secure link"
              loading={busy}
              onPress={() => void create()}
            />
          </>
        ) : (
          <>
            <Card className="mt-6 bg-sunken">
              <Text variant="overline">Your link</Text>
              <Text variant="stat" className="mt-1 text-[14px]" numberOfLines={2} selectable>
                {link.url}
              </Text>
              <Text variant="caption" className="mt-2">
                Expires {formatDay(link.expiresAt)} at {formatTime(Date.parse(link.expiresAt))}
              </Text>
            </Card>
            <View className="mt-3 flex-row gap-3">
              <Button
                className="flex-1"
                variant="secondary"
                label={copied ? "Copied" : "Copy link"}
                icon={
                  copied ? (
                    <Check size={18} color={colors.success} />
                  ) : (
                    <Copy size={18} color={colors.text} />
                  )
                }
                onPress={() => {
                  void Clipboard.setStringAsync(link.url).then(() => {
                    setCopied(true);
                    setTimeout(() => {
                      setCopied(false);
                    }, 1800);
                  });
                }}
              />
              <Button
                className="flex-1"
                label="Share…"
                icon={<Share2 size={18} color={colors.background} />}
                onPress={() => {
                  void Share.share({ message: shareMessage(link.url, title), url: link.url });
                }}
              />
            </View>
            <View className="mt-3 flex-row flex-wrap gap-2">
              {TARGETS.map(({ target, label, Icon }) => (
                <Chip
                  key={target}
                  label={label}
                  icon={<Icon size={16} color={colors.text} />}
                  onPress={() => void open(target)}
                />
              ))}
            </View>
            {!isBackendConfigured() && (
              <Text variant="caption" className="mt-3">
                Preview mode: connect Wave to its backend so recipients can open this link.
              </Text>
            )}
          </>
        )}

        {error ? (
          <Text variant="caption" className="mt-3 text-coral">
            {error}
          </Text>
        ) : null}

        {live.length > 0 && (
          <>
            <Text variant="overline" className="mt-8 mb-2">
              Active links
            </Text>
            {live.map((l) => (
              <Card key={l.id} className="mb-2 flex-row items-center justify-between">
                <View>
                  <Text variant="label">…/{l.tokenPrefix}••••</Text>
                  <Text variant="caption">
                    {l.viewCount} {l.viewCount === 1 ? "view" : "views"} · expires{" "}
                    {formatTime(Date.parse(l.expiresAt))}
                  </Text>
                </View>
                <Button
                  size="sm"
                  variant="danger"
                  label="Turn off"
                  icon={<Link2Off size={14} color={colors.danger} />}
                  onPress={() => void revoke(l.id)}
                />
              </Card>
            ))}
          </>
        )}
      </ScrollView>
    </View>
  );
}
