/** 将后端/工具链技术性文案转为用户可理解的提示（仍保留未知错误的原文以便排查） */

function stripChatexcelImportNoise(text: string): string {
  return text
    .replace(/\[OK\]\s*成功导入模块:\s*[^\s]+\s*/g, "")
    .replace(/\[WARN\][^\n]*\n?/g, "")
    .trim();
}

/** KeyError 在 chatexcel JSON 里可能是 suggestions、'suggestions' 或 "'suggestions'" */
function normalizeKeyErrorName(err: string): string {
  let s = (err || "").trim();
  s = s.replace(/^['"]|['"]$/g, "");
  if ((s.startsWith("'") && s.endsWith("'")) || (s.startsWith('"') && s.endsWith('"'))) {
    s = s.slice(1, -1);
  }
  return s.trim();
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
          const key = normalizeKeyErrorName(err) || "未知";
          if (key === "suggestions") {
            return (
              "Excel 代码执行时访问了「suggestions」列/键，但当前数据里并没有这个名称。" +
              "常见原因：模型把普通表当成带「建议」字段的结构、或误用列名。请让助手按**实际表头**编写代码，或先说明各列含义；" +
              "若仅服务器失败，请对比服务器上文件与本地文件的列名是否一致。"
            );
          }
          return `Excel 代码执行失败：访问了不存在的键或列「${key}」。请核对代码中的列名、字典键与表格是否一致（服务器与本地文件可能不同）。`;
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
