"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowRightLeft,
  Box,
  ChevronDown,
  ChevronLeft,
  Clock,
  Download,
  Eye,
  LayoutGrid,
  List,
  MoreVertical,
  Pencil,
  Play,
  Plus,
  Search,
  Trash2,
} from "lucide-react";

import { AutoToast } from "@/components/auto-toast";
import { MoreDataShell } from "@/components/more-data-shell";
import { ScheduleResultPushSection, validateResultPushBlocks, type ResultPushBlock } from "@/components/schedule-result-push";
import { useOptionalPlatformAgent } from "@/components/platform-agent-provider";
import { RequiredAsterisk } from "@/components/required-mark";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { downloadAuthorizedFile, formatAgentApiErrorForUser, getTask, parseFastApiDetail } from "@/lib/agent-api/client";
import {
  createUserScheduledTaskGroup,
  deleteUserScheduledTask,
  fetchAllScheduledTaskRuns,
  deleteScheduledTaskRun,
  fetchAllUserScheduledTaskGroups,
  fetchAllUserScheduledTasks,
  getUserScheduledTask,
  patchUserScheduledTask,
  runUserScheduledTaskNow,
} from "@/lib/agent-api/scheduled-tasks";
import {
  deriveTaskUiStatus,
  formatRunRecordFinishedAtLocal,
  getScheduledRunSkillTaskId,
  nextRunLabel,
  runStatusDisplay,
  runStatusToApi,
  scheduledRunShowsDownloadAllReports,
} from "@/lib/agent-api/schedules-mappers";
import { isPlatformBackendEnabled } from "@/lib/agent-runtime";
import {
  clearScheduleTrialStorage,
  loadScheduleCreateDraft,
  saveScheduleCreateDraft,
  saveScheduleTrialMeta,
} from "@/lib/schedule-create-draft";
import {
  computeNextRunForCreateBody,
  defaultNearestHalfHourHhmm,
  runOnceDateYmdImpliedToday,
} from "@/lib/schedule-next-run";
import { buildCreatePayloads, toHhmm, SCHEDULE_KINDS, type ScheduleKind } from "@/lib/schedule-payloads";
import { saveScheduleTasksWithDraft } from "@/lib/save-schedule-from-draft";
import type {
  ScheduledTaskRunItemApi,
  UserScheduledTaskGroupDto,
  UserScheduledTaskItemApi,
} from "@/lib/agent-api/types";
import { cn } from "@/lib/utils";

const PRIMARY_TABS = ["已定时", "运行记录"] as const;
const WORKFLOW_STATUS_OPTIONS = ["全部状态", "生效中", "已暂停", "已完结"] as const;
const RUN_STATUS_OPTIONS = ["全部状态", "运行成功", "运行失败", "运行超时"] as const;

/** 与后端一致：0=周一 … 6=周日；界面按「周日—周六」展示 */
const WEEKDAY_OPTIONS: { label: string; value: number }[] = [
  { label: "周日", value: 6 },
  { label: "周一", value: 0 },
  { label: "周二", value: 1 },
  { label: "周三", value: 2 },
  { label: "周四", value: 3 },
  { label: "周五", value: 4 },
  { label: "周六", value: 5 },
];

function buildHalfHourTimeOptions(): string[] {
  const o: string[] = [];
  for (let h = 0; h < 24; h++) {
    o.push(`${String(h).padStart(2, "0")}:00`);
    o.push(`${String(h).padStart(2, "0")}:30`);
  }
  return o;
}

const HALF_HOUR_TIME_OPTIONS = buildHalfHourTimeOptions();
const MONTH_DAY_OPTIONS = Array.from({ length: 31 }, (_, i) => i + 1);

function weekdayButtonLabel(weekdays: Set<number>) {
  if (weekdays.size === 0) return "选择星期";
  const order = [6, 0, 1, 2, 3, 4, 5];
  return order
    .filter((v) => weekdays.has(v))
    .map((v) => WEEKDAY_OPTIONS.find((o) => o.value === v)?.label ?? "")
    .join("、");
}

function monthDayButtonLabel(days: Set<number>) {
  if (days.size === 0) return "选择日期";
  return Array.from(days)
    .sort((a, b) => a - b)
    .map((d) => `${d}号`)
    .join("、");
}

function filterTasksByChip(tasks: UserScheduledTaskItemApi[], chip: string, groups: UserScheduledTaskGroupDto[]) {
  if (chip === "全部") return tasks;
  if (chip === "默认") return tasks.filter((t) => !t.group_id);
  const g = groups.find((x) => x.name === chip);
  if (!g) return [];
  return tasks.filter((t) => t.group_id === g.id);
}

function filterTasksByWorkflowStatus(tasks: UserScheduledTaskItemApi[], f: (typeof WORKFLOW_STATUS_OPTIONS)[number]) {
  if (f === "全部状态") return tasks;
  return tasks.filter((t) => deriveTaskUiStatus(t) === f);
}

function filterRunsBySearch(runs: ScheduledTaskRunItemApi[], q: string) {
  if (!q.trim()) return runs;
  const s = q.toLowerCase();
  return runs.filter(
    (r) =>
      r.task_title_snapshot.toLowerCase().includes(s) ||
      r.prompt_snapshot.toLowerCase().includes(s) ||
      (r.error_message && r.error_message.toLowerCase().includes(s)),
  );
}

function ScheduleEmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex min-h-[min(420px,calc(100vh-320px))] flex-col items-center justify-center rounded-[16px] border border-[#f0f0f0] bg-white px-4 py-20">
      <div className="mb-7 flex flex-col items-center" aria-hidden>
        <div className="mb-1 flex w-[100px] justify-center gap-2">
          <span className="h-0.5 w-6 border-t border-dotted border-[#cbd5e1]" />
          <span className="h-0.5 w-5 border-t border-dotted border-[#cbd5e1]" />
          <span className="h-0.5 w-4 border-t border-dotted border-[#e2e8f0]" />
        </div>
        <div
          className="flex h-[100px] w-[112px] items-center justify-center rounded-[20px] border-2 border-dashed border-[#e5e7eb] bg-[#fafafa]"
        >
          <div className="flex flex-col items-center">
            <Box className="h-11 w-11 text-[#bfc4c9]" strokeWidth={1.1} />
            <div className="mt-0.5 h-1 w-12 rounded-t-sm border border-b-0 border-[#e2e8f0] bg-white/80" />
          </div>
        </div>
      </div>
      <p className="text-center text-[15px] text-[#71717a]">
        暂无定时任务{" "}
        <button
          type="button"
          className="font-medium text-[#2563eb] no-underline transition hover:text-[#1d4ed8] hover:underline"
          onClick={onCreate}
        >
          立即创建
        </button>
      </p>
    </div>
  );
}

