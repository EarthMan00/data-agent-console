"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlarmFilled,
  ArrowRightLeft,
  ChevronDown,
  Download,
  Eye,
  InfoCircle,
  Loader2,
  MoreVertical,
  Pencil,
  Plus,
  PlusThin,
  Power,
  Search,
  Trash2,
  X,
} from "@/components/ui/tabler-icons";

import { AutoToast } from "@/components/auto-toast";
import { EmptyState } from "@/components/empty-state";
import { AliceShell } from "@/components/alice-shell";
import { PageLostState } from "@/components/page-lost-state";
import {
  ScheduleResultPushSection,
  getResultPushValidationError,
  type ResultPushBlock,
  type ResultPushValidationError,
} from "@/components/schedule-result-push";
import { TaskComposer } from "@/components/task-composer";
import { useOptionalPlatformAgent } from "@/components/platform-agent-provider";
import { RequiredAsterisk } from "@/components/required-mark";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { downloadAuthorizedFile, formatAgentApiErrorForUser, parseFastApiDetail } from "@/lib/agent-api/client";
import {
  createUserScheduledTaskGroup,
  deleteUserScheduledTaskGroup,
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
import {
  buildCreatePayloads,
  normalizeScheduleKind,
  toHhmm,
  SCHEDULE_KINDS,
  type ScheduleKind,
} from "@/lib/schedule-payloads";
import { saveScheduleTasksWithDraft } from "@/lib/save-schedule-from-draft";
import { parseComposerPrefillStorageValue } from "@/lib/composer-prefill";
import { AGENT_COMPOSER_PREFILL_STORAGE_KEY } from "@/lib/agent-api/session";
import { getDataSourceItems, getHomeCapabilityItem } from "@/lib/home-capability-items";
import { useDataSourceMenu } from "@/lib/use-data-source-menu";
import {
  persistResultPushBlocksForTask,
  resultPushBlocksForEditingTask,
} from "@/lib/schedule-result-push-storage";
import type {
  ScheduledTaskRunItemApi,
  UserScheduledTaskGroupDto,
  UserScheduledTaskItemApi,
} from "@/lib/agent-api/types";
import { cn } from "@/lib/utils";
import { humanizeTaskErrorMessage } from "@/lib/platform-task-error-copy";

const PRIMARY_TABS = ["已定时", "运行记录"] as const;
const WORKFLOW_STATUS_OPTIONS = ["全部状态", "生效中", "已暂停", "已完结"] as const;
const RUN_STATUS_OPTIONS = ["全部状态", "运行成功", "运行失败", "运行超时"] as const;
const DEFAULT_GROUP_VALUE = "__default__";

function serializeScheduleComposerPrompt(text: string, sourceIds: string[]) {
  const sourceText = sourceIds
    .map((id) => getDataSourceItems().find((item) => item.id === id && item.id !== "scenarios")?.label)
    .filter((label): label is string => Boolean(label))
    .map((label) => `@${label}`)
    .join(" ");
  return `${sourceText ? `${sourceText} ` : ""}${text}`.trim();
}

function sortGroupsByCreatedAsc(groups: UserScheduledTaskGroupDto[]) {
  return groups
    .map((group, index) => ({ group, index }))
    .sort((a, b) => {
      const at = Date.parse(a.group.created_at);
      const bt = Date.parse(b.group.created_at);
      if (Number.isFinite(at) && Number.isFinite(bt) && at !== bt) return at - bt;
      return a.index - b.index;
    })
    .map(({ group }) => group);
}
const SCHEDULE_TITLE_MAX_LENGTH = 50;
const SCHEDULE_PROMPT_MAX_LENGTH = 8000;

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

function sortTasksByCreatedDesc(tasks: UserScheduledTaskItemApi[]) {
  return tasks
    .map((task, index) => ({ task, index }))
    .sort((a, b) => {
      const at = Date.parse(a.task.created_at);
      const bt = Date.parse(b.task.created_at);
      const aValid = Number.isFinite(at);
      const bValid = Number.isFinite(bt);
      if (aValid && bValid && at !== bt) return bt - at;
      if (aValid !== bValid) return aValid ? -1 : 1;
      return a.index - b.index;
    })
    .map(({ task }) => task);
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
    <EmptyState
      message="暂无定时任务"
      action={
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-auto px-1 py-0 text-body font-medium text-foreground hover:bg-transparent hover:text-foreground"
          onClick={onCreate}
        >
          立即创建
        </Button>
      }
    />
  );
}

