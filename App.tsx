import "./global.css";
import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  Modal,
  Linking,
  AppState,
  StatusBar,
  type AppStateStatus,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import {
  Calendar,
  History as HistoryIcon,
  Settings,
  Check,
  ChevronLeft,
  ChevronRight,
  CirclePlay,
  Trash2,
} from "lucide-react-native";
import { useFonts } from "expo-font";
import * as SplashScreen from "expo-splash-screen";

import {
  WORKOUTS,
  BY_ID,
  BY_CATEGORY,
  CATEGORY_LABELS,
  CATEGORY_ICONS,
  DAYS,
  DAYS_LONG,
  SCHEDULE,
  getCurrentDay,
  getCurrentMondayISO,
  flipWeek,
  safeUid,
  daysAgo,
  previewLine,
  collectKeys,
} from "./src/workouts";
import { loadStorage, saveStorage, resetAllStorage } from "./src/storage";
import { ErrorBoundary } from "./src/ErrorBoundary";

SplashScreen.preventAutoHideAsync().catch(() => {});

// ============================================================
// TYPES
// ============================================================

type TabId = "today" | "history" | "setup";
type Week = "A" | "B";

type HistoryEntry = {
  id: string;
  workoutId: string;
  name: string;
  category: string;
  completedAt: number;
  doneCount: number;
  totalCount: number;
  done?: Record<string, number>;
};

type ActiveState = {
  done: Record<string, number>;
  confirm: { kind: "cancel" } | null;
};

type PickPayload =
  | { kind: "workout"; workoutId: string }
  | { kind: "outdoor"; title: string; day: number; week: Week };

// ============================================================
// HEADER
// ============================================================