export function SchedulesWorkspace() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const platformAgent = useOptionalPlatformAgent();

  const [primaryTab, setPrimaryTab] = useState<(typeof PRIMARY_TABS)[number]>("已定时");
  const [activeChip, setActiveChip] = useState("全部");
  const [addGroupOpen, setAddGroupOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const newGroupInputRef = useRef<HTMLInputElement | null>(null);
  const skipNewGroupBlurRef = useRef(false);

  const [search, setSearch] = useState("");
  const [groups, setGroups] = useState<UserScheduledTaskGroupDto[]>([]);
  const [tasks, setTasks] = useState<UserScheduledTaskItemApi[]>([]);
  const [runs, setRuns] = useState<ScheduledTaskRunItemApi[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const [workflowStatusFilter, setWorkflowStatusFilter] = useState<(typeof WORKFLOW_STATUS_OPTIONS)[number]>("全部状态");
  const [runStatusFilter, setRunStatusFilter] = useState<(typeof RUN_STATUS_OPTIONS)[number]>("全部状态");
  const [filterOpen, setFilterOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastVariant, setToastVariant] = useState<"default" | "error">("default");
  /** 编辑态：提示词已改时点「保存」的拦截说明层 */
  const [editPromptChangedSaveGateOpen, setEditPromptChangedSaveGateOpen] = useState(false);
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");

  const [bulkSelectRuns, setBulkSelectRuns] = useState(false);
  const [selectedRunIds, setSelectedRunIds] = useState<Set<string>>(() => new Set());

  const [moveTask, setMoveTask] = useState<UserScheduledTaskItemApi | null>(null);
  const [moveGroupId, setMoveGroupId] = useState<string | "">("");

  const createMode = searchParams.get("create") === "1";
  const createGroupIdQ = searchParams.get("groupId") || "";
  const editId = searchParams.get("edit");

  const [title, setTitle] = useState("");
  const [prompt, setPrompt] = useState("");
  /** 定时任务所在分组，null 为「默认」；与 `UserScheduledTaskItemApi.group_id` 一致 */
  const [formGroupId, setFormGroupId] = useState<string | null>(null);
  const [scheduleKind, setScheduleKind] = useState<ScheduleKind>("每天");
  const [timeHhmm, setTimeHhmm] = useState(() => defaultNearestHalfHourHhmm(HALF_HOUR_TIME_OPTIONS));
  const [selectedWeekdays, setSelectedWeekdays] = useState<Set<number>>(() => new Set());
  const [selectedMonthDays, setSelectedMonthDays] = useState<Set<number>>(() => new Set());
  const [runOnceDate, setRunOnceDate] = useState("");
  const [taskEnabled, setTaskEnabled] = useState(true);
  const [resultPushFormKey, setResultPushFormKey] = useState(0);
  const fromRestore = useRef(false);
  const editFormHydratedForId = useRef<string | null>(null);
  /** 进入编辑时从服务器装填的提示词，用于判断「保存」前是否需先试跑 */
  const editPromptBaselineRef = useRef<string | null>(null);
  const resultPushRef = useRef<ResultPushBlock[]>([]);

  const chipOptions = useMemo(() => ["全部", "默认", ...groups.map((g) => g.name).filter(Boolean)], [groups]);

  const restoreParam = searchParams.get("restore") === "1";

  /** 从试跑「上一步」回配置：带 restore=1 时从 sessionStorage 还原表单。其它进入创建页时若仅保留内存/草稿（例如上次未保存就离开），则恢复为干净默认态。 */
  useEffect(() => {
    if (!createMode) {
      fromRestore.current = false;
      return;
    }
    if (restoreParam) {
      const d = loadScheduleCreateDraft();
      if (d) {
        setTitle(d.title);
        setPrompt(d.prompt);
        setTaskEnabled(d.taskEnabled);
        setScheduleKind(d.scheduleKind);
        setTimeHhmm(d.timeHhmm);
        setSelectedWeekdays(new Set(d.selectedWeekdayValues));
        setSelectedMonthDays(new Set(d.selectedMonthDayValues));
        setRunOnceDate(d.runOnceDate);
        setFormGroupId(d.groupId ?? null);
        resultPushRef.current = d.resultPushBlocks;
        setResultPushFormKey((k) => k + 1);
        fromRestore.current = true;
      }
      const gq = (() => {
        if (d?.groupId) {
          return `&groupId=${encodeURIComponent(String(d.groupId))}`;
        }
        return createGroupIdQ.trim() ? `&groupId=${encodeURIComponent(createGroupIdQ.trim())}` : "";
      })();
      const editQ = (() => {
        const e = searchParams.get("edit");
        return e && e.trim() ? `&edit=${encodeURIComponent(e)}` : "";
      })();
      router.replace(`/schedules?create=1${editQ}${gq}`);
      return;
    }
    if (fromRestore.current) {
      fromRestore.current = false;
      return;
    }
    if (searchParams.get("edit")) {
      return;
    }
    setTimeHhmm(defaultNearestHalfHourHhmm(HALF_HOUR_TIME_OPTIONS));
  }, [createMode, restoreParam, createGroupIdQ, router, searchParams]);

  /** 放弃/重新进入空新建：清空 memory 与 session 草稿。试跑上一步会带 restore=1 且由上方 effect 还原，不调用此项。 */
  const resetCreateFormToDefaults = useCallback(() => {
    setTitle("");
    setPrompt("");
    setFormGroupId(null);
    setTaskEnabled(true);
    setScheduleKind("每天");
    setTimeHhmm(defaultNearestHalfHourHhmm(HALF_HOUR_TIME_OPTIONS));
    setSelectedWeekdays(new Set());
    setSelectedMonthDays(new Set());
    setRunOnceDate("");
    resultPushRef.current = [];
    setResultPushFormKey((k) => k + 1);
    setNotice("");
    editPromptBaselineRef.current = null;
    setEditPromptChangedSaveGateOpen(false);
    clearScheduleTrialStorage();
  }, []);

  const wasInCreateMode = useRef(false);
  useEffect(() => {
    if (createMode && !wasInCreateMode.current) {
      if (!restoreParam && !searchParams.get("edit")) {
        resetCreateFormToDefaults();
      }
    }
    wasInCreateMode.current = createMode;
  }, [createMode, restoreParam, resetCreateFormToDefaults, searchParams]);

  const applyTaskToScheduleForm = useCallback((t: UserScheduledTaskItemApi) => {
    setTitle(t.title);
    setPrompt(t.prompt_text);
    setTaskEnabled(t.enabled);
    const r = String(t.recurrence || "daily");
    if (r === "daily") {
      setScheduleKind("每天");
      setSelectedWeekdays(new Set());
      setSelectedMonthDays(new Set());
      setRunOnceDate("");
    } else if (r === "weekly") {
      setScheduleKind("每周");
      setSelectedWeekdays(t.weekday != null ? new Set([t.weekday]) : new Set());
      setSelectedMonthDays(new Set());
      setRunOnceDate("");
    } else if (r === "monthly") {
      setScheduleKind("每月");
      setSelectedWeekdays(new Set());
      setSelectedMonthDays(t.day_of_month != null ? new Set([t.day_of_month]) : new Set());
      setRunOnceDate("");
    } else if (r === "once") {
      setScheduleKind("不重复");
      setSelectedWeekdays(new Set());
      setSelectedMonthDays(new Set());
      const ro = t.run_once_date;
      setRunOnceDate(typeof ro === "string" && ro.trim() ? ro.trim().slice(0, 10) : "");
    } else {
      setScheduleKind("每天");
      setSelectedWeekdays(new Set());
      setSelectedMonthDays(new Set());
      setRunOnceDate("");
    }
    setTimeHhmm(toHhmm(t.time_hhmm));
    setFormGroupId(t.group_id ?? null);
    resultPushRef.current = [];
    setResultPushFormKey((k) => k + 1);
    editPromptBaselineRef.current = String(t.prompt_text ?? "").trim();
  }, []);

  useEffect(() => {
    if (!createMode || !editId) {
      editFormHydratedForId.current = null;
      editPromptBaselineRef.current = null;
      return;
    }
    if (editFormHydratedForId.current === editId) {
      return;
    }
    const fromList = tasks.find((x) => x.id === editId);
    if (fromList) {
      applyTaskToScheduleForm(fromList);
      editFormHydratedForId.current = editId;
      return;
    }
    if (!platformAgent?.auth) {
      return;
    }
    let cancelled = false;
    void platformAgent.withFreshToken(async (token) => {
      const t = await getUserScheduledTask(token, editId);
      if (cancelled) {
        return;
      }
      applyTaskToScheduleForm(t);
      editFormHydratedForId.current = editId;
    });
    return () => {
      cancelled = true;
    };
  }, [createMode, editId, tasks, platformAgent, applyTaskToScheduleForm]);

  /** 新建时：用 URL 的 `groupId` 初始化（从列表点「创建」会带上与筛选胶囊一致的分组；编辑态由 `applyTaskToScheduleForm` 从任务装填，此处跳过） */
  useEffect(() => {
    if (!createMode || editId) {
      return;
    }
    if (restoreParam) {
      return;
    }
    const q = (createGroupIdQ || "").trim();
    setFormGroupId(q || null);
  }, [createMode, createGroupIdQ, editId, restoreParam]);

  /** 与 `scheduled_task_schedule.initial_next_run` 对齐的首次执行判定（用于本页提示与试跑前拦截） */
  const scheduleBodiesForNext = useMemo(
    () => buildCreatePayloads("·", "·", null, true, scheduleKind, timeHhmm, selectedWeekdays, selectedMonthDays, runOnceDate),
    [scheduleKind, timeHhmm, selectedWeekdays, selectedMonthDays, runOnceDate],
  );
  const hasValidNextExecution = useMemo(
    () =>
      scheduleBodiesForNext.length > 0 && scheduleBodiesForNext.every((b) => computeNextRunForCreateBody(b) != null),
    [scheduleBodiesForNext],
  );
  const tryRunSubmitBlocked = taskEnabled && !hasValidNextExecution;

  const refreshGroupsAndTasks = useCallback(async () => {
    if (!platformAgent?.auth) return;
    setBusy(true);
    setError("");
    try {
      await platformAgent.withFreshToken(async (token) => {
        const [g, t] = await Promise.all([fetchAllUserScheduledTaskGroups(token), fetchAllUserScheduledTasks(token)]);
        setGroups(g);
        setTasks(t);
      });
    } catch (e) {
      setError(formatAgentApiErrorForUser(e));
    } finally {
      setBusy(false);
    }
  }, [platformAgent]);

  const refreshRuns = useCallback(async () => {
    if (!platformAgent?.auth) return;
    setBusy(true);
    setError("");
    try {
      const rs = runStatusToApi(runStatusFilter);
      await platformAgent.withFreshToken(async (token) => {
        const r = await fetchAllScheduledTaskRuns(token, { run_status: rs });
        setRuns(r);
      });
    } catch (e) {
      setError(formatAgentApiErrorForUser(e));
    } finally {
      setBusy(false);
    }
  }, [platformAgent, runStatusFilter]);

  useEffect(() => {
    if (!isPlatformBackendEnabled() || !platformAgent?.auth) return;
    void refreshGroupsAndTasks();
  }, [platformAgent, refreshGroupsAndTasks]);

  useEffect(() => {
    if (!isPlatformBackendEnabled() || !platformAgent?.auth || primaryTab !== "运行记录") return;
    void refreshRuns();
  }, [platformAgent, primaryTab, refreshRuns]);

  const groupIdForCreate: string | null = useMemo(() => {
    if (activeChip === "全部" || activeChip === "默认") return null;
    const g = groups.find((x) => x.name === activeChip);
    return g?.id ?? null;
  }, [activeChip, groups]);

  const createGroupIdForChip = useCallback((): string => {
    if (activeChip === "全部" || activeChip === "默认") return "";
    const g = groups.find((x) => x.name === activeChip);
    return g?.id ?? "";
  }, [activeChip, groups]);

  const commitNewGroup = useCallback(async () => {
    if (!addGroupOpen) return;
    const name = newGroupName.trim();
    if (!name) {
      setAddGroupOpen(false);
      setNewGroupName("");
      return;
    }
    if (name === "全部" || name === "默认") {
      setToastMessage("该名称与系统分组冲突");
      setToastVariant("error");
      window.requestAnimationFrame(() => newGroupInputRef.current?.focus());
      return;
    }
    if (groups.some((g) => g.name.trim() === name)) {
      setToastMessage("已存在同名分组");
      setToastVariant("error");
      window.requestAnimationFrame(() => newGroupInputRef.current?.focus());
      return;
    }
    if (!platformAgent) return;
    setBusy(true);
    try {
      await platformAgent.withFreshToken(async (token) => {
        await createUserScheduledTaskGroup(token, name);
      });
      setAddGroupOpen(false);
      setNewGroupName("");
      setActiveChip(name);
      await refreshGroupsAndTasks();
    } catch (e) {
      const msg = e && typeof e === "object" && "body" in e ? parseFastApiDetail((e as { body: unknown }).body) : null;
      setError(msg || formatAgentApiErrorForUser(e) || "创建分组失败");
    } finally {
      setBusy(false);
    }
  }, [addGroupOpen, newGroupName, groups, platformAgent, refreshGroupsAndTasks]);

  const filteredByChip = useMemo(
    () => filterTasksByChip(tasks, activeChip, groups),
    [tasks, activeChip, groups],
  );
  const filteredTasks = useMemo(
    () => filterTasksByWorkflowStatus(filteredByChip, workflowStatusFilter),
    [filteredByChip, workflowStatusFilter],
  );
  const displayTasks = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return filteredTasks;
    return filteredTasks.filter((t) => t.title.toLowerCase().includes(q) || t.prompt_text.toLowerCase().includes(q));
  }, [filteredTasks, search]);

  const runApiStatus = runStatusToApi(runStatusFilter);
  const displayRuns = useMemo(
    () => (primaryTab === "运行记录" ? filterRunsBySearch(runs, search) : []),
    [primaryTab, runs, search],
  );

  const startScheduleTrial = useCallback(async () => {
    if (!title.trim() || !prompt.trim()) {
      setNotice("请先补全标题和提示词。");
      return;
    }
    if (scheduleKind === "每周" && selectedWeekdays.size === 0) {
      setNotice("请选择星期。");
      return;
    }
    if (scheduleKind === "每月" && selectedMonthDays.size === 0) {
      setNotice("请选择日期。");
      return;
    }
    if (scheduleKind === "不重复" && !runOnceDate.trim()) {
      setNotice("请选择执行日期。");
      return;
    }
    if (taskEnabled && !hasValidNextExecution) {
      setNotice("无法排程，请检查周期、星期/日期或时间。");
      return;
    }
    const pushErr = validateResultPushBlocks(resultPushRef.current);
    if (pushErr) {
      setNotice(pushErr);
      return;
    }
    if (!isPlatformBackendEnabled() || !platformAgent) {
      setNotice("试跑需启用平台并登录。当前无法连接会话服务。");
      return;
    }
    setBusy(true);
    setNotice("");
    try {
      saveScheduleCreateDraft({
        title: title.trim(),
        prompt: prompt.trim(),
        taskEnabled,
        scheduleKind,
        timeHhmm,
        selectedWeekdayValues: Array.from(selectedWeekdays).sort((a, b) => a - b),
        selectedMonthDayValues: Array.from(selectedMonthDays).sort((a, b) => a - b),
        runOnceDate,
        groupId: formGroupId,
        resultPushBlocks: resultPushRef.current,
        createGroupIdFromUrl: createGroupIdQ,
        editingTaskId: editId || null,
      });
      const sid = await platformAgent.beginNewHomeTaskSession();
      if (!sid) {
        setNotice("无法创建试跑会话，请登录后重试。");
        return;
      }
      /** 首条消息在 agent 试跑页内发送，避免在定时页阻塞 2–3s 后已进入对话的割裂感 */
      saveScheduleTrialMeta({ v: 1, sessionId: sid, taskId: null, sendKind: "pending" });
      platformAgent.setActivePlatformSession(sid);
      router.push(`/agent?sessionId=${encodeURIComponent(sid)}&scheduleTrial=1`);
    } catch (e) {
      setNotice(formatAgentApiErrorForUser(e) || "试跑发起失败。");
    } finally {
      setBusy(false);
    }
  }, [
    title,
    prompt,
    platformAgent,
    createGroupIdQ,
    formGroupId,
    taskEnabled,
    scheduleKind,
    timeHhmm,
    selectedWeekdays,
    selectedMonthDays,
    runOnceDate,
    hasValidNextExecution,
    router,
    editId,
  ]);

  const saveEditedSchedule = useCallback(async () => {
    if (!editId) {
      return;
    }
    if (!title.trim() || !prompt.trim()) {
      setNotice("请先补全标题和提示词。");
      return;
    }
    if (scheduleKind === "每周" && selectedWeekdays.size === 0) {
      setNotice("请选择星期。");
      return;
    }
    if (scheduleKind === "每月" && selectedMonthDays.size === 0) {
      setNotice("请选择日期。");
      return;
    }
    if (scheduleKind === "不重复" && !runOnceDate.trim()) {
      setNotice("请选择执行日期。");
      return;
    }
    if (taskEnabled && !hasValidNextExecution) {
      setNotice("无法排程，请检查周期、星期/日期或时间。");
      return;
    }
    const pushErr = validateResultPushBlocks(resultPushRef.current);
    if (pushErr) {
      setNotice(pushErr);
      return;
    }
    if (!platformAgent) {
      setNotice("请登录后保存。");
      return;
    }
    setBusy(true);
    setNotice("");
    try {
      saveScheduleCreateDraft({
        title: title.trim(),
        prompt: prompt.trim(),
        taskEnabled,
        scheduleKind,
        timeHhmm,
        selectedWeekdayValues: Array.from(selectedWeekdays).sort((a, b) => a - b),
        selectedMonthDayValues: Array.from(selectedMonthDays).sort((a, b) => a - b),
        runOnceDate,
        groupId: formGroupId,
        resultPushBlocks: resultPushRef.current,
        createGroupIdFromUrl: createGroupIdQ,
        editingTaskId: editId,
      });
      await saveScheduleTasksWithDraft(platformAgent.withFreshToken, { requireEnabledNext: true });
      // 与列表/水合共用 `tasks`：保存后必须刷新，否则再次进入编辑会从旧的 tasks.find 装填表单
      await refreshGroupsAndTasks();
      resetCreateFormToDefaults();
      router.push("/schedules");
      setToastMessage("定时任务已更新");
      setToastVariant("default");
    } catch (e) {
      setNotice(formatAgentApiErrorForUser(e) || "保存失败");
    } finally {
      setBusy(false);
    }
  }, [
    editId,
    title,
    prompt,
    platformAgent,
    createGroupIdQ,
    formGroupId,
    taskEnabled,
    scheduleKind,
    timeHhmm,
    selectedWeekdays,
    selectedMonthDays,
    runOnceDate,
    hasValidNextExecution,
    router,
    resetCreateFormToDefaults,
    refreshGroupsAndTasks,
  ]);

  const onEditSaveButtonClick = useCallback(() => {
    if (busy || tryRunSubmitBlocked) return;
    if (!editId) return;
    const baseline = editPromptBaselineRef.current;
    if (baseline !== null && prompt.trim() !== baseline) {
      setEditPromptChangedSaveGateOpen(true);
      return;
    }
    void saveEditedSchedule();
  }, [editId, prompt, busy, tryRunSubmitBlocked, saveEditedSchedule]);

  const onToggleEnabled = useCallback(
    async (t: UserScheduledTaskItemApi, enabled: boolean) => {
      if (!platformAgent) return;
      try {
        await platformAgent.withFreshToken(async (token) => {
          await patchUserScheduledTask(token, t.id, { enabled });
        });
        await refreshGroupsAndTasks();
      } catch (e) {
        setError(formatAgentApiErrorForUser(e) || "更新失败");
      }
    },
    [platformAgent, refreshGroupsAndTasks],
  );

  const onDeleteTask = useCallback(
    async (t: UserScheduledTaskItemApi) => {
      if (!platformAgent) return;
      if (!window.confirm("确定删除该定时任务？")) return;
      try {
        await platformAgent.withFreshToken(async (token) => {
          await deleteUserScheduledTask(token, t.id);
        });
        await refreshGroupsAndTasks();
      } catch (e) {
        setError(formatAgentApiErrorForUser(e) || "删除失败");
      }
    },
    [platformAgent, refreshGroupsAndTasks],
  );

  const onRunNow = useCallback(
    async (t: UserScheduledTaskItemApi) => {
      if (!platformAgent) return;
      try {
        await platformAgent.withFreshToken(async (token) => {
          await runUserScheduledTaskNow(token, t.id);
        });
        setNotice("已加入执行队列。");
        if (primaryTab === "运行记录") void refreshRuns();
      } catch (e) {
        setError(formatAgentApiErrorForUser(e) || "触发失败");
      }
    },
    [platformAgent, primaryTab, refreshRuns],
  );

  if (createMode) {
    return (
      <MoreDataShell currentPath="/schedules">
        <div className="px-8 pb-12 pt-8">
          <div className="mx-auto max-w-[760px]">
            {notice ? <p className="mb-6 text-sm text-[#52525b]">{notice}</p> : null}
            <button
              type="button"
              onClick={() => {
                resetCreateFormToDefaults();
                router.push("/schedules");
              }}
              className="inline-flex items-center gap-2 text-sm text-[#52525b]"
            >
              <ChevronLeft className="h-4 w-4" />
              返回
            </button>
            <h1 className="mt-4 text-[18px] font-semibold text-[#18181b]">
              {editId ? "编辑定时任务" : "创建定时任务"}
            </h1>
            <p className="mt-2 text-sm text-[#71717a]">
              {editId
                ? "与新建相同的配置项；试跑后保存将更新本条任务。"
                : "定时任务将按设定频率执行，请留意积分消耗"}
            </p>

            <div className="mt-8 space-y-8">
              <Card className="border-[#e5e7eb] bg-[#fafafa]">
                <CardContent className="flex items-center justify-between px-4 py-4">
                  <div>
                    <div className="font-medium text-[#18181b]">任务启用</div>
                    <div className="mt-2 text-sm text-[#a1a1aa]">关闭后，任务将不会按调度执行</div>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={taskEnabled}
                    onClick={() => setTaskEnabled((v) => !v)}
                    className={cn(
                      "flex h-7 w-12 items-center rounded-full px-0.5 transition-colors",
                      taskEnabled ? "bg-[#18181b]" : "bg-[#e5e7eb]",
                    )}
                  >
                    <span
                      className={cn(
                        "block h-5 w-5 rounded-full bg-white shadow transition-transform",
                        taskEnabled ? "translate-x-5" : "translate-x-0",
                      )}
                    />
                  </button>
                </CardContent>
              </Card>

              <div className="space-y-6">
                <Field label="标题" required>
                  <Input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="请输入定时任务标题"
                    className="h-12 rounded-[12px] border-[#e5e7eb]"
                  />
                </Field>
                <Field label="分组">
                  <select
                    value={formGroupId ?? ""}
                    onChange={(e) => setFormGroupId(e.target.value || null)}
                    className="h-12 w-full rounded-[12px] border border-[#e5e7eb] bg-white px-3 text-sm text-[#18181b]"
                  >
                    <option value="">默认</option>
                    {groups.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1.5 text-xs text-[#a1a1aa]">可在主列表通过分组名筛选；新分组在列表左侧添加。</p>
                </Field>
                <Field label="提示词" required>
                  <Textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="需要查看 Keepa 数据？尝试 @Keepa-亚马逊-价格历史。"
                    className="min-h-[160px] rounded-[12px] border-[#e5e7eb] px-4 py-4"
                  />
                </Field>
                <Field label="执行时间">
                  <div
                    className={cn(
                      "grid grid-cols-1 gap-3",
                      scheduleKind === "每天" ? "md:grid-cols-2" : "md:grid-cols-3",
                    )}
                  >
                    <select
                      value={scheduleKind}
                      onChange={(e) => {
                        const v = e.target.value as ScheduleKind;
                        setScheduleKind(v);
                        if (v !== "每周") setSelectedWeekdays(new Set());
                        if (v !== "每月") setSelectedMonthDays(new Set());
                        if (v === "不重复") {
                          setRunOnceDate((prev) => (prev.trim() ? prev : runOnceDateYmdImpliedToday()));
                        } else {
                          setRunOnceDate("");
                        }
                      }}
                      className="h-12 w-full rounded-[12px] border border-[#e5e7eb] bg-white px-3 text-sm text-[#18181b]"
                    >
                      {SCHEDULE_KINDS.map((k) => (
                        <option key={k} value={k}>
                          {k}
                        </option>
                      ))}
                    </select>

                    {scheduleKind === "不重复" ? (
                      <input
                        type="date"
                        value={runOnceDate}
                        onChange={(e) => setRunOnceDate(e.target.value)}
                        className="h-12 w-full min-w-0 rounded-[12px] border border-[#e5e7eb] bg-white px-3 text-sm text-[#18181b] [color-scheme:light]"
                      />
                    ) : null}
                    {scheduleKind === "每周" ? (
                      <Popover>
                        <PopoverTrigger asChild>
                          <button
                            type="button"
                            className="flex h-12 w-full items-center justify-between gap-2 rounded-[12px] border border-[#e5e7eb] bg-white px-3 text-left text-sm text-[#18181b] transition hover:border-[#d4d4d4]"
                          >
                            <span className={cn("truncate", selectedWeekdays.size === 0 && "text-[#9ca3af]")}>
                              {weekdayButtonLabel(selectedWeekdays)}
                            </span>
                            <ChevronDown className="h-4 w-4 shrink-0 text-[#71717a]" />
                          </button>
                        </PopoverTrigger>
                        <PopoverContent
                          className="w-[min(100vw-2rem,16rem)] p-0"
                          align="start"
                          onOpenAutoFocus={(ev) => ev.preventDefault()}
                        >
                          <div className="max-h-64 space-y-0.5 overflow-y-auto p-2">
                            {WEEKDAY_OPTIONS.map((w) => (
                              <label
                                key={w.value}
                                className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-[#f4f4f5]"
                              >
                                <input
                                  type="checkbox"
                                  className="h-4 w-4 rounded border-[#cbd5e1]"
                                  checked={selectedWeekdays.has(w.value)}
                                  onChange={() => {
                                    setSelectedWeekdays((prev) => {
                                      const n = new Set(prev);
                                      if (n.has(w.value)) n.delete(w.value);
                                      else n.add(w.value);
                                      return n;
                                    });
                                  }}
                                />
                                {w.label}
                              </label>
                            ))}
                          </div>
                        </PopoverContent>
                      </Popover>
                    ) : null}
                    {scheduleKind === "每月" ? (
                      <Popover>
                        <PopoverTrigger asChild>
                          <button
                            type="button"
                            className="flex h-12 w-full items-center justify-between gap-2 rounded-[12px] border border-[#e5e7eb] bg-white px-3 text-left text-sm text-[#18181b] transition hover:border-[#d4d4d4]"
                          >
                            <span className={cn("truncate", selectedMonthDays.size === 0 && "text-[#9ca3af]")}>
                              {monthDayButtonLabel(selectedMonthDays)}
                            </span>
                            <ChevronDown className="h-4 w-4 shrink-0 text-[#71717a]" />
                          </button>
                        </PopoverTrigger>
                        <PopoverContent
                          className="w-[min(100vw-2rem,18rem)] p-0"
                          align="start"
                          onOpenAutoFocus={(ev) => ev.preventDefault()}
                        >
                          <div className="max-h-64 space-y-1 overflow-y-auto p-2">
                            <div className="grid grid-cols-4 gap-1 sm:grid-cols-5">
                              {MONTH_DAY_OPTIONS.map((d) => (
                                <label
                                  key={d}
                                  className="flex cursor-pointer items-center gap-1.5 rounded-md border border-transparent px-1 py-1.5 text-xs hover:bg-[#f4f4f5] sm:text-sm"
                                >
                                  <input
                                    type="checkbox"
                                    className="h-3.5 w-3.5 shrink-0 rounded border-[#cbd5e1] sm:h-4 sm:w-4"
                                    checked={selectedMonthDays.has(d)}
                                    onChange={() => {
                                      setSelectedMonthDays((prev) => {
                                        const n = new Set(prev);
                                        if (n.has(d)) n.delete(d);
                                        else n.add(d);
                                        return n;
                                      });
                                    }}
                                  />
                                  <span className="tabular-nums">{d}号</span>
                                </label>
                              ))}
                            </div>
                          </div>
                        </PopoverContent>
                      </Popover>
                    ) : null}

                    <select
                      value={timeHhmm}
                      onChange={(e) => setTimeHhmm(e.target.value)}
                      className="h-12 w-full rounded-[12px] border border-[#e5e7eb] bg-white px-3 text-sm text-[#18181b]"
                    >
                      {HALF_HOUR_TIME_OPTIONS.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </div>

                  {scheduleKind === "不重复" && runOnceDate.trim() ? (
                    <p className="mt-2 text-sm text-[#a1a1aa]">
                      仅执行一次: {runOnceDate} {toHhmm(timeHhmm)}
                    </p>
                  ) : null}
                  {scheduleKind === "不重复" && !runOnceDate ? (
                    <p className="mt-2 text-sm text-[#a1a1aa]">请选择执行日期</p>
                  ) : null}
                  {scheduleKind === "每周" && selectedWeekdays.size === 0 ? (
                    <p className="mt-2 text-sm text-[#a1a1aa]">请选择星期</p>
                  ) : scheduleKind === "每月" && selectedMonthDays.size === 0 ? (
                    <p className="mt-2 text-sm text-[#a1a1aa]">请选择日期</p>
                  ) : null}
                  {tryRunSubmitBlocked ? (
                    <p className="mt-2 text-sm text-red-600" role="alert">
                      无法排程，请检查周期、星期/日期或时间。
                    </p>
                  ) : null}
                </Field>
                <Field label="结果推送">
                  <ScheduleResultPushSection
                    key={resultPushFormKey}
                    defaultBlocks={resultPushFormKey > 0 ? resultPushRef.current : undefined}
                    onConfigSnapshot={({ blocks }) => {
                      resultPushRef.current = blocks;
                    }}
                    onNotify={setNotice}
                  />
                </Field>
              </div>
            </div>
          </div>
        </div>
        <div className="sticky bottom-0 z-20 border-t border-[#e5e7eb] bg-white px-8 py-4">
          <div className="mx-auto flex max-w-[760px] flex-wrap items-center justify-end gap-3">
            {editId ? (
              <span className="mr-auto min-w-0 text-xs text-[#a1a1aa]">保存后将在列表中显示最新配置</span>
            ) : (
              <span className="mr-auto min-w-0 text-xs text-[#a1a1aa]">试运行同样会消耗运行次数</span>
            )}
            <div className="relative z-10 flex flex-shrink-0 items-center justify-end gap-3">
              <Button
                type="button"
                variant="outline"
                className="shrink-0 rounded-[10px]"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (busy) return;
                  resetCreateFormToDefaults();
                  router.push("/schedules");
                }}
                disabled={busy}
              >
                取消
              </Button>
              {editId ? (
                <Popover open={editPromptChangedSaveGateOpen} onOpenChange={setEditPromptChangedSaveGateOpen}>
                  <PopoverAnchor asChild>
                    <span className="inline-flex">
                      <Button
                        type="button"
                        className="shrink-0 rounded-[10px] bg-[#18181b] text-white hover:bg-[#27272a]"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          onEditSaveButtonClick();
                        }}
                        disabled={busy || tryRunSubmitBlocked}
                      >
                        保存
                      </Button>
                    </span>
                  </PopoverAnchor>
                  <PopoverContent
                    side="top"
                    align="end"
                    sideOffset={8}
                    className="w-[min(calc(100vw-2rem),300px)] p-4"
                    onCloseAutoFocus={(e) => e.preventDefault()}
                  >
                    <p className="text-sm font-semibold text-[#18181b]">提示词已修改</p>
                    <p className="mt-2 text-xs leading-relaxed text-[#71717a]">
                      修改提示词后需要重新试运行才能保存
                    </p>
                    <div className="mt-4 flex justify-end gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="rounded-[10px]"
                        onClick={() => setEditPromptChangedSaveGateOpen(false)}
                      >
                        取消
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        className="rounded-[10px] bg-[#18181b] text-white hover:bg-[#27272a]"
                        disabled={busy}
                        onClick={() => {
                          setEditPromptChangedSaveGateOpen(false);
                          void startScheduleTrial();
                        }}
                      >
                        试运行
                      </Button>
                    </div>
                  </PopoverContent>
                </Popover>
              ) : (
                <Button
                  type="button"
                  className="shrink-0 rounded-[10px] bg-[#18181b] text-white hover:bg-[#27272a]"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (busy || tryRunSubmitBlocked) return;
                    void startScheduleTrial();
                  }}
                  disabled={busy || tryRunSubmitBlocked}
                >
                  试运行
                </Button>
              )}
            </div>
          </div>
        </div>
      </MoreDataShell>
    );
  }

  if (!isPlatformBackendEnabled() || !platformAgent) {
    return (
      <MoreDataShell currentPath="/schedules">
        <div className="px-8 py-12 text-sm text-[#64748b]">当前未启用平台后端，无法管理定时任务。</div>
      </MoreDataShell>
    );
  }

  const searchPlaceholder = primaryTab === "已定时" ? "搜索定时任务" : "搜索运行记录";
  const statusOptions = primaryTab === "已定时" ? WORKFLOW_STATUS_OPTIONS : RUN_STATUS_OPTIONS;
  const currentStatusFilter = primaryTab === "已定时" ? workflowStatusFilter : runStatusFilter;

  return (
    <MoreDataShell currentPath="/schedules">
      <AutoToast
        message={toastMessage}
        variant={toastVariant}
        onDismiss={() => {
          setToastMessage(null);
          setToastVariant("default");
        }}
        durationMs={2200}
      />
      <div className="px-8 pb-12 pt-8">
        <div className="mx-auto max-w-[1180px]">
          {error ? (
            <div className="mb-4 text-sm text-red-600" role="alert">
              {error}
            </div>
          ) : null}
          <div>
            {/* 第一行：与目标稿一致 — 仅 标题 | 搜索 + 创建（同一行、左右分栏） */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h1 className="shrink-0 font-[family:var(--font-jakarta)] text-[24px] font-semibold text-[#18181b]">定时任务</h1>
              <div className="flex w-full min-w-0 flex-wrap items-center justify-end gap-2 sm:w-auto sm:justify-end">
                <div className="relative w-full min-w-0 sm:w-[220px]">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#71717a]" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder={searchPlaceholder}
                    className="h-9 w-full rounded-[10px] border-[#e5e7eb] pl-9"
                  />
                </div>
                <Button
                  type="button"
                  className="h-9 shrink-0 rounded-[10px] bg-[#18181b] px-3 text-white hover:bg-[#27272a] sm:px-4"
                  onClick={() => {
                    const g = createGroupIdForChip();
                    const q = g ? `&groupId=${encodeURIComponent(g)}` : "";
                    router.push(`/schedules?create=1${q}`);
                  }}
                >
                  <span className="font-medium">+</span> 创建定时任务
                </Button>
              </div>
            </div>

            {/* 第二行：主 Tab，纯文字下划线 */}
            <Tabs
              value={primaryTab}
              onValueChange={(value) => {
                setPrimaryTab(value as (typeof PRIMARY_TABS)[number]);
                setSearch("");
                setFilterOpen(false);
              }}
              className="mt-4 w-full"
            >
              <TabsList className="h-auto w-full justify-start gap-8 bg-transparent p-0 sm:gap-10">
                {PRIMARY_TABS.map((tab) => (
                  <TabsTrigger
                    key={tab}
                    value={tab}
                    className="rounded-none border-b-2 border-transparent bg-transparent px-0 pb-2.5 pt-0 text-[15px] text-[#8a97aa] data-[state=active]:border-[#18181b] data-[state=active]:bg-transparent data-[state=active]:text-[#18181b] data-[state=active]:shadow-none"
                  >
                    {tab}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>

            {/* 第三行：已定时 = 左分组胶囊 + 右（状态/批量/视图，与目标稿第二幅图对齐）；运行记录 = 仅右侧筛选区 */}
            {primaryTab === "已定时" ? (
              <div className="mt-4 flex min-h-[40px] flex-wrap items-center justify-between gap-x-4 gap-y-3 border-b border-[#f0f0f0] pb-4">
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                  {chipOptions.map((chip) => (
                    <button
                      key={chip}
                      type="button"
                      onClick={() => setActiveChip(chip)}
                      className={cn(
                        "inline-flex h-8 items-center rounded-[10px] border px-3.5 text-xs font-medium transition",
                        activeChip === chip
                          ? "border-[#e8e8ec] bg-[#f0f0f0] text-[#18181b] shadow-sm"
                          : "border-[#e5e7eb] bg-white text-[#64748b] hover:border-[#d4d4d4] hover:bg-[#fafafa]",
                      )}
                    >
                      {chip}
                    </button>
                  ))}
                  {addGroupOpen ? (
                    <Input
                      ref={newGroupInputRef}
                      autoFocus
                      value={newGroupName}
                      onChange={(e) => setNewGroupName(e.target.value)}
                      placeholder="请输入分组名称"
                      className="h-8 w-[160px] rounded-[10px] border-[#e5e7eb] text-xs"
                      onBlur={() => {
                        window.setTimeout(() => {
                          if (skipNewGroupBlurRef.current) {
                            skipNewGroupBlurRef.current = false;
                            return;
                          }
                          void commitNewGroup();
                        }, 0);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          skipNewGroupBlurRef.current = true;
                          void commitNewGroup();
                        }
                        if (e.key === "Escape") {
                          e.preventDefault();
                          skipNewGroupBlurRef.current = true;
                          setAddGroupOpen(false);
                          setNewGroupName("");
                        }
                      }}
                    />
                  ) : (
                    <button
                      type="button"
                      aria-label="新建分组"
                      onClick={() => setAddGroupOpen(true)}
                      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-dashed border-[#d4d4d8] bg-[#f7f7f7] text-[#64748b] transition hover:border-[#a1a1aa] hover:bg-[#f0f0f0] hover:text-[#18181b]"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  )}
                </div>
                <div className="flex w-full min-w-0 flex-wrap items-center justify-end gap-2 sm:w-auto sm:shrink-0">
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setFilterOpen((o) => !o)}
                      className="inline-flex h-9 min-w-0 max-w-full items-center gap-1 rounded-[10px] border border-[#e5e7eb] bg-white px-2.5 text-sm text-[#64748b] transition hover:border-[#d4d4d4] sm:px-3"
                    >
                      <span className="truncate">{currentStatusFilter}</span>
                      <ChevronDown className="h-4 w-4 shrink-0" />
                    </button>
                    {filterOpen ? (
                      <div className="absolute right-0 top-10 z-30 min-w-[128px] rounded-[10px] border border-[#e5e7eb] bg-white py-1 shadow-lg">
                        {statusOptions.map((item) => (
                          <button
                            key={item}
                            type="button"
                            onClick={() => {
                              setWorkflowStatusFilter(item as (typeof WORKFLOW_STATUS_OPTIONS)[number]);
                              setFilterOpen(false);
                            }}
                            className="block w-full px-3 py-2 text-left text-sm text-[#475569] hover:bg-[#f8fafc]"
                          >
                            {item}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    className="text-sm text-[#64748b] transition hover:text-[#18181b]"
                    onClick={() => setNotice("请在「运行记录」中使用批量操作。")}
                  >
                    批量操作
                  </button>
                  <div className="flex h-9 shrink-0 items-center gap-0.5 rounded-[10px] border border-[#e5e7eb] bg-white p-0.5">
                    <button
                      type="button"
                      className={cn("rounded-[8px] p-1.5", viewMode === "list" ? "bg-[#f4f4f5] text-[#18181b]" : "text-[#94a3b8]")}
                      onClick={() => setViewMode("list")}
                      aria-label="列表视图"
                    >
                      <List className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      className={cn("rounded-[8px] p-1.5", viewMode === "grid" ? "bg-[#f4f4f5] text-[#18181b]" : "text-[#94a3b8]")}
                      onClick={() => setViewMode("grid")}
                      aria-label="卡片视图"
                    >
                      <LayoutGrid className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-4 flex min-h-[40px] flex-wrap items-center justify-end gap-2 border-b border-[#f0f0f0] pb-4">
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setFilterOpen((o) => !o)}
                    className="inline-flex h-9 items-center gap-1 rounded-[10px] border border-[#e5e7eb] bg-white px-2.5 text-sm text-[#64748b] transition hover:border-[#d4d4d4] sm:px-3"
                  >
                    <span className="truncate">{currentStatusFilter}</span>
                    <ChevronDown className="h-4 w-4 shrink-0" />
                  </button>
                  {filterOpen ? (
                    <div className="absolute right-0 top-10 z-30 min-w-[128px] rounded-[10px] border border-[#e5e7eb] bg-white py-1 shadow-lg">
                      {statusOptions.map((item) => (
                        <button
                          key={item}
                          type="button"
                          onClick={() => {
                            setRunStatusFilter(item as (typeof RUN_STATUS_OPTIONS)[number]);
                            void (async () => {
                              if (!platformAgent) return;
                              setBusy(true);
                              try {
                                const rs = runStatusToApi(item as (typeof RUN_STATUS_OPTIONS)[number]);
                                await platformAgent.withFreshToken(async (token) => {
                                  const r = await fetchAllScheduledTaskRuns(token, { run_status: rs });
                                  setRuns(r);
                                });
                              } catch (e) {
                                setError(formatAgentApiErrorForUser(e) || "加载失败");
                              } finally {
                                setBusy(false);
                              }
                            })();
                            setFilterOpen(false);
                          }}
                          className="block w-full px-3 py-2 text-left text-sm text-[#475569] hover:bg-[#f8fafc]"
                        >
                          {item}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
                <button
                  type="button"
                  className="text-sm text-[#64748b] transition hover:text-[#18181b]"
                  onClick={() => setBulkSelectRuns(true)}
                >
                  批量操作
                </button>
              </div>
            )}
          </div>

          {notice ? <p className="mt-4 text-sm text-[#52525b]">{notice}</p> : null}
          {busy && primaryTab === "已定时" && tasks.length === 0 ? <p className="mt-6 text-sm text-[#71717a]">加载中…</p> : null}
          {busy && primaryTab === "运行记录" && runs.length === 0 ? <p className="mt-6 text-sm text-[#71717a]">加载中…</p> : null}

          {primaryTab === "运行记录" && bulkSelectRuns ? (
            <div className="mt-4 flex flex-wrap items-center gap-3 rounded-[12px] border border-[#e5e7eb] bg-[#fafafa] px-4 py-3 text-sm">
              <span className="text-[#64748b]">已选 {selectedRunIds.size} 个</span>
              <Button type="button" size="sm" variant="secondary" disabled className="rounded-[8px]" onClick={() => {}}>
                删除
              </Button>
              <span className="text-xs text-[#94a3b8]">删除单条请使用记录卡片上的「⋯」菜单。批量删除待支持。</span>
              <button
                type="button"
                className="text-[#64748b] underline underline-offset-2"
                onClick={() => {
                  setBulkSelectRuns(false);
                  setSelectedRunIds(new Set());
                }}
              >
                取消多选
              </button>
            </div>
          ) : null}

          {primaryTab === "已定时" && !busy && displayTasks.length === 0 ? (
            <ScheduleEmptyState
              onCreate={() =>
                router.push(
                  `/schedules?create=1${groupIdForCreate ? `&groupId=${encodeURIComponent(groupIdForCreate)}` : ""}`,
                )
              }
            />
          ) : null}
          {primaryTab === "已定时" && displayTasks.length > 0 ? (
            <div className="mt-8 flex flex-wrap content-start items-start justify-start gap-4">
              {displayTasks.map((t) => (
                <ApiScheduledTaskCard
                  key={t.id}
                  item={t}
                  onToggleEnabled={(en) => void onToggleEnabled(t, en)}
                  onRun={() => void onRunNow(t)}
                  onEdit={() => {
                    const gq = t.group_id ? `&groupId=${encodeURIComponent(t.group_id)}` : "";
                    router.push(`/schedules?create=1&edit=${encodeURIComponent(t.id)}${gq}`);
                  }}
                  onMove={() => {
                    setMoveTask(t);
                    setMoveGroupId(t.group_id ?? "");
                  }}
                  onDelete={() => void onDeleteTask(t)}
                  onOpenRuns={() => {
                    setPrimaryTab("运行记录");
                    setSearch(t.title.slice(0, 16));
                  }}
                />
              ))}
            </div>
          ) : null}

          {primaryTab === "运行记录" && !busy && displayRuns.length === 0 ? (
            <div className="mt-6 flex min-h-[min(360px,calc(100vh-360px))] flex-col items-center justify-center rounded-[16px] border border-[#f0f0f0] bg-white px-4 py-16">
              <div
                className="mb-6 flex h-[88px] w-[88px] items-center justify-center rounded-2xl border-2 border-dashed border-[#e5e7eb] bg-[#fafafa]"
                aria-hidden
              >
                <Box className="h-10 w-10 text-[#d1d1d6]" strokeWidth={1.05} />
              </div>
              <p className="text-[15px] text-[#71717a]">暂无运行记录</p>
            </div>
          ) : null}
          {primaryTab === "运行记录" && displayRuns.length > 0 ? (
            <div className="mt-8 flex flex-col gap-4">
              {displayRuns.map((r) => (
                <ApiRunRecordRow
                  key={r.id}
                  run={r}
                  bulkSelect={bulkSelectRuns}
                  selected={selectedRunIds.has(r.id)}
                  onToggleSelect={() => {
                    setSelectedRunIds((prev) => {
                      const n = new Set(prev);
                      if (n.has(r.id)) n.delete(r.id);
                      else n.add(r.id);
                      return n;
                    });
                  }}
                  onRunRecordsChanged={() => void refreshRuns()}
                  onNotify={(m, v) => {
                    setToastMessage(m);
                    setToastVariant(v ?? "default");
                  }}
                  onApiError={(m) => setError(m)}
                />
              ))}
            </div>
          ) : null}
        </div>
      </div>

      <Dialog open={Boolean(moveTask)} onOpenChange={(o) => !o && setMoveTask(null)}>
        <DialogContent className="max-w-[400px] rounded-[16px]">
          <DialogTitle>移动到分组</DialogTitle>
          <div className="mt-4 space-y-3">
            <select
              value={moveGroupId}
              onChange={(e) => setMoveGroupId(e.target.value as string | "")}
              className="h-11 w-full rounded-[10px] border border-[#e5e7eb] px-3"
            >
              <option value="">默认</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setMoveTask(null)}>
                取消
              </Button>
              <Button
                className="bg-[#18181b] text-white"
                onClick={() => {
                  if (!moveTask || !platformAgent) return;
                  const gid = moveGroupId || null;
                  void (async () => {
                    try {
                      await platformAgent.withFreshToken(async (token) => {
                        await patchUserScheduledTask(token, moveTask.id, { group_id: gid });
                      });
                      setMoveTask(null);
                      await refreshGroupsAndTasks();
                    } catch (e) {
                      setError(formatAgentApiErrorForUser(e) || "移动失败");
                    }
                  })();
                }}
              >
                确定
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </MoreDataShell>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: ReactNode }) {
  return (
    <div>
      <div className="mb-3 text-sm font-medium text-[#52525b]">
        {label}
        {required ? (
          <>
            {" "}
            <RequiredAsterisk />
          </>
        ) : null}
      </div>
      {children}
    </div>
  );
}

function ApiScheduledTaskCard({
  item: t,
  onToggleEnabled,
  onRun,
  onEdit,
  onMove,
  onDelete,
  onOpenRuns,
}: {
  item: UserScheduledTaskItemApi;
  onToggleEnabled: (enabled: boolean) => void;
  onRun: () => void;
  onEdit: () => void;
  onMove: () => void;
  onDelete: () => void;
  onOpenRuns: () => void;
}) {
  const ui = deriveTaskUiStatus(t);
  const ended = ui === "已完结";
  const canToggle = !ended;
  const statusHeader =
    ui === "已完结"
      ? { bar: "bg-slate-100/95", text: "text-slate-600", dot: "bg-slate-400" }
      : ui === "已暂停"
        ? { bar: "bg-amber-50", text: "text-amber-800", dot: "bg-amber-400" }
        : { bar: "bg-emerald-50", text: "text-emerald-800", dot: "bg-emerald-500" };

  return (
    <Card
      className={cn(
        "box-border flex h-[200px] w-full max-w-[290px] shrink-0 flex-col overflow-hidden border border-[#e2e7ef] bg-white p-0",
        "min-[300px]:w-[290px] shadow-[0_1px_3px_rgba(15,23,42,0.07)]",
      )}
    >
      <div
        className={cn(
          "flex shrink-0 items-center justify-between gap-2 border-b border-transparent px-3 py-1.5",
          statusHeader.bar,
        )}
      >
        <div className={cn("min-w-0 flex items-center gap-1.5 text-[11px] font-medium", statusHeader.text)}>
          <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", statusHeader.dot)} />
          {ui}
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={t.enabled}
          disabled={!canToggle}
          onClick={() => canToggle && onToggleEnabled(!t.enabled)}
          className={cn(
            "flex h-5 w-9 shrink-0 items-center rounded-full px-0.5 transition-colors disabled:opacity-40",
            t.enabled && canToggle ? "bg-[#18181b]" : "bg-[#e5e7eb]",
          )}
        >
          <span
            className={cn(
              "block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform",
              t.enabled && canToggle ? "translate-x-4" : "translate-x-0",
            )}
          />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden px-3 pt-1.5">
        <div className="line-clamp-2 break-words text-[14px] font-semibold leading-snug text-[#18181b]">
          {t.title}
        </div>
        <p className="mt-1 line-clamp-2 break-all text-[11px] leading-snug text-[#94a3b8]">
          执行时间：{nextRunLabel(t)}
        </p>
      </div>
      <div className="mt-auto flex shrink-0 items-center justify-end gap-1.5 border-t border-dashed border-[#e5e7eb] px-2.5 py-1.5">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 max-w-full shrink rounded-[8px] border-[#e2e7ef] px-1.5 text-[11px]"
          onClick={onOpenRuns}
        >
          <Clock className="mr-0.5 h-3 w-3 shrink-0" />
          <span className="truncate">运行记录</span>
        </Button>
        <Popover>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-7 w-7 shrink-0 rounded-[8px] border-[#e2e7ef] text-[#64748b]"
              >
                <MoreVertical className="h-3.5 w-3.5" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-44 p-1">
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-[#f4f4f5]"
                onClick={onRun}
              >
                <Play className="h-4 w-4" />
                运行
              </button>
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-[#f4f4f5]"
                onClick={onEdit}
              >
                <Pencil className="h-4 w-4" />
                编辑
              </button>
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-[#f4f4f5]"
                onClick={onMove}
              >
                <ArrowRightLeft className="h-4 w-4" />
                移动到
              </button>
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm text-red-600 hover:bg-red-50"
                onClick={onDelete}
              >
                <Trash2 className="h-4 w-4" />
                删除
              </button>
            </PopoverContent>
          </Popover>
      </div>
    </Card>
  );
}

function ApiRunRecordRow({
  run: r,
  bulkSelect,
  selected,
  onToggleSelect,
  onRunRecordsChanged,
  onNotify,
  onApiError,
}: {
  run: ScheduledTaskRunItemApi;
  bulkSelect: boolean;
  selected: boolean;
  onToggleSelect: () => void;
  onRunRecordsChanged: () => void | Promise<void>;
  onNotify: (message: string, variant?: "default" | "error") => void;
  onApiError: (message: string) => void;
}) {
  const router = useRouter();
  const platformAgent = useOptionalPlatformAgent();
  const [runMenuOpen, setRunMenuOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const st = runStatusDisplay(r.status);
  const finished = formatRunRecordFinishedAtLocal(r.finished_at ?? r.started_at);
  const showDownload = scheduledRunShowsDownloadAllReports(r);
  const taskId = getScheduledRunSkillTaskId(r);
  const sessionId = (r.session_id || "").trim();

  const onDownloadAll = useCallback(async () => {
    if (!taskId) {
      onNotify("无关联任务产物，无法下载", "error");
      return;
    }
    if (!platformAgent) {
      onApiError("请登录后重试。");
      return;
    }
    setDownloading(true);
    try {
      await platformAgent.withFreshToken(async (token) => {
        // 后端统一按规则处理：单文件直下，多文件打包 zip，且过滤所有 *result.txt
        await downloadAuthorizedFile(token, `/api/tasks/${taskId}/download`, `${taskId}.zip`);
        onNotify("已开始下载", "default");
      });
    } catch (e) {
      onApiError(formatAgentApiErrorForUser(e) || "下载失败");
    } finally {
      setDownloading(false);
    }
  }, [onApiError, onNotify, platformAgent, taskId]);

  const onViewProcess = useCallback(() => {
    setRunMenuOpen(false);
    if (!sessionId) {
      onNotify("该记录无关联会话，无法查看对话", "error");
      return;
    }
    if (platformAgent) {
      platformAgent.setActivePlatformSession(sessionId);
    }
    router.push(`/agent?sessionId=${encodeURIComponent(sessionId)}`);
  }, [onNotify, platformAgent, router, sessionId]);

  const onDeleteRun = useCallback(() => {
    if (!window.confirm("确定删除该条运行记录？将同时清理该次执行产生的会话、对话与任务文件。")) {
      return;
    }
    if (!platformAgent) {
      onApiError("请登录后重试。");
      return;
    }
    setRunMenuOpen(false);
    void (async () => {
      try {
        await platformAgent.withFreshToken(async (token) => {
          await deleteScheduledTaskRun(token, r.id);
        });
        onNotify("已删除", "default");
        await onRunRecordsChanged();
      } catch (e) {
        onApiError(formatAgentApiErrorForUser(e) || "删除失败");
      }
    })();
  }, [onApiError, onNotify, onRunRecordsChanged, platformAgent, r.id]);

  const summaryText = (() => {
    const err = (r.error_message || "").trim();
    if (err) return err;
    return (r.prompt_snapshot || "").trim() || "—";
  })();

  return (
    <div
      className={cn(
        "flex gap-3 rounded-[12px] border border-[#e8eaef] bg-white p-4 shadow-sm transition-colors hover:bg-[#fafbfc] sm:gap-4 sm:p-5",
        selected && "border-[#18181b] ring-1 ring-[#18181b] hover:bg-white",
      )}
    >
      {bulkSelect ? (
        <input
          type="checkbox"
          className="mt-1.5 h-4 w-4 shrink-0 rounded border-[#cbd5e1]"
          checked={selected}
          onChange={onToggleSelect}
          aria-label="选择"
        />
      ) : null}
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2.5 pr-1">
            <span
              className={cn("inline-flex w-fit shrink-0 items-center rounded-md px-2.5 py-1 text-xs font-medium", st.className)}
              title={
                (r.error_message && r.error_message.trim()) || (st.text === "运行成功" ? "执行成功" : st.text)
              }
            >
              {st.text}
            </span>
            <div className="min-w-0 flex-1 break-words text-[15px] font-semibold leading-snug text-[#18181b]">
              {r.task_title_snapshot || "定时任务执行"}
            </div>
          </div>
          <div className="inline-flex shrink-0 items-center gap-0.5 pl-1">
            {showDownload ? (
              <button
                type="button"
                disabled={downloading}
                onClick={() => void onDownloadAll()}
                className="inline-flex items-center gap-1.5 text-sm text-[#2563eb] transition hover:text-[#1d4ed8] hover:underline disabled:opacity-50"
              >
                <Download className="h-4 w-4 shrink-0" />
                {downloading ? "准备中…" : "下载所有报告"}
              </button>
            ) : null}
            <Popover open={runMenuOpen} onOpenChange={setRunMenuOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[#64748b] transition hover:bg-[#f0f0f0] hover:text-[#18181b]"
                  aria-label="更多操作"
                >
                  <MoreVertical className="h-5 w-5" />
                </button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-48 p-1" onOpenAutoFocus={(e) => e.preventDefault()}>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm text-[#18181b] hover:bg-[#f4f4f5]"
                  onClick={onViewProcess}
                >
                  <Eye className="h-4 w-4 shrink-0" />
                  查看执行过程
                </button>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm text-red-600 hover:bg-red-50"
                  onClick={onDeleteRun}
                >
                  <Trash2 className="h-4 w-4 shrink-0" />
                  删除
                </button>
              </PopoverContent>
            </Popover>
          </div>
        </div>
        <p className="mt-3 line-clamp-6 text-sm leading-relaxed text-[#64748b] sm:line-clamp-4">{summaryText}</p>
        <p className="mt-3 text-xs text-[#94a3b8]">完成时间：{finished}</p>
      </div>
    </div>
  );
}