export function SchedulesWorkspace() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const platformAgent = useOptionalPlatformAgent();
  const {
    groups: scheduleDataSourceGroups,
    items: scheduleDataSourceItems,
    loading: scheduleDataSourceLoading,
    ensureMenuLoaded: ensureScheduleDataSourceMenu,
  } = useDataSourceMenu();

  const [primaryTab, setPrimaryTab] = useState<(typeof PRIMARY_TABS)[number]>("已定时");
  const [activeChip, setActiveChip] = useState("全部");
  const [addGroupOpen, setAddGroupOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupSaving, setNewGroupSaving] = useState(false);
  const [newGroupNameConflict, setNewGroupNameConflict] = useState(false);
  const [deleteGroupConfirmId, setDeleteGroupConfirmId] = useState<string | null>(null);
  const newGroupInputRef = useRef<HTMLInputElement | null>(null);

  const [search, setSearch] = useState("");
  const [searchDialogOpen, setSearchDialogOpen] = useState(false);
  const searchDialogInputRef = useRef<HTMLInputElement | null>(null);
  const [groups, setGroups] = useState<UserScheduledTaskGroupDto[]>([]);
  const [tasks, setTasks] = useState<UserScheduledTaskItemApi[]>([]);
  const [runs, setRuns] = useState<ScheduledTaskRunItemApi[]>([]);
  const newGroupNameTrimmed = newGroupName.trim();
  const newGroupNameReserved = newGroupNameTrimmed === "全部" || newGroupNameTrimmed === "默认";
  const newGroupNameDuplicate = groups.some((g) => (g.name || "").trim() === newGroupNameTrimmed);
  const newGroupCreateDisabled = newGroupSaving || !newGroupNameTrimmed;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");

  const [workflowStatusFilter, setWorkflowStatusFilter] = useState<(typeof WORKFLOW_STATUS_OPTIONS)[number]>("全部状态");
  const [runStatusFilter, setRunStatusFilter] = useState<(typeof RUN_STATUS_OPTIONS)[number]>("全部状态");
  const [notice, setNotice] = useState("");
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastVariant, setToastVariant] = useState<"default" | "error">("default");
  /** 编辑态：提示词已改时点「保存」的拦截说明层 */
  const [editPromptChangedSaveGateOpen, setEditPromptChangedSaveGateOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [moveTask, setMoveTask] = useState<UserScheduledTaskItemApi | null>(null);
  const [moveGroupId, setMoveGroupId] = useState<string | "">("");

  const readSearchParam = useCallback(
    (key: string) => searchParams.get(key),
    [searchParams],
  );
  const createMode = useSyncExternalStore(
    () => () => {},
    () => readSearchParam("create") === "1",
    () => false,
  );
  const createGroupIdQ = useSyncExternalStore(
    () => () => {},
    () => readSearchParam("groupId") || "",
    () => "",
  );
  const editId = useSyncExternalStore(
    () => () => {},
    () => readSearchParam("edit"),
    () => null,
  );

  const [title, setTitle] = useState("");
  const [prompt, setPrompt] = useState("");
  const [scheduleSourceIds, setScheduleSourceIds] = useState<string[]>([]);
  const [scheduleComposerMode, setScheduleComposerMode] = useState<"普通模式" | "深度模式">("深度模式");
  /** 定时任务所在分组，null 为「默认」；与 `UserScheduledTaskItemApi.group_id` 一致 */
  const [formGroupId, setFormGroupId] = useState<string | null>(null);
  const [scheduleKind, setScheduleKind] = useState<ScheduleKind>("每天");
  const [timeHhmm, setTimeHhmm] = useState(() => defaultNearestHalfHourHhmm(HALF_HOUR_TIME_OPTIONS));
  const [selectedWeekdays, setSelectedWeekdays] = useState<Set<number>>(() => new Set());
  const [selectedMonthDays, setSelectedMonthDays] = useState<Set<number>>(() => new Set());
  const [runOnceDate, setRunOnceDate] = useState("");
  const [taskEnabled, setTaskEnabled] = useState(true);
  const [resultPushFormKey, setResultPushFormKey] = useState(0);
  const [resultPushValidationError, setResultPushValidationError] = useState<ResultPushValidationError | null>(null);
  const fromRestore = useRef(false);
  const editFormHydratedForId = useRef<string | null>(null);
  /** 进入编辑时从服务器装填的提示词，用于判断「保存」前是否需先立即运行 */
  const editPromptBaselineRef = useRef<string | null>(null);
  const resultPushRef = useRef<ResultPushBlock[]>([]);

  const applyResultPushBlocks = useCallback((blocks: ResultPushBlock[]) => {
    resultPushRef.current = blocks;
    setResultPushFormKey((k) => k + 1);
  }, []);

  const restoreResultPushForEdit = useCallback(
    (taskId: string, task?: UserScheduledTaskItemApi | null) => {
      const blocks = resultPushBlocksForEditingTask(taskId, task);
      if (blocks.length > 0) {
        applyResultPushBlocks(blocks);
      }
    },
    [applyResultPushBlocks],
  );

  const restoreParam = useSyncExternalStore(
    () => () => {},
    () => readSearchParam("restore") === "1",
    () => false,
  );

  useEffect(() => {
    if (!searchDialogOpen) return;
    const timer = window.setTimeout(() => searchDialogInputRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [searchDialogOpen]);

  /** 带 restore=1 时从 sessionStorage 还原表单。其它进入创建页时若仅保留内存/草稿（例如上次未保存就离开），则恢复为干净默认态。 */
  useEffect(() => {
    if (!createMode) {
      fromRestore.current = false;
      return;
    }
    if (restoreParam) {
      const d = loadScheduleCreateDraft();
      if (d) {
        setTitle(d.title);
        const restoredPrompt = parseComposerPrefillStorageValue(d.prompt);
        setPrompt(restoredPrompt.text);
        setScheduleSourceIds(restoredPrompt.selectedSourceIds);
        setTaskEnabled(d.taskEnabled);
        setScheduleKind(normalizeScheduleKind(String(d.scheduleKind)));
        setTimeHhmm(d.timeHhmm);
        setSelectedWeekdays(new Set(d.selectedWeekdayValues));
        setSelectedMonthDays(new Set(d.selectedMonthDayValues));
        setRunOnceDate(d.runOnceDate);
        setFormGroupId(d.groupId ?? null);
        applyResultPushBlocks(Array.isArray(d.resultPushBlocks) ? d.resultPushBlocks : []);
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
  }, [createMode, restoreParam, createGroupIdQ, router, searchParams, applyResultPushBlocks]);

  /** 放弃/重新进入空新建：清空 memory 与 session 草稿。restore=1 会由上方 effect 还原，不调用此项。 */
  const resetCreateFormToDefaults = useCallback(() => {
    setTitle("");
    setPrompt("");
    setScheduleSourceIds([]);
    setScheduleComposerMode("深度模式");
    setFormGroupId(null);
    setTaskEnabled(true);
    setScheduleKind("每天");
    setTimeHhmm(defaultNearestHalfHourHhmm(HALF_HOUR_TIME_OPTIONS));
    setSelectedWeekdays(new Set());
    setSelectedMonthDays(new Set());
    setRunOnceDate("");
    applyResultPushBlocks([]);
    setResultPushValidationError(null);
    setNotice("");
    editPromptBaselineRef.current = null;
    setEditPromptChangedSaveGateOpen(false);
    setAdvancedOpen(false);
    clearScheduleTrialStorage();
  }, [applyResultPushBlocks]);

  const wasInCreateMode = useRef(false);
  useEffect(() => {
    if (createMode && !wasInCreateMode.current) {
      if (!restoreParam && !searchParams.get("edit")) {
        resetCreateFormToDefaults();
      }
    }
    wasInCreateMode.current = createMode;
  }, [createMode, restoreParam, resetCreateFormToDefaults, searchParams]);

  useEffect(() => {
    if (!createMode || restoreParam || searchParams.get("edit")) return;
    if (typeof sessionStorage === "undefined") return;
    const raw = sessionStorage.getItem(AGENT_COMPOSER_PREFILL_STORAGE_KEY);
    if (!raw) return;

    const prefill = parseComposerPrefillStorageValue(raw);
    if (prefill.text.trim()) {
      setPrompt(prefill.text);
    }
    setScheduleSourceIds(prefill.selectedSourceIds);
    sessionStorage.removeItem(AGENT_COMPOSER_PREFILL_STORAGE_KEY);
  }, [createMode, restoreParam, searchParams]);

  const applyTaskToScheduleForm = useCallback((t: UserScheduledTaskItemApi) => {
    const taskPrompt = parseComposerPrefillStorageValue(t.prompt_text);
    setTitle(t.title);
    setPrompt(taskPrompt.text);
    setScheduleSourceIds(taskPrompt.selectedSourceIds);
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
      setScheduleKind("单次");
      setSelectedWeekdays(new Set());
      setSelectedMonthDays(new Set());
      const ro = t.run_once_date;
      setRunOnceDate(
        typeof ro === "string" && ro.trim() ? ro.trim().slice(0, 10) : runOnceDateYmdImpliedToday(),
      );
    } else {
      setScheduleKind("每天");
      setSelectedWeekdays(new Set());
      setSelectedMonthDays(new Set());
      setRunOnceDate("");
    }
    setTimeHhmm(toHhmm(t.time_hhmm));
    setFormGroupId(t.group_id ?? null);
    editPromptBaselineRef.current = serializeScheduleComposerPrompt(taskPrompt.text, taskPrompt.selectedSourceIds);
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
      restoreResultPushForEdit(editId, fromList);
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
      restoreResultPushForEdit(editId, t);
      editFormHydratedForId.current = editId;
    });
    return () => {
      cancelled = true;
    };
  }, [createMode, editId, tasks, platformAgent, applyTaskToScheduleForm, restoreResultPushForEdit]);

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

  /** 与 `scheduled_task_schedule.initial_next_run` 对齐的首次执行判定（用于本页提示与立即运行前拦截） */
  const scheduleBodiesForNext = useMemo(
    () => buildCreatePayloads("·", "·", null, true, scheduleKind, timeHhmm, selectedWeekdays, selectedMonthDays, runOnceDate),
    [scheduleKind, timeHhmm, selectedWeekdays, selectedMonthDays, runOnceDate],
  );
  const hasValidNextExecution = useMemo(
    () =>
      scheduleBodiesForNext.length > 0 &&
      scheduleBodiesForNext.every((b) => computeNextRunForCreateBody(b) != null),
    [scheduleBodiesForNext],
  );
  const tryRunSubmitBlocked = taskEnabled && !hasValidNextExecution;
  const serializedPrompt = useMemo(
    () => serializeScheduleComposerPrompt(prompt, scheduleSourceIds),
    [prompt, scheduleSourceIds],
  );
  const addScheduleComposerSource = useCallback((capabilityId: string) => {
    const item = getHomeCapabilityItem(capabilityId);
    if (!item || item.id === "scenarios") return;
    setScheduleSourceIds((current) => (current.includes(item.id) ? current : [...current, item.id]));
  }, []);
  const removeScheduleComposerSource = useCallback((capabilityId: string) => {
    setScheduleSourceIds((current) => current.filter((id) => id !== capabilityId));
  }, []);
  const requiredFieldsMissing = !title.trim() || !serializedPrompt.trim();
  const promptTooLong = serializedPrompt.length > SCHEDULE_PROMPT_MAX_LENGTH;
  const formSubmitDisabled = busy || requiredFieldsMissing || tryRunSubmitBlocked || promptTooLong;

  const refreshGroupsAndTasks = useCallback(async () => {
    if (!platformAgent?.auth) return;
    setBusy(true);
    setError("");
    setLoadError("");
    try {
      await platformAgent.withFreshToken(async (token) => {
        const [g, t] = await Promise.all([fetchAllUserScheduledTaskGroups(token), fetchAllUserScheduledTasks(token)]);
        setGroups(sortGroupsByCreatedAsc(g));
        setTasks(t);
      });
    } catch (e) {
      const msg = formatAgentApiErrorForUser(e);
      setError(msg);
      setLoadError(msg);
    } finally {
      setBusy(false);
    }
  }, [platformAgent]);

  const refreshRuns = useCallback(async () => {
    if (!platformAgent?.auth) return;
    setBusy(true);
    setError("");
    setLoadError("");
    try {
      const rs = runStatusToApi(runStatusFilter);
      await platformAgent.withFreshToken(async (token) => {
        const r = await fetchAllScheduledTaskRuns(token, { run_status: rs });
        setRuns(r);
      });
    } catch (e) {
      const msg = formatAgentApiErrorForUser(e);
      setError(msg);
      setLoadError(msg);
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
    if (newGroupSaving) return;
    const name = newGroupNameTrimmed;
    if (!name) {
      setAddGroupOpen(false);
      setNewGroupName("");
      setNewGroupNameConflict(false);
      return;
    }
    if (newGroupNameReserved || newGroupNameDuplicate) {
      setNewGroupNameConflict(true);
      window.requestAnimationFrame(() => newGroupInputRef.current?.focus());
      return;
    }
    if (!platformAgent) return;
    setNewGroupNameConflict(false);
    setNewGroupSaving(true);
    setBusy(true);
    try {
      await platformAgent.withFreshToken(async (token) => {
        const group = await createUserScheduledTaskGroup(token, name);
        setGroups((prev) => sortGroupsByCreatedAsc([...prev.filter((x) => x.id !== group.id), group]));
      });
      setAddGroupOpen(false);
      setNewGroupName("");
      setNewGroupNameConflict(false);
      setActiveChip(name);
      await refreshGroupsAndTasks();
    } catch (e) {
      const msg = e && typeof e === "object" && "body" in e ? parseFastApiDetail((e as { body: unknown }).body) : null;
      setError(msg || formatAgentApiErrorForUser(e) || "创建分组失败");
    } finally {
      setNewGroupSaving(false);
      setBusy(false);
    }
  }, [newGroupNameTrimmed, newGroupNameReserved, newGroupNameDuplicate, newGroupSaving, platformAgent, refreshGroupsAndTasks]);

  const handleDeleteGroup = useCallback(async (group: UserScheduledTaskGroupDto) => {
    if (!platformAgent) return;
    setBusy(true);
    setError("");
    try {
      await platformAgent.withFreshToken(async (token) => {
        await deleteUserScheduledTaskGroup(token, group.id);
      });
      if (activeChip === group.name) setActiveChip("全部");
      setDeleteGroupConfirmId(null);
      await refreshGroupsAndTasks();
    } catch (e) {
      setError(formatAgentApiErrorForUser(e) || "删除分组失败");
    } finally {
      setBusy(false);
    }
  }, [activeChip, platformAgent, refreshGroupsAndTasks]);

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
    const matchedTasks = q
      ? filteredTasks.filter((t) => t.title.toLowerCase().includes(q) || t.prompt_text.toLowerCase().includes(q))
      : filteredTasks;
    return sortTasksByCreatedDesc(matchedTasks);
  }, [filteredTasks, search]);

  const displayRuns = useMemo(
    () => (primaryTab === "运行记录" ? filterRunsBySearch(runs, search) : []),
    [primaryTab, runs, search],
  );
  const showScheduledLoadError = Boolean(loadError && !busy && primaryTab === "已定时" && tasks.length === 0);
  const showRunsLoadError = Boolean(loadError && !busy && primaryTab === "运行记录" && runs.length === 0);

  const startScheduleTrial = useCallback(async () => {
    if (!title.trim() || !serializedPrompt.trim()) {
      setNotice("请先补全标题和提示词。");
      return;
    }
    if (serializedPrompt.length > SCHEDULE_PROMPT_MAX_LENGTH) {
      setNotice(`提示词不能超过 ${SCHEDULE_PROMPT_MAX_LENGTH} 字。`);
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
    if (scheduleKind === "单次" && !runOnceDate.trim()) {
      setNotice("请选择执行日期。");
      return;
    }
    const enabledForSubmit = editId ? taskEnabled : true;
    if (enabledForSubmit && !hasValidNextExecution) {
      setNotice("无法排程，请检查周期、星期/日期或时间。");
      return;
    }
    const pushErr = getResultPushValidationError(resultPushRef.current);
    if (pushErr) {
      setNotice("");
      setResultPushValidationError(pushErr);
      setAdvancedOpen(true);
      return;
    }
    if (!isPlatformBackendEnabled() || !platformAgent) {
      setNotice("立即运行需启用平台并登录。当前无法连接会话服务。");
      return;
    }
    setBusy(true);
    setNotice("");
    try {
      saveScheduleCreateDraft({
        title: title.trim(),
        prompt: serializedPrompt,
        taskEnabled: enabledForSubmit,
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
        setNotice("无法创建立即运行会话，请登录后重试。");
        return;
      }
      /** 首条消息在 agent 立即运行页内发送，避免在定时页阻塞 2–3s 后已进入对话的割裂感 */
      saveScheduleTrialMeta({ v: 1, sessionId: sid, taskId: null, sendKind: "pending" });
      platformAgent.setActivePlatformSession(sid);
      router.push(`/agent?sessionId=${encodeURIComponent(sid)}&scheduleTrial=1`);
    } catch (e) {
      setNotice(formatAgentApiErrorForUser(e) || "立即运行发起失败。");
    } finally {
      setBusy(false);
    }
  }, [
    title,
    serializedPrompt,
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

  const saveNewScheduleOnly = useCallback(async () => {
    if (editId) return;
    if (!title.trim() || !serializedPrompt.trim()) {
      setNotice("请先补全标题和提示词。");
      return;
    }
    if (serializedPrompt.length > SCHEDULE_PROMPT_MAX_LENGTH) {
      setNotice(`提示词不能超过 ${SCHEDULE_PROMPT_MAX_LENGTH} 字。`);
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
    if (scheduleKind === "单次" && !runOnceDate.trim()) {
      setNotice("请选择执行日期。");
      return;
    }
    if (taskEnabled && !hasValidNextExecution) {
      setNotice("无法排程，请检查周期、星期/日期或时间。");
      return;
    }
    const pushErr = getResultPushValidationError(resultPushRef.current);
    if (pushErr) {
      setNotice("");
      setResultPushValidationError(pushErr);
      setAdvancedOpen(true);
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
        prompt: serializedPrompt,
        taskEnabled,
        scheduleKind,
        timeHhmm,
        selectedWeekdayValues: Array.from(selectedWeekdays).sort((a, b) => a - b),
        selectedMonthDayValues: Array.from(selectedMonthDays).sort((a, b) => a - b),
        runOnceDate,
        groupId: formGroupId,
        resultPushBlocks: resultPushRef.current,
        createGroupIdFromUrl: createGroupIdQ,
        editingTaskId: null,
      });
      const saved = await saveScheduleTasksWithDraft(platformAgent.withFreshToken, { requireEnabledNext: true });
      await refreshGroupsAndTasks();
      resetCreateFormToDefaults();
      router.push("/schedules");
      setToastMessage(saved.count > 1 ? `已保存 ${saved.count} 个定时任务` : "定时任务已保存");
      setToastVariant("default");
    } catch (e) {
      setNotice(formatAgentApiErrorForUser(e) || "保存失败");
    } finally {
      setBusy(false);
    }
  }, [
    editId,
    title,
    serializedPrompt,
    taskEnabled,
    scheduleKind,
    timeHhmm,
    selectedWeekdays,
    selectedMonthDays,
    runOnceDate,
    formGroupId,
    createGroupIdQ,
    platformAgent,
    hasValidNextExecution,
    refreshGroupsAndTasks,
    resetCreateFormToDefaults,
    router,
  ]);

  const saveEditedSchedule = useCallback(async () => {
    if (!editId) {
      return;
    }
    if (!title.trim() || !serializedPrompt.trim()) {
      setNotice("请先补全标题和提示词。");
      return;
    }
    if (serializedPrompt.length > SCHEDULE_PROMPT_MAX_LENGTH) {
      setNotice(`提示词不能超过 ${SCHEDULE_PROMPT_MAX_LENGTH} 字。`);
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
    if (scheduleKind === "单次" && !runOnceDate.trim()) {
      setNotice("请选择执行日期。");
      return;
    }
    if (taskEnabled && !hasValidNextExecution) {
      setNotice("无法排程，请检查周期、星期/日期或时间。");
      return;
    }
    const pushErr = getResultPushValidationError(resultPushRef.current);
    if (pushErr) {
      setNotice("");
      setResultPushValidationError(pushErr);
      setAdvancedOpen(true);
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
        prompt: serializedPrompt,
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
      persistResultPushBlocksForTask(editId, resultPushRef.current);
      // 与列表/水合共用 `tasks`：保存后必须刷新，否则再次进入编辑会从旧的 tasks.find 装填表单
      await refreshGroupsAndTasks();
      resetCreateFormToDefaults();
      router.push("/schedules");
      setToastMessage("定时任务已更新");
      setToastVariant("default");
    } catch (e) {
      persistResultPushBlocksForTask(editId, resultPushRef.current);
      setNotice(formatAgentApiErrorForUser(e) || "保存失败");
    } finally {
      setBusy(false);
    }
  }, [
    editId,
    title,
    serializedPrompt,
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
    if (formSubmitDisabled) return;
    if (!editId) return;
    const baseline = editPromptBaselineRef.current;
    if (baseline !== null && serializedPrompt !== baseline) {
      setEditPromptChangedSaveGateOpen(true);
      return;
    }
    void saveEditedSchedule();
  }, [editId, serializedPrompt, formSubmitDisabled, saveEditedSchedule]);

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

  const scheduleFormDialog = createMode ? (
    <Dialog
      open={createMode}
      onOpenChange={(open) => {
        if (open) return;
        resetCreateFormToDefaults();
        router.push("/schedules");
      }}
    >
      <DialogContent
        className="flex max-h-schedule-dialog max-w-lg flex-col overflow-hidden rounded-panel border-transparent p-0 shadow-popover-strong [&>button]:right-5 [&>button]:top-5"
        overlayClassName="bg-mask-bg-strong backdrop-blur-soft"
      >
        <div className="shrink-0 bg-bg-surface px-6 pb-3 pt-5">
          <DialogTitle className="text-lg font-medium leading-7 text-foreground">
            {editId ? "编辑定时任务" : "创建定时任务"}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {editId ? "编辑定时任务配置" : "创建新的定时任务"}
          </DialogDescription>
        </div>
        <div className="hide-scrollbar-y min-h-0 flex-1 overflow-y-auto px-6 pb-3">
            {notice ? (
              <div
                className="mt-3 rounded-control bg-danger-bg px-3 py-2 text-sm font-medium leading-5 text-danger"
                role="alert"
              >
                {notice}
              </div>
            ) : null}

            <div className="mt-4 space-y-4">
                <Field label="标题" required>
                  <div className="relative">
                    <Input
                      value={title}
                      maxLength={SCHEDULE_TITLE_MAX_LENGTH}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="请输入任务名称"
                      className="h-10 rounded-control border-transparent bg-fill-hover px-3 pr-14 text-sm text-foreground placeholder:text-text-disabled focus-visible:ring-0"
                    />
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-text-tertiary">
                      {title.length}/{SCHEDULE_TITLE_MAX_LENGTH}
                    </span>
                  </div>
                </Field>
                <Field label="提示词" required>
                  <div className="relative">
                    <TaskComposer
                      key={editId ?? "create"}
                      value={prompt}
                      onValueChange={setPrompt}
                      placeholder="需要分析亚马逊的流量来源？试试 @Sif-亚马逊-流量来源分析。"
                      mode={scheduleComposerMode}
                      onModeChange={setScheduleComposerMode}
                      selectedSourceIds={scheduleSourceIds}
                      dataSourceGroups={scheduleDataSourceGroups}
                      dataSourceItems={scheduleDataSourceItems}
                      onDataSourceMenuRequest={ensureScheduleDataSourceMenu}
                      dataSourceLoading={scheduleDataSourceLoading}
                      onToolSelect={addScheduleComposerSource}
                      onSourceRemove={removeScheduleComposerSource}
                      onFilesSelected={() => {}}
                      showAttachmentButton={false}
                      onSubmit={() => undefined}
                      showSubmitButton={false}
                      submitOnEnter={false}
                      visualStyle="heroMinimal"
                      containerClassName="relative z-30 w-full rounded-control border border-transparent bg-fill-hover shadow-none"
                      textareaClassName="min-h-composer max-h-composer-compact min-w-0 flex-1 overflow-y-auto whitespace-pre-wrap break-words bg-transparent px-1 py-2 pr-2 text-body font-normal leading-6 text-foreground caret-foreground outline-none scrollbar-thin scrollbar-thumb-transparent hover:scrollbar-thumb-zinc-300"
                      placeholderClassName="left-1 top-2 text-body leading-6 text-text-tertiary"
                      sendButtonClassName={cn(
                        "h-8 w-8 min-w-0 rounded-full border border-transparent p-0 text-primary-foreground shadow-none transition",
                        serializedPrompt ? "bg-primary hover:bg-link-hover" : "bg-fill-active hover:bg-fill-active",
                      )}
                    />
                    <span className="pointer-events-none absolute bottom-3 right-3 text-xs text-text-tertiary">
                      {serializedPrompt.length}/{SCHEDULE_PROMPT_MAX_LENGTH}
                    </span>
                  </div>
                </Field>
                <Field label="执行方式" required>
                  <div
                    className={cn(
                      "grid grid-cols-1 gap-2.5 sm:grid-cols-3",
                      scheduleKind === "每天" && "sm:grid-cols-2",
                    )}
                  >
                    <Select
                      value={scheduleKind}
                      onValueChange={(value) => {
                        const v = value as ScheduleKind;
                        setScheduleKind(v);
                        if (v !== "每周") setSelectedWeekdays(new Set());
                        if (v !== "每月") setSelectedMonthDays(new Set());
                        if (v === "单次") {
                          setRunOnceDate((prev) => (prev.trim() ? prev : runOnceDateYmdImpliedToday()));
                        } else {
                          setRunOnceDate("");
                        }
                      }}
                    >
                      <SelectTrigger className="h-10 w-full rounded-control border-transparent bg-fill-hover px-3 text-sm text-foreground focus-visible:ring-0">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {SCHEDULE_KINDS.map((k) => (
                            <SelectItem key={k} value={k}>
                              {k}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>

                    {scheduleKind === "单次" ? (
                      <input
                        type="date"
                        value={runOnceDate}
                        onChange={(e) => setRunOnceDate(e.target.value)}
                        className="color-scheme-light h-10 w-full min-w-0 rounded-control border border-transparent bg-fill-hover px-3 text-sm text-foreground outline-none"
                      />
                    ) : null}
                    {scheduleKind === "每周" ? (
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            type="button"
                            variant="outline"
                            className="h-10 w-full justify-between rounded-control border-transparent bg-fill-hover px-3 text-left text-sm font-normal text-foreground hover:bg-bg-subtle"
                          >
                            <span className={cn("truncate", selectedWeekdays.size === 0 && "text-text-disabled")}>
                              {weekdayButtonLabel(selectedWeekdays)}
                            </span>
                            <ChevronDown className="h-4 w-4 shrink-0 text-text-tertiary" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent
                          className="w-responsive-popover-sm p-0"
                          align="start"
                          onOpenAutoFocus={(ev) => ev.preventDefault()}
                        >
                          <div className="max-h-64 space-y-0.5 overflow-y-auto p-2">
                            {WEEKDAY_OPTIONS.map((w) => (
                              <label
                                key={w.value}
                                className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-fill-hover"
                              >
                                <Checkbox
                                  checked={selectedWeekdays.has(w.value)}
                                  onCheckedChange={() => {
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
                      <Select
                        value={
                          selectedMonthDays.size > 0
                            ? String(Array.from(selectedMonthDays).sort((a, b) => a - b)[0])
                            : undefined
                        }
                        onValueChange={(value) => {
                          const next = Number.parseInt(value, 10);
                          setSelectedMonthDays(Number.isInteger(next) && next >= 1 && next <= 31 ? new Set([next]) : new Set());
                        }}
                      >
                            <SelectTrigger className="h-10 w-full rounded-control border-transparent bg-fill-hover px-3 text-sm text-foreground focus-visible:ring-0">
                              <SelectValue placeholder="选择日期" />
                            </SelectTrigger>
                            <SelectContent className="max-h-64">
                              <SelectGroup>
                                {MONTH_DAY_OPTIONS.map((d) => (
                                  <SelectItem key={d} value={String(d)}>
                                    {d}号
                                  </SelectItem>
                            ))}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                    ) : null}

                    <Select value={timeHhmm} onValueChange={setTimeHhmm}>
                      <SelectTrigger className="h-10 w-full rounded-control border-transparent bg-fill-hover px-3 text-sm text-foreground focus-visible:ring-0">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {HALF_HOUR_TIME_OPTIONS.map((t) => (
                            <SelectItem key={t} value={t}>
                              {t}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </div>

                  {scheduleKind === "单次" && runOnceDate.trim() ? (
                    <p className="mt-2 text-xs text-text-disabled">
                      仅执行一次: {runOnceDate} {toHhmm(timeHhmm)}
                    </p>
                  ) : null}
                  {scheduleKind === "单次" && !runOnceDate && !tryRunSubmitBlocked ? (
                    <p className="mt-2 text-xs text-text-disabled">请选择执行日期</p>
                  ) : null}
                  {scheduleKind === "每周" && selectedWeekdays.size === 0 && !tryRunSubmitBlocked ? (
                    <p className="mt-2 text-xs text-text-disabled">请选择星期</p>
                  ) : scheduleKind === "每月" && selectedMonthDays.size === 0 && !tryRunSubmitBlocked ? (
                    <p className="mt-2 text-xs text-text-disabled">请选择日期</p>
                  ) : null}
                  {tryRunSubmitBlocked ? (
                    <p className="mt-2 text-xs text-danger" role="alert">
                      无法排程，请检查周期、星期/日期或时间。
                    </p>
                  ) : null}
                </Field>
                <div className="space-y-3">
                  <button
                    type="button"
                    className="flex h-10 w-full items-center justify-between rounded-control bg-fill-hover px-3 text-left text-sm font-medium text-foreground transition hover:bg-bg-subtle"
                    aria-expanded={advancedOpen}
                    onClick={() => setAdvancedOpen((open) => !open)}
                  >
                    <span>高级设置</span>
                    <ChevronDown
                      className={cn("h-4 w-4 text-text-tertiary transition-transform", advancedOpen && "rotate-180")}
                    />
                  </button>
                  {advancedOpen ? (
                    <div className="mt-3 space-y-4">
                      <Field label="分组">
                        <Select
                          value={formGroupId ?? DEFAULT_GROUP_VALUE}
                          onValueChange={(value) => setFormGroupId(value === DEFAULT_GROUP_VALUE ? null : value)}
                        >
                          <SelectTrigger className="h-10 w-full rounded-control border-transparent bg-fill-hover px-3 text-sm text-foreground focus-visible:ring-0">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectGroup>
                              <SelectItem value={DEFAULT_GROUP_VALUE}>默认</SelectItem>
                              {groups.map((g) => (
                                <SelectItem key={g.id} value={g.id}>
                                  {g.name}
                                </SelectItem>
                              ))}
                            </SelectGroup>
                          </SelectContent>
                        </Select>
                      </Field>
                      <ScheduleResultPushSection
                        key={resultPushFormKey}
                        headerLabel="结果推送"
                        inlineAddTrigger
                        validationError={resultPushValidationError}
                        defaultBlocks={resultPushRef.current.length > 0 ? resultPushRef.current : undefined}
                        onConfigSnapshot={({ blocks }) => {
                          resultPushRef.current = blocks;
                          setResultPushValidationError((current) =>
                            current && !getResultPushValidationError(blocks) ? null : current,
                          );
                          if (editId) {
                            persistResultPushBlocksForTask(editId, blocks);
                          }
                        }}
                      />
                    </div>
                  ) : null}
                </div>
            </div>
        </div>
        <div className="shrink-0 border-t border-border bg-bg-surface px-6 py-3">
          <div className="flex flex-wrap items-center justify-end gap-3">
            {editId ? <span className="mr-auto" aria-hidden /> : null}
            <div className="relative z-10 flex flex-shrink-0 items-center justify-end gap-3">
              {editId ? (
                <Popover open={editPromptChangedSaveGateOpen} onOpenChange={setEditPromptChangedSaveGateOpen}>
                  <PopoverAnchor asChild>
                    <span className="inline-flex">
                      <Button
                        type="button"
                        className="h-9 shrink-0 rounded-control bg-primary px-4 text-sm text-primary-foreground hover:bg-link-hover"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          onEditSaveButtonClick();
                        }}
                        disabled={formSubmitDisabled}
                      >
                        保存
                      </Button>
                    </span>
                  </PopoverAnchor>
                  <PopoverContent
                    side="top"
                    align="end"
                    sideOffset={8}
                    className="w-responsive-popover-sm p-4"
                    onCloseAutoFocus={(e) => e.preventDefault()}
                  >
                    <p className="text-sm font-semibold text-foreground">提示词已修改</p>
                    <p className="mt-2 text-xs leading-relaxed text-text-tertiary">
                      修改提示词后需要立即运行验证，才能保存
                    </p>
                    <div className="mt-4 flex justify-end gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="rounded-control"
                        onClick={() => setEditPromptChangedSaveGateOpen(false)}
                      >
                        取消
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        className="rounded-control bg-primary text-primary-foreground hover:bg-link-hover"
                        disabled={busy}
                        onClick={() => {
                          setEditPromptChangedSaveGateOpen(false);
                          void startScheduleTrial();
                        }}
                      >
                        立即运行
                      </Button>
                    </div>
                  </PopoverContent>
                </Popover>
              ) : (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-9 shrink-0 rounded-control border-border px-4 text-sm"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (formSubmitDisabled) return;
                      void saveNewScheduleOnly();
                    }}
                    disabled={formSubmitDisabled}
                  >
                    仅保存
                  </Button>
                  <Button
                    type="button"
                    className="h-9 shrink-0 rounded-control bg-primary px-4 text-sm text-primary-foreground hover:bg-link-hover"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (formSubmitDisabled) return;
                      void startScheduleTrial();
                    }}
                    disabled={formSubmitDisabled}
                  >
                    立即运行
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  ) : null;

  if (!isPlatformBackendEnabled() || !platformAgent) {
    return (
      <AliceShell currentPath="/schedules">
        <div className="px-8 py-12 text-sm text-text-tertiary">当前未启用平台后端，无法管理定时任务。</div>
      </AliceShell>
    );
  }

  const searchPlaceholder = primaryTab === "已定时" ? "搜索定时任务" : "搜索运行记录";

  return (
    <AliceShell currentPath="/schedules" showTopHeader={false}>
      <AutoToast
        message={toastMessage}
        variant={toastVariant}
        onDismiss={() => {
          setToastMessage(null);
          setToastVariant("default");
        }}
        durationMs={2200}
      />
      {scheduleFormDialog}
      <div className="px-4 pb-14 pt-5 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-page-content">
          {error && !showScheduledLoadError && !showRunsLoadError ? (
            <div className="mb-4 text-sm text-danger" role="alert">
              {error}
            </div>
          ) : null}
          <div>
            <div className="flex items-center">
              <h1 className="shrink-0 whitespace-nowrap text-title-3 font-semibold leading-8 text-foreground">定时任务</h1>
            </div>

            <div className="mt-5 flex min-h-10 w-full flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <Tabs
                value={primaryTab}
                onValueChange={(value) => {
                  setPrimaryTab(value as (typeof PRIMARY_TABS)[number]);
                  setSearch("");
                }}
                className="min-w-0"
              >
                <TabsList>
                  {PRIMARY_TABS.map((tab) => (
                    <TabsTrigger key={tab} value={tab}>
                      {tab}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
              <div className="flex w-full min-w-0 flex-wrap items-center justify-start gap-2 lg:w-auto lg:shrink-0 lg:flex-nowrap lg:justify-end">
                <div className="relative w-full min-w-0 max-lg:hidden sm:w-sidebar-admin">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder={searchPlaceholder}
                    className="h-9 w-full rounded-control border-border pl-9"
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label={searchPlaceholder}
                  className="hidden h-9 w-9 shrink-0 rounded-control border-border bg-bg-surface text-foreground hover:bg-fill-hover max-lg:inline-flex"
                  onClick={() => setSearchDialogOpen(true)}
                >
                  <Search className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  className="h-9 shrink-0 whitespace-nowrap rounded-control bg-primary px-3 text-primary-foreground hover:bg-link-hover sm:px-4"
                  onClick={() => {
                    const g = createGroupIdForChip();
                    const q = g ? `&groupId=${encodeURIComponent(g)}` : "";
                    setTaskEnabled(true);
                    router.push(`/schedules?create=1${q}`);
                  }}
                >
                  <Plus className="h-4 w-4" /> 创建定时任务
                </Button>
              </div>
            </div>

            {/* 第三行：已定时 = 左分组胶囊 + 右（状态/批量/视图，与目标稿第二幅图对齐）；运行记录 = 仅右侧筛选区 */}
            {primaryTab === "已定时" ? (
              <div className="mt-5 flex min-h-10 w-full max-w-4xl flex-wrap items-center justify-start gap-x-4 gap-y-3 lg:w-fit">
                <div className="flex min-w-0 flex-wrap items-center gap-2 lg:flex-none">
                  <Tabs value={activeChip} onValueChange={setActiveChip}>
                    <TabsList className="flex-wrap justify-start">
                      <TabsTrigger value="全部">全部</TabsTrigger>
                      <TabsTrigger value="默认">默认</TabsTrigger>
                      {groups.map((g) => {
                        const name = g.name || "未命名";
                        return (
                          <div key={g.id} className="group/chip relative inline-flex items-center rounded-md">
                            <TabsTrigger value={name}>
                              <span className="max-w-40 truncate">{name}</span>
                            </TabsTrigger>
                            <Popover
                              open={deleteGroupConfirmId === g.id}
                              onOpenChange={(open) => setDeleteGroupConfirmId(open ? g.id : null)}
                            >
                              <PopoverAnchor asChild>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  aria-label={`删除分组 ${name}`}
                                  aria-expanded={deleteGroupConfirmId === g.id}
                                  className="pointer-events-auto absolute -right-1 -top-1 z-10 h-4 w-4 rounded-full p-0 text-text-tertiary opacity-0 transition hover:bg-transparent hover:text-danger focus-visible:opacity-100 group-hover/chip:opacity-100 data-[state=open]:opacity-100"
                                  onMouseDown={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                  }}
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setDeleteGroupConfirmId(g.id);
                                  }}
                                >
                                  <X className="h-3 w-3" />
                                </Button>
                              </PopoverAnchor>
                              <PopoverContent
                                side="bottom"
                                align="end"
                                sideOffset={8}
                                className="w-responsive-popover-sm rounded-panel border border-border bg-bg-surface p-4 shadow-popover-strong"
                                onCloseAutoFocus={(e) => e.preventDefault()}
                              >
                                <p className="text-body leading-6 text-foreground">
                                  确定删除吗？该分组下的定时任务将移回默认分组
                                </p>
                                <div className="mt-4 flex justify-end gap-2">
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="h-9 rounded-control border-border bg-bg-surface px-4 text-body text-text-tertiary hover:bg-fill-hover"
                                    disabled={busy}
                                    onClick={() => setDeleteGroupConfirmId(null)}
                                  >
                                    取消
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="destructive"
                                    size="sm"
                                    className="h-9 rounded-control bg-danger px-4 text-body text-primary-foreground hover:bg-danger-hover"
                                    disabled={busy}
                                    onClick={() => void handleDeleteGroup(g)}
                                  >
                                    {busy ? "删除中…" : "确定删除"}
                                  </Button>
                                </div>
                              </PopoverContent>
                            </Popover>
                          </div>
                        );
                      })}
                    </TabsList>
                  </Tabs>
                  <Button
                    type="button"
                    variant="outline"
                    size="iconSm"
                    aria-label="新建分组"
                    onClick={() => {
                      setNewGroupName("");
                      setAddGroupOpen(true);
                    }}
                    className="shrink-0"
                  >
                    <PlusThin />
                  </Button>
                </div>
                <div className="flex w-full min-w-0 flex-wrap items-center justify-start gap-2 sm:w-auto sm:shrink-0 sm:flex-nowrap">
                  <Select
                    value={workflowStatusFilter}
                    onValueChange={(value) => setWorkflowStatusFilter(value as (typeof WORKFLOW_STATUS_OPTIONS)[number])}
                  >
                    <SelectTrigger className="h-9 w-36 shrink-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {WORKFLOW_STATUS_OPTIONS.map((item) => (
                          <SelectItem key={item} value={item}>
                            {item}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            ) : (
              <div className="mt-5 flex min-h-10 flex-wrap items-center justify-end gap-2">
                <Select
                  value={runStatusFilter}
                  onValueChange={(value) => {
                    const next = value as (typeof RUN_STATUS_OPTIONS)[number];
                    setRunStatusFilter(next);
                    void (async () => {
                      if (!platformAgent) return;
                      setBusy(true);
                      try {
                        const rs = runStatusToApi(next);
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
                  }}
                >
                  <SelectTrigger className="h-9 w-36 shrink-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {RUN_STATUS_OPTIONS.map((item) => (
                        <SelectItem key={item} value={item}>
                          {item}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {!createMode && notice ? <p className="mt-4 text-sm text-text-secondary">{notice}</p> : null}
          {busy && primaryTab === "已定时" && tasks.length === 0 ? <p className="mt-6 text-sm text-text-tertiary">加载中…</p> : null}
          {busy && primaryTab === "运行记录" && runs.length === 0 ? <p className="mt-6 text-sm text-text-tertiary">加载中…</p> : null}

          {showScheduledLoadError ? (
            <PageLostState onRetry={() => void refreshGroupsAndTasks()} />
          ) : primaryTab === "已定时" && !busy && displayTasks.length === 0 ? (
            <ScheduleEmptyState
              onCreate={() =>
                router.push(
                  `/schedules?create=1${groupIdForCreate ? `&groupId=${encodeURIComponent(groupIdForCreate)}` : ""}`,
                )
              }
            />
          ) : null}
          {primaryTab === "已定时" && displayTasks.length > 0 ? (
            <div className="mt-8 flex flex-wrap content-start items-start justify-start gap-5">
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
                  onDelete={() => onDeleteTask(t)}
                />
              ))}
            </div>
          ) : null}

          {showRunsLoadError ? (
            <PageLostState onRetry={() => void refreshRuns()} />
          ) : primaryTab === "运行记录" && !busy && displayRuns.length === 0 ? (
            <EmptyState message="暂无运行记录" />
          ) : null}
          {primaryTab === "运行记录" && displayRuns.length > 0 ? (
            <div className="mt-8 flex flex-col gap-4">
              {displayRuns.map((r) => (
                <ApiRunRecordRow
                  key={r.id}
                  run={r}
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

      <Dialog open={searchDialogOpen} onOpenChange={setSearchDialogOpen}>
        <DialogContent className="max-w-confirm-dialog rounded-panel p-5">
          <DialogTitle className="text-title-1 font-semibold text-foreground">{searchPlaceholder}</DialogTitle>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
            <Input
              ref={searchDialogInputRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") setSearchDialogOpen(false);
              }}
              placeholder={searchPlaceholder}
              className="h-10 w-full rounded-field border-border pl-9"
            />
          </div>
          <div className="flex justify-end gap-2">
            {search ? (
              <Button
                type="button"
                variant="outline"
                className="h-9 rounded-control border-border px-3 text-body"
                onClick={() => setSearch("")}
              >
                清空
              </Button>
            ) : null}
            <Button
              type="button"
              className="h-9 rounded-control bg-primary px-4 text-body text-primary-foreground hover:bg-link-hover"
              onClick={() => setSearchDialogOpen(false)}
            >
              完成
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={addGroupOpen}
        onOpenChange={(open) => {
          if (newGroupSaving) return;
          setAddGroupOpen(open);
          if (!open) {
            setNewGroupName("");
            setNewGroupNameConflict(false);
          }
        }}
      >
        <DialogContent className="max-w-md rounded-panel p-5">
          <DialogTitle className="text-title-1 font-semibold text-foreground">新建分组</DialogTitle>
          <div>
            <Input
              id="schedule-new-group-name"
              ref={newGroupInputRef}
              autoFocus
              value={newGroupName}
              aria-label="分组名称"
              disabled={newGroupSaving}
              onChange={(e) => {
                setNewGroupName(e.target.value);
                setNewGroupNameConflict(false);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void commitNewGroup();
                }
              }}
              placeholder="请输入分组名称"
              className={`h-10 rounded-field text-body ${
                newGroupNameConflict
                  ? "!border-danger focus-visible:!ring-danger/20"
                  : "border-border"
              }`}
            />
            {newGroupNameConflict ? (
              <p className="mt-2 flex items-center gap-1.5 text-body leading-5 text-danger">
                <InfoCircle className="h-3.5 w-3.5 shrink-0" aria-hidden />
                名称已存在
              </p>
            ) : null}
          </div>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              className="h-9 rounded-control border-border px-3 text-body"
              disabled={newGroupSaving}
              onClick={() => {
                setAddGroupOpen(false);
                setNewGroupName("");
                setNewGroupNameConflict(false);
              }}
            >
              取消
            </Button>
            <Button
              type="button"
              className="h-9 rounded-control bg-primary px-4 text-body text-primary-foreground hover:bg-link-hover"
              disabled={newGroupCreateDisabled}
              onClick={() => void commitNewGroup()}
            >
              {newGroupSaving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  创建中
                </>
              ) : (
                "创建"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(moveTask)} onOpenChange={(o) => !o && setMoveTask(null)}>
        <DialogContent className="max-w-md rounded-panel">
          <DialogTitle>移动到分组</DialogTitle>
          <div className="mt-4 space-y-3">
            <Select
              value={moveGroupId || DEFAULT_GROUP_VALUE}
              onValueChange={(value) => setMoveGroupId(value === DEFAULT_GROUP_VALUE ? "" : value)}
            >
              <SelectTrigger className="h-11 w-full rounded-control border-border">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value={DEFAULT_GROUP_VALUE}>默认</SelectItem>
                  {groups.map((g) => (
                    <SelectItem key={g.id} value={g.id}>
                      {g.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setMoveTask(null)}>
                取消
              </Button>
              <Button
                className="bg-primary text-primary-foreground hover:bg-link-hover"
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
    </AliceShell>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: ReactNode }) {
  return (
    <div>
      <div className="mb-2 text-sm font-medium leading-5 text-foreground">
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
}: {
  item: UserScheduledTaskItemApi;
  onToggleEnabled: (enabled: boolean) => void;
  onRun: () => void;
  onEdit: () => void;
  onMove: () => void;
  onDelete: () => Promise<void>;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const ui = deriveTaskUiStatus(t);
  const ended = ui === "已完结";
  const canToggle = !ended;
  const promptSummary = t.prompt_text.trim() || "暂无任务指引";
  const scheduleLabel = ui === "已暂停" ? "暂停" : nextRunLabel(t);

  return (
    <Card
      className={cn(
        "box-border flex h-schedule-card w-full max-w-card-grid shrink-0 flex-col overflow-hidden rounded-popover border border-border-subtle bg-bg-surface/90 p-0",
        " shadow-none transition-colors duration-200 hover:bg-bg-surface",
      )}
    >
      <div className="min-h-0 flex-1 overflow-hidden px-4 pb-3 pt-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-info text-primary-foreground">
              <AlarmFilled className="h-icon-md w-icon-md" />
            </div>
            <div className="min-w-0 flex-1 line-clamp-1 break-words text-title-1 font-semibold leading-6 text-foreground">
              {t.title}
            </div>
          </div>
          {ended ? (
            <span className="shrink-0 rounded-full bg-fill-hover px-2 py-0.5 text-caption font-medium leading-5 text-text-tertiary">
              {ui}
            </span>
          ) : null}
        </div>
        <p className="mt-3 line-clamp-2 break-words text-body leading-5 text-text-tertiary">
          {promptSummary}
        </p>
      </div>
      <div className="mx-4 h-px bg-border-subtle" />
      <div className="mt-auto flex shrink-0 items-center gap-2 px-4 py-3">
        <div className="min-w-0 flex-1 truncate text-body leading-5 text-text-tertiary">
          {scheduleLabel}
        </div>
        <Button
          type="button"
          variant="subtle"
          size="sm"
          className="h-8 shrink-0 rounded-full bg-fill-hover px-4 text-body font-semibold text-foreground hover:bg-fill-hover"
          onClick={onRun}
        >
          运行
        </Button>
        <DropdownMenu
          open={menuOpen}
          onOpenChange={(open) => {
            setMenuOpen(open);
          }}
        >
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0 rounded-full text-text-disabled hover:bg-fill-hover hover:text-foreground"
              aria-label="更多任务操作"
            >
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuGroup>
              <DropdownMenuItem onSelect={onEdit}>
                <Pencil className="h-4 w-4" />
                编辑
              </DropdownMenuItem>
              {canToggle ? (
                <DropdownMenuItem onSelect={() => onToggleEnabled(!t.enabled)}>
                  <Power className="h-4 w-4" />
                  {t.enabled ? "暂停" : "启用"}
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuItem onSelect={onMove}>
                <ArrowRightLeft className="h-4 w-4" />
                移动到
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-danger focus:bg-danger-bg focus:text-danger"
                onSelect={(event) => {
                  event.preventDefault();
                  setMenuOpen(false);
                  window.setTimeout(() => setDeleteOpen(true), 0);
                }}
              >
                <Trash2 className="h-4 w-4" />
                删除
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
          <DialogContent
            hideClose
            className="max-w-sm rounded-panel p-5"
            aria-describedby={undefined}
          >
            <DialogTitle className="sr-only">删除定时任务</DialogTitle>
            <p className="text-body leading-6 text-foreground">
              确定删除该任务吗？删除后会话记忆与产出物将不可恢复
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 rounded-control"
                disabled={deleteBusy}
                onClick={() => setDeleteOpen(false)}
              >
                取消
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                className="h-9 rounded-control bg-danger px-4 text-primary-foreground hover:bg-danger-hover"
                disabled={deleteBusy}
                onClick={async () => {
                  setDeleteBusy(true);
                  try {
                    await onDelete();
                    setDeleteOpen(false);
                  } finally {
                    setDeleteBusy(false);
                  }
                }}
              >
                {deleteBusy ? "删除中…" : "确定删除"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </Card>
  );
}

function ApiRunRecordRow({
  run: r,
  onRunRecordsChanged,
  onNotify,
  onApiError,
}: {
  run: ScheduledTaskRunItemApi;
  onRunRecordsChanged: () => void | Promise<void>;
  onNotify: (message: string, variant?: "default" | "error") => void;
  onApiError: (message: string) => void;
}) {
  const router = useRouter();
  const platformAgent = useOptionalPlatformAgent();
  const [downloading, setDownloading] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
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
    if (!sessionId) {
      onNotify("该记录无关联会话，无法查看对话", "error");
      return;
    }
    if (platformAgent) {
      platformAgent.setActivePlatformSession(sessionId);
    }
    const label = (r.task_title_snapshot || "").trim();
    const q = new URLSearchParams({
      sessionId,
      scheduledRunRecord: "1",
    });
    if (label) q.set("runLabel", label);
    if (taskId) q.set("taskId", taskId);
    router.push(`/agent?${q.toString()}`);
  }, [onNotify, platformAgent, router, sessionId, r.task_title_snapshot, taskId]);

  const onDeleteRun = useCallback(async () => {
    if (!platformAgent) {
      onApiError("请登录后重试。");
      return;
    }
    setDeleteBusy(true);
    try {
      await platformAgent.withFreshToken(async (token) => {
        await deleteScheduledTaskRun(token, r.id);
      });
      setDeleteOpen(false);
      onNotify("已删除", "default");
      await onRunRecordsChanged();
    } catch (e) {
      onApiError(formatAgentApiErrorForUser(e) || "删除失败");
    } finally {
      setDeleteBusy(false);
    }
  }, [onApiError, onNotify, onRunRecordsChanged, platformAgent, r.id]);

  const summaryText = (() => {
    const err = (r.error_message || "").trim();
    if (err) return humanizeTaskErrorMessage(err);
    return (r.prompt_snapshot || "").trim() || "—";
  })();

  const statusTooltip = (() => {
    const err = (r.error_message || "").trim();
    if (err) return humanizeTaskErrorMessage(err);
    return st.text === "运行成功" ? "执行成功" : st.text;
  })();

  return (
    <div
      className="flex gap-3 rounded-popover border border-border bg-bg-surface p-4 shadow-surface transition-colors hover:border-border hover:bg-bg-surface sm:gap-4 sm:p-5"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-1.5 flex-wrap items-center gap-2 pr-1">
            <span
              className={cn("inline-flex w-fit shrink-0 items-center rounded-md px-2.5 py-1 text-xs font-medium", st.className)}
              title={statusTooltip}
            >
              {st.text}
            </span>
            <div className="min-w-0 flex-1 break-words text-body font-semibold leading-snug text-foreground">
              {r.task_title_snapshot || "定时任务执行"}
            </div>
          </div>
          <div className="inline-flex shrink-0 items-center gap-0.5 pl-1">
            {showDownload ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={downloading}
                onClick={() => void onDownloadAll()}
                className="h-9 px-2 text-sm text-foreground hover:text-foreground hover:underline"
              >
                <Download className="h-4 w-4 shrink-0" />
                {downloading ? "准备中…" : "下载所有报告"}
              </Button>
            ) : null}
            <DropdownMenu
              open={menuOpen}
              onOpenChange={(open) => {
                setMenuOpen(open);
              }}
            >
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 shrink-0 rounded-control text-text-tertiary"
                  aria-label="更多操作"
                >
                  <MoreVertical className="h-5 w-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuGroup>
                  <DropdownMenuItem onSelect={onViewProcess}>
                    <Eye className="h-4 w-4 shrink-0" />
                    查看执行过程
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="text-danger focus:bg-danger-bg focus:text-danger"
                    onSelect={(event) => {
                      event.preventDefault();
                      setMenuOpen(false);
                      window.setTimeout(() => setDeleteOpen(true), 0);
                    }}
                  >
                    <Trash2 className="h-4 w-4 shrink-0" />
                    删除
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
            <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
              <DialogContent
                hideClose
                className="max-w-sm rounded-panel p-5"
                aria-describedby={undefined}
              >
                <DialogTitle className="sr-only">删除运行记录</DialogTitle>
                <p className="text-body leading-6 text-foreground">
                  确定删除该任务吗？删除后会话记忆与产出物将不可恢复
                </p>
                <div className="mt-4 flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-9 rounded-control"
                    disabled={deleteBusy}
                    onClick={() => setDeleteOpen(false)}
                  >
                    取消
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    className="h-9 rounded-control bg-danger px-4 text-primary-foreground hover:bg-danger-hover"
                    disabled={deleteBusy}
                    onClick={() => void onDeleteRun()}
                  >
                    {deleteBusy ? "删除中…" : "确定删除"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>
        <p className="mt-3 line-clamp-6 text-sm leading-relaxed text-text-tertiary sm:line-clamp-4">{summaryText}</p>
        <p className="mt-3 text-xs text-text-tertiary">完成时间：{finished}</p>
      </div>
    </div>
  );
}
