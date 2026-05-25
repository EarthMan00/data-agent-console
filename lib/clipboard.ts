async function clipboardMatches(text: string) {
  if (!navigator.clipboard?.readText) return true;
  try {
    return (await navigator.clipboard.readText()) === text;
  } catch {
    return true;
  }
}

async function writeWithClipboardApi(text: string) {
  if (!navigator.clipboard?.writeText) return false;
  try {
    await navigator.clipboard.writeText(text);
    return clipboardMatches(text);
  } catch {
    return false;
  }
}

async function writeWithCopyEventFallback(text: string) {
  const activeElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const selection = window.getSelection();
  const ranges = selection ? Array.from({ length: selection.rangeCount }, (_, index) => selection.getRangeAt(index).cloneRange()) : [];
  const marker = document.createElement("span");

  const handleCopy = (event: ClipboardEvent) => {
    event.preventDefault();
    event.clipboardData?.setData("text/plain", text);
  };

  try {
    marker.textContent = text || " ";
    marker.style.position = "fixed";
    marker.style.left = "0";
    marker.style.top = "0";
    marker.style.opacity = "0";
    marker.style.pointerEvents = "none";
    marker.style.userSelect = "text";
    document.body.appendChild(marker);

    const range = document.createRange();
    range.selectNodeContents(marker);
    selection?.removeAllRanges();
    selection?.addRange(range);

    document.addEventListener("copy", handleCopy, true);
    const ok = document.execCommand("copy");
    document.removeEventListener("copy", handleCopy, true);
    return ok && (await clipboardMatches(text));
  } catch {
    document.removeEventListener("copy", handleCopy, true);
    return false;
  } finally {
    marker.remove();
    selection?.removeAllRanges();
    ranges.forEach((range) => selection?.addRange(range));
    activeElement?.focus({ preventScroll: true });
  }
}

async function writeWithSelectionFallback(text: string) {
  const activeElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const selection = window.getSelection();
  const ranges = selection ? Array.from({ length: selection.rangeCount }, (_, index) => selection.getRangeAt(index).cloneRange()) : [];
  const ta = document.createElement("textarea");

  try {
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.left = "0";
    ta.style.top = "0";
    ta.style.width = "1px";
    ta.style.height = "1px";
    ta.style.opacity = "0";
    ta.style.pointerEvents = "none";
    ta.style.zIndex = "-1";
    document.body.appendChild(ta);
    ta.focus({ preventScroll: true });
    ta.select();
    ta.setSelectionRange(0, text.length);
    const ok = document.execCommand("copy");
    return ok && (await clipboardMatches(text));
  } catch {
    return false;
  } finally {
    ta.remove();
    selection?.removeAllRanges();
    ranges.forEach((range) => selection?.addRange(range));
    activeElement?.focus({ preventScroll: true });
  }
}

/**
 * 将文本写入系统剪贴板。只有浏览器确认写入，或 fallback 后未检测到失败时，才返回成功。
 */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  if (typeof window === "undefined") return false;

  return (await writeWithCopyEventFallback(text)) || (await writeWithClipboardApi(text)) || writeWithSelectionFallback(text);
}
