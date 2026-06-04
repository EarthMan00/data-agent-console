"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ArrowUp, ChevronDown, CornerDownLeft, Paperclip, X } from "@/components/ui/tabler-icons";

import { homeCapabilityGroups, homeDataSourceItems } from "@/lib/home-capability-items";
import { getPlatformLogoSvgMarkup, PlatformLogo } from "@/components/platform-logo";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type ComposerMode = "普通模式" | "深度模式";

type TaskComposerProps = {
  value: string;
  onValueChange: (value: string) => void;
  placeholder: string;
  mode: ComposerMode;
  onModeChange: (mode: ComposerMode) => void;
  selectedSourceIds?: string[];
  onToolSelect: (capabilityId: string) => void;
  onSourceRemove: (capabilityId: string) => void;
  onFilesSelected: (files: FileList) => void;
  onAttachmentsChange?: (files: File[]) => void;
  onSubmit: () => void;
  /** 任务执行中显示为停止按钮 */
  submitVariant?: "send" | "stop";
  onStop?: () => void;
  showSubmitButton?: boolean;
  submitOnEnter?: boolean;
  showAttachmentButton?: boolean;
  visualStyle?: "default" | "heroMinimal";
  containerClassName?: string;
  textareaClassName?: string;
  placeholderClassName?: string;
  sendButtonClassName?: string;
};

type ComposerAttachment = {
  id: string;
  file: File;
  name: string;
  size: number;
  extension: string;
  isImage: boolean;
  previewUrl?: string;
};

const IMAGE_ATTACHMENT_EXTENSIONS = new Set([
  "avif",
  "bmp",
  "gif",
  "heic",
  "heif",
  "ico",
  "jpeg",
  "jpg",
  "png",
  "svg",
  "tif",
  "tiff",
  "webp",
]);

const DATA_SOURCE_MENU_NAVIGATION_KEYS = new Set([
  "ArrowDown",
  "ArrowRight",
  "ArrowUp",
  "ArrowLeft",
  "Home",
  "End",
  "PageDown",
  "PageUp",
  "Enter",
  " ",
  "Escape",
  "Tab",
]);

const EDITOR_IGNORED_TEXT_SELECTOR = "[data-tool-token='true'], [data-template-ghost='true']";

type PromptTemplatePart =
  | { kind: "text"; text: string }
  | { kind: "slot"; text: string };

function getAttachmentExtension(name: string) {
  const dotIndex = name.lastIndexOf(".");
  if (dotIndex < 0 || dotIndex === name.length - 1) return "";
  return name.slice(dotIndex + 1).toLowerCase();
}

function isImageAttachment(file: File, extension: string) {
  return file.type.startsWith("image/") || IMAGE_ATTACHMENT_EXTENSIONS.has(extension);
}

