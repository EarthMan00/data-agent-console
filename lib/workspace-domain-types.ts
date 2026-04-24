/** 工作区 / 报告 / 首页提示词等 UI 结构类型（非 mock 运行数据）。 */

export type HomePromptCard = {
  id: string;
  title: string;
  body: string;
  prompt: string;
  meta: string;
  capabilityIds: string[];
  replayRunId?: string;
  replayShareId?: string;
};

export type PromptCard = {
  id: string;
  title: string;
  body: string;
  scope: "全部" | "默认";
  createdAt: string;
};

export type ScheduleItem = {
  id: string;
  title: string;
  frequency: string;
  nextRun: string;
  /** 已完结：任务周期结束，不再执行 */
  status: "生效中" | "已暂停" | "已完结";
  scope: "全部" | "默认";
};

export type RunRecord = {
  id: string;
  title: string;
  startedAt: string;
  result: string;
  status: "成功" | "失败";
  completedAt?: string;
  summary?: string;
};

export type FavoriteItem = {
  id: string;
  title: string;
  body: string;
  scope: "全部" | "默认";
  type: "报告" | "表格";
  createdAt: string;
};

export type SheetTab = {
  id: string;
  label: string;
};

export type ResultPreview = {
  id: string;
  title: string;
  subtitle: string;
  mode: "sheet" | "report";
  summary: string[];
  sheetTabs: SheetTab[];
  sheetRows: string[][];
};
