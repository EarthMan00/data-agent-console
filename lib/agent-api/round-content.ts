import { stripInternalToolNamesForUi } from "@/lib/strip-internal-tool-names";
import type { ChatRoundSnapshot } from "@/lib/agent-api/types";

const INTERNAL_ASSIGNMENT_RE =
  /["']?(?:capability|tool_name|operation|raw_args|managed_path|provider|credential|api[_-]?key|access[_-]?token|password)["']?\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s,;}\n]+)/gi;
const INTERNAL_TERM_RE =
  /run_(?:linkfox|chatexcel)_task|commerce_data\.collect|scheduled_task\.create|favorite_snapshot\.create|\b(?:capability|tool_name|operation|raw_args|managed_path|provider|credential)\b/gi;
const SECRET_VALUE_RE = /\b(?:Bearer\s+\S+|sk-[A-Za-z0-9_-]{8,}|atk_[A-Za-z0-9_-]+)\b/gi;
const MANAGED_WINDOWS_PATH_RE = /(?:[A-Za-z]:\\|%LOCALAPPDATA%\\)[^\s<>"'`]+/gi;

export function sanitizeAssistantContent(content: string): string {
  return stripInternalToolNamesForUi(content)
    .replace(INTERNAL_ASSIGNMENT_RE, "")
    .replace(INTERNAL_TERM_RE, "")
    .replace(SECRET_VALUE_RE, "[受保护信息]")
    .replace(MANAGED_WINDOWS_PATH_RE, "[受保护路径]")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

const FAILED_FALLBACK = "暂时无法完成本轮任务，请稍后重试。";
const CANCELLED_FALLBACK = "任务已终止";

export function publicRoundContent(snapshot: ChatRoundSnapshot): string {
  const content = sanitizeAssistantContent(snapshot.content);
  const businessFailure =
    snapshot.error_code === "BUSINESS_ACTION_FAILED" ||
    snapshot.error_code === "BUSINESS_VERIFICATION_FAILED" ||
    snapshot.steps.some(
      (step) =>
        step.status === "FAILED" &&
        (step.error_code === "BUSINESS_ACTION_FAILED" ||
          step.error_code === "BUSINESS_VERIFICATION_FAILED"),
    );
  const base = businessFailure ? content.replace(/已创建/g, "未能创建") : content;
  if (base.trim()) return base;
  if (snapshot.status === "FAILED") {
    const message = sanitizeAssistantContent(snapshot.error_message ?? "");
    return message.trim() || FAILED_FALLBACK;
  }
  if (snapshot.status === "CANCELLED") {
    return CANCELLED_FALLBACK;
  }
  return base;
}
