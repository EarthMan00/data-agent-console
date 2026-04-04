/** 将后端/工具链技术性文案转为用户可理解的提示（仍保留未知错误的原文以便排查） */

export function humanizeTaskErrorMessage(raw: string): string {
  const t = (raw || "").trim();
  if (!t) return t;
  if (/no available key/i.test(t) && /in use|cooldown|invalid/i.test(t)) {
    return "当前系统忙，请稍后重试。";
  }
  return t;
}
