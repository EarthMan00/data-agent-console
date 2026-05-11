/** 将后端/工具链技术性文案转为用户可理解的提示（仍保留未知错误的原文以便排查） */

function stripChatexcelImportNoise(text: string): string {
  return text
    .replace(/\[OK\]\s*成功导入模块:\s*[^\s]+\s*/g, "")
    .replace(/\[WARN\][^\n]*\n?/g, "")
    .trim();
}

export function humanizeTaskErrorMessage(raw: string): string {
  const t = (raw || "").trim();
  if (!t) return t;
  if (/no available key/i.test(t) && /in use|cooldown|invalid/i.test(t)) {
    return "当前系统忙，请稍后重试。";
  }

  const withoutSpam = stripChatexcelImportNoise(t);
  const scan = withoutSpam.length > 0 ? withoutSpam : t;
  const brace = scan.lastIndexOf("{");
  if (brace >= 0) {
    try {
      const parsed = JSON.parse(scan.slice(brace)) as {
        ok?: boolean;
        action?: string;
        error?: string;
        error_type?: string;
      };
      if (parsed && parsed.ok === false && typeof parsed.error === "string") {
        const action = typeof parsed.action === "string" ? parsed.action : "";
        const et = typeof parsed.error_type === "string" ? parsed.error_type : "";
        const err = parsed.error.replace(/^['"]|['"]$/g, "");
        if (action === "run_excel_code" && et === "KeyError") {
          return `Excel 代码执行失败：数据或代码中缺少键/列「${err || "未知"}」。若仅在服务器上失败，请核对表格列名是否与本地一致。`;
        }
        if (action === "run_excel_code") {
          return `Excel 代码执行失败：${err.slice(0, 280)}${err.length > 280 ? "…" : ""}`;
        }
      }
    } catch {
      /* 非 JSON 后缀，走下方 */
    }
  }

  if (withoutSpam.length > 0 && withoutSpam.length < t.length) {
    return withoutSpam.length > 280 ? `${withoutSpam.slice(0, 280)}…` : withoutSpam;
  }
  return t;
}