function formatComposerAttachmentSize(size: number) {
  if (!Number.isFinite(size) || size <= 0) return "0KB";
  if (size < 1024) return `${size}B`;
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))}KB`;
  const mb = size / 1024 / 1024;
  return `${mb >= 10 ? Math.round(mb) : mb.toFixed(1)}MB`;
}

function scrollItemIntoPane(item: HTMLElement | null | undefined, pane: HTMLElement | null | undefined) {
  if (!item || !pane) return;
  const itemRect = item.getBoundingClientRect();
  const paneRect = pane.getBoundingClientRect();
  if (itemRect.top < paneRect.top) {
    pane.scrollTop = Math.max(0, pane.scrollTop - (paneRect.top - itemRect.top) - 8);
  } else if (itemRect.bottom > paneRect.bottom) {
    pane.scrollTop = Math.max(0, pane.scrollTop + itemRect.bottom - paneRect.bottom + 8);
  }
}

function estimateDataSourceMenuHeight(groupCount: number, maxHeight: number) {
  if (groupCount <= 0) return 180;
  const categoryColumnHeight = groupCount * 40 + 16;
  const optionPaneHeight = groupCount * 134 + 24;
  return Math.min(maxHeight, Math.max(180, categoryColumnHeight, optionPaneHeight));
}

function createComposerAttachment(file: File, index: number): ComposerAttachment {
  const extension = getAttachmentExtension(file.name);
  const isImage = isImageAttachment(file, extension);
  return {
    id: `${file.name}-${file.size}-${file.lastModified}-${index}`,
    file,
    name: file.name,
    size: file.size,
    extension,
    isImage,
    previewUrl: isImage ? URL.createObjectURL(file) : undefined,
  };
}

function getSelectionOffsets(container: HTMLElement) {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  if (!container.contains(range.startContainer) || !container.contains(range.endContainer)) return null;

  const getRangeTextLength = (targetRange: Range) => {
    const fragment = targetRange.cloneContents();
    fragment.querySelectorAll?.(EDITOR_IGNORED_TEXT_SELECTOR).forEach((node) => node.remove());
    return fragment.textContent?.length ?? 0;
  };

  const startRange = range.cloneRange();
  startRange.selectNodeContents(container);
  startRange.setEnd(range.startContainer, range.startOffset);

  const endRange = range.cloneRange();
  endRange.selectNodeContents(container);
  endRange.setEnd(range.endContainer, range.endOffset);

  return {
    start: getRangeTextLength(startRange),
    end: getRangeTextLength(endRange),
  };
}

function getCaretAnchorTop(container: HTMLElement) {
  const selection = window.getSelection();
  const style = window.getComputedStyle(container);
  const lineHeight = Number.parseFloat(style.lineHeight) || 28;
  if (!selection || selection.rangeCount === 0) return lineHeight + 4;

  const range = selection.getRangeAt(0).cloneRange();
  range.collapse(true);
  let rect = typeof range.getClientRects === "function" ? range.getClientRects()[0] : undefined;

  if (!rect) {
    const marker = document.createElement("span");
    marker.textContent = "\u200b";
    range.insertNode(marker);
    rect = marker.getBoundingClientRect();
    marker.remove();
  }

  const containerRect = container.getBoundingClientRect();
  return (rect?.top ?? containerRect.top) - containerRect.top + container.scrollTop + lineHeight + 8;
}

function setSelectionByOffsets(container: HTMLElement, startOffset: number, endOffset: number) {
  const selection = window.getSelection();
  if (!selection) return false;

  const range = document.createRange();
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  let currentOffset = 0;
  let startSet = false;
  let node = walker.nextNode();

  while (node) {
    if (node.parentElement?.closest(EDITOR_IGNORED_TEXT_SELECTOR)) {
      node = walker.nextNode();
      continue;
    }
    const length = node.textContent?.length ?? 0;
    if (!startSet && currentOffset + length >= startOffset) {
      range.setStart(node, Math.max(0, startOffset - currentOffset));
      startSet = true;
    }
    if (currentOffset + length >= endOffset) {
      range.setEnd(node, Math.max(0, endOffset - currentOffset));
      selection.removeAllRanges();
      selection.addRange(range);
      return true;
    }
    currentOffset += length;
    node = walker.nextNode();
  }

  return false;
}

function getPlainText(container: HTMLElement) {
  return Array.from(container.childNodes)
    .filter(
      (node) =>
        !(
          node instanceof HTMLElement &&
          (node.dataset.toolToken === "true" || node.dataset.templateGhost === "true")
        ),
    )
    .map((node) => node.textContent ?? "")
    .join("");
}

function normalizeComposerPlainText(text: string) {
  return text.replace(/\u00a0/g, " ").replace(/^[ \t]+/, "");
}

function getTokenIds(container: HTMLElement) {
  return Array.from(container.querySelectorAll<HTMLElement>("[data-tool-token='true'][data-tool-id]")).map(
    (node) => node.dataset.toolId ?? "",
  );
}

function getSelectedToolTokenIds(container: HTMLElement) {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return [];
  const range = selection.getRangeAt(0);
  if (!container.contains(range.commonAncestorContainer)) return [];

  return Array.from(container.querySelectorAll<HTMLElement>("[data-tool-token='true'][data-tool-id]"))
    .filter((node) => range.intersectsNode(node))
    .map((node) => node.dataset.toolId ?? "")
    .filter(Boolean);
}

function getToolTokenNearCaret(container: HTMLElement, direction: "backward" | "forward") {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || !selection.isCollapsed) return null;
  const { anchorNode, anchorOffset } = selection;
  if (!anchorNode || !container.contains(anchorNode)) return null;

  const resolveTokenFromNode = (node: Node | null, step: "previousSibling" | "nextSibling"): HTMLElement | null => {
    let current = node;
    while (current) {
      if (current instanceof HTMLElement && current.dataset.toolToken === "true") {
        return current;
      }
      if (current.nodeType === Node.TEXT_NODE && (current.textContent ?? "").trim() !== "") {
        return null;
      }
      current = current[step];
    }
    return null;
  };

  if (anchorNode.nodeType === Node.TEXT_NODE) {
    const textContent = anchorNode.textContent ?? "";
    const leading = textContent.slice(0, anchorOffset);
    const trailing = textContent.slice(anchorOffset);

    if (direction === "backward" && leading.trim() !== "") return null;
    if (direction === "forward" && trailing.trim() !== "") return null;

    return resolveTokenFromNode(
      direction === "backward" ? anchorNode.previousSibling : anchorNode.nextSibling,
      direction === "backward" ? "previousSibling" : "nextSibling",
    );
  }

  const siblings = anchorNode.childNodes;
  const seed =
    direction === "backward"
      ? siblings[Math.max(0, anchorOffset - 1)] ?? null
      : siblings[Math.min(siblings.length - 1, anchorOffset)] ?? null;

  return resolveTokenFromNode(seed, direction === "backward" ? "previousSibling" : "nextSibling");
}

function moveCaretAfterNode(node: Node) {
  const selection = window.getSelection();
  if (!selection) return;
  const range = document.createRange();
  range.setStartAfter(node);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
}

function placeCaretAtEditorEnd(editor: HTMLElement) {
  const selection = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(editor);
  range.collapse(false);
  selection?.removeAllRanges();
  selection?.addRange(range);
}

function scrollEditorToBottom(editor: HTMLElement) {
  editor.scrollTop = editor.scrollHeight;
}

function normalizeSelectionOutsideToolToken(container: HTMLElement) {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return;
  const anchorNode = selection.anchorNode;
  if (!anchorNode || !container.contains(anchorNode)) return;

  const anchorElement =
    anchorNode instanceof HTMLElement ? anchorNode : anchorNode.parentElement;
  const token = anchorElement?.closest<HTMLElement>("[data-tool-token='true']");
  if (!token || !container.contains(token)) return;

  const spacer =
    token.nextSibling?.nodeType === Node.TEXT_NODE && token.nextSibling.textContent?.startsWith(" ")
      ? token.nextSibling
      : token;
  moveCaretAfterNode(spacer);
}

function normalizeEditorContent(container: HTMLElement) {
  container.normalize();
  Array.from(container.childNodes).forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE && (node.textContent ?? "").length === 0) {
      node.remove();
    }
  });
}

function insertPlainTextAtSelection(text: string) {
  const selection = window.getSelection();
  if (!selection?.rangeCount) return;
  selection.deleteFromDocument();
  const range = selection.getRangeAt(0);
  range.insertNode(document.createTextNode(text));
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}

function handleEditorPaste(event: React.ClipboardEvent<HTMLElement>, syncValue: () => string) {
  event.preventDefault();
  const plain = event.clipboardData.getData("text/plain");
  if (!plain) return;
  insertPlainTextAtSelection(plain);
  syncValue();
}

function parsePromptTemplate(template: string): PromptTemplatePart[] {
  const parts: PromptTemplatePart[] = [];
  const slotPattern = /{{\s*([^{}]+?)\s*}}/g;
  let cursor = 0;
  let match = slotPattern.exec(template);

  while (match) {
    if (match.index > cursor) {
      parts.push({ kind: "text", text: template.slice(cursor, match.index) });
    }
    parts.push({ kind: "slot", text: match[1]?.trim() ?? "" });
    cursor = match.index + match[0].length;
    match = slotPattern.exec(template);
  }

  if (cursor < template.length) {
    parts.push({ kind: "text", text: template.slice(cursor) });
  }

  return parts;
}

function getPromptTemplatePlainText(template: string) {
  return parsePromptTemplate(template)
    .map((part) => part.text)
    .join("");
}

function createTemplateSlotNode(text: string) {
  const span = document.createElement("span");
  span.dataset.templateSlot = "true";
  span.className =
    "mx-1 inline-flex h-6 cursor-text items-center rounded-[6px] bg-[rgba(55,53,47,0.06)] px-1.5 align-baseline text-[14px] font-medium leading-6 text-[#34322d]";
  span.textContent = text;
  return span;
}

function createTemplateGhostNode(template: string) {
  const span = document.createElement("span");
  span.dataset.templateGhost = "true";
  span.className = "pointer-events-none select-none text-[#b8bec8]";
  span.setAttribute("contenteditable", "false");
  span.textContent = `${template} [按 Tab 键补全]`;
  return span;
}

function appendPromptTemplateNodes(container: HTMLElement, template: string) {
  parsePromptTemplate(template).forEach((part) => {
    if (!part.text) return;
    if (part.kind === "slot") {
      container.appendChild(createTemplateSlotNode(part.text));
    } else {
      container.appendChild(document.createTextNode(part.text));
    }
  });
}

function placeCaretBeforeNode(container: HTMLElement, node: Node) {
  if (node.parentNode !== container) return;
  const selection = window.getSelection();
  if (!selection) return;
  const range = document.createRange();
  range.setStartBefore(node);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
  container.focus();
}

function renderHighlightedText(text: string, query: string) {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) return text;

  const lowerText = text.toLowerCase();
  const lowerQuery = normalizedQuery.toLowerCase();
  const nodes: ReactNode[] = [];
  let cursor = 0;
  let index = lowerText.indexOf(lowerQuery);

  while (index >= 0) {
    if (index > cursor) nodes.push(text.slice(cursor, index));
    nodes.push(
      <span key={`${text}-${index}`} className="text-[#3478ff]">
        {text.slice(index, index + normalizedQuery.length)}
      </span>,
    );
    cursor = index + normalizedQuery.length;
    index = lowerText.indexOf(lowerQuery, cursor);
  }

  if (cursor < text.length) nodes.push(text.slice(cursor));
  return nodes;
}

function createToolTokenNode({
  capabilityId,
  icon,
  label,
  accent,
  onRemove,
}: {
  capabilityId: string;
  icon: string;
  label: string;
  accent: string;
  onRemove: (capabilityId: string) => void;
}) {
  const button = document.createElement("button");
  button.type = "button";
  button.dataset.toolToken = "true";
  button.dataset.toolId = capabilityId;
  button.dataset.sourceTag = capabilityId;
  button.className =
    "group mx-1 inline-flex h-7 items-center gap-1.5 rounded-[10px] border border-transparent bg-[#e5efff] px-2.5 align-middle text-[14px] font-semibold leading-none text-[#1764ff]";
  button.setAttribute("contenteditable", "false");
  button.setAttribute("aria-label", `移除数据源 ${label}`);

  const iconWrap = document.createElement("span");
  iconWrap.className = "inline-flex h-4 w-4 items-center justify-center";
  iconWrap.setAttribute("aria-hidden", "true");
  iconWrap.innerHTML = getPlatformLogoSvgMarkup({ name: icon, color: accent, className: "h-4 w-4" });

  const labelNode = document.createElement("span");
  labelNode.className = "translate-y-px";
  labelNode.textContent = label;

  button.appendChild(iconWrap);
  button.appendChild(labelNode);
  button.addEventListener("mousedown", (event) => {
    event.preventDefault();
    onRemove(capabilityId);
  });

  return button;
}

export function TaskComposer({
  value,
  onValueChange,
  placeholder,
  selectedSourceIds = [],
  onToolSelect,
  onSourceRemove,
  onFilesSelected,
  onAttachmentsChange,
  onSubmit,
  submitVariant = "send",
  onStop,
  showSubmitButton = true,
  submitOnEnter = true,
  showAttachmentButton = true,
  visualStyle = "default",
  containerClassName,
  textareaClassName,
  placeholderClassName,
  sendButtonClassName,
}: TaskComposerProps) {
  const isHeroMinimal = visualStyle === "heroMinimal";
  const hasText = value.trim().length > 0;
  const showStop = submitVariant === "stop";
  const defaultSendButtonClassName = isHeroMinimal
    ? hasText
      ? "h-8 w-8 min-w-0 rounded-full border border-transparent bg-[#37352f] p-0 text-white shadow-none transition hover:bg-[#2f2d28]"
      : "h-8 w-8 min-w-0 rounded-full border border-transparent bg-[rgba(55,53,47,0.08)] p-0 text-white shadow-none transition hover:bg-[rgba(55,53,47,0.08)]"
    : hasText
      ? "h-10 w-10 min-w-0 rounded-full border border-transparent bg-[#111111] p-0 text-white shadow-none transition hover:bg-[#2a2a2a]"
      : "h-10 w-10 min-w-0 rounded-full border border-transparent bg-[#dededc] p-0 text-white shadow-none transition hover:bg-[#d1d1cf]";
  const resolvedSendButtonClassName = sendButtonClassName ?? defaultSendButtonClassName;
  const fileInputId = useId();
  const textboxRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const sourceButtonTriggerRef = useRef<HTMLButtonElement | null>(null);
  const sourceButtonItemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const sourceButtonListRef = useRef<HTMLDivElement | null>(null);
  const sourceButtonOptionPaneRef = useRef<HTMLDivElement | null>(null);
  const sourceButtonHighlightedIndexRef = useRef(0);
  const toolItemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const toolListRef = useRef<HTMLDivElement | null>(null);
  const mentionOptionPaneRef = useRef<HTMLDivElement | null>(null);
  const highlightedToolIndexRef = useRef(-1);
  const mentionRangeRef = useRef<{ start: number; end: number } | null>(null);
  const suppressExternalSyncRef = useRef(false);
  const pendingEditorEndPlacementRef = useRef(false);
  const syncEditorInteractionStateRef = useRef<(editor: HTMLElement) => void>(() => {});
  const onAttachmentsChangeRef = useRef(onAttachmentsChange);
  const attachmentsRef = useRef<ComposerAttachment[]>([]);

  const [sourceButtonOpen, setSourceButtonOpen] = useState(false);
  const [sourceButtonHighlightedIndex, setSourceButtonHighlightedIndex] = useState(0);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionRange, setMentionRange] = useState<{ start: number; end: number } | null>(null);
  const [mentionAnchorTop, setMentionAnchorTop] = useState(36);
  const [mentionMenuStyle, setMentionMenuStyle] = useState<{ top: number; left: number; width: number; maxHeight: number }>({
    top: 0,
    left: 0,
    width: 340,
    maxHeight: 240,
  });
  const [, setModeOpen] = useState(false);
  const [highlightedToolIndex, setHighlightedToolIndex] = useState(-1);
  const [attachments, setAttachments] = useState<ComposerAttachment[]>([]);
  const [acceptedTemplateToolId, setAcceptedTemplateToolId] = useState<string | null>(null);
  const blurTimeoutRef = useRef<number | null>(null);

  const filteredTools = useMemo(() => homeDataSourceItems, []);

  const selectedSources = useMemo(
    () =>
      selectedSourceIds
        .map((id) => filteredTools.find((item) => item.id === id))
        .filter((item): item is (typeof filteredTools)[number] => Boolean(item)),
    [filteredTools, selectedSourceIds],
  );

  const templateSuggestion = useMemo(() => {
    const source = [...selectedSources].reverse().find((item) => Boolean(item.promptTemplate));
    if (!source?.promptTemplate) return null;
    return {
      toolId: source.id,
      template: source.promptTemplate,
      plainText: getPromptTemplatePlainText(source.promptTemplate),
    };
  }, [selectedSources]);

  const acceptedTemplateRender = useMemo(() => {
    if (!acceptedTemplateToolId) return null;
    const source = selectedSources.find((item) => item.id === acceptedTemplateToolId);
    if (!source?.promptTemplate) return null;
    const plainText = getPromptTemplatePlainText(source.promptTemplate);
    return {
      toolId: source.id,
      template: source.promptTemplate,
      plainText,
    };
  }, [acceptedTemplateToolId, selectedSources]);

  const templateGhostRender = useMemo(() => {
    if (value.length > 0 || mentionOpen || acceptedTemplateRender || !templateSuggestion) return null;
    return templateSuggestion;
  }, [acceptedTemplateRender, mentionOpen, templateSuggestion, value.length]);

  const mentionQuery = useMemo(() => {
    if (!mentionRange) return "";
    return value.slice(mentionRange.start + 1, mentionRange.end);
  }, [mentionRange, value]);
  const isMentionSearchMode = mentionQuery.trim().length > 0;

  const mentionTools = useMemo(() => {
    const query = mentionQuery.trim().toLowerCase();
    if (!query) return filteredTools;
    return filteredTools.filter((item) => {
      const haystack = [item.label, item.parentLabel, item.promptHint, item.promptTemplate, item.id]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [filteredTools, mentionQuery]);

  const mentionMenuListboxHeight = useMemo(
    () => Math.min(mentionMenuStyle.maxHeight, Math.max(48, mentionTools.length * 46)),
    [mentionMenuStyle.maxHeight, mentionTools.length],
  );

  const sourceButtonToolGroups = useMemo(
    () =>
      homeCapabilityGroups
        .map((group) => ({
          ...group,
          items: group.items.filter((item) => filteredTools.some((tool) => tool.id === item.id)),
        }))
        .filter((group) => group.items.length > 0),
    [filteredTools],
  );
  const sourceButtonMenuListboxHeight = useMemo(
    () => estimateDataSourceMenuHeight(sourceButtonToolGroups.length, 360),
    [sourceButtonToolGroups.length],
  );

  const getSourceButtonGroupFirstIndex = (group: (typeof sourceButtonToolGroups)[number]) => {
    const firstItem = group.items[0];
    return firstItem ? filteredTools.findIndex((tool) => tool.id === firstItem.id) : -1;
  };

  useEffect(() => {
    return () => {
      if (blurTimeoutRef.current) {
        window.clearTimeout(blurTimeoutRef.current);
      }
      attachmentsRef.current.forEach((attachment) => {
        if (attachment.previewUrl) URL.revokeObjectURL(attachment.previewUrl);
      });
    };
  }, []);

  useEffect(() => {
    onAttachmentsChangeRef.current = onAttachmentsChange;
  }, [onAttachmentsChange]);

  useEffect(() => {
    attachmentsRef.current = attachments;
    onAttachmentsChangeRef.current?.(attachments.map((attachment) => attachment.file));
  }, [attachments]);

  const removeAttachment = useCallback((id: string) => {
    setAttachments((current) => {
      const target = current.find((attachment) => attachment.id === id);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return current.filter((attachment) => attachment.id !== id);
    });
  }, []);

  useEffect(() => {
    if (!mentionOpen) return;
    const container = isMentionSearchMode ? toolListRef.current : mentionOptionPaneRef.current;
    const item = toolItemRefs.current[highlightedToolIndex];
    if (!container || !item || highlightedToolIndex < 0) return;

    requestAnimationFrame(() => {
      scrollItemIntoPane(item, container);
    });
  }, [highlightedToolIndex, isMentionSearchMode, mentionOpen]);

  useEffect(() => {
    if (!sourceButtonOpen) return;
    const safeIndex =
      filteredTools.length === 0
        ? -1
        : ((sourceButtonHighlightedIndexRef.current % filteredTools.length) + filteredTools.length) % filteredTools.length;
    if (safeIndex < 0) return;
    sourceButtonHighlightedIndexRef.current = safeIndex;
    const frame = requestAnimationFrame(() => {
      sourceButtonItemRefs.current[safeIndex]?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [filteredTools.length, sourceButtonOpen]);

  useEffect(() => {
    if (!sourceButtonOpen) return;
    const container = sourceButtonOptionPaneRef.current;
    const item = sourceButtonItemRefs.current[sourceButtonHighlightedIndex];
    if (!container || !item || sourceButtonHighlightedIndex < 0) return;

    requestAnimationFrame(() => {
      scrollItemIntoPane(item, container);
    });
  }, [sourceButtonHighlightedIndex, sourceButtonOpen]);

  const focusEditor = (collapseToEnd = true) => {
    if (blurTimeoutRef.current) {
      window.clearTimeout(blurTimeoutRef.current);
      blurTimeoutRef.current = null;
    }
    requestAnimationFrame(() => {
      const editor = editorRef.current;
      if (!editor) return;
      editor.focus();
      if (!collapseToEnd) return;
      placeCaretAtEditorEnd(editor);
      scrollEditorToBottom(editor);
    });
  };

  const closeMentionMenu = () => {
    setMentionOpen(false);
    mentionRangeRef.current = null;
    setMentionRange(null);
    setMentionAnchorTop(36);
    highlightedToolIndexRef.current = -1;
    setHighlightedToolIndex(-1);
  };

  const updateHighlightedToolIndex = (nextIndex: number, focusItem = false) => {
    highlightedToolIndexRef.current = nextIndex;
    setHighlightedToolIndex(nextIndex);
    if (!focusItem || nextIndex < 0) return;
    requestAnimationFrame(() => {
      toolItemRefs.current[nextIndex]?.focus({ preventScroll: true });
    });
  };

  const getSafeSourceButtonIndex = (index: number) => {
    if (filteredTools.length === 0) return -1;
    return ((index % filteredTools.length) + filteredTools.length) % filteredTools.length;
  };

  const updateSourceButtonHighlightedIndex = (nextIndex: number, focusItem = false) => {
    const safeIndex = getSafeSourceButtonIndex(nextIndex);
    sourceButtonHighlightedIndexRef.current = safeIndex;
    setSourceButtonHighlightedIndex(safeIndex);
    if (!focusItem || safeIndex < 0) return;
    requestAnimationFrame(() => {
      sourceButtonItemRefs.current[safeIndex]?.focus({ preventScroll: true });
    });
  };

  const handleMentionMenuKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeMentionMenu();
      focusEditor(false);
      return;
    }
    if (mentionTools.length === 0) return;
    const currentIndex = highlightedToolIndexRef.current < 0 ? 0 : highlightedToolIndexRef.current;
    const getSafeMentionIndex = (index: number) =>
      ((index % mentionTools.length) + mentionTools.length) % mentionTools.length;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      updateHighlightedToolIndex(getSafeMentionIndex(currentIndex + 1), true);
      return;
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      updateHighlightedToolIndex(getSafeMentionIndex(currentIndex + 1), true);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      updateHighlightedToolIndex(getSafeMentionIndex(currentIndex - 1), true);
      return;
    }
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      updateHighlightedToolIndex(getSafeMentionIndex(currentIndex - 1), true);
      return;
    }
    if (event.key === "Home") {
      event.preventDefault();
      updateHighlightedToolIndex(0, true);
      return;
    }
    if (event.key === "End") {
      event.preventDefault();
      updateHighlightedToolIndex(mentionTools.length - 1, true);
      return;
    }
    if (event.key === "PageDown") {
      event.preventDefault();
      updateHighlightedToolIndex(getSafeMentionIndex(currentIndex + 4), true);
      return;
    }
    if (event.key === "PageUp") {
      event.preventDefault();
      updateHighlightedToolIndex(getSafeMentionIndex(currentIndex - 4), true);
      return;
    }
    if (event.key === "Enter" || event.key === " " || event.key === "Tab") {
      event.preventDefault();
      const selectedTool = mentionTools[getSafeMentionIndex(currentIndex)];
      if (selectedTool) selectDataSource(selectedTool.id, "mention");
      return;
    }
  };

  const updateMentionMenuPosition = useCallback((anchorTop: number, compact: boolean) => {
    const textbox = textboxRef.current;
    const editor = editorRef.current;
    if (!textbox || !editor || typeof window === "undefined") return;

    const rect = textbox.getBoundingClientRect();
    const viewportPadding = 16;
    const gap = 10;
    const width = compact
      ? Math.min(440, Math.max(340, rect.width * 0.52), window.innerWidth - viewportPadding * 2)
      : Math.min(760, window.innerWidth - viewportPadding * 2);
    const left = Math.min(Math.max(rect.left, viewportPadding), window.innerWidth - width - viewportPadding);
    const estimatedMenuHeight = compact ? Math.min(240, Math.round(window.innerHeight * 0.32)) : 360;
    const belowTop = rect.top + anchorTop + gap;
    const belowSpace = window.innerHeight - belowTop - viewportPadding;
    const aboveSpace = rect.top - viewportPadding - gap;
    const placeBottom = belowSpace >= estimatedMenuHeight || belowSpace >= aboveSpace;
    const maxHeight = compact
      ? Math.max(132, Math.min(placeBottom ? belowSpace : aboveSpace, 240))
      : Math.max(180, Math.min(placeBottom ? belowSpace : aboveSpace, 360));
    const top = placeBottom
      ? belowTop
      : Math.max(viewportPadding, rect.top - Math.min(estimatedMenuHeight, maxHeight) - gap);

    setMentionMenuStyle({
      top,
      left,
      width,
      maxHeight,
    });
  }, []);

  const syncMentionState = (nextValue: string, caret: number) => {
    const prefix = nextValue.slice(0, caret);
    const match = prefix.match(/@([^\s@]*)$/);
    if (!match) {
      closeMentionMenu();
      return;
    }

    const editor = editorRef.current;
    const anchorTop = editor ? getCaretAnchorTop(editor) : 36;
    updateMentionMenuPosition(anchorTop, Boolean(match[1]?.trim()));
    setSourceButtonOpen(false);
    setModeOpen(false);
    const nextMentionRange = { start: prefix.lastIndexOf("@"), end: caret };
    mentionRangeRef.current = nextMentionRange;
    setMentionRange(nextMentionRange);
    setMentionAnchorTop(anchorTop);
    setMentionOpen(true);
    updateHighlightedToolIndex(filteredTools.length > 0 ? 0 : -1);
  };

  useEffect(() => {
    if (!mentionOpen) return;
    const handleReposition = () => updateMentionMenuPosition(mentionAnchorTop, isMentionSearchMode);
    window.addEventListener("resize", handleReposition);
    window.addEventListener("scroll", handleReposition, true);
    return () => {
      window.removeEventListener("resize", handleReposition);
      window.removeEventListener("scroll", handleReposition, true);
    };
  }, [isMentionSearchMode, mentionAnchorTop, mentionOpen, updateMentionMenuPosition]);

  const removeLastSource = () => {
    const lastSource = selectedSources[selectedSources.length - 1];
    if (!lastSource) return;
    removeToolFromEditor(lastSource.id);
  };

  const syncEditorValue = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return "";
    const nextValue = normalizeComposerPlainText(getPlainText(editor));
    if (acceptedTemplateToolId && !selectedSourceIds.includes(acceptedTemplateToolId)) {
      setAcceptedTemplateToolId(null);
    }
    onValueChange(nextValue);
    return nextValue;
  }, [acceptedTemplateToolId, onValueChange, selectedSourceIds]);

  const syncEditorInteractionState = (editor: HTMLElement) => {
    const nextValue = syncEditorValue();
    const offsets = getSelectionOffsets(editor);
    syncMentionState(nextValue, offsets?.start ?? nextValue.length);
  };

  useEffect(() => {
    syncEditorInteractionStateRef.current = syncEditorInteractionState;
  });

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || typeof MutationObserver === "undefined") return;

    let frame = 0;
    const queueSync = () => {
      if (document.activeElement !== editor) return;
      if (frame) window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        syncEditorInteractionStateRef.current(editor);
      });
    };

    const observer = new MutationObserver(queueSync);
    observer.observe(editor, { childList: true, characterData: true, subtree: true });

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);

  const deleteSelectionWithSources = useCallback((editor: HTMLElement) => {
    const selectedToolIds = getSelectedToolTokenIds(editor);
    if (selectedToolIds.length === 0) return false;

    const selection = window.getSelection();
    const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
    if (!selection || !range) return false;

    suppressExternalSyncRef.current = true;
    range.deleteContents();
    selectedToolIds.forEach((id) => {
      editor.querySelector<HTMLElement>(`[data-tool-token='true'][data-tool-id='${id}']`)?.remove();
      onSourceRemove(id);
    });
    normalizeEditorContent(editor);
    syncEditorValue();
    closeMentionMenu();

    const nextRange = document.createRange();
    nextRange.selectNodeContents(editor);
    nextRange.collapse(false);
    selection.removeAllRanges();
    selection.addRange(nextRange);
    return true;
  }, [onSourceRemove, syncEditorValue]);

  const removeToolFromEditor = useCallback((capabilityId: string) => {
    const editor = editorRef.current;
    if (!editor) return;
    const token = editor.querySelector<HTMLElement>(`[data-tool-token='true'][data-tool-id='${capabilityId}']`);
    if (!token) return;
    const trailingSpace =
      token.nextSibling?.nodeType === Node.TEXT_NODE && token.nextSibling.textContent?.startsWith(" ")
        ? token.nextSibling
        : null;
    token.remove();
    trailingSpace?.remove();
    normalizeEditorContent(editor);
    suppressExternalSyncRef.current = true;
    syncEditorValue();
    onSourceRemove(capabilityId);
    if (acceptedTemplateToolId === capabilityId) {
      setAcceptedTemplateToolId(null);
    }
    requestAnimationFrame(() => focusEditor(false));
  }, [acceptedTemplateToolId, onSourceRemove, syncEditorValue]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const currentText = normalizeComposerPlainText(getPlainText(editor));
    const currentTokenIds = getTokenIds(editor);
    const nextTemplateToolId = acceptedTemplateRender?.toolId ?? "";
    const nextGhostToolId = templateGhostRender?.toolId ?? "";
    const currentTemplateToolId = editor.dataset.templateToolId ?? "";
    const currentGhostToolId = editor.dataset.templateGhostToolId ?? "";
    const tokensMatch =
      currentTokenIds.length === selectedSourceIds.length &&
      currentTokenIds.every((id, index) => id === selectedSourceIds[index]);

    if (
      suppressExternalSyncRef.current &&
      currentText === value &&
      tokensMatch &&
      currentTemplateToolId === nextTemplateToolId &&
      currentGhostToolId === nextGhostToolId
    ) {
      suppressExternalSyncRef.current = false;
    } else if (
      currentText !== value ||
      !tokensMatch ||
      currentTemplateToolId !== nextTemplateToolId ||
      currentGhostToolId !== nextGhostToolId
    ) {
      editor.innerHTML = "";
      editor.dataset.templateToolId = nextTemplateToolId;
      editor.dataset.templateGhostToolId = nextGhostToolId;
      selectedSources.forEach((source) => {
        editor.appendChild(
          createToolTokenNode({
            capabilityId: source.id,
            icon: source.icon,
            label: source.label,
            accent: source.accent,
            onRemove: removeToolFromEditor,
          }),
        );
        editor.appendChild(document.createTextNode(" "));
      });
      if (acceptedTemplateRender) {
        appendPromptTemplateNodes(editor, acceptedTemplateRender.template);
      } else {
        editor.appendChild(document.createTextNode(value));
        if (templateGhostRender) {
          const ghost = createTemplateGhostNode(templateGhostRender.template);
          editor.appendChild(ghost);
          if (document.activeElement === editor) {
            requestAnimationFrame(() => placeCaretBeforeNode(editor, ghost));
          }
        }
      }
      normalizeEditorContent(editor);
      pendingEditorEndPlacementRef.current = !templateGhostRender;
      requestAnimationFrame(() => {
        scrollEditorToBottom(editor);
        if (!templateGhostRender && document.activeElement === editor) {
          placeCaretAtEditorEnd(editor);
          pendingEditorEndPlacementRef.current = false;
        }
      });
    }
  }, [acceptedTemplateRender, removeToolFromEditor, selectedSourceIds, selectedSources, templateGhostRender, value]);

  const selectDataSource = (capabilityId: string, origin: "button" | "mention") => {
    const tool = filteredTools.find((item) => item.id === capabilityId);
    const editor = editorRef.current;
    if (!tool || !editor) return;

    editor.focus();
    suppressExternalSyncRef.current = true;

    const activeMentionRange = mentionRangeRef.current ?? mentionRange;
    if (origin === "mention" && activeMentionRange) {
      setSelectionByOffsets(editor, activeMentionRange.start, activeMentionRange.end);
      const selection = window.getSelection();
      selection?.getRangeAt(0).deleteContents();
      closeMentionMenu();
    } else {
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0 || !editor.contains(selection.anchorNode)) {
        const range = document.createRange();
        range.selectNodeContents(editor);
        range.collapse(false);
        selection?.removeAllRanges();
        selection?.addRange(range);
      }
      setSourceButtonOpen(false);
    }

    const selection = window.getSelection();
    const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
    if (!range) return;

    const tokenNode = createToolTokenNode({
      capabilityId: tool.id,
      icon: tool.icon,
      label: tool.label,
      accent: tool.accent,
      onRemove: removeToolFromEditor,
    });
    const spacer = document.createTextNode(" ");
    range.insertNode(spacer);
    range.insertNode(tokenNode);

    const nextRange = document.createRange();
    nextRange.setStartAfter(spacer);
    nextRange.collapse(true);
    selection?.removeAllRanges();
    selection?.addRange(nextRange);

    normalizeEditorContent(editor);
    syncEditorValue();
    if (!selectedSourceIds.includes(capabilityId)) {
      onToolSelect(capabilityId);
    }
  };

  const acceptTemplateSuggestion = () => {
    if (!templateGhostRender) return false;
    setAcceptedTemplateToolId(templateGhostRender.toolId);
    onValueChange(templateGhostRender.plainText);
    closeMentionMenu();
    requestAnimationFrame(() => {
      focusEditor();
    });
    return true;
  };

  const openSourceButtonMenu = (initialIndex = 0) => {
    closeMentionMenu();
    setModeOpen(false);
    updateSourceButtonHighlightedIndex(initialIndex);
    setSourceButtonOpen(true);
  };

  const handleSourceButtonMenuKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      setSourceButtonOpen(false);
      requestAnimationFrame(() => sourceButtonTriggerRef.current?.focus());
      return;
    }
    if (filteredTools.length === 0) return;
    const currentIndex = sourceButtonHighlightedIndexRef.current < 0 ? 0 : sourceButtonHighlightedIndexRef.current;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      updateSourceButtonHighlightedIndex(currentIndex + 1, true);
      return;
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      updateSourceButtonHighlightedIndex(currentIndex + 1, true);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      updateSourceButtonHighlightedIndex(currentIndex - 1, true);
      return;
    }
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      updateSourceButtonHighlightedIndex(currentIndex - 1, true);
      return;
    }
    if (event.key === "Home") {
      event.preventDefault();
      updateSourceButtonHighlightedIndex(0, true);
      return;
    }
    if (event.key === "End") {
      event.preventDefault();
      updateSourceButtonHighlightedIndex(filteredTools.length - 1, true);
      return;
    }
    if (event.key === "PageDown") {
      event.preventDefault();
      updateSourceButtonHighlightedIndex(currentIndex + 4, true);
      return;
    }
    if (event.key === "PageUp") {
      event.preventDefault();
      updateSourceButtonHighlightedIndex(currentIndex - 4, true);
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      const selectedTool = filteredTools[currentIndex];
      if (selectedTool) selectDataSource(selectedTool.id, "button");
      return;
    }
  };

  const composerCard = (
    <div
      data-task-composer-root
      className={
        containerClassName ??
        cn(
          "relative z-30 w-full border text-[#243248]",
          isHeroMinimal
            ? "rounded-[22px] !border-[#e2e2df] !bg-none !bg-white !shadow-[0_1px_2px_rgba(17,17,17,0.03)] backdrop-blur-none"
            : "rounded-[18px] border-[#e2e2df] bg-white shadow-[0_1px_2px_rgba(17,17,17,0.03)]",
        )
      }
    >
      <div className="p-0">
          <div className={cn(isHeroMinimal ? "px-4 pb-2 pt-2" : "px-4 pb-3 pt-3")}>
            <div
            className="px-1"
            onKeyDownCapture={(event) => {
              if ((event.key !== "Backspace" && event.key !== "Delete") || selectedSources.length === 0) return;
              const activeElement = document.activeElement;
              if (activeElement === editorRef.current) {
                return;
              }

              const insideSourceTag =
                activeElement instanceof HTMLElement && activeElement.closest("[data-source-tag]");
              if (insideSourceTag) {
                event.preventDefault();
                removeLastSource();
              }
            }}
          >
            <div className={cn(isHeroMinimal ? "min-h-[54px]" : "min-h-[88px]")}>
              <div className={cn("relative", isHeroMinimal ? "min-h-[42px]" : "min-h-[72px]")}>
                <div
                  ref={textboxRef}
                  data-testid="task-composer-textbox"
                  role="textbox"
                  tabIndex={0}
                  onMouseDown={(event) => {
                    if (event.target === event.currentTarget) {
                      event.preventDefault();
                      focusEditor();
                    }
                  }}
                  onClick={(event) => {
                    if (event.target === event.currentTarget) {
                      focusEditor();
                    }
                  }}
                  onFocus={() => focusEditor(false)}
                  className={cn("relative overflow-visible", isHeroMinimal ? "min-h-[52px]" : "min-h-[84px]")}
                >
                  <div className={cn("flex flex-wrap items-start gap-1.5", isHeroMinimal ? "min-h-[52px]" : "min-h-[84px]")}>
                    <div
                      ref={editorRef}
                      data-testid="task-composer-editor"
                      aria-label="任务输入编辑器"
                      contentEditable
                      suppressContentEditableWarning
                      onBeforeInput={(event) => {
                        normalizeSelectionOutsideToolToken(event.currentTarget);
                      }}
                      onPaste={(event) => {
                        handleEditorPaste(event, syncEditorValue);
                      }}
                      onInput={(event) => {
                        syncEditorInteractionState(event.currentTarget);
                      }}
                      onKeyDown={(event) => {
                        normalizeSelectionOutsideToolToken(event.currentTarget);
                        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "a") {
                          event.preventDefault();
                          const selection = window.getSelection();
                          const range = document.createRange();
                          range.selectNodeContents(event.currentTarget);
                          selection?.removeAllRanges();
                          selection?.addRange(range);
                          return;
                        }
                        if (
                          (event.key === "Backspace" || event.key === "Delete") &&
                          deleteSelectionWithSources(event.currentTarget)
                        ) {
                          event.preventDefault();
                          return;
                        }
                        const nearbyToken =
                          event.key === "Backspace"
                            ? getToolTokenNearCaret(event.currentTarget, "backward")
                            : event.key === "Delete"
                              ? getToolTokenNearCaret(event.currentTarget, "forward")
                              : null;
                        if (mentionOpen && DATA_SOURCE_MENU_NAVIGATION_KEYS.has(event.key)) {
                          handleMentionMenuKeyDown(event);
                          return;
                        }
                        if (event.key === "Tab" && acceptTemplateSuggestion()) {
                          event.preventDefault();
                          return;
                        }
                        if (
                          (event.key === "Backspace" || event.key === "Delete") &&
                          nearbyToken?.dataset.toolId
                        ) {
                          event.preventDefault();
                          removeToolFromEditor(nearbyToken.dataset.toolId);
                          return;
                        }
                        if (
                          (event.key === "Backspace" || event.key === "Delete") &&
                          (() => {
                            const offsets = getSelectionOffsets(event.currentTarget);
                            return ((offsets?.start ?? 0) === 0 || !value.length) && (offsets?.start ?? 0) === (offsets?.end ?? 0);
                          })() &&
                          selectedSources.length > 0
                        ) {
                          event.preventDefault();
                          removeLastSource();
                          return;
                        }
                        if (submitOnEnter && event.key === "Enter" && !event.shiftKey) {
                          event.preventDefault();
                          if (showStop && onStop) {
                            onStop();
                          } else {
                            onSubmit();
                          }
                        }
                      }}
                      onClick={(event) => {
                        normalizeSelectionOutsideToolToken(event.currentTarget);
                        syncEditorInteractionState(event.currentTarget);
                      }}
                      onKeyUp={(event) => {
                        if (event.key === "Tab" || event.key === "Enter" || event.key === "Escape") return;
                        syncEditorInteractionState(event.currentTarget);
                      }}
                      onFocus={(event) => {
                        if (blurTimeoutRef.current) {
                          window.clearTimeout(blurTimeoutRef.current);
                          blurTimeoutRef.current = null;
                        }
                        if (pendingEditorEndPlacementRef.current) {
                          pendingEditorEndPlacementRef.current = false;
                          const editor = event.currentTarget;
                          requestAnimationFrame(() => {
                            placeCaretAtEditorEnd(editorRef.current ?? editor);
                            scrollEditorToBottom(editorRef.current ?? editor);
                          });
                        }
                      }}
                      onBlur={() => {
                        blurTimeoutRef.current = window.setTimeout(() => {
                          const activeElement = document.activeElement;
                          const insideComposer =
                            activeElement instanceof HTMLElement &&
                            Boolean(activeElement.closest("[data-task-composer-root]"));
                          const insideMentionMenu =
                            activeElement instanceof HTMLElement &&
                            Boolean(activeElement.closest("[data-task-composer-mention-menu]"));
                          if (!insideComposer && !insideMentionMenu) {
                            closeMentionMenu();
                          }
                        }, 0);
                      }}
                      className={cn(
                        textareaClassName ??
                          (isHeroMinimal
                            ? "min-h-[28px] max-h-[9em] min-w-[180px] flex-1 overflow-y-auto whitespace-pre-wrap break-words bg-transparent px-0 py-1.5 pr-2 text-[14px] leading-6 text-[#34322d] outline-none scrollbar-thin scrollbar-thumb-transparent hover:scrollbar-thumb-zinc-300"
                            : "min-h-[28px] max-h-[10em] min-w-[180px] flex-1 overflow-y-auto whitespace-pre-wrap break-words bg-transparent px-0 py-1 pr-2 text-[14px] leading-7 text-[#1c1c1c] outline-none scrollbar-thin scrollbar-thumb-transparent hover:scrollbar-thumb-zinc-300"),
                      )}
                    />
                  </div>
                  {!value && selectedSources.length === 0 ? (
                    <div
                      className={cn(
                        "pointer-events-none absolute left-[1px] max-w-[520px] leading-7",
                        isHeroMinimal
                          ? "top-[8px] text-[14px] text-[#858481]"
                          : "top-[4px] text-[14px] text-[#a1a1aa]",
                        placeholderClassName,
                      )}
                    >
                      {placeholder}
                    </div>
                  ) : null}

                  {mentionOpen && typeof document !== "undefined"
                    ? createPortal(
                      <div
                        data-task-composer-mention-menu
                        data-testid="task-composer-mention-menu"
                        className="pointer-events-auto fixed z-[140] overflow-hidden rounded-[12px] border border-[#e2e5ea] bg-white shadow-[0_10px_30px_rgba(24,24,27,0.12)]"
                        style={{
                          top: mentionMenuStyle.top,
                          left: mentionMenuStyle.left,
                          width: mentionMenuStyle.width,
                        }}
                      >
                        <div className="flex h-11 items-center border-b border-[#e5e7eb] px-4">
                          <div className="text-[15px] font-semibold leading-5 text-[#111111]">
                            {isMentionSearchMode ? "选择工具" : "@数据源"}
                          </div>
                        </div>
                        {isMentionSearchMode ? (
                          <div
                            ref={toolListRef}
                            role="listbox"
                            aria-label="数据源列表"
                            className="min-h-0 overflow-y-auto overscroll-contain py-2"
                            style={{ height: mentionMenuListboxHeight, maxHeight: mentionMenuStyle.maxHeight }}
                            onKeyDown={handleMentionMenuKeyDown}
                            onWheel={(event) => event.stopPropagation()}
                          >
                            {mentionTools.length > 0 ? (
                              mentionTools.map((item, index) => (
                                <button
                                  key={item.id}
                                  ref={(node) => {
                                    toolItemRefs.current[index] = node;
                                  }}
                                  type="button"
                                  role="option"
                                  aria-selected={index === highlightedToolIndex}
                                  onMouseEnter={() => updateHighlightedToolIndex(index)}
                                  onPointerDown={(event) => {
                                    event.preventDefault();
                                    selectDataSource(item.id, "mention");
                                  }}
                                  onClick={(event) => event.preventDefault()}
                                  className={cn(
                                    "flex h-[46px] w-full cursor-pointer items-center px-4 text-left text-[14px] leading-5 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1764ff]/30",
                                    index === highlightedToolIndex ? "bg-[#f7f8fa]" : "hover:bg-[#f7f8fa]",
                                  )}
                                >
                                  <span className="min-w-0 truncate">
                                    <span className="text-[#b4b6bd]">
                                      {renderHighlightedText(item.parentLabel, mentionQuery)}
                                    </span>
                                    <span className="mx-2.5 text-[#111111]">/</span>
                                    <span className="font-medium text-[#111111]">
                                      {renderHighlightedText(item.label, mentionQuery)}
                                    </span>
                                  </span>
                                </button>
                              ))
                            ) : (
                              <div className="flex h-12 items-center px-4 text-[14px] text-[#9a9b97]">没有匹配工具</div>
                            )}
                          </div>
                        ) : (
                          <div
                            ref={toolListRef}
                            role="listbox"
                            aria-label="数据源列表"
                            className="grid min-h-0 grid-cols-[176px_minmax(0,1fr)] grid-rows-[minmax(0,1fr)] overflow-hidden"
                            style={{ height: Math.min(sourceButtonMenuListboxHeight, mentionMenuStyle.maxHeight), maxHeight: 360 }}
                            onKeyDown={handleMentionMenuKeyDown}
                            onWheel={(event) => event.stopPropagation()}
                          >
                            <div
                              data-testid="task-composer-mention-category-pane"
                              className="h-full min-h-0 overflow-y-auto overscroll-contain border-r border-[rgba(0,0,0,0.06)] bg-[#fafafa] p-2"
                            >
                              {sourceButtonToolGroups.map((group) => {
                                const active = group.items.some(
                                  (item) => filteredTools.findIndex((tool) => tool.id === item.id) === highlightedToolIndex,
                                );
                                return (
                                  <button
                                    key={group.id}
                                    type="button"
                                    tabIndex={-1}
                                    onClick={() => {
                                      const firstIndex = getSourceButtonGroupFirstIndex(group);
                                      if (firstIndex >= 0) updateHighlightedToolIndex(firstIndex, true);
                                    }}
                                    className={cn(
                                      "flex h-10 w-full items-center gap-2 rounded-[10px] px-2 text-left text-[14px] font-medium leading-5 text-[#6f716d] transition hover:bg-[rgba(55,53,47,0.05)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1764ff]/30",
                                      active && "bg-[rgba(55,53,47,0.06)] text-[#34322d]",
                                    )}
                                  >
                                    <PlatformLogo name={group.icon} color={group.accent} className="h-4 w-4 shrink-0" />
                                    <span className="truncate">{group.label}</span>
                                  </button>
                                );
                              })}
                            </div>
                            <div
                              ref={mentionOptionPaneRef}
                              data-testid="task-composer-mention-option-pane"
                              className="h-full min-h-0 overflow-y-auto overscroll-contain p-3"
                            >
                              {sourceButtonToolGroups.map((group) => (
                                <section key={group.id} className="pb-5 last:pb-1">
                                  <div className="mb-2 flex items-center gap-2 text-[14px] font-semibold leading-5 text-[#111111]">
                                    <span className="h-4 w-0.5 rounded-full bg-[#1764ff]" />
                                    {group.label}
                                  </div>
                                  <div className="grid grid-cols-2 gap-2.5">
                                    {group.items.map((item) => {
                                      const index = filteredTools.findIndex((tool) => tool.id === item.id);
                                      return (
                                        <button
                                          key={item.id}
                                          ref={(node) => {
                                            if (index >= 0) toolItemRefs.current[index] = node;
                                          }}
                                          type="button"
                                          role="option"
                                          aria-selected={index === highlightedToolIndex}
                                          onMouseEnter={() => updateHighlightedToolIndex(index)}
                                          onPointerDown={(event) => {
                                            event.preventDefault();
                                            selectDataSource(item.id, "mention");
                                          }}
                                          onClick={(event) => event.preventDefault()}
                                          className={cn(
                                            "flex min-h-[76px] cursor-pointer items-center gap-3 rounded-[12px] border bg-white px-3 py-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1764ff]/35",
                                            index === highlightedToolIndex
                                              ? "border-[rgba(23,100,255,0.24)] bg-[rgba(23,100,255,0.04)]"
                                              : "border-[rgba(0,0,0,0.06)] hover:border-[rgba(23,100,255,0.22)] hover:bg-[rgba(23,100,255,0.03)]",
                                          )}
                                        >
                                          <PlatformLogo name={item.icon} color={item.accent} className="h-4 w-4 shrink-0" />
                                          <span className="min-w-0 flex-1">
                                            <span className="block truncate text-[14px] font-medium leading-5 text-[#34322d]">
                                              {item.label}
                                            </span>
                                            <span className="mt-1 line-clamp-1 block text-[12px] leading-[18px] text-[#9a9b97]">
                                              {item.promptHint}
                                            </span>
                                          </span>
                                          <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-[#858481]" />
                                        </button>
                                      );
                                    })}
                                  </div>
                                </section>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>,
                      document.body,
                    )
                    : null}
                </div>
              </div>
            </div>

            {attachments.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {attachments.map((attachment) => {
                  const typeLabel = attachment.extension ? attachment.extension.toUpperCase() : "FILE";
                  return (
                    <div
                      key={attachment.id}
                      className="relative flex h-[58px] max-w-full items-center gap-3 rounded-[14px] bg-[#eeeeec] py-2 pl-2 pr-9 text-left"
                    >
                      {attachment.previewUrl ? (
                        <span
                          aria-label={`图片预览 ${attachment.name}`}
                          className="flex h-[42px] w-[42px] shrink-0 rounded-[10px] border border-white bg-cover bg-center bg-no-repeat"
                          style={{ backgroundImage: `url(${attachment.previewUrl})` }}
                        />
                      ) : (
                        <span className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-[10px] bg-white text-[10px] font-semibold text-[#8b8c87]">
                          {typeLabel.slice(0, 4)}
                        </span>
                      )}
                      <span className="min-w-0">
                        <span className="block max-w-[260px] truncate text-[14px] font-medium leading-5 text-[#18181b]">
                          {attachment.name}
                        </span>
                        <span className="mt-0.5 block text-[12px] leading-4 text-[#787a76]">
                          {typeLabel} | {formatComposerAttachmentSize(attachment.size)}
                        </span>
                      </span>
                      <button
                        type="button"
                        aria-label={`删除附件 ${attachment.name}`}
                        className="absolute -right-1.5 -top-1.5 inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#c7c7c3] text-white transition hover:bg-[#a9a9a4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#111111]/20"
                        onClick={() => removeAttachment(attachment.id)}
                      >
                        <X className="h-4 w-4" strokeWidth={2.4} />
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </div>

          <div
            className={cn(
              "mt-2.5 flex flex-wrap items-center justify-between gap-3 pt-2.5",
              isHeroMinimal ? "mt-2.5 border-t border-[rgba(0,0,0,0.06)] pt-2.5" : "border-t border-[#f1eeea]",
            )}
          >
            <div className="flex flex-wrap items-center gap-1.5">
              <Popover open={sourceButtonOpen} onOpenChange={setSourceButtonOpen}>
                <PopoverTrigger asChild>
                  <Button
                    ref={sourceButtonTriggerRef}
                    variant="outline"
                    size="sm"
                    className={cn(
                      "h-8 rounded-[10px] bg-white px-3 text-[14px] font-medium shadow-none",
                      isHeroMinimal
                        ? "border-[rgba(0,0,0,0.08)] text-[#34322d] hover:border-[rgba(0,0,0,0.12)] hover:bg-[rgba(55,53,47,0.06)]"
                        : "border-[#e6e2da] text-[#27272a] hover:border-[#d9d4cb] hover:bg-[#fbfaf8]",
                    )}
                    type="button"
                    onClick={() => {
                      if (sourceButtonOpen) {
                        setSourceButtonOpen(false);
                      } else {
                        openSourceButtonMenu();
                      }
                    }}
                    onKeyDown={(event) => {
                      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
                      event.preventDefault();
                      openSourceButtonMenu(event.key === "ArrowUp" ? filteredTools.length - 1 : 0);
                    }}
                  >
                    @数据源
                    <ChevronDown className={`h-3.5 w-3.5 transition ${sourceButtonOpen ? "rotate-180" : ""}`} />
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  align="start"
                  sideOffset={10}
                  onOpenAutoFocus={(event) => event.preventDefault()}
                  onCloseAutoFocus={(event) => event.preventDefault()}
	                  className="pointer-events-auto w-[760px] max-w-[calc(100vw-32px)] rounded-[18px] border-[rgba(0,0,0,0.08)] bg-white p-0 shadow-[0_20px_48px_rgba(24,24,27,0.12)]"
                >
                  <div className="flex items-center border-b border-[rgba(0,0,0,0.06)] px-4 py-3">
                    <div className="text-[14px] font-medium text-[#34322d]">@数据源</div>
                  </div>
	                  <div
	                    ref={sourceButtonListRef}
	                    role="listbox"
	                    aria-label="数据源列表"
	                    className="grid min-h-0 grid-cols-[176px_minmax(0,1fr)] grid-rows-[minmax(0,1fr)] overflow-hidden"
	                    style={{ height: sourceButtonMenuListboxHeight, maxHeight: 360 }}
	                    onKeyDown={handleSourceButtonMenuKeyDown}
	                    onWheel={(event) => event.stopPropagation()}
	                  >
	                    <div data-testid="task-composer-source-category-pane" className="h-full min-h-0 overflow-y-auto overscroll-contain border-r border-[rgba(0,0,0,0.06)] bg-[#fafafa] p-2">
	                      {sourceButtonToolGroups.map((group) => {
	                        const active = group.items.some((item) => filteredTools.findIndex((tool) => tool.id === item.id) === sourceButtonHighlightedIndex);
	                        return (
	                          <button
	                            key={group.id}
	                            type="button"
	                            tabIndex={-1}
	                            onClick={() => {
	                              const firstIndex = getSourceButtonGroupFirstIndex(group);
	                              if (firstIndex >= 0) updateSourceButtonHighlightedIndex(firstIndex, true);
	                            }}
	                            className={cn(
	                              "flex h-10 w-full items-center gap-2 rounded-[10px] px-2 text-left text-[14px] font-medium leading-5 text-[#6f716d] transition hover:bg-[rgba(55,53,47,0.05)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1764ff]/30",
	                              active && "bg-[rgba(55,53,47,0.06)] text-[#34322d]",
	                            )}
	                          >
	                            <PlatformLogo name={group.icon} color={group.accent} className="h-4 w-4 shrink-0" />
	                            <span className="truncate">{group.label}</span>
	                          </button>
	                        );
	                      })}
	                    </div>
	                    <div ref={sourceButtonOptionPaneRef} data-testid="task-composer-source-option-pane" className="h-full min-h-0 overflow-y-auto overscroll-contain p-3">
	                      {sourceButtonToolGroups.map((group) => (
	                        <section key={group.id} className="pb-5 last:pb-1">
	                          <div className="mb-2 flex items-center gap-2 text-[14px] font-semibold leading-5 text-[#111111]">
	                            <span className="h-4 w-0.5 rounded-full bg-[#1764ff]" />
	                            {group.label}
	                          </div>
	                          <div className="grid grid-cols-2 gap-2.5">
	                            {group.items.map((item) => {
	                              const index = filteredTools.findIndex((tool) => tool.id === item.id);
	                              return (
	                                <button
	                                  key={item.id}
	                                  ref={(node) => {
	                                    if (index >= 0) sourceButtonItemRefs.current[index] = node;
	                                  }}
	                                  type="button"
	                                  role="option"
	                                  aria-selected={index === sourceButtonHighlightedIndex}
	                                  onMouseEnter={() => updateSourceButtonHighlightedIndex(index)}
	                                  onPointerDown={(event) => {
	                                    event.preventDefault();
	                                    selectDataSource(item.id, "button");
	                                  }}
	                                  onClick={(event) => event.preventDefault()}
	                                  className={cn(
	                                    "flex min-h-[76px] cursor-pointer items-center gap-3 rounded-[12px] border bg-white px-3 py-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1764ff]/35",
	                                    index === sourceButtonHighlightedIndex
	                                      ? "border-[rgba(23,100,255,0.24)] bg-[rgba(23,100,255,0.04)]"
	                                      : "border-[rgba(0,0,0,0.06)] hover:border-[rgba(23,100,255,0.22)] hover:bg-[rgba(23,100,255,0.03)]",
	                                  )}
	                                >
	                                  <PlatformLogo name={item.icon} color={item.accent} className="h-4 w-4 shrink-0" />
	                                  <span className="min-w-0 flex-1">
	                                    <span className="block truncate text-[14px] font-medium leading-5 text-[#34322d]">{item.label}</span>
	                                    <span className="mt-1 line-clamp-1 block text-[12px] leading-[18px] text-[#9a9b97]">
	                                      {item.promptHint}
	                                    </span>
	                                  </span>
	                                  <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-[#858481]" />
	                                </button>
	                              );
	                            })}
	                          </div>
	                        </section>
	                      ))}
	                    </div>
	                  </div>
                </PopoverContent>
              </Popover>

              {showAttachmentButton ? (
                <>
                  <input
                    ref={fileInputRef}
                    id={fileInputId}
                    type="file"
                    className="sr-only"
                    accept="image/*,.xlsx,.csv,.pdf,.zip,.json"
                    multiple
                    onChange={(event) => {
                      if (event.target.files?.length) {
                        const selectedFiles = Array.from(event.target.files);
                        setAttachments((current) => [
                          ...current,
                          ...selectedFiles.map((file, index) => createComposerAttachment(file, current.length + index)),
                        ]);
                        onFilesSelected(event.target.files);
                      }
                      event.target.value = "";
                    }}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className={cn(
                      "h-8 rounded-[10px] border px-3 text-[14px] font-medium",
                      isHeroMinimal
                        ? "border-transparent text-[#34322d] hover:border-[rgba(0,0,0,0.08)] hover:bg-[rgba(55,53,47,0.06)] hover:text-[#34322d]"
                        : "border-transparent text-[#6f7783] hover:border-[#e8e2d8] hover:bg-[#faf8f4] hover:text-[#27272a]",
                    )}
                    onClick={() => {
                      setSourceButtonOpen(false);
                      closeMentionMenu();
                      setModeOpen(false);
                      const input = fileInputRef.current;
                      if (!input) return;
                      if ("showPicker" in input && typeof input.showPicker === "function") {
                        input.showPicker();
                        return;
                      }
                      input.click();
                    }}
                    aria-label="添加附件"
                  >
                    <Paperclip className="h-4 w-4" />
                    附件
                  </Button>
                </>
              ) : null}
            </div>

            <div className="flex items-center gap-2.5">
              {/* <Popover open={modeOpen} onOpenChange={setModeOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className={cn(
                      "h-[30px] rounded-[10px] bg-white px-[10px] text-[12px] shadow-none",
                      isHeroMinimal
                        ? "border-[#e5e7eb] text-[#6b7280] hover:bg-[#fafafa]"
                        : "border-[#e7e5e4] text-[#52525b] hover:bg-[#fafaf9]",
                    )}
                    type="button"
                    onClick={() => {
                      setSourceButtonOpen(false);
                      closeMentionMenu();
                    }}
                  >
                    {composerModeLabel[mode]}
                    <ChevronDown className="h-[13px] w-[13px]" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  align="end"
                  onOpenAutoFocus={(event) => event.preventDefault()}
                  onCloseAutoFocus={(event) => event.preventDefault()}
                  className="w-[180px] rounded-[18px] border-[#e7e5e4] p-2 shadow-[0_16px_34px_rgba(24,24,27,0.08)]"
                >
                  <div className="grid gap-1">
                    {(["普通模式", "深度模式"] as const).map((option) => (
                      <button
                        key={option}
                        type="button"
                        onClick={() => {
                          onModeChange(option);
                          setModeOpen(false);
                          focusEditor();
                        }}
                        className={`rounded-[12px] px-3 py-3 text-left text-sm transition ${
                          mode === option ? "bg-[#f5f5f4] text-[#18181b]" : "text-[#52525b] hover:bg-[#f5f5f4]"
                        }`}
                      >
                        {composerModeLabel[option]}
                      </button>
                    ))}
                  </div>
                </PopoverContent>
              </Popover> */}

              {showSubmitButton ? (
                <Button
                  type="button"
                  onClick={() => (showStop ? onStop?.() : onSubmit())}
                  size="icon"
                  aria-label={showStop ? "停止任务" : "发送任务"}
                  data-testid="task-composer-submit"
                  className={
                    showStop
                      ? cn(
                          resolvedSendButtonClassName,
                          "shrink-0 rounded-full border-transparent !bg-[#171a1f] p-0 text-white shadow-none transition hover:!bg-[#111318] focus-visible:ring-2 focus-visible:ring-[#171a1f]/20",
                        )
                      : resolvedSendButtonClassName
                  }
                >
                  {showStop ? (
                    <span className="block h-4 w-4 rounded-[3px] bg-white" aria-hidden />
                  ) : (
                    <ArrowUp className="h-[15px] w-[15px]" strokeWidth={2.4} />
                  )}
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      </div>
      </div>
  );

  return (
    <div className="contents" data-assistant-ui-composer>
      {composerCard}
    </div>
  );
}