function Header({
  tab,
  setTab,
  week,
  day,
  hideTabs = false,
}: {
  tab: TabId | "";
  setTab: (t: TabId) => void;
  week: Week;
  day: number;
  hideTabs?: boolean;
}) {
  return (
    <View className="bg-zinc-950 border-b border-zinc-800">
      <View className="px-4 py-3 flex-row items-center justify-between">
        <View>
          <Text className="text-[10px] tracking-[2.5px] text-amber-500 font-mono uppercase">
            Workout System
          </Text>
          <Text className="text-2xl text-white font-archivo">IFFF</Text>
        </View>
        <View className="items-end">
          <Text className="text-[10px] tracking-widest text-zinc-500 font-mono uppercase">
            Week {week}
          </Text>
          <Text className="text-sm font-bold text-zinc-300">{DAYS[day]}</Text>
        </View>
      </View>
      {!hideTabs && (
        <View className="flex-row border-t border-zinc-900">
          {(
            [
              { id: "today", label: "Today", Icon: Calendar },
              { id: "history", label: "History", Icon: HistoryIcon },
              { id: "setup", label: "Setup", Icon: Settings },
            ] as const
          ).map(({ id, label, Icon }) => {
            const active = tab === id;
            return (
              <Pressable
                key={id}
                onPress={() => setTab(id)}
                className={`flex-1 py-3 items-center ${active ? "bg-amber-500" : ""}`}
              >
                <Icon size={16} strokeWidth={2.5} color={active ? "#000" : "#71717a"} />
                <Text
                  className={`text-[10px] font-bold tracking-wider uppercase mt-0.5 ${active ? "text-black" : "text-zinc-500"}`}
                >
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

// ============================================================
// CONFIRM MODAL
// ============================================================

function ConfirmModal({
  open,
  message,
  confirmLabel = "Confirm",
  danger = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal
      transparent
      visible={open}
      animationType="fade"
      onRequestClose={onCancel}
    >
      <Pressable
        onPress={onCancel}
        className="flex-1 bg-black/80 items-center justify-center p-4"
      >
        <Pressable
          onPress={(e) => e.stopPropagation()}
          className="bg-zinc-950 border border-zinc-800 rounded-lg p-5 max-w-sm w-full"
        >
          <Text className="text-white text-sm">{message}</Text>
          <View className="flex-row gap-2 mt-4">
            <Pressable
              onPress={onCancel}
              className="flex-1 bg-zinc-900 border border-zinc-800 py-2.5 rounded-md items-center"
            >
              <Text className="text-zinc-300 text-xs font-bold uppercase tracking-wider">
                Cancel
              </Text>
            </Pressable>
            <Pressable
              onPress={onConfirm}
              className={`flex-1 py-2.5 rounded-md items-center ${danger ? "bg-red-500" : "bg-amber-500"}`}
            >
              <Text
                className={`text-xs font-bold uppercase tracking-wider ${danger ? "text-white" : "text-black"}`}
              >
                {confirmLabel}
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ============================================================
// VIDEO LINK
// ============================================================

function VideoLink({ url }: { url?: string | null }) {
  const open = useCallback(() => {
    if (url) Linking.openURL(url).catch(() => {});
  }, [url]);
  if (!url) return null;
  return (
    <Pressable onPress={open} className="flex-row items-center mt-1">
      <CirclePlay size={12} strokeWidth={2.5} color="#f59e0b" />
      <Text className="text-amber-500 text-[11px] ml-1">Demo</Text>
    </Pressable>
  );
}

// ============================================================
// EXERCISE ROW
// ============================================================

function ExerciseRow({
  exercise,
  video,
  sub,
  meta,
  done,
  onToggle,
}: {
  exercise: string;
  video?: string | null;
  sub?: string | null;
  meta?: string | null;
  done: boolean;
  onToggle: () => void;
}) {
  return (
    <Pressable
      onPress={onToggle}
      className={`rounded-md p-3 border ${done ? "bg-emerald-950/40 border-emerald-700" : "bg-zinc-900 border-zinc-800"}`}
    >
      <View className="flex-row items-start">
        <View
          className={`w-6 h-6 rounded border-2 items-center justify-center mt-0.5 mr-3 ${done ? "bg-emerald-500 border-emerald-500" : "border-zinc-600"}`}
        >
          {done ? <Check size={14} color="#000" strokeWidth={3} /> : null}
        </View>
        <View className="flex-1">
          {sub ? (
            <Text className="text-[9px] font-mono tracking-widest text-zinc-500 uppercase">
              {sub}
            </Text>
          ) : null}
          <Text
            className={`text-sm font-bold ${done ? "text-zinc-400 line-through" : "text-white"}`}
          >
            {exercise}
          </Text>
          {meta ? (
            <Text className="text-[11px] font-mono text-amber-500 mt-0.5">{meta}</Text>
          ) : null}
          <VideoLink url={video} />
        </View>
      </View>
    </Pressable>
  );
}

// ============================================================
// WORKOUT TYPE VIEWS
// ============================================================

function SplitView({
  w,
  isDone,
  toggle,
}: {
  w: any;
  isDone: (k: string) => boolean;
  toggle: (k: string) => void;
}) {
  return (
    <View className="gap-2">
      {w.groups.map((g: any, i: number) => {
        const meta = `${g.sets} SETS${g.reps ? " · " + g.reps : ""}${g.mode ? " · " + g.mode : ""}`;
        return (
          <ExerciseRow
            key={i}
            sub={g.label}
            exercise={g.exercise}
            video={g.video}
            meta={meta}
            done={isDone(`g${i}`)}
            onToggle={() => toggle(`g${i}`)}
          />
        );
      })}
    </View>
  );
}

function PatternBlock({
  title,
  rows,
  prefix,
  isDone,
  toggle,
}: {
  title: string;
  rows: any[];
  prefix: string;
  isDone: (k: string) => boolean;
  toggle: (k: string) => void;
}) {
  if (!rows.length) return null;
  return (
    <View>
      <Text className="text-[10px] tracking-[2.5px] text-zinc-500 font-mono uppercase mb-2">
        {title}
      </Text>
      <View className="gap-2">
        {rows.map((r, i) => (
          <ExerciseRow
            key={i}
            sub={`${r.track}${r.reps ? " · " + r.reps : ""}`}
            exercise={r.exercise}
            video={r.video}
            meta={r.movement}
            done={isDone(`${prefix}_${i}`)}
            onToggle={() => toggle(`${prefix}_${i}`)}
          />
        ))}
      </View>
    </View>
  );
}

function TotalBodyView({
  w,
  isDone,
  toggle,
}: {
  w: any;
  isDone: (k: string) => boolean;
  toggle: (k: string) => void;
}) {
  return (
    <View className="gap-4">
      <PatternBlock
        title="Pattern 1 · Repeat 5–8 Rounds"
        rows={w.pattern1}
        prefix="p1"
        isDone={isDone}
        toggle={toggle}
      />
      <PatternBlock
        title="Pattern 2 · Repeat 3–5 Rounds"
        rows={w.pattern2}
        prefix="p2"
        isDone={isDone}
        toggle={toggle}
      />
      <PatternBlock
        title="Pattern 3 · Isolation · Repeat 1–3 Rounds"
        rows={w.pattern3}
        prefix="p3"
        isDone={isDone}
        toggle={toggle}
      />
    </View>
  );
}

function Cardio12View({
  w,
  isDone,
  toggle,
}: {
  w: any;
  isDone: (k: string) => boolean;
  toggle: (k: string) => void;
}) {
  return (
    <View className="gap-2">
      <View className="bg-zinc-900 border border-zinc-800 rounded-md p-3">
        <Text className="text-[10px] tracking-widest text-amber-500 font-mono uppercase">
          30 on / 10 off · 12 exercises straight through
        </Text>
        <Text className="text-xs text-zinc-400 mt-1">
          Repeat 3–6 rounds. Rest 2–3 min between.
        </Text>
      </View>
      {w.exercises.map((e: any, i: number) => (
        <ExerciseRow
          key={i}
          sub={`${(i + 1).toString().padStart(2, "0")} · ${e.movement || ""}`}
          exercise={e.exercise}
          video={e.video}
          done={isDone(`x_${i}`)}
          onToggle={() => toggle(`x_${i}`)}
        />
      ))}
    </View>
  );
}

function Cardio4GView({
  w,
  isDone,
  toggle,
}: {
  w: any;
  isDone: (k: string) => boolean;
  toggle: (k: string) => void;
}) {
  return (
    <View className="gap-4">
      <View className="bg-zinc-900 border border-zinc-800 rounded-md p-3">
        <Text className="text-[10px] tracking-widest text-amber-500 font-mono uppercase">
          30 on / 10 off · 4 groups · 4 exercises each
        </Text>
        <Text className="text-xs text-zinc-400 mt-1">
          Pick a round option (e.g. A×4, then B×4, etc).
        </Text>
      </View>
      {(["A", "B", "C", "D"] as const).map((letter) => (
        <View key={letter}>
          <Text className="text-[10px] tracking-[2.5px] text-zinc-500 font-mono uppercase mb-2">
            Group {letter}
          </Text>
          <View className="gap-2">
            {w.groups[letter].map((it: any, i: number) => (
              <ExerciseRow
                key={i}
                sub={`${i + 1} · ${it.equipment || ""}`}
                exercise={it.exercise}
                video={it.video}
                done={isDone(`G${letter}_${i}`)}
                onToggle={() => toggle(`G${letter}_${i}`)}
              />
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

function ExtrasView({
  w,
  isDone,
  toggle,
}: {
  w: any;
  isDone: (k: string) => boolean;
  toggle: (k: string) => void;
}) {
  if (w.abs.length === 0 && w.finisher.length === 0 && w.steady.length === 0)
    return null;
  return (
    <View className="gap-4">
      {w.abs.length > 0 && (
        <View>
          <Text className="text-[10px] tracking-[2.5px] text-zinc-500 font-mono uppercase mb-2">
            Abs · Optional · 3 sets
          </Text>
          <View className="gap-2">
            {w.abs.map((a: any, i: number) => (
              <ExerciseRow
                key={i}
                exercise={a.exercise}
                video={a.video}
                meta={a.reps}
                done={isDone(`A_${i}`)}
                onToggle={() => toggle(`A_${i}`)}
              />
            ))}
          </View>
        </View>
      )}
      {w.finisher.length > 0 && (
        <View>
          <Text className="text-[10px] tracking-[2.5px] text-zinc-500 font-mono uppercase mb-2">
            Cardio Finisher · Optional
          </Text>
          <View className="gap-2">
            {w.finisher.map((a: any, i: number) => (
              <ExerciseRow
                key={i}
                exercise={a.exercise}
                video={a.video}
                done={isDone(`F_${i}`)}
                onToggle={() => toggle(`F_${i}`)}
              />
            ))}
          </View>
        </View>
      )}
      {w.steady.length > 0 && (
        <View>
          <Text className="text-[10px] tracking-[2.5px] text-zinc-500 font-mono uppercase mb-2">
            Steady State · Optional
          </Text>
          <View className="gap-2">
            {w.steady.map((a: any, i: number) => (
              <ExerciseRow
                key={i}
                exercise={a.exercise}
                video={a.video}
                done={isDone(`S_${i}`)}
                onToggle={() => toggle(`S_${i}`)}
              />
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

// ============================================================
// TODAY SCREEN
// ============================================================

function TodayScreen({
  week,
  day,
  history,
  onPick,
}: {
  week: Week;
  day: number;
  history: HistoryEntry[];
  onPick: (p: PickPayload) => void;
}) {
  const slot: any = SCHEDULE[week][day];
  const todayName = DAYS_LONG[day];

  const pool = useMemo(() => {
    const out: any[] = [];
    for (const cat of slot.categories) {
      for (const w of (BY_CATEGORY as any)[cat] || []) out.push(w);
    }
    return out;
  }, [slot]);

  const lastDone = useMemo(() => {
    const m: Record<string, number> = {};
    for (const h of history) {
      if (!m[h.workoutId] || h.completedAt > m[h.workoutId]) {
        m[h.workoutId] = h.completedAt;
      }
    }
    return m;
  }, [history]);

  return (
    <ScrollView contentContainerClassName="p-4 pb-24 gap-4">
      <View className="bg-amber-500 rounded-lg p-5">
        <Text className="text-[10px] tracking-[2.5px] font-mono uppercase text-black/70">
          Today · Week {week}
        </Text>
        <Text className="text-3xl text-black font-archivo mt-1">
          {todayName.toUpperCase()}
        </Text>
        <Text className="text-xl font-bold text-black mt-3">{slot.title}</Text>
        {slot.optional ? (
          <Text className="text-xs text-black/70 mt-1">
            Optional · take rest if needed
          </Text>
        ) : null}
        {slot.kind === "outdoor" ? (
          <Text className="text-sm text-black/80 mt-2">
            Self-directed cardio. Bike, run, or swim.
          </Text>
        ) : null}
      </View>

      {slot.kind === "outdoor" ? (
        <Pressable
          onPress={() =>
            onPick({ kind: "outdoor", title: slot.title, day, week })
          }
          className="bg-amber-500 py-4 rounded-md flex-row items-center justify-center"
        >
          <Check size={18} color="#000" strokeWidth={3} />
          <Text className="text-black font-black tracking-widest uppercase text-sm ml-2">
            Mark Complete
          </Text>
        </Pressable>
      ) : (
        <View>
          <Text className="text-[10px] tracking-[2.5px] text-zinc-500 font-mono uppercase mb-2">
            Pick a workout · {pool.length} ready
          </Text>
          {slot.picker === "rotate" ? (
            <Text className="text-[11px] text-zinc-500 mb-2">
              Friday rotates: pick any of the four total-body styles.
            </Text>
          ) : null}
          <View className="gap-2">
            {pool.map((w) => {
              const last = lastDone[w.id];
              return (
                <Pressable
                  key={w.id}
                  onPress={() => onPick({ kind: "workout", workoutId: w.id })}
                  className="bg-zinc-900 border border-zinc-800 rounded-md p-3 flex-row items-center"
                >
                  <Text className="text-2xl mr-3">
                    {(CATEGORY_ICONS as any)[w.category] || "💪"}
                  </Text>
                  <View className="flex-1">
                    <Text
                      className="text-white font-bold text-sm"
                      numberOfLines={1}
                    >
                      {w.name}
                    </Text>
                    <Text
                      className="text-zinc-500 text-[11px]"
                      numberOfLines={1}
                    >
                      {previewLine(w)}
                    </Text>
                  </View>
                  {last ? (
                    <Text className="text-[9px] font-mono text-emerald-500 uppercase tracking-wider mx-2">
                      ✓ {daysAgo(last)}
                    </Text>
                  ) : null}
                  <ChevronRight size={16} color="#52525b" />
                </Pressable>
              );
            })}
          </View>
        </View>
      )}
    </ScrollView>
  );
}

// ============================================================
// WORKOUT SCREEN
// ============================================================

function WorkoutScreen({
  workout,
  state,
  setState,
  onFinish,
  onCancel,
}: {
  workout: any;
  state: ActiveState;
  setState: (updater: (s: ActiveState) => ActiveState) => void;
  onFinish: () => void;
  onCancel: () => void;
}) {
  const w = workout;
  const askConfirm = state.confirm;
  const setAskConfirm = (v: ActiveState["confirm"]) =>
    setState((s) => ({ ...s, confirm: v }));
  const doneSet = state.done;
  const isDone = (key: string) => !!doneSet[key];
  const toggle = (key: string) => {
    setState((s) => {
      const next = { ...s.done };
      if (next[key]) delete next[key];
      else next[key] = Date.now();
      return { ...s, done: next };
    });
  };

  const totalKeys = collectKeys(w);
  const doneCount = totalKeys.filter((k: string) => isDone(k)).length;

  return (
    <ScrollView contentContainerClassName="p-4 pb-24 gap-4">
      <View className="flex-row items-center justify-between">
        <Pressable
          onPress={() =>
            doneCount > 0 ? setAskConfirm({ kind: "cancel" }) : onCancel()
          }
          className="flex-row items-center"
        >
          <ChevronLeft size={14} color="#a1a1aa" />
          <Text className="text-zinc-400 text-xs ml-1">Cancel</Text>
        </Pressable>
        <Text className="text-[10px] tracking-widest text-zinc-500 font-mono uppercase">
          {doneCount} / {totalKeys.length}
        </Text>
      </View>

      <View>
        <Text className="text-[10px] tracking-[2.5px] text-amber-500 font-mono uppercase">
          Active
        </Text>
        <Text className="text-xl text-white font-archivo">{w.name}</Text>
        {w.template ? (
          <Text className="text-xs text-zinc-500 font-mono mt-1">
            Template: {w.template}
          </Text>
        ) : null}
      </View>

      {w.type === "strength_split" && (
        <SplitView w={w} isDone={isDone} toggle={toggle} />
      )}
      {w.type === "strength_total_body" && (
        <TotalBodyView w={w} isDone={isDone} toggle={toggle} />
      )}
      {w.type === "cardio_12" && (
        <Cardio12View w={w} isDone={isDone} toggle={toggle} />
      )}
      {w.type === "cardio_4group" && (
        <Cardio4GView w={w} isDone={isDone} toggle={toggle} />
      )}

      <ExtrasView w={w} isDone={isDone} toggle={toggle} />

      <Pressable
        onPress={onFinish}
        className="bg-emerald-500 py-4 rounded-md flex-row items-center justify-center"
      >
        <Check size={18} color="#000" strokeWidth={3} />
        <Text className="text-black font-black tracking-widest uppercase text-sm ml-2">
          Finish & Save
        </Text>
      </Pressable>

      <ConfirmModal
        open={!!askConfirm && askConfirm.kind === "cancel"}
        message="Discard this workout? Your progress won't be saved."
        confirmLabel="Discard"
        danger
        onConfirm={() => {
          setAskConfirm(null);
          onCancel();
        }}
        onCancel={() => setAskConfirm(null)}
      />
    </ScrollView>
  );
}

// ============================================================
// HISTORY SCREEN
// ============================================================

function HistoryScreen({
  history,
  onClear,
}: {
  history: HistoryEntry[];
  onClear: () => void;
}) {
  const [askClear, setAskClear] = useState(false);
  const startOfWeek = new Date();
  const dayOfWeek = startOfWeek.getDay();
  const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  startOfWeek.setDate(startOfWeek.getDate() - mondayOffset);
  startOfWeek.setHours(0, 0, 0, 0);
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);
  const weekCount = history.filter((h) => h.completedAt >= startOfWeek.getTime()).length;
  const monthCount = history.filter((h) => h.completedAt >= startOfMonth.getTime()).length;
  const avgCompletion =
    history.length === 0
      ? 0
      : Math.round(
          history.reduce(
            (sum, h) => sum + h.doneCount / Math.max(h.totalCount, 1),
            0,
          ) /
            history.length *
            100,
        );
  const lastWorkout = history.reduce<HistoryEntry | null>(
    (latest, entry) =>
      !latest || entry.completedAt > latest.completedAt ? entry : latest,
    null,
  );

  if (history.length === 0) {
    return (
      <View className="p-8 items-center">
        <HistoryIcon size={32} color="#3f3f46" />
        <Text className="text-zinc-500 text-sm mt-3">
          No completed workouts yet.
        </Text>
      </View>
    );
  }
  return (
    <ScrollView contentContainerClassName="p-4 gap-3 pb-24">
      <View className="flex-row items-center justify-between">
        <Text className="text-[10px] tracking-[2.5px] text-zinc-500 font-mono uppercase">
          History · {history.length}
        </Text>
        <Pressable
          onPress={() => setAskClear(true)}
          className="flex-row items-center"
        >
          <Trash2 size={10} color="#52525b" />
          <Text className="text-zinc-600 text-[10px] font-mono uppercase ml-1">
            Clear
          </Text>
        </Pressable>
      </View>
      <View className="bg-zinc-900 border border-zinc-800 rounded-md p-3">
        <View className="flex-row">
          <View className="flex-1">
            <Text className="text-[9px] text-zinc-500 font-mono uppercase tracking-wider">
              This Week
            </Text>
            <Text className="text-xl text-white font-archivo">{weekCount}</Text>
          </View>
          <View className="flex-1">
            <Text className="text-[9px] text-zinc-500 font-mono uppercase tracking-wider">
              This Month
            </Text>
            <Text className="text-xl text-white font-archivo">{monthCount}</Text>
          </View>
          <View className="flex-1">
            <Text className="text-[9px] text-zinc-500 font-mono uppercase tracking-wider">
              Avg Done
            </Text>
            <Text className="text-xl text-white font-archivo">{avgCompletion}%</Text>
          </View>
        </View>
        {lastWorkout ? (
          <Text className="text-[11px] text-zinc-500 mt-2" numberOfLines={1}>
            Last: {lastWorkout.name} · {daysAgo(lastWorkout.completedAt)}
          </Text>
        ) : null}
      </View>
      {history
        .slice()
        .reverse()
        .map((h) => {
          const dt = new Date(h.completedAt);
          const dateStr = dt.toLocaleDateString();
          const timeStr = dt.toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          });
          const pct = Math.round(
            (h.doneCount / Math.max(h.totalCount, 1)) * 100,
          );
          return (
            <View
              key={h.id}
              className="bg-zinc-900 border border-zinc-800 rounded-md p-3 flex-row items-center"
            >
              <View className="flex-1">
                <Text className="text-white font-bold text-sm" numberOfLines={1}>
                  {h.name}
                </Text>
                <Text className="text-zinc-500 text-[10px] font-mono">
                  {dateStr} · {timeStr}
                </Text>
              </View>
              <View className="items-end ml-3">
                <Text className="text-amber-500 font-mono text-xs">
                  {h.doneCount}/{h.totalCount}
                </Text>
                <Text className="text-zinc-500 font-mono text-[10px]">{pct}%</Text>
              </View>
            </View>
          );
        })}
      <ConfirmModal
        open={askClear}
        message="Clear all history? This cannot be undone."
        confirmLabel="Clear"
        danger
        onConfirm={() => {
          onClear();
          setAskClear(false);
        }}
        onCancel={() => setAskClear(false)}
      />
    </ScrollView>
  );
}

// ============================================================
// SETUP SCREEN
// ============================================================

function SetupScreen({
  week,
  setWeek,
  day,
  setDay,
  onResetAll,
}: {
  week: Week;
  setWeek: (w: Week) => void;
  day: number;
  setDay: (d: number) => void;
  onResetAll: () => void;
}) {
  const [askReset, setAskReset] = useState(false);
  return (
    <ScrollView contentContainerClassName="p-4 gap-5 pb-24">
      <View>
        <Text className="text-[10px] tracking-[2.5px] text-zinc-500 font-mono uppercase mb-2">
          Week
        </Text>
        <View className="flex-row gap-2">
          {(["A", "B"] as const).map((w) => (
            <Pressable
              key={w}
              onPress={() => setWeek(w)}
              className={`flex-1 py-3 rounded-md items-center ${week === w ? "bg-amber-500" : "bg-zinc-900 border border-zinc-800"}`}
            >
              <Text
                className={`text-sm font-bold tracking-wider uppercase ${week === w ? "text-black" : "text-zinc-400"}`}
              >
                Week {w}
              </Text>
            </Pressable>
          ))}
        </View>
        <Text className="text-[11px] text-zinc-500 mt-2">
          Auto-flips weekly. Tap to override.
        </Text>
      </View>

      <View>
        <Text className="text-[10px] tracking-[2.5px] text-zinc-500 font-mono uppercase mb-2">
          Day
        </Text>
        <View className="flex-row gap-1">
          {DAYS.map((label, idx) => (
            <Pressable
              key={label}
              onPress={() => setDay(idx)}
              className={`flex-1 py-2 rounded-md items-center ${day === idx ? "bg-amber-500" : "bg-zinc-900 border border-zinc-800"}`}
            >
              <Text
                className={`text-[11px] font-bold tracking-wider uppercase ${day === idx ? "text-black" : "text-zinc-400"}`}
              >
                {label}
              </Text>
            </Pressable>
          ))}
        </View>
        <Text className="text-[11px] text-zinc-500 mt-2">
          Auto-syncs to current day. Tap to override (e.g. skip ahead).
        </Text>
      </View>

      <View>
        <Text className="text-[10px] tracking-[2.5px] text-zinc-500 font-mono uppercase mb-2">
          Schedule
        </Text>
        <View className="bg-zinc-900 border border-zinc-800 rounded-md overflow-hidden">
          {DAYS.map((d, i) => {
            const slot: any = SCHEDULE[week][i];
            const isToday = i === day;
            return (
              <View
                key={d}
                className={`px-3 py-2 flex-row items-center border-b border-zinc-800 ${isToday ? "bg-amber-500/10" : ""}`}
              >
                <Text
                  className={`font-mono w-8 ${isToday ? "text-amber-500" : "text-zinc-500"} text-xs`}
                >
                  {d}
                </Text>
                <View className="flex-1 flex-row items-center">
                  <Text
                    className={`text-xs ${isToday ? "text-white font-bold" : "text-zinc-400"}`}
                  >
                    {slot.title}
                  </Text>
                  {slot.optional ? (
                    <Text className="text-zinc-600 text-xs"> · opt</Text>
                  ) : null}
                </View>
              </View>
            );
          })}
        </View>
      </View>

      <View>
        <Text className="text-[10px] tracking-[2.5px] text-zinc-500 font-mono uppercase mb-2">
          Library
        </Text>
        <View className="bg-zinc-900 border border-zinc-800 rounded-md p-3">
          {Object.entries(BY_CATEGORY).map(([cat, arr]) => (
            <View key={cat} className="flex-row justify-between py-0.5">
              <Text className="text-[11px] font-mono text-zinc-400">
                {(CATEGORY_LABELS as any)[cat]}
              </Text>
              <Text className="text-[11px] font-mono text-amber-500">
                {(arr as any[]).length}
              </Text>
            </View>
          ))}
          <View className="pt-1 mt-1 border-t border-zinc-800 flex-row justify-between">
            <Text className="text-[11px] font-mono text-white font-bold">
              Total
            </Text>
            <Text className="text-[11px] font-mono text-white font-bold">
              {WORKOUTS.length}
            </Text>
          </View>
        </View>
      </View>

      <View>
        <Text className="text-[10px] tracking-[2.5px] text-zinc-500 font-mono uppercase mb-2">
          Danger Zone
        </Text>
        <Pressable
          onPress={() => setAskReset(true)}
          className="bg-zinc-900 border border-red-900 py-2.5 rounded-md flex-row items-center justify-center"
        >
          <Trash2 size={12} color="#f87171" />
          <Text className="text-red-400 text-xs font-bold uppercase tracking-wider ml-2">
            Reset All Data
          </Text>
        </Pressable>
      </View>

      <Text className="text-[10px] text-zinc-700 font-mono text-center pt-4 border-t border-zinc-900">
        IFFF · v0.4 · {WORKOUTS.length} prebuilt workouts
      </Text>

      <ConfirmModal
        open={askReset}
        message="Reset all data? Wipes history, week, and schedule overrides."
        confirmLabel="Reset"
        danger
        onConfirm={() => {
          onResetAll();
          setAskReset(false);
        }}
        onCancel={() => setAskReset(false)}
      />
    </ScrollView>
  );
}

// ============================================================
// APP ROOT
// ============================================================

function AppInner() {
  const [tab, setTab] = useState<TabId>("today");
  const [activeWorkout, setActiveWorkout] = useState<any>(null);
  const [activeState, setActiveState] = useState<ActiveState>({
    done: {},
    confirm: null,
  });
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [week, setWeek] = useState<Week>("A");
  const [day, setDay] = useState<number>(getCurrentDay());
  const [lastMonday, setLastMonday] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      const [h, w, d, lm, aw, as] = await Promise.all([
        loadStorage<HistoryEntry[]>("history", []),
        loadStorage<Week>("week", "A"),
        loadStorage<number>("day", getCurrentDay()),
        loadStorage<string | null>("lastMonday", null),
        loadStorage<any>("activeWorkout", null),
        loadStorage<ActiveState>("activeState", { done: {}, confirm: null }),
      ]);

      setHistory(Array.isArray(h) ? h : []);

      const thisMonday = getCurrentMondayISO();
      let nextWeek: Week = w === "A" || w === "B" ? w : "A";
      if (lm && lm !== thisMonday) {
        const wkMs = 7 * 24 * 60 * 60 * 1000;
        const diff = Math.round(
          (new Date(thisMonday).getTime() - new Date(lm).getTime()) / wkMs,
        );
        for (let i = 0; i < diff; i++) nextWeek = flipWeek(nextWeek) as Week;
      }
      setWeek(nextWeek);
      setLastMonday(thisMonday);
      setDay(getCurrentDay());

      if (aw && BY_ID[aw.id]) {
        setActiveWorkout(aw);
        setActiveState(
          as && typeof as === "object" && as.done
            ? as
            : { done: {}, confirm: null },
        );
      }
      setLoaded(true);
    })();
  }, []);

  // Re-sync day when app comes to foreground
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s: AppStateStatus) => {
      if (s === "active") setDay(getCurrentDay());
    });
    return () => sub.remove();
  }, []);

  // Persist
  useEffect(() => {
    if (loaded) saveStorage("history", history);
  }, [history, loaded]);
  useEffect(() => {
    if (loaded) saveStorage("week", week);
  }, [week, loaded]);
  useEffect(() => {
    if (loaded) saveStorage("day", day);
  }, [day, loaded]);
  useEffect(() => {
    if (loaded && lastMonday) saveStorage("lastMonday", lastMonday);
  }, [lastMonday, loaded]);
  useEffect(() => {
    if (loaded) saveStorage("activeWorkout", activeWorkout);
  }, [activeWorkout, loaded]);
  useEffect(() => {
    if (loaded) saveStorage("activeState", activeState);
  }, [activeState, loaded]);

  const handlePick = (pick: PickPayload) => {
    if (pick.kind === "workout") {
      const w = BY_ID[pick.workoutId];
      if (!w) return;
      setActiveWorkout(w);
      setActiveState({ done: {}, confirm: null });
    } else if (pick.kind === "outdoor") {
      const entry: HistoryEntry = {
        id: safeUid("h"),
        workoutId: "outdoor",
        name: pick.title,
        category: "outdoor",
        completedAt: Date.now(),
        doneCount: 1,
        totalCount: 1,
      };
      setHistory((h) => [...h, entry]);
      setTab("history");
    }
  };

  const handleFinish = () => {
    if (!activeWorkout) return;
    const totalKeys = collectKeys(activeWorkout);
    const doneCount = totalKeys.filter(
      (k: string) => activeState.done[k],
    ).length;
    const entry: HistoryEntry = {
      id: safeUid("h"),
      workoutId: activeWorkout.id,
      name: activeWorkout.name,
      category: activeWorkout.category,
      completedAt: Date.now(),
      doneCount,
      totalCount: totalKeys.length,
      done: activeState.done,
    };
    setHistory((h) => [...h, entry]);
    setActiveWorkout(null);
    setActiveState({ done: {}, confirm: null });
    setTab("today");
  };

  const handleCancel = () => {
    setActiveWorkout(null);
    setActiveState({ done: {}, confirm: null });
  };

  const handleResetAll = async () => {
    await resetAllStorage();
    const today = getCurrentDay();
    const thisMonday = getCurrentMondayISO();
    setHistory([]);
    setActiveWorkout(null);
    setActiveState({ done: {}, confirm: null });
    setWeek("A");
    setDay(today);
    setLastMonday(thisMonday);
    setTab("today");
  };

  return (
    <View className="flex-1 bg-black">
      {activeWorkout ? (
        <>
          <Header tab="" setTab={() => {}} week={week} day={day} hideTabs />
          <WorkoutScreen
            workout={activeWorkout}
            state={activeState}
            setState={(updater) =>
              setActiveState((s) =>
                typeof updater === "function" ? updater(s) : updater,
              )
            }
            onFinish={handleFinish}
            onCancel={handleCancel}
          />
        </>
      ) : (
        <>
          <Header tab={tab} setTab={setTab} week={week} day={day} />
          {tab === "today" && (
            <TodayScreen
              week={week}
              day={day}
              history={history}
              onPick={handlePick}
            />
          )}
          {tab === "history" && (
            <HistoryScreen history={history} onClear={() => setHistory([])} />
          )}
          {tab === "setup" && (
            <SetupScreen
              week={week}
              setWeek={setWeek}
              day={day}
              setDay={setDay}
              onResetAll={handleResetAll}
            />
          )}
        </>
      )}
    </View>
  );
}

export default function App() {
  const [fontsLoaded] = useFonts({
    "ArchivoBlack-Regular": require("./assets/fonts/ArchivoBlack-Regular.ttf"),
    "JetBrainsMono-Regular": require("./assets/fonts/JetBrainsMono-Regular.ttf"),
    "JetBrainsMono-Bold": require("./assets/fonts/JetBrainsMono-Bold.ttf"),
  });

  useEffect(() => {
    if (fontsLoaded) SplashScreen.hideAsync().catch(() => {});
  }, [fontsLoaded]);

  if (!fontsLoaded) return null;

  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <SafeAreaView className="flex-1 bg-black" edges={["top", "bottom"]}>
          <StatusBar barStyle="light-content" backgroundColor="#000" />
          <AppInner />
        </SafeAreaView>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}
