"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { ArrowUp, ChevronDown, CornerDownLeft, Paperclip, X } from "@/components/ui/tabler-icons";
import { PromptLibraryPicker } from "@/components/prompt-library-picker";
import { parseDatasourceMentions, type ComposerSourcePlacement } from "@/lib/composer-prefill";

import {
  homeCapabilityGroups,
  homeDataSourceItems,
  type HomeCapabilityGroup,
  type HomeCapabilityItem,
} from "@/lib/home-capability-items";
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
  dataSourceGroups?: HomeCapabilityGroup[];
  dataSourceItems?: HomeCapabilityItem[];
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
  showPromptLibraryButton?: boolean;
  visualStyle?: "default" | "heroMinimal";
  containerClassName?: string;
  editorRowClassName?: string;
  textareaClassName?: string;
  placeholderClassName?: string;
  sendButtonClassName?: string;
  suppressTemplateCompletion?: boolean;
  sourcePlacements?: ComposerSourcePlacement[];
  sourceMenuSide?: "top" | "right" | "bottom" | "left";
  onPromptUse?: (promptText: string) => void;
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

const DATA_SOURCE_GRID_COLUMNS = 2;
const DATA_SOURCE_SECTION_SCROLL_GAP = 10;
const DATA_SOURCE_SECTION_HEADING_CLASS =
  "mb-2 flex items-center gap-2 text-body font-semibold leading-5 text-foreground";
const EDITOR_IGNORED_TEXT_SELECTOR = "[data-tool-token='true'], [data-template-ghost='true']";
const TEMPLATE_SLOT_SELECTOR = "[data-template-slot='true']";
const EMPTY_TEMPLATE_SLOT_TEXT = "\u200b";
const EMPTY_TEMPLATE_SLOT_TEXT_PATTERN = /\u200b/g;
const EMPTY_SOURCE_PLACEMENTS: ComposerSourcePlacement[] = [];

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

function imageExtensionFromMime(type: string) {
  const subtype = type.toLowerCase().replace(/^image\//, "").replace("+xml", "");
  if (!subtype || subtype === type.toLowerCase()) return "png";
  if (subtype === "jpeg") return "jpg";
  return subtype;
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

function scrollSectionIntoPane(section: HTMLElement | null | undefined, pane: HTMLElement | null | undefined) {
  if (!section || !pane) return;
  pane.scrollTop = Math.max(0, section.offsetTop - DATA_SOURCE_SECTION_SCROLL_GAP);
}

function estimateDataSourceMenuHeight(groupCount: number, maxHeight: number) {
  if (groupCount <= 0) return 180;
  const categoryColumnHeight = groupCount * 40 + 16;
  const optionPaneHeight = groupCount * 134 + 24;
  return Math.min(maxHeight, Math.max(180, categoryColumnHeight, optionPaneHeight));
}

function DataSourceGroupHeading({ label }: { label: string }) {
  return (
    <div className={DATA_SOURCE_SECTION_HEADING_CLASS} data-testid="task-composer-source-section-heading">
      <span className="h-4 w-0.5 rounded-full bg-primary" />
      {label}
    </div>
  );
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

function ensurePastedImageName(file: File, index: number) {
  if (file.name.trim()) return file;
  const extension = getAttachmentExtension(file.name) || imageExtensionFromMime(file.type);
  return new File([file], `pasted-image-${index + 1}.${extension}`, {
    type: file.type || `image/${extension}`,
    lastModified: file.lastModified || Date.now(),
  });
}

function getClipboardImageFiles(data: DataTransfer) {
  const found: File[] = [];
  const seen = new Set<string>();
  const add = (file: File | null) => {
    if (!file) return;
    const extension = getAttachmentExtension(file.name);
    if (!isImageAttachment(file, extension)) return;
    const key = `${file.name}:${file.type}:${file.size}`;
    if (seen.has(key)) return;
    seen.add(key);
    found.push(file);
  };

  Array.from(data.files ?? []).forEach(add);
  Array.from(data.items ?? []).forEach((item) => {
    if (item.kind !== "file") return;
    add(item.getAsFile());
  });

  return found.map((file, index) => ensurePastedImageName(file, index));
}

function normalizeTemplateSlotPlainText(text: string) {
  return text.replace(EMPTY_TEMPLATE_SLOT_TEXT_PATTERN, "");
}

function getDomTextOffsetForPlainOffset(text: string, plainOffset: number) {
  if (!text.includes(EMPTY_TEMPLATE_SLOT_TEXT)) return plainOffset;
  let visibleOffset = 0;
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === EMPTY_TEMPLATE_SLOT_TEXT) {
      if (visibleOffset === plainOffset) return index + 1;
      continue;
    }
    if (visibleOffset === plainOffset) return index;
    visibleOffset += 1;
  }
  return text.length;
}

function getSelectionOffsets(container: HTMLElement) {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  if (!container.contains(range.startContainer) || !container.contains(range.endContainer)) return null;

  const getRangeTextLength = (targetRange: Range) => {
    const fragment = targetRange.cloneContents();
    fragment.querySelectorAll?.(EDITOR_IGNORED_TEXT_SELECTOR).forEach((node) => node.remove());
    return normalizeTemplateSlotPlainText(fragment.textContent ?? "").length;
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
    const textContent = node.textContent ?? "";
    const length = normalizeTemplateSlotPlainText(textContent).length;
    if (!startSet && currentOffset + length >= startOffset) {
      range.setStart(node, getDomTextOffsetForPlainOffset(textContent, Math.max(0, startOffset - currentOffset)));
      startSet = true;
    }
    if (currentOffset + length >= endOffset) {
      range.setEnd(node, getDomTextOffsetForPlainOffset(textContent, Math.max(0, endOffset - currentOffset)));
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
  return normalizeTemplateSlotPlainText(text).replace(/\u00a0/g, " ").replace(/^[ \t]+/, "");
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

function getSourcePlacementKey(placements: ComposerSourcePlacement[]) {
  return placements.map((placement) => `${placement.sourceId}:${placement.offset}`).join("|");
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

function getTemplateSlotFromNode(container: HTMLElement, node: Node | null) {
  if (!node || !container.contains(node)) return null;
  const element = node instanceof HTMLElement ? node : node.parentElement;
  const slot = element?.closest<HTMLElement>(TEMPLATE_SLOT_SELECTOR) ?? null;
  return slot && container.contains(slot) ? slot : null;
}

function getTemplateSlotOffset(slot: HTMLElement, node: Node, offset: number) {
  const range = document.createRange();
  range.selectNodeContents(slot);
  range.setEnd(node, offset);
  return normalizeTemplateSlotPlainText(range.toString()).length;
}

function getTemplateSlotSelectionState(container: HTMLElement) {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  const startSlot = getTemplateSlotFromNode(container, range.startContainer);
  const endSlot = getTemplateSlotFromNode(container, range.endContainer);
  if (!startSlot || startSlot !== endSlot) return null;

  return {
    slot: startSlot,
    text: normalizeTemplateSlotPlainText(startSlot.textContent ?? ""),
    startOffset: getTemplateSlotOffset(startSlot, range.startContainer, range.startOffset),
    endOffset: getTemplateSlotOffset(startSlot, range.endContainer, range.endOffset),
    isCollapsed: selection.isCollapsed,
  };
}

function getTemplateSlotNearCaret(container: HTMLElement, direction: "backward" | "forward") {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || !selection.isCollapsed) return null;
  const { anchorNode, anchorOffset } = selection;
  if (!anchorNode || !container.contains(anchorNode)) return null;

  const resolveSlotFromNode = (node: Node | null, step: "previousSibling" | "nextSibling"): HTMLElement | null => {
    let current = node;
    while (current) {
      if (current instanceof HTMLElement && current.dataset.templateSlot === "true") {
        return current;
      }
      if (current.nodeType === Node.TEXT_NODE && normalizeTemplateSlotPlainText(current.textContent ?? "").trim() !== "") {
        return null;
      }
      current = current[step];
    }
    return null;
  };

  if (anchorNode.nodeType === Node.TEXT_NODE) {
    const textContent = normalizeTemplateSlotPlainText(anchorNode.textContent ?? "");
    const leading = textContent.slice(0, anchorOffset);
    const trailing = textContent.slice(anchorOffset);

    if (direction === "backward" && leading.trim() !== "") return null;
    if (direction === "forward" && trailing.trim() !== "") return null;

    return resolveSlotFromNode(
      direction === "backward" ? anchorNode.previousSibling : anchorNode.nextSibling,
      direction === "backward" ? "previousSibling" : "nextSibling",
    );
  }

  const siblings = anchorNode.childNodes;
  const seed =
    direction === "backward"
      ? siblings[Math.max(0, anchorOffset - 1)] ?? null
      : siblings[Math.min(siblings.length - 1, anchorOffset)] ?? null;

  return resolveSlotFromNode(seed, direction === "backward" ? "previousSibling" : "nextSibling");
}

function placeCaretInsideTemplateSlot(slot: HTMLElement, position: "start" | "end" = "end") {
  const selection = window.getSelection();
  if (!selection) return;
  let textNode = Array.from(slot.childNodes).find((node) => node.nodeType === Node.TEXT_NODE) as Text | undefined;
  if (!textNode) {
    textNode = document.createTextNode(EMPTY_TEMPLATE_SLOT_TEXT);
    slot.appendChild(textNode);
  }
  const range = document.createRange();
  range.setStart(textNode, position === "start" ? 0 : (textNode.textContent?.length ?? 0));
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
}

function keepTemplateSlotEmpty(slot: HTMLElement) {
  slot.dataset.empty = "true";
  slot.textContent = EMPTY_TEMPLATE_SLOT_TEXT;
  placeCaretInsideTemplateSlot(slot);
}

function updateTemplateSlotText(slot: HTMLElement, text: string, caretPosition: "start" | "end") {
  delete slot.dataset.empty;
  slot.textContent = text;
  placeCaretInsideTemplateSlot(slot, caretPosition);
}

function removeTemplateSlotNode(slot: HTMLElement) {
  const selection = window.getSelection();
  const range = document.createRange();
  range.setStartBefore(slot);
  range.collapse(true);
  slot.remove();
  selection?.removeAllRanges();
  selection?.addRange(range);
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

function insertPlainTextAtSelectionWithUndo(text: string) {
  if (typeof document.execCommand === "function" && document.execCommand("insertText", false, text)) return;
  insertPlainTextAtSelection(text);
}

function handleEditorPaste(
  event: React.ClipboardEvent<HTMLElement>,
  syncValue: () => string,
  appendImageFiles?: (files: File[]) => void,
) {
  const imageFiles = appendImageFiles ? getClipboardImageFiles(event.clipboardData) : [];
  if (imageFiles.length > 0) {
    event.preventDefault();
    appendImageFiles?.(imageFiles);
    syncValue();
    return;
  }

  event.preventDefault();
  const plain = event.clipboardData.getData("text/plain");
  if (!plain) return;
  insertPlainTextAtSelectionWithUndo(plain);
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

function getTemplateCompletionPrefix(value: string) {
  if (!value) return "";
  return /\s$/.test(value) ? value : `${value} `;
}

function getCapabilityPromptTemplates(source: HomeCapabilityItem) {
  const templates: string[] = [];
  const addTemplate = (template: string | null | undefined) => {
    const normalized = template?.trim();
    if (!normalized || templates.includes(normalized)) return;
    templates.push(normalized);
  };

  addTemplate(source.promptTemplate);
  source.promptTemplates?.forEach(addTemplate);
  return templates;
}

function createTemplateSlotNode(text: string) {
  const span = document.createElement("span");
  span.dataset.templateSlot = "true";
  span.className =
    "mx-1 inline-flex h-6 min-w-4 cursor-text items-center rounded-sm bg-fill-hover px-1.5 align-baseline text-body font-medium leading-6 text-foreground";
  span.textContent = text;
  return span;
}

function createTemplateGhostNode(template: string, phase: "visible" | "fading") {
  const span = document.createElement("span");
  span.dataset.templateGhost = "true";
  span.className = cn(
    "pointer-events-none select-none text-text-disabled transition-opacity duration-200",
    phase === "fading" ? "opacity-0" : "opacity-100",
  );
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

function appendPromptTemplateNodesWithSourcePlacements(
  container: HTMLElement,
  template: string,
  placements: ComposerSourcePlacement[],
  sources: HomeCapabilityItem[],
) {
  let cursor = 0;
  placements.forEach((placement) => {
    const source = sources.find((item) => item.id === placement.sourceId);
    if (!source) return;
    const offset = Math.min(Math.max(0, placement.offset), template.length);
    appendPromptTemplateNodes(container, template.slice(cursor, offset));
    container.appendChild(
      createToolTokenNode({
        capabilityId: source.id,
        icon: source.icon,
        label: source.label,
        accent: source.accent,
      }),
    );
    cursor = offset;
  });
  appendPromptTemplateNodes(container, template.slice(cursor));
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
      <span key={`${text}-${index}`} className="font-medium text-link">
        {text.slice(index, index + normalizedQuery.length)}
      </span>,
    );
    cursor = index + normalizedQuery.length;
    index = lowerText.indexOf(lowerQuery, cursor);
  }

  if (cursor < text.length) nodes.push(text.slice(cursor));
  return nodes;
}

function getMentionMatchRank(item: HomeCapabilityItem, normalizedQuery: string) {
  const query = normalizedQuery.trim().toLowerCase();
  if (!query) return 0;

  const primaryText = item.label.toLowerCase();
  if (primaryText.includes(query)) return 0;

  const secondaryText = [item.parentLabel, item.promptHint, item.id]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (secondaryText.includes(query)) return 1;

  const templateText = getCapabilityPromptTemplates(item).join(" ").toLowerCase();
  if (templateText.includes(query)) return 2;

  return null;
}

function createToolTokenNode({
  capabilityId,
  icon,
  label,
  accent,
}: {
  capabilityId: string;
  icon: string;
  label: string;
  accent: string;
}) {
  const token = document.createElement("span");
  token.dataset.toolToken = "true";
  token.dataset.toolId = capabilityId;
  token.dataset.sourceTag = capabilityId;
  token.className =
    "mx-1 inline-flex h-7 max-w-[220px] items-center gap-1.5 whitespace-nowrap rounded-control border border-border bg-bg-surface px-2.5 align-middle text-body font-medium leading-none text-foreground shadow-surface";
  token.setAttribute("contenteditable", "false");
  token.setAttribute("aria-label", `数据源 ${label}`);

  const iconWrap = document.createElement("span");
  iconWrap.className = "inline-flex h-4 w-4 shrink-0 items-center justify-center";
  iconWrap.setAttribute("aria-hidden", "true");
  iconWrap.innerHTML = getPlatformLogoSvgMarkup({ name: icon, color: accent, className: "h-4 w-4" });

  const labelNode = document.createElement("span");
  labelNode.className = "min-w-0 translate-y-px truncate";
  labelNode.textContent = label;

  token.appendChild(iconWrap);
  token.appendChild(labelNode);

  return token;
}

export function TaskComposer({
  value,
  onValueChange,
  placeholder,
  selectedSourceIds = [],
  dataSourceGroups = homeCapabilityGroups,
  dataSourceItems = homeDataSourceItems,
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
  showPromptLibraryButton = true,
  visualStyle = "default",
  containerClassName,
  editorRowClassName,
  textareaClassName,
  placeholderClassName,
  sendButtonClassName,
  suppressTemplateCompletion = false,
  sourcePlacements = [],
  sourceMenuSide = "bottom",
  onPromptUse,
}: TaskComposerProps) {
  const isHeroMinimal = visualStyle === "heroMinimal";
  const hasText = value.trim().length > 0;
  const showStop = submitVariant === "stop";
  const fileInputId = useId();
  const textboxRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const sourceButtonTriggerRef = useRef<HTMLButtonElement | null>(null);
  const sourceButtonItemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const sourceButtonCategoryRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const sourceButtonGroupSectionRefs = useRef<Array<HTMLElement | null>>([]);
  const sourceButtonListRef = useRef<HTMLDivElement | null>(null);
  const sourceButtonOptionPaneRef = useRef<HTMLDivElement | null>(null);
  const sourceButtonHighlightedIndexRef = useRef(-1);
  const toolItemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const mentionCategoryRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const mentionGroupSectionRefs = useRef<Array<HTMLElement | null>>([]);
  const toolListRef = useRef<HTMLDivElement | null>(null);
  const mentionOptionPaneRef = useRef<HTMLDivElement | null>(null);
  const highlightedToolIndexRef = useRef(-1);
  const mentionModeKeyRef = useRef("");
  const mentionRangeRef = useRef<{ start: number; end: number } | null>(null);
  const suppressExternalSyncRef = useRef(false);
  const pendingEditorEndPlacementRef = useRef(false);
  const syncEditorInteractionStateRef = useRef<(editor: HTMLElement) => void>(() => {});
  const onAttachmentsChangeRef = useRef(onAttachmentsChange);
  const attachmentsRef = useRef<ComposerAttachment[]>([]);

  const [sourceButtonOpen, setSourceButtonOpen] = useState(false);
  const [sourceButtonHighlightedIndex, setSourceButtonHighlightedIndex] = useState(-1);
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
  const [optimisticSourceIds, setOptimisticSourceIds] = useState<string[]>([]);
  const canSubmit = hasText || attachments.length > 0;
  const handleSubmit = () => {
    if (showStop) {
      onStop?.();
      return;
    }
    if (!canSubmit) return;
    onSubmit();
    setAttachments((current) => {
      current.forEach((attachment) => {
        if (attachment.previewUrl) URL.revokeObjectURL(attachment.previewUrl);
      });
      return [];
    });
  };
  const defaultSendButtonClassName = isHeroMinimal
    ? canSubmit
      ? "h-8 w-8 min-w-0 rounded-full border border-transparent bg-primary p-0 text-primary-foreground shadow-none transition hover:bg-primary/85"
      : "h-8 w-8 min-w-0 rounded-full border border-transparent bg-fill-active p-0 text-primary-foreground shadow-none transition hover:bg-fill-active"
    : canSubmit
      ? "h-10 w-10 min-w-0 rounded-full border border-transparent bg-primary p-0 text-primary-foreground shadow-none transition hover:bg-primary/85"
      : "h-10 w-10 min-w-0 rounded-full border border-transparent bg-fill-active p-0 text-primary-foreground shadow-none transition hover:bg-fill-active";
  const resolvedSendButtonClassName = sendButtonClassName ?? defaultSendButtonClassName;
  const [acceptedTemplateToolId, setAcceptedTemplateToolId] = useState<string | null>(null);
  const [acceptedTemplatePrefix, setAcceptedTemplatePrefix] = useState("");
  const [internalSuppressTemplateCompletion, setInternalSuppressTemplateCompletion] = useState(false);
  const blurTimeoutRef = useRef<number | null>(null);
  const preserveMentionFocusRef = useRef(false);

  const filteredTools = useMemo(() => dataSourceItems, [dataSourceItems]);

  const effectiveSelectedSourceIds = useMemo(
    () => [
      ...selectedSourceIds,
      ...optimisticSourceIds.filter((id) => !selectedSourceIds.includes(id)),
    ],
    [optimisticSourceIds, selectedSourceIds],
  );

  useEffect(() => {
    if (optimisticSourceIds.length === 0) return;
    const timer = window.setTimeout(() => {
      setOptimisticSourceIds((current) => current.filter((id) => !selectedSourceIds.includes(id)));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [optimisticSourceIds.length, selectedSourceIds]);

  const selectedSources = useMemo(
    () =>
      effectiveSelectedSourceIds
        .map((id) => filteredTools.find((item) => item.id === id))
        .filter((item): item is (typeof filteredTools)[number] => Boolean(item)),
    [effectiveSelectedSourceIds, filteredTools],
  );
  const inlineSourcePlacements = useMemo(() => {
    const selectedSet = new Set(effectiveSelectedSourceIds);
    const seen = new Set<string>();
    return sourcePlacements
      .filter((placement) => selectedSet.has(placement.sourceId))
      .map((placement) => ({
        sourceId: placement.sourceId,
        offset: Math.min(Math.max(0, placement.offset), value.length),
      }))
      .sort((a, b) => a.offset - b.offset)
      .filter((placement) => {
        if (seen.has(placement.sourceId)) return false;
        seen.add(placement.sourceId);
        return true;
      });
  }, [effectiveSelectedSourceIds, sourcePlacements, value.length]);
  const inlineSourcePlacementKey = useMemo(() => getSourcePlacementKey(inlineSourcePlacements), [inlineSourcePlacements]);
  const renderedPlainValue = useMemo(() => getPromptTemplatePlainText(value), [value]);

  const templateSuggestion = useMemo(() => {
    const source = [...selectedSources].reverse().find((item) => getCapabilityPromptTemplates(item).length > 0);
    if (!source) return null;
    const templates = getCapabilityPromptTemplates(source);
    const templateIndex = 0;
    const template = templates[templateIndex];
    if (!template) return null;
    return {
      toolId: source.id,
      template,
      templateIndex,
      templates,
      plainText: getPromptTemplatePlainText(template),
    };
  }, [selectedSources]);

  const acceptedTemplateRender = useMemo(() => {
    if (!acceptedTemplateToolId) return null;
    const source = selectedSources.find((item) => item.id === acceptedTemplateToolId);
    if (!source) return null;
    const templates = getCapabilityPromptTemplates(source);
    if (templates.length === 0) return null;
    const templateIndex = 0;
    const template = templates[templateIndex];
    if (!template) return null;
    const plainText = getPromptTemplatePlainText(template);
    return {
      toolId: source.id,
      template,
      templateIndex,
      plainText,
    };
  }, [acceptedTemplateToolId, selectedSources]);

  const templateGhostRender = useMemo(() => {
    if (
      suppressTemplateCompletion ||
      internalSuppressTemplateCompletion ||
      mentionOpen ||
      acceptedTemplateRender ||
      !templateSuggestion
    ) {
      return null;
    }
    return {
      ...templateSuggestion,
      phase: "visible" as const,
    };
  }, [acceptedTemplateRender, internalSuppressTemplateCompletion, mentionOpen, suppressTemplateCompletion, templateSuggestion]);

  const acceptedTemplatePrefill = useMemo(() => {
    if (!acceptedTemplateRender) return null;
    return parseDatasourceMentions(`${acceptedTemplatePrefix}${acceptedTemplateRender.template}`, filteredTools);
  }, [acceptedTemplatePrefix, acceptedTemplateRender, filteredTools]);
  const acceptedTemplateSourcePlacements = acceptedTemplatePrefill?.sourcePlacements ?? EMPTY_SOURCE_PLACEMENTS;
  const acceptedTemplateSourcePlacementKey = useMemo(
    () => getSourcePlacementKey(acceptedTemplateSourcePlacements),
    [acceptedTemplateSourcePlacements],
  );
  const renderedSourceIds = useMemo(() => {
    const placedIds = new Set([
      ...inlineSourcePlacements.map((placement) => placement.sourceId),
      ...acceptedTemplateSourcePlacements.map((placement) => placement.sourceId),
    ]);
    return [
      ...selectedSources.filter((source) => !placedIds.has(source.id)).map((source) => source.id),
      ...inlineSourcePlacements.map((placement) => placement.sourceId),
      ...acceptedTemplateSourcePlacements.map((placement) => placement.sourceId),
    ];
  }, [acceptedTemplateSourcePlacements, inlineSourcePlacements, selectedSources]);

  const mentionQuery = useMemo(() => {
    if (!mentionRange) return "";
    return value.slice(mentionRange.start + 1, mentionRange.end);
  }, [mentionRange, value]);
  const isMentionSearchMode = mentionQuery.trim().length > 0;

  const sourceButtonToolGroups = useMemo(
    () =>
      dataSourceGroups
        .map((group) => ({
          ...group,
          items: group.items.filter((item) => filteredTools.some((tool) => tool.id === item.id)),
        }))
        .filter((group) => group.items.length > 0),
    [dataSourceGroups, filteredTools],
  );
  const [menuSnapshot, setMenuSnapshot] = useState<{
    tools: HomeCapabilityItem[];
    groups: HomeCapabilityGroup[];
  } | null>(null);
  const menuSnapshotActive = sourceButtonOpen || mentionOpen;
  const activeFilteredTools = menuSnapshotActive && menuSnapshot ? menuSnapshot.tools : filteredTools;
  const activeSourceButtonToolGroups = menuSnapshotActive && menuSnapshot ? menuSnapshot.groups : sourceButtonToolGroups;
  const activeSourceButtonMenuListboxHeight = useMemo(
    () => estimateDataSourceMenuHeight(activeSourceButtonToolGroups.length, 360),
    [activeSourceButtonToolGroups.length],
  );

  const mentionTools = useMemo(() => {
    const query = mentionQuery.trim().toLowerCase();
    if (!query) return activeFilteredTools;
    const rankedTools = activeFilteredTools
      .map((item, index) => ({ item, index, rank: getMentionMatchRank(item, query) }))
      .filter((entry): entry is { item: HomeCapabilityItem; index: number; rank: number } => entry.rank !== null);
    const hasNameMatch = rankedTools.some((entry) => entry.rank < 2);
    return rankedTools
      .filter((entry) => !hasNameMatch || entry.rank < 2)
      .sort((a, b) => a.rank - b.rank || a.index - b.index)
      .map((entry) => entry.item);
  }, [activeFilteredTools, mentionQuery]);

  const mentionMenuListboxHeight = useMemo(
    () => Math.min(mentionMenuStyle.maxHeight, Math.max(48, mentionTools.length * 46)),
    [mentionMenuStyle.maxHeight, mentionTools.length],
  );

  const captureMenuSnapshot = useCallback(() => {
    setMenuSnapshot({ tools: filteredTools, groups: sourceButtonToolGroups });
  }, [filteredTools, sourceButtonToolGroups]);

  const clearMenuSnapshot = useCallback(() => {
    setMenuSnapshot(null);
  }, []);

  const getSourceButtonGroupFirstIndex = (group: (typeof activeSourceButtonToolGroups)[number]) => {
    const firstItem = group.items[0];
    return firstItem ? activeFilteredTools.findIndex((tool) => tool.id === firstItem.id) : -1;
  };

  const getGroupFirstToolIndexByGroupIndex = (groupIndex: number) => {
    const group = activeSourceButtonToolGroups[groupIndex];
    return group ? getSourceButtonGroupFirstIndex(group) : -1;
  };

  const getGroupIndexForToolIndex = (toolIndex: number) => {
    const tool = activeFilteredTools[toolIndex];
    if (!tool) return -1;
    return activeSourceButtonToolGroups.findIndex((group) => group.items.some((item) => item.id === tool.id));
  };

  const getSafeGroupIndex = (index: number) => {
    if (activeSourceButtonToolGroups.length === 0) return -1;
    return ((index % activeSourceButtonToolGroups.length) + activeSourceButtonToolGroups.length) % activeSourceButtonToolGroups.length;
  };

  const getToolIndexByGroupPosition = (groupIndex: number, itemIndex: number) => {
    const group = activeSourceButtonToolGroups[groupIndex];
    if (!group || group.items.length === 0) return -1;
    const safeItemIndex = Math.min(Math.max(itemIndex, 0), group.items.length - 1);
    const item = group.items[safeItemIndex];
    return item ? activeFilteredTools.findIndex((tool) => tool.id === item.id) : -1;
  };

  const getToolPositionByIndex = (toolIndex: number) => {
    const tool = activeFilteredTools[toolIndex];
    if (!tool) return null;
    const groupIndex = activeSourceButtonToolGroups.findIndex((group) => group.items.some((item) => item.id === tool.id));
    const group = activeSourceButtonToolGroups[groupIndex];
    if (!group) return null;
    const itemIndex = group.items.findIndex((item) => item.id === tool.id);
    if (itemIndex < 0) return null;
    return { group, groupIndex, itemIndex };
  };

  const getGroupedToolNavigationTarget = (toolIndex: number, key: "ArrowDown" | "ArrowRight" | "ArrowUp" | "ArrowLeft") => {
    const position = getToolPositionByIndex(toolIndex);
    if (!position) {
      const safeIndex =
        activeFilteredTools.length === 0 ? -1 : ((toolIndex % activeFilteredTools.length) + activeFilteredTools.length) % activeFilteredTools.length;
      return { kind: "item" as const, index: safeIndex };
    }

    const { group, groupIndex, itemIndex } = position;
    const columnIndex = itemIndex % DATA_SOURCE_GRID_COLUMNS;

    if (key === "ArrowLeft") {
      if (columnIndex === 0) {
        const previousGroupIndex = getSafeGroupIndex(groupIndex - 1);
        const previousGroup = activeSourceButtonToolGroups[previousGroupIndex];
        const previousItemIndex = previousGroup ? previousGroup.items.length - 1 : itemIndex;
        const previousIndex = getToolIndexByGroupPosition(previousGroupIndex, previousItemIndex);
        return { kind: "item" as const, index: previousIndex >= 0 ? previousIndex : toolIndex };
      }
      const previousIndex = getToolIndexByGroupPosition(groupIndex, itemIndex - 1);
      return { kind: "item" as const, index: previousIndex >= 0 ? previousIndex : toolIndex };
    }

    if (key === "ArrowRight") {
      const nextIndex = getToolIndexByGroupPosition(groupIndex, itemIndex + 1);
      if (itemIndex + 1 < group.items.length && nextIndex >= 0) return { kind: "item" as const, index: nextIndex };
      const nextGroupIndex = getSafeGroupIndex(groupIndex + 1);
      return { kind: "item" as const, index: getToolIndexByGroupPosition(nextGroupIndex, 0) };
    }

    if (key === "ArrowDown") {
      const nextRowIndex = getToolIndexByGroupPosition(groupIndex, itemIndex + DATA_SOURCE_GRID_COLUMNS);
      if (itemIndex + DATA_SOURCE_GRID_COLUMNS < group.items.length && nextRowIndex >= 0) {
        return { kind: "item" as const, index: nextRowIndex };
      }
      const nextGroupIndex = getSafeGroupIndex(groupIndex + 1);
      return {
        kind: "item" as const,
        index: getToolIndexByGroupPosition(nextGroupIndex, columnIndex),
      };
    }

    const previousRowIndex = getToolIndexByGroupPosition(groupIndex, itemIndex - DATA_SOURCE_GRID_COLUMNS);
    if (itemIndex - DATA_SOURCE_GRID_COLUMNS >= 0 && previousRowIndex >= 0) {
      return { kind: "item" as const, index: previousRowIndex };
    }
    const previousGroupIndex = getSafeGroupIndex(groupIndex - 1);
    const previousGroup = activeSourceButtonToolGroups[previousGroupIndex];
    const previousGroupLastRowStart = previousGroup
      ? Math.max(0, previousGroup.items.length - DATA_SOURCE_GRID_COLUMNS)
      : 0;
    return {
      kind: "item" as const,
      index: getToolIndexByGroupPosition(previousGroupIndex, previousGroupLastRowStart + columnIndex),
    };
  };

  const getLinearGroupedToolNavigationIndex = (toolIndex: number, delta: 1 | -1) => {
    const orderedIndexes = activeSourceButtonToolGroups.flatMap((group) =>
      group.items
        .map((item) => activeFilteredTools.findIndex((tool) => tool.id === item.id))
        .filter((index) => index >= 0),
    );
    if (orderedIndexes.length === 0) return -1;
    const orderIndex = orderedIndexes.indexOf(toolIndex);
    const baseOrderIndex = orderIndex >= 0 ? orderIndex : delta > 0 ? -1 : 0;
    const nextOrderIndex = ((baseOrderIndex + delta) % orderedIndexes.length + orderedIndexes.length) % orderedIndexes.length;
    return orderedIndexes[nextOrderIndex] ?? -1;
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

  useEffect(() => {
    highlightedToolIndexRef.current = highlightedToolIndex;
  }, [highlightedToolIndex]);

	  useEffect(() => {
	    sourceButtonHighlightedIndexRef.current = sourceButtonHighlightedIndex;
	  }, [sourceButtonHighlightedIndex]);

	  function updateHighlightedToolIndex(nextIndex: number, focusItem = false) {
	    highlightedToolIndexRef.current = nextIndex;
	    setHighlightedToolIndex(nextIndex);
	    if (!focusItem || nextIndex < 0) return;
	    preserveMentionFocusRef.current = true;
	    toolItemRefs.current[nextIndex]?.focus({ preventScroll: true });
	    requestAnimationFrame(() => {
	      toolItemRefs.current[nextIndex]?.focus({ preventScroll: true });
	    });
	  }

	  useEffect(() => {
	    if (!mentionOpen) {
      mentionModeKeyRef.current = "";
      return;
    }

    const modeKey = `${isMentionSearchMode ? "search" : "browse"}:${mentionQuery.trim().toLowerCase()}`;
    const maxIndex = isMentionSearchMode ? mentionTools.length : activeFilteredTools.length;
    const currentIndex = highlightedToolIndexRef.current;
    let nextIndex: number | null = null;

    if (maxIndex <= 0) {
      if (currentIndex !== -1) nextIndex = -1;
      mentionModeKeyRef.current = modeKey;
    } else if (mentionModeKeyRef.current !== modeKey) {
      mentionModeKeyRef.current = modeKey;
      nextIndex = isMentionSearchMode ? -1 : 0;
    } else if (currentIndex < 0 || currentIndex >= maxIndex) {
      nextIndex = isMentionSearchMode ? -1 : 0;
    }

    if (nextIndex === null) return;
    const expectedIndex = currentIndex;
    const frame = requestAnimationFrame(() => {
      if (mentionModeKeyRef.current !== modeKey || highlightedToolIndexRef.current !== expectedIndex) return;
      updateHighlightedToolIndex(nextIndex);
    });
    return () => cancelAnimationFrame(frame);
  }, [activeFilteredTools.length, isMentionSearchMode, mentionOpen, mentionQuery, mentionTools.length]);

  const removeAttachment = useCallback((id: string) => {
    setAttachments((current) => {
      const target = current.find((attachment) => attachment.id === id);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return current.filter((attachment) => attachment.id !== id);
    });
  }, [setAttachments]);

  const appendAttachmentFiles = useCallback((files: File[]) => {
    if (files.length === 0) return;
    setAttachments((current) => [
      ...current,
      ...files.map((file, index) => createComposerAttachment(file, current.length + index)),
    ]);
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
    if (sourceButtonHighlightedIndexRef.current < 0) return;
    const rawIndex = sourceButtonHighlightedIndexRef.current;
    const safeIndex =
      activeFilteredTools.length === 0
        ? -1
        : ((rawIndex % activeFilteredTools.length) + activeFilteredTools.length) % activeFilteredTools.length;
    if (safeIndex < 0) return;
    sourceButtonHighlightedIndexRef.current = safeIndex;
    const frame = requestAnimationFrame(() => {
      setSourceButtonHighlightedIndex(safeIndex);
      sourceButtonItemRefs.current[safeIndex]?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [activeFilteredTools.length, activeSourceButtonToolGroups, sourceButtonOpen]);

  useEffect(() => {
    if (!sourceButtonOpen) return;
    const container = sourceButtonOptionPaneRef.current;
    const item = sourceButtonItemRefs.current[sourceButtonHighlightedIndex];
    if (!container || !item || sourceButtonHighlightedIndex < 0) return;

    requestAnimationFrame(() => {
      scrollItemIntoPane(item, container);
    });
  }, [sourceButtonHighlightedIndex, sourceButtonOpen]);

  const focusEditor = useCallback((collapseToEnd = true) => {
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
  }, []);

  const closeMentionMenu = useCallback(() => {
    preserveMentionFocusRef.current = false;
    setMentionOpen(false);
    clearMenuSnapshot();
    mentionRangeRef.current = null;
    setMentionRange(null);
    setMentionAnchorTop(36);
    highlightedToolIndexRef.current = -1;
    setHighlightedToolIndex(-1);
  }, [clearMenuSnapshot]);

  const handlePromptLibraryUse = useCallback((promptText: string) => {
    setSourceButtonOpen(false);
    clearMenuSnapshot();
    closeMentionMenu();
    setModeOpen(false);
    setAcceptedTemplateToolId(null);
    setAcceptedTemplatePrefix("");

    if (onPromptUse) {
      setInternalSuppressTemplateCompletion(false);
      onPromptUse(promptText);
    } else {
      const prefill = parseDatasourceMentions(promptText, filteredTools);
      setInternalSuppressTemplateCompletion(prefill.selectedSourceIds.length > 0);
      onValueChange(prefill.text);
      prefill.selectedSourceIds.forEach(onToolSelect);
    }

    focusEditor();
  }, [
    closeMentionMenu,
    clearMenuSnapshot,
    filteredTools,
    focusEditor,
    onPromptUse,
    onToolSelect,
    onValueChange,
    setAcceptedTemplatePrefix,
    setAcceptedTemplateToolId,
    setModeOpen,
    setSourceButtonOpen,
  ]);

  const clearPendingBlurClose = () => {
    if (!blurTimeoutRef.current) return;
    window.clearTimeout(blurTimeoutRef.current);
    blurTimeoutRef.current = null;
  };

  const queueCloseMentionMenuIfFocusOutside = () => {
    clearPendingBlurClose();
    blurTimeoutRef.current = window.setTimeout(() => {
      if (preserveMentionFocusRef.current) {
        preserveMentionFocusRef.current = false;
        return;
      }
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
  };

  const getSafeSourceButtonIndex = (index: number) => {
    if (activeFilteredTools.length === 0) return -1;
    return ((index % activeFilteredTools.length) + activeFilteredTools.length) % activeFilteredTools.length;
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

  const clearSourceButtonHighlight = () => {
    sourceButtonHighlightedIndexRef.current = -1;
    setSourceButtonHighlightedIndex(-1);
  };

  const focusMentionCategory = (groupIndex: number) => {
    const safeIndex = getSafeGroupIndex(groupIndex);
    if (safeIndex < 0) return;
    preserveMentionFocusRef.current = true;
    mentionCategoryRefs.current[safeIndex]?.focus({ preventScroll: true });
    requestAnimationFrame(() => {
      mentionCategoryRefs.current[safeIndex]?.focus({ preventScroll: true });
    });
  };

  const focusSourceButtonCategory = (groupIndex: number) => {
    const safeIndex = getSafeGroupIndex(groupIndex);
    if (safeIndex < 0) return;
    sourceButtonCategoryRefs.current[safeIndex]?.focus({ preventScroll: true });
    requestAnimationFrame(() => {
      sourceButtonCategoryRefs.current[safeIndex]?.focus({ preventScroll: true });
    });
  };

  const updateMentionGroupHighlight = (groupIndex: number, focusTarget: "category" | "item" | false = false) => {
    const safeGroupIndex = getSafeGroupIndex(groupIndex);
    const firstIndex = getGroupFirstToolIndexByGroupIndex(safeGroupIndex);
    if (firstIndex < 0) return;
    updateHighlightedToolIndex(firstIndex, focusTarget === "item");
    requestAnimationFrame(() => {
      scrollSectionIntoPane(mentionGroupSectionRefs.current[safeGroupIndex], mentionOptionPaneRef.current);
    });
    if (focusTarget === "category") focusMentionCategory(safeGroupIndex);
  };

  const updateSourceButtonGroupHighlight = (groupIndex: number, focusTarget: "category" | "item" | false = false) => {
    const safeGroupIndex = getSafeGroupIndex(groupIndex);
    const firstIndex = getGroupFirstToolIndexByGroupIndex(safeGroupIndex);
    if (firstIndex < 0) return;
    updateSourceButtonHighlightedIndex(firstIndex, focusTarget === "item");
    requestAnimationFrame(() => {
      scrollSectionIntoPane(sourceButtonGroupSectionRefs.current[safeGroupIndex], sourceButtonOptionPaneRef.current);
    });
    if (focusTarget === "category") focusSourceButtonCategory(safeGroupIndex);
  };

  const handleMentionMenuKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (!DATA_SOURCE_MENU_NAVIGATION_KEYS.has(event.key)) return;
    event.stopPropagation();

    if (event.key === "Escape") {
      event.preventDefault();
      closeMentionMenu();
      focusEditor(false);
      return;
    }
    const visibleSearchOptions = isMentionSearchMode
      ? Array.from(toolListRef.current?.querySelectorAll<HTMLElement>("[data-mention-tool-id][role='option']") ?? [])
      : [];
    const mentionNavigationCount = isMentionSearchMode ? visibleSearchOptions.length : mentionTools.length;
    if (mentionNavigationCount === 0) {
      event.preventDefault();
      return;
    }
    const rawCurrentIndex = highlightedToolIndexRef.current;
    const currentIndex = rawCurrentIndex < 0 ? 0 : rawCurrentIndex;
    const getSafeMentionIndex = (index: number) =>
      ((index % mentionNavigationCount) + mentionNavigationCount) % mentionNavigationCount;

    if (!isMentionSearchMode) {
      const eventTarget = event.target instanceof HTMLElement ? event.target : null;
      const currentTarget = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
      const activeElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      const activeCategory =
        eventTarget?.closest<HTMLElement>("[data-mention-category-index]") ??
        currentTarget?.closest<HTMLElement>("[data-mention-category-index]") ??
        activeElement?.closest<HTMLElement>("[data-mention-category-index]") ??
        null;
      const activeOption =
        eventTarget?.closest<HTMLElement>("[data-mention-option-index]") ??
        currentTarget?.closest<HTMLElement>("[data-mention-option-index]") ??
        activeElement?.closest<HTMLElement>("[data-mention-option-index]") ??
        null;
      const currentGroupIndex = getGroupIndexForToolIndex(currentIndex);
      const safeCurrentGroupIndex = currentGroupIndex >= 0 ? currentGroupIndex : 0;
      const eventFromEditor = eventTarget === editorRef.current || activeElement === editorRef.current;

      if (activeCategory) {
        const parsedGroupIndex = Number.parseInt(activeCategory.dataset.mentionCategoryIndex ?? "0", 10);
        const groupIndex = Number.isFinite(parsedGroupIndex) ? parsedGroupIndex : 0;

        if (event.key === "ArrowDown") {
          event.preventDefault();
          updateMentionGroupHighlight(groupIndex + 1, "item");
          return;
        }
        if (event.key === "ArrowUp") {
          event.preventDefault();
          updateMentionGroupHighlight(groupIndex - 1, "item");
          return;
        }
        if (event.key === "Home") {
          event.preventDefault();
          updateMentionGroupHighlight(0, "item");
          return;
        }
        if (event.key === "End") {
          event.preventDefault();
          updateMentionGroupHighlight(activeSourceButtonToolGroups.length - 1, "item");
          return;
        }
        if (event.key === "PageDown") {
          event.preventDefault();
          updateMentionGroupHighlight(groupIndex + 4, "item");
          return;
        }
        if (event.key === "PageUp") {
          event.preventDefault();
          updateMentionGroupHighlight(groupIndex - 4, "item");
          return;
        }
        if (event.key === "ArrowRight" || event.key === "Enter" || event.key === " " || (event.key === "Tab" && !event.shiftKey)) {
          event.preventDefault();
          updateMentionGroupHighlight(groupIndex, "item");
          return;
        }
        if (event.key === "ArrowLeft" || (event.key === "Tab" && event.shiftKey)) {
          event.preventDefault();
          focusEditor(false);
          return;
        }
      }

      if (activeOption && event.key === "Tab") {
        event.preventDefault();
        const parsedOptionIndex = Number.parseInt(activeOption.dataset.mentionOptionIndex ?? `${currentIndex}`, 10);
        const activeOptionIndex = Number.isFinite(parsedOptionIndex) ? parsedOptionIndex : currentIndex;
        if (event.shiftKey) {
          updateHighlightedToolIndex(getSafeMentionIndex(activeOptionIndex - 1), true);
        } else {
          updateHighlightedToolIndex(getSafeMentionIndex(activeOptionIndex + 1), true);
        }
        return;
      }

      if (activeOption && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
        event.preventDefault();
        const parsedOptionIndex = Number.parseInt(activeOption.dataset.mentionOptionIndex ?? `${currentIndex}`, 10);
        const activeOptionIndex = Number.isFinite(parsedOptionIndex) ? parsedOptionIndex : currentIndex;
        updateHighlightedToolIndex(getLinearGroupedToolNavigationIndex(activeOptionIndex, event.key === "ArrowDown" ? 1 : -1), true);
        return;
      }

      if (activeOption && (event.key === "ArrowRight" || event.key === "ArrowLeft")) {
        event.preventDefault();
        const parsedOptionIndex = Number.parseInt(activeOption.dataset.mentionOptionIndex ?? `${currentIndex}`, 10);
        const activeOptionIndex = Number.isFinite(parsedOptionIndex) ? parsedOptionIndex : currentIndex;
        const target = getGroupedToolNavigationTarget(activeOptionIndex, event.key);
        updateHighlightedToolIndex(target.index, true);
        return;
      }

      if (!activeOption && eventFromEditor) {
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault();
          const nextIndex =
            rawCurrentIndex < 0
              ? event.key === "ArrowDown"
                ? 0
                : mentionTools.length - 1
              : getLinearGroupedToolNavigationIndex(rawCurrentIndex, event.key === "ArrowDown" ? 1 : -1);
          updateHighlightedToolIndex(getSafeMentionIndex(nextIndex), true);
          return;
        }
        if (event.key === "ArrowRight") {
          event.preventDefault();
          const target = getGroupedToolNavigationTarget(currentIndex, event.key);
          updateHighlightedToolIndex(target.index, true);
          return;
        }
        if (event.key === "ArrowLeft") {
          event.preventDefault();
          const target = getGroupedToolNavigationTarget(currentIndex, event.key);
          updateHighlightedToolIndex(target.index);
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
      }

      if (!activeOption) {
        if (event.key === "Tab") {
          event.preventDefault();
          updateHighlightedToolIndex(currentIndex, true);
          return;
        }
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault();
          updateHighlightedToolIndex(getLinearGroupedToolNavigationIndex(currentIndex, event.key === "ArrowDown" ? 1 : -1), true);
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
          updateHighlightedToolIndex(getSafeMentionIndex(currentIndex + DATA_SOURCE_GRID_COLUMNS * 4), true);
          return;
        }
        if (event.key === "PageUp") {
          event.preventDefault();
          updateHighlightedToolIndex(getSafeMentionIndex(currentIndex - DATA_SOURCE_GRID_COLUMNS * 4), true);
          return;
        }
        if (event.key === "ArrowRight") {
          event.preventDefault();
          updateMentionGroupHighlight(safeCurrentGroupIndex, "item");
          return;
        }
      }

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        updateHighlightedToolIndex(getSafeMentionIndex(currentIndex - 1), true);
        return;
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        updateHighlightedToolIndex(getSafeMentionIndex(currentIndex + 1), true);
        return;
      }
    }

    const searchEventTarget = event.target instanceof HTMLElement ? event.target : null;
    const searchCurrentTarget = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
    const searchActiveElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const searchActiveOption =
      searchEventTarget?.closest<HTMLElement>("[data-mention-option-index]") ??
      searchCurrentTarget?.closest<HTMLElement>("[data-mention-option-index]") ??
      searchActiveElement?.closest<HTMLElement>("[data-mention-option-index]") ??
      null;
    const selectedSearchOption =
      searchActiveOption ??
      toolListRef.current?.querySelector<HTMLElement>('[data-mention-tool-id][role="option"][aria-selected="true"]') ??
      null;
    const highlightedSearchTool = rawCurrentIndex >= 0 ? mentionTools[rawCurrentIndex] : null;
    const selectedSearchIndex = selectedSearchOption ? visibleSearchOptions.indexOf(selectedSearchOption) : -1;
    const getSearchNavigationIndex = (delta: number) => {
      const baseIndex = selectedSearchIndex >= 0 ? selectedSearchIndex : rawCurrentIndex;
      if (baseIndex < 0) return delta >= 0 ? 0 : mentionNavigationCount - 1;
      return getSafeMentionIndex(baseIndex + delta);
    };

    if (event.key === "ArrowDown") {
      event.preventDefault();
      updateHighlightedToolIndex(getSearchNavigationIndex(1));
      return;
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      updateHighlightedToolIndex(getSearchNavigationIndex(1));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      updateHighlightedToolIndex(getSearchNavigationIndex(-1));
      return;
    }
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      updateHighlightedToolIndex(getSearchNavigationIndex(-1));
      return;
    }
    if (event.key === "Home") {
      event.preventDefault();
      updateHighlightedToolIndex(0);
      return;
    }
    if (event.key === "End") {
      event.preventDefault();
      updateHighlightedToolIndex(mentionNavigationCount - 1);
      return;
    }
    if (event.key === "PageDown") {
      event.preventDefault();
      updateHighlightedToolIndex(getSafeMentionIndex(currentIndex + 4));
      return;
    }
    if (event.key === "PageUp") {
      event.preventDefault();
      updateHighlightedToolIndex(getSafeMentionIndex(currentIndex - 4));
      return;
    }
    if (event.key === "Tab") {
      event.preventDefault();
      updateHighlightedToolIndex(getSafeMentionIndex(currentIndex + (event.shiftKey ? -1 : 1)));
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      const selectedToolId = selectedSearchOption?.dataset.mentionToolId ?? highlightedSearchTool?.id;
      if (selectedToolId) selectDataSource(selectedToolId, "mention");
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

    const nextQuery = match[1] ?? "";
    const previousRange = mentionRangeRef.current;
    const previousQuery = previousRange
      ? nextValue.slice(previousRange.start + 1, previousRange.end)
      : null;
    const editor = editorRef.current;
    const anchorTop = editor ? getCaretAnchorTop(editor) : 36;
    updateMentionMenuPosition(anchorTop, Boolean(nextQuery.trim()));
    setSourceButtonOpen(false);
    setModeOpen(false);
    if (!mentionOpen || !menuSnapshot) {
      captureMenuSnapshot();
    }
    const nextMentionRange = { start: prefix.lastIndexOf("@"), end: caret };
    mentionRangeRef.current = nextMentionRange;
    setMentionRange(nextMentionRange);
    setMentionAnchorTop(anchorTop);
    setMentionOpen(true);
    const normalizedNextQuery = nextQuery.trim().toLowerCase();
    const snapshotTools = mentionOpen && menuSnapshot ? activeFilteredTools : filteredTools;
    const nextToolCount = normalizedNextQuery
      ? snapshotTools.filter((item) => getMentionMatchRank(item, normalizedNextQuery) !== null).length
      : snapshotTools.length;
    if (nextToolCount === 0) {
      updateHighlightedToolIndex(-1);
      return;
    }
    const sameMentionQuery =
      previousRange?.start === nextMentionRange.start &&
      previousRange?.end === nextMentionRange.end &&
      previousQuery === nextQuery;
    if (!sameMentionQuery || highlightedToolIndexRef.current < 0) {
      updateHighlightedToolIndex(normalizedNextQuery ? -1 : 0);
      return;
    }
    updateHighlightedToolIndex(
      ((highlightedToolIndexRef.current % nextToolCount) + nextToolCount) % nextToolCount,
    );
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
    if (acceptedTemplateToolId && !effectiveSelectedSourceIds.includes(acceptedTemplateToolId)) {
      setAcceptedTemplateToolId(null);
      setAcceptedTemplatePrefix("");
    }
    onValueChange(nextValue);
    return nextValue;
  }, [acceptedTemplateToolId, effectiveSelectedSourceIds, onValueChange]);

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
      setOptimisticSourceIds((current) => current.filter((sourceId) => sourceId !== id));
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
  }, [closeMentionMenu, onSourceRemove, syncEditorValue]);

  const deleteTemplateSlotAtBoundary = useCallback((editor: HTMLElement, key: "Backspace" | "Delete") => {
    const slotState = getTemplateSlotSelectionState(editor);
    if (slotState) {
      if (!slotState.isCollapsed) {
        const selectedWholeSlot = slotState.startOffset === 0 && slotState.endOffset >= slotState.text.length;
        if (!selectedWholeSlot) return false;
        suppressExternalSyncRef.current = true;
        keepTemplateSlotEmpty(slotState.slot);
        syncEditorValue();
        closeMentionMenu();
        return true;
      }

      if (slotState.text.length === 0) {
        suppressExternalSyncRef.current = true;
        removeTemplateSlotNode(slotState.slot);
        normalizeEditorContent(editor);
        syncEditorValue();
        closeMentionMenu();
        return true;
      }

      const deletesLastCharacter =
        (key === "Backspace" && slotState.text.length === 1 && slotState.startOffset === 1) ||
        (key === "Delete" && slotState.text.length === 1 && slotState.startOffset === 0);
      if (!deletesLastCharacter) return false;

      suppressExternalSyncRef.current = true;
      keepTemplateSlotEmpty(slotState.slot);
      syncEditorValue();
      closeMentionMenu();
      return true;
    }

    const nearbySlot = getTemplateSlotNearCaret(editor, key === "Backspace" ? "backward" : "forward");
    if (!nearbySlot) return false;
    const nearbyText = normalizeTemplateSlotPlainText(nearbySlot.textContent ?? "");

    suppressExternalSyncRef.current = true;
    if (nearbyText.length === 0) {
      removeTemplateSlotNode(nearbySlot);
      normalizeEditorContent(editor);
    } else if (nearbyText.length === 1) {
      keepTemplateSlotEmpty(nearbySlot);
    } else if (key === "Backspace") {
      updateTemplateSlotText(nearbySlot, nearbyText.slice(0, -1), "end");
    } else {
      updateTemplateSlotText(nearbySlot, nearbyText.slice(1), "start");
    }
    syncEditorValue();
    closeMentionMenu();
    return true;
  }, [closeMentionMenu, syncEditorValue]);

  const removeToolFromEditor = useCallback((capabilityId: string) => {
    setInternalSuppressTemplateCompletion(false);
    const editor = editorRef.current;
    if (!editor) {
      setOptimisticSourceIds((current) => current.filter((id) => id !== capabilityId));
      onSourceRemove(capabilityId);
      return;
    }
    const token = editor.querySelector<HTMLElement>(`[data-tool-token='true'][data-tool-id='${capabilityId}']`);
    if (!token) {
      setOptimisticSourceIds((current) => current.filter((id) => id !== capabilityId));
      onSourceRemove(capabilityId);
      if (acceptedTemplateToolId === capabilityId) {
        setAcceptedTemplateToolId(null);
        setAcceptedTemplatePrefix("");
      }
      return;
    }
    const trailingSpace =
      token.nextSibling?.nodeType === Node.TEXT_NODE && token.nextSibling.textContent?.startsWith(" ")
        ? token.nextSibling
        : null;
    token.remove();
    trailingSpace?.remove();
    normalizeEditorContent(editor);
    suppressExternalSyncRef.current = true;
    syncEditorValue();
    setOptimisticSourceIds((current) => current.filter((id) => id !== capabilityId));
    onSourceRemove(capabilityId);
    if (acceptedTemplateToolId === capabilityId) {
      setAcceptedTemplateToolId(null);
      setAcceptedTemplatePrefix("");
    }
    requestAnimationFrame(() => focusEditor(false));
  }, [acceptedTemplateToolId, focusEditor, onSourceRemove, syncEditorValue]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const currentText = normalizeComposerPlainText(getPlainText(editor));
    const currentTokenIds = getTokenIds(editor);
    const nextTemplateToolId = acceptedTemplateRender?.toolId ?? "";
    const nextGhostToolId = templateGhostRender?.toolId ?? "";
    const nextTemplateRenderKey = acceptedTemplateRender
      ? `${acceptedTemplateRender.toolId}:${acceptedTemplateRender.templateIndex}:${acceptedTemplatePrefill?.text ?? acceptedTemplateRender.template}:${acceptedTemplateSourcePlacementKey}`
      : "";
    const nextGhostRenderKey = templateGhostRender
      ? `${templateGhostRender.toolId}:${templateGhostRender.templateIndex}:${templateGhostRender.phase}:${templateGhostRender.template}`
      : "";
    const currentTemplateToolId = editor.dataset.templateToolId ?? "";
    const currentGhostToolId = editor.dataset.templateGhostToolId ?? "";
    const currentTemplateRenderKey = editor.dataset.templateRenderKey ?? "";
    const currentGhostRenderKey = editor.dataset.templateGhostRenderKey ?? "";
    const currentSourcePlacementKey = editor.dataset.sourcePlacementKey ?? "";
    const tokensMatch =
      currentTokenIds.length === renderedSourceIds.length &&
      currentTokenIds.every((id, index) => id === renderedSourceIds[index]);

    if (
      suppressExternalSyncRef.current &&
      currentText === renderedPlainValue &&
      tokensMatch &&
      currentTemplateToolId === nextTemplateToolId &&
      currentGhostToolId === nextGhostToolId &&
      currentTemplateRenderKey === nextTemplateRenderKey &&
      currentGhostRenderKey === nextGhostRenderKey &&
      currentSourcePlacementKey === inlineSourcePlacementKey
    ) {
      suppressExternalSyncRef.current = false;
    } else if (
      currentText !== renderedPlainValue ||
      !tokensMatch ||
      currentTemplateToolId !== nextTemplateToolId ||
      currentGhostToolId !== nextGhostToolId ||
      currentTemplateRenderKey !== nextTemplateRenderKey ||
      currentGhostRenderKey !== nextGhostRenderKey ||
      currentSourcePlacementKey !== inlineSourcePlacementKey
    ) {
      editor.innerHTML = "";
      editor.dataset.templateToolId = nextTemplateToolId;
      editor.dataset.templateGhostToolId = nextGhostToolId;
      editor.dataset.templateRenderKey = nextTemplateRenderKey;
      editor.dataset.templateGhostRenderKey = nextGhostRenderKey;
      editor.dataset.sourcePlacementKey = inlineSourcePlacementKey;
      const placedSourceIds = new Set([
        ...inlineSourcePlacements.map((placement) => placement.sourceId),
        ...acceptedTemplateSourcePlacements.map((placement) => placement.sourceId),
      ]);
      const unplacedSources = selectedSources.filter((source) => !placedSourceIds.has(source.id));
      const appendToolToken = (source: (typeof selectedSources)[number]) => {
        editor.appendChild(
          createToolTokenNode({
            capabilityId: source.id,
            icon: source.icon,
            label: source.label,
            accent: source.accent,
          }),
        );
        editor.appendChild(document.createTextNode(" "));
      };
      unplacedSources.forEach(appendToolToken);
      if (acceptedTemplateRender) {
        appendPromptTemplateNodesWithSourcePlacements(
          editor,
          acceptedTemplatePrefill?.text ?? `${acceptedTemplatePrefix}${acceptedTemplateRender.template}`,
          acceptedTemplateSourcePlacements,
          selectedSources,
        );
      } else if (inlineSourcePlacements.length > 0) {
        let textCursor = 0;
        inlineSourcePlacements.forEach((placement) => {
          const source = selectedSources.find((item) => item.id === placement.sourceId);
          if (!source) return;
          appendPromptTemplateNodes(editor, value.slice(textCursor, placement.offset));
          editor.appendChild(
            createToolTokenNode({
              capabilityId: source.id,
              icon: source.icon,
              label: source.label,
              accent: source.accent,
            }),
          );
          textCursor = placement.offset;
        });
        appendPromptTemplateNodes(editor, value.slice(textCursor));
      } else {
        appendPromptTemplateNodes(editor, value);
        if (templateGhostRender) {
          const ghost = createTemplateGhostNode(templateGhostRender.template, templateGhostRender.phase);
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
  }, [
    acceptedTemplatePrefix,
    acceptedTemplateRender,
    acceptedTemplatePrefill,
    acceptedTemplateSourcePlacementKey,
    acceptedTemplateSourcePlacements,
    inlineSourcePlacementKey,
    inlineSourcePlacements,
    renderedSourceIds,
    renderedPlainValue,
    selectedSources,
    templateGhostRender,
    value,
  ]);

  const selectDataSource = (capabilityId: string, origin: "button" | "mention") => {
    const tool = filteredTools.find((item) => item.id === capabilityId) ?? activeFilteredTools.find((item) => item.id === capabilityId);
    const editor = editorRef.current;
    if (!tool || !editor) return;
    setInternalSuppressTemplateCompletion(false);

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
      clearMenuSnapshot();
    }

    const selection = window.getSelection();
    let range = selection?.rangeCount ? selection.getRangeAt(0) : null;
    if (!range) {
      placeCaretAtEditorEnd(editor);
      const fallbackSelection = window.getSelection();
      range = fallbackSelection?.rangeCount ? fallbackSelection.getRangeAt(0) : null;
    }
    if (!range) return;

    const tokenNode = createToolTokenNode({
      capabilityId: tool.id,
      icon: tool.icon,
      label: tool.label,
      accent: tool.accent,
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
    if (!effectiveSelectedSourceIds.includes(capabilityId)) {
      setOptimisticSourceIds((current) => (current.includes(capabilityId) ? current : [...current, capabilityId]));
      onToolSelect(capabilityId);
    }
  };

  const stopDataSourceOptionPointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    event.stopPropagation();
  };

  const handleDataSourceOptionClick = (
    event: MouseEvent<HTMLButtonElement>,
    capabilityId: string,
    origin: "button" | "mention",
  ) => {
    event.preventDefault();
    event.stopPropagation();
    selectDataSource(capabilityId, origin);
  };

  const acceptTemplateSuggestion = () => {
    if (!templateGhostRender) return false;
    const prefix = getTemplateCompletionPrefix(value);
    const prefill = parseDatasourceMentions(`${prefix}${templateGhostRender.template}`, filteredTools);
    const newlySelectedSourceIds = prefill.selectedSourceIds.filter((id) => !effectiveSelectedSourceIds.includes(id));
    setAcceptedTemplateToolId(templateGhostRender.toolId);
    setAcceptedTemplatePrefix(prefix);
    if (newlySelectedSourceIds.length > 0) {
      setOptimisticSourceIds((current) =>
        Array.from(new Set([...current, ...newlySelectedSourceIds])),
      );
      newlySelectedSourceIds.forEach(onToolSelect);
    }
    onValueChange(getPromptTemplatePlainText(prefill.text));
    closeMentionMenu();
    requestAnimationFrame(() => {
      focusEditor();
    });
    return true;
  };

  const openSourceButtonMenu = (initialIndex = -1) => {
    closeMentionMenu();
    setModeOpen(false);
    captureMenuSnapshot();
    if (initialIndex < 0) {
      clearSourceButtonHighlight();
    } else {
      updateSourceButtonHighlightedIndex(initialIndex);
    }
    setSourceButtonOpen(true);
  };

  const openSourceButtonMenuAndFocusItem = (initialIndex = 0) => {
    closeMentionMenu();
    setModeOpen(false);
    captureMenuSnapshot();
    updateSourceButtonHighlightedIndex(initialIndex);
    setSourceButtonOpen(true);
    requestAnimationFrame(() => {
      const safeIndex = getSafeSourceButtonIndex(initialIndex);
      if (safeIndex >= 0) sourceButtonItemRefs.current[safeIndex]?.focus({ preventScroll: true });
    });
  };

  const closeSourceButtonMenu = () => {
    setSourceButtonOpen(false);
    clearMenuSnapshot();
  };

  const handleSourceButtonMenuKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeSourceButtonMenu();
      requestAnimationFrame(() => sourceButtonTriggerRef.current?.focus());
      return;
    }
    if (activeFilteredTools.length === 0) return;
    const rawCurrentIndex = sourceButtonHighlightedIndexRef.current;
    const currentIndex = rawCurrentIndex < 0 ? 0 : rawCurrentIndex;
    const eventTarget = event.target instanceof HTMLElement ? event.target : null;
    const currentTarget = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
    const activeElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const sourceButtonTrigger = sourceButtonTriggerRef.current;
    const eventFromSourceButtonTrigger = Boolean(
      sourceButtonTrigger &&
        ((eventTarget && sourceButtonTrigger.contains(eventTarget)) ||
          (currentTarget && sourceButtonTrigger.contains(currentTarget))),
    );
    const activeCategory =
      eventTarget?.closest<HTMLElement>("[data-source-button-category-index]") ??
      currentTarget?.closest<HTMLElement>("[data-source-button-category-index]") ??
      (!eventFromSourceButtonTrigger
        ? activeElement?.closest<HTMLElement>("[data-source-button-category-index]")
        : null) ??
      null;
    const activeOption =
      eventTarget?.closest<HTMLElement>("[data-source-button-option-index]") ??
      currentTarget?.closest<HTMLElement>("[data-source-button-option-index]") ??
      (!eventFromSourceButtonTrigger
        ? activeElement?.closest<HTMLElement>("[data-source-button-option-index]")
        : null) ??
      null;

    if (activeCategory) {
      const parsedGroupIndex = Number.parseInt(activeCategory.dataset.sourceButtonCategoryIndex ?? "0", 10);
      const groupIndex = Number.isFinite(parsedGroupIndex) ? parsedGroupIndex : 0;

      if (event.key === "ArrowDown") {
        event.preventDefault();
        updateSourceButtonGroupHighlight(groupIndex + 1, "item");
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        updateSourceButtonGroupHighlight(groupIndex - 1, "item");
        return;
      }
      if (event.key === "Home") {
        event.preventDefault();
        updateSourceButtonGroupHighlight(0, "item");
        return;
      }
      if (event.key === "End") {
        event.preventDefault();
        updateSourceButtonGroupHighlight(activeSourceButtonToolGroups.length - 1, "item");
        return;
      }
      if (event.key === "PageDown") {
        event.preventDefault();
        updateSourceButtonGroupHighlight(groupIndex + 4, "item");
        return;
      }
      if (event.key === "PageUp") {
        event.preventDefault();
        updateSourceButtonGroupHighlight(groupIndex - 4, "item");
        return;
      }
      if (event.key === "ArrowRight" || event.key === "Enter" || event.key === " " || (event.key === "Tab" && !event.shiftKey)) {
        event.preventDefault();
        updateSourceButtonGroupHighlight(groupIndex, "item");
        return;
      }
      if (event.key === "ArrowLeft" || (event.key === "Tab" && event.shiftKey)) {
        event.preventDefault();
        requestAnimationFrame(() => sourceButtonTriggerRef.current?.focus());
        return;
      }
    }

    if (activeOption && event.key === "Tab") {
      event.preventDefault();
      const parsedOptionIndex = Number.parseInt(activeOption.dataset.sourceButtonOptionIndex ?? `${currentIndex}`, 10);
      const activeOptionIndex = Number.isFinite(parsedOptionIndex) ? parsedOptionIndex : currentIndex;
      if (event.shiftKey) {
        updateSourceButtonHighlightedIndex(activeOptionIndex - 1, true);
      } else {
        updateSourceButtonHighlightedIndex(activeOptionIndex + 1, true);
      }
      return;
    }

    if (activeOption && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
      event.preventDefault();
      const parsedOptionIndex = Number.parseInt(activeOption.dataset.sourceButtonOptionIndex ?? `${currentIndex}`, 10);
      const activeOptionIndex = Number.isFinite(parsedOptionIndex) ? parsedOptionIndex : currentIndex;
      updateSourceButtonHighlightedIndex(getLinearGroupedToolNavigationIndex(activeOptionIndex, event.key === "ArrowDown" ? 1 : -1), true);
      return;
    }

    if (activeOption && (event.key === "ArrowRight" || event.key === "ArrowLeft")) {
      event.preventDefault();
      const parsedOptionIndex = Number.parseInt(activeOption.dataset.sourceButtonOptionIndex ?? `${currentIndex}`, 10);
      const activeOptionIndex = Number.isFinite(parsedOptionIndex) ? parsedOptionIndex : currentIndex;
      const target = getGroupedToolNavigationTarget(activeOptionIndex, event.key);
      updateSourceButtonHighlightedIndex(target.index, true);
      return;
    }

    if (!activeOption && rawCurrentIndex < 0) {
      if (event.key === "ArrowDown" || event.key === "ArrowRight" || (event.key === "Tab" && !event.shiftKey) || event.key === "Home") {
        event.preventDefault();
        updateSourceButtonHighlightedIndex(0, true);
        return;
      }
      if (event.key === "ArrowUp" || event.key === "ArrowLeft" || (event.key === "Tab" && event.shiftKey) || event.key === "End") {
        event.preventDefault();
        updateSourceButtonHighlightedIndex(activeFilteredTools.length - 1, true);
        return;
      }
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        return;
      }
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      updateSourceButtonHighlightedIndex(getLinearGroupedToolNavigationIndex(currentIndex, 1), true);
      return;
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      const target = getGroupedToolNavigationTarget(currentIndex, event.key);
      updateSourceButtonHighlightedIndex(target.index, true);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      updateSourceButtonHighlightedIndex(getLinearGroupedToolNavigationIndex(currentIndex, -1), true);
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
      updateSourceButtonHighlightedIndex(activeFilteredTools.length - 1, true);
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
    if (event.key === "Tab") {
      event.preventDefault();
      updateSourceButtonHighlightedIndex(currentIndex + (event.shiftKey ? -1 : 1), true);
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (!activeOption) return;
      const parsedOptionIndex = Number.parseInt(activeOption?.dataset.sourceButtonOptionIndex ?? `${currentIndex}`, 10);
      const selectedIndex = Number.isFinite(parsedOptionIndex) ? parsedOptionIndex : currentIndex;
      const selectedTool = activeFilteredTools[selectedIndex];
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
          "relative z-30 w-full border text-foreground",
          isHeroMinimal
            ? "rounded-dialog !border-border !bg-none !bg-bg-surface !shadow-surface backdrop-blur-none"
            : "rounded-popover border-border bg-bg-surface shadow-surface",
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
            <div className={cn(isHeroMinimal ? "min-h-composer-hero" : "min-h-22")}>
              <div className={cn("relative", isHeroMinimal ? "min-h-attachment-thumb" : "min-h-18")}>
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
                  onKeyDown={(event) => {
                    if (mentionOpen && DATA_SOURCE_MENU_NAVIGATION_KEYS.has(event.key)) {
                      handleMentionMenuKeyDown(event);
                    }
                  }}
                  onFocus={() => focusEditor(false)}
                  className={cn("relative overflow-visible", isHeroMinimal ? "min-h-composer-compact" : "min-h-composer")}
                >
                  <div className={cn("flex flex-wrap items-start gap-1.5", isHeroMinimal ? "min-h-composer-compact" : "min-h-composer", editorRowClassName)}>
                    <div
                      ref={editorRef}
                      data-testid="task-composer-editor"
                      aria-label="任务输入编辑器"
                      contentEditable
                      suppressHydrationWarning
                      suppressContentEditableWarning
                      onKeyDownCapture={(event) => {
                        if (!mentionOpen || !DATA_SOURCE_MENU_NAVIGATION_KEYS.has(event.key)) return;
                        handleMentionMenuKeyDown(event);
                        event.stopPropagation();
                      }}
                      onBeforeInput={(event) => {
                        normalizeSelectionOutsideToolToken(event.currentTarget);
                      }}
                      onPaste={(event) => {
                        handleEditorPaste(event, syncEditorValue, showAttachmentButton ? appendAttachmentFiles : undefined);
                      }}
                      onInput={(event) => {
                        syncEditorInteractionState(event.currentTarget);
                      }}
                      onKeyDown={(event) => {
                        normalizeSelectionOutsideToolToken(event.currentTarget);
                        if (mentionOpen && DATA_SOURCE_MENU_NAVIGATION_KEYS.has(event.key)) {
                          return;
                        }
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
                        if (
                          (event.key === "Backspace" || event.key === "Delete") &&
                          deleteTemplateSlotAtBoundary(event.currentTarget, event.key)
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
                          } else if (canSubmit) {
                            handleSubmit();
                          }
                        }
                      }}
                      onClick={(event) => {
                        normalizeSelectionOutsideToolToken(event.currentTarget);
                        syncEditorInteractionState(event.currentTarget);
                      }}
                      onKeyUp={(event) => {
                        if (mentionOpen && DATA_SOURCE_MENU_NAVIGATION_KEYS.has(event.key)) return;
                        if (event.key === "Tab" || event.key === "Enter" || event.key === "Escape") return;
                        syncEditorInteractionState(event.currentTarget);
                      }}
                      onFocus={(event) => {
                        clearPendingBlurClose();
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
                        queueCloseMentionMenuIfFocusOutside();
                      }}
                      className={cn(
                        textareaClassName ??
                          (isHeroMinimal
                            ? "min-h-composer-text max-h-composer-compact min-w-44 flex-1 overflow-y-auto whitespace-pre-wrap break-words bg-transparent px-0 py-1.5 pr-2 text-body leading-6 text-foreground outline-none scrollbar-thin scrollbar-thumb-transparent hover:scrollbar-thumb-zinc-300"
                            : "min-h-composer-text max-h-composer-home min-w-44 flex-1 overflow-y-auto whitespace-pre-wrap break-words bg-transparent px-0 py-1 pr-2 text-body leading-7 text-foreground outline-none scrollbar-thin scrollbar-thumb-transparent hover:scrollbar-thumb-zinc-300"),
                      )}
                    />
                  </div>
                  {!value && selectedSources.length === 0 ? (
                    <div
                      className={cn(
                        "pointer-events-none absolute left-px max-w-lg leading-7",
                        isHeroMinimal
                          ? "top-2 text-body text-text-tertiary"
                          : "top-1 text-body text-text-disabled",
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
                        className="pointer-events-auto fixed z-modal-floating overflow-hidden rounded-field border border-border bg-bg-surface shadow-menu"
                        onFocusCapture={clearPendingBlurClose}
                        onBlurCapture={queueCloseMentionMenuIfFocusOutside}
                        style={{
                          top: mentionMenuStyle.top,
                          left: mentionMenuStyle.left,
                          width: mentionMenuStyle.width,
                        }}
                      >
                        {isMentionSearchMode ? (
                          <div className="flex h-11 items-center border-b border-border px-4">
                            <div className="text-title-1 font-semibold text-foreground">选择工具</div>
                          </div>
                        ) : null}
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
                                  data-mention-tool-id={item.id}
                                  role="option"
                                  aria-selected={index === highlightedToolIndex}
                                  data-mention-option-index={index}
                                  tabIndex={index === highlightedToolIndex ? 0 : -1}
                                  onMouseEnter={() => updateHighlightedToolIndex(index)}
                                  onKeyDown={(event) => {
                                    event.stopPropagation();
                                    handleMentionMenuKeyDown(event);
                                  }}
                                  onPointerDown={stopDataSourceOptionPointerDown}
                                  onClick={(event) => handleDataSourceOptionClick(event, item.id, "mention")}
                                  className={cn(
                                    "flex h-source-row w-full cursor-pointer items-center px-4 text-left text-body leading-5 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20",
                                    index === highlightedToolIndex ? "bg-fill-hover" : "hover:bg-fill-hover",
                                  )}
                                >
                                  <span className="min-w-0 truncate">
                                    <span className="text-text-disabled">
                                      {renderHighlightedText(item.parentLabel, mentionQuery)}
                                    </span>
                                    <span className="mx-2.5 text-foreground">/</span>
                                    <span className="font-medium text-foreground">
                                      {renderHighlightedText(item.label, mentionQuery)}
                                    </span>
                                  </span>
                                </button>
                              ))
                            ) : (
                              <div className="flex h-12 items-center px-4 text-body text-text-disabled">没有匹配工具</div>
                            )}
                          </div>
                        ) : (
                          <div
                            ref={toolListRef}
                            role="listbox"
                            aria-label="数据源列表"
                            className="grid min-h-0 grid-source-menu overflow-hidden"
                            style={{ height: Math.min(activeSourceButtonMenuListboxHeight, mentionMenuStyle.maxHeight), maxHeight: 360 }}
                            onKeyDown={handleMentionMenuKeyDown}
                            onWheel={(event) => event.stopPropagation()}
                          >
                            <div
                              data-testid="task-composer-mention-category-pane"
                              className="h-full min-h-0 overflow-y-auto overscroll-contain border-r border-border-subtle bg-bg-surface p-2"
                            >
                              {activeSourceButtonToolGroups.map((group, groupIndex) => {
                                const active = group.items.some(
                                  (item) => activeFilteredTools.findIndex((tool) => tool.id === item.id) === highlightedToolIndex,
                                );
                                return (
                                  <button
                                    key={group.id}
                                    ref={(node) => {
                                      mentionCategoryRefs.current[groupIndex] = node;
                                    }}
                                    type="button"
                                    data-mention-category-index={groupIndex}
                                    tabIndex={-1}
                                    onMouseEnter={() => updateMentionGroupHighlight(groupIndex)}
                                    onMouseDown={(event) => event.preventDefault()}
                                    onKeyDown={(event) => {
                                      event.stopPropagation();
                                      handleMentionMenuKeyDown(event);
                                    }}
                                    onClick={() => updateMentionGroupHighlight(groupIndex, "item")}
                                    className={cn(
                                      "flex h-10 w-full items-center gap-2 rounded-control px-2 text-left text-body font-medium leading-5 text-text-tertiary transition hover:bg-fill-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20",
                                      active && "bg-fill-hover text-foreground",
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
                              className="h-full min-h-0 overflow-y-auto overscroll-contain bg-bg-surface p-3"
                            >
                              {activeSourceButtonToolGroups.map((group, groupIndex) => (
                                <section
                                  key={group.id}
                                  ref={(node) => {
                                    mentionGroupSectionRefs.current[groupIndex] = node;
                                  }}
                                  className="pb-5 last:pb-1"
                                >
                                  <DataSourceGroupHeading label={group.label} />
                                  <div className="grid grid-cols-2 gap-2.5">
                                    {group.items.map((item) => {
                                      const index = activeFilteredTools.findIndex((tool) => tool.id === item.id);
                                      return (
                                        <button
                                          key={item.id}
                                          ref={(node) => {
                                            if (index >= 0) toolItemRefs.current[index] = node;
                                          }}
                                          type="button"
                                          data-mention-tool-id={item.id}
                                          role="option"
                                          aria-selected={index === highlightedToolIndex}
                                          data-mention-option-index={index}
                                          tabIndex={index === highlightedToolIndex ? 0 : -1}
                                          onMouseEnter={() => updateHighlightedToolIndex(index)}
                                          onKeyDown={(event) => {
                                            event.stopPropagation();
                                            handleMentionMenuKeyDown(event);
                                          }}
                                          onPointerDown={stopDataSourceOptionPointerDown}
                                          onClick={(event) => handleDataSourceOptionClick(event, item.id, "mention")}
                                          className={cn(
                                            "flex min-h-source-option cursor-pointer items-center gap-3 rounded-field border bg-bg-surface px-3 py-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20",
                                            index === highlightedToolIndex
                                              ? "border-border-strong bg-fill-hover"
                                              : "border-border-subtle hover:border-border-strong hover:bg-fill-hover",
                                          )}
                                        >
                                          <PlatformLogo name={item.icon} color={item.accent} className="h-4 w-4 shrink-0" />
                                          <span className="min-w-0 flex-1">
                                            <span className="block truncate text-body font-medium leading-5 text-foreground">
                                              {item.label}
                                            </span>
                                            <span className="mt-1 line-clamp-1 block text-caption leading-5 text-text-secondary">
                                              {item.promptHint}
                                            </span>
                                          </span>
                                          <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-text-tertiary" />
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
                      className="relative flex h-composer-attachment max-w-full items-center gap-3 rounded-card bg-bg-subtle py-2 pl-2 pr-9 text-left"
                    >
                      {attachment.previewUrl ? (
                        <span
                          aria-label={`图片预览 ${attachment.name}`}
                          className="flex h-attachment-thumb w-attachment-thumb shrink-0 rounded-control border border-border-subtle bg-cover bg-center bg-no-repeat"
                          style={{ backgroundImage: `url(${attachment.previewUrl})` }}
                        />
                      ) : (
                        <span className="flex h-attachment-thumb w-attachment-thumb shrink-0 items-center justify-center rounded-control bg-bg-surface text-caption font-semibold text-text-tertiary">
                          {typeLabel.slice(0, 4)}
                        </span>
                      )}
                      <span className="min-w-0">
                        <span className="block max-w-attachment-name truncate text-body font-medium leading-5 text-foreground">
                          {attachment.name}
                        </span>
                        <span className="mt-0.5 block text-caption leading-4 text-text-tertiary">
                          {typeLabel} | {formatComposerAttachmentSize(attachment.size)}
                        </span>
                      </span>
                      <button
                        type="button"
                        aria-label={`删除附件 ${attachment.name}`}
                        className="absolute -right-1.5 -top-1.5 inline-flex h-6 w-6 items-center justify-center rounded-full bg-fill-active text-primary-foreground transition hover:bg-fill-active focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20"
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
              isHeroMinimal ? "mt-2.5 border-t border-border-subtle pt-2.5" : "border-t border-border-subtle",
            )}
          >
              <div className="flex flex-wrap items-center gap-1.5">
	              <Popover
                  open={sourceButtonOpen}
                  onOpenChange={(open) => {
                    if (open) {
                      openSourceButtonMenu();
                    } else {
                      closeSourceButtonMenu();
                    }
                  }}
                >
                <PopoverTrigger asChild>
                  <Button
                    ref={sourceButtonTriggerRef}
                    variant="outline"
                    size="sm"
                    className={cn(
                      "h-8 rounded-control bg-bg-surface px-3 text-body font-medium shadow-none",
                      isHeroMinimal
                        ? "border-border text-foreground hover:border-border-strong hover:bg-fill-hover"
                        : "border-border text-foreground hover:border-border hover:bg-bg-subtle",
                    )}
                    type="button"
	                    onClick={() => {
	                      if (sourceButtonOpen) {
	                        closeSourceButtonMenu();
	                      } else {
	                        openSourceButtonMenu();
	                      }
                    }}
                    onKeyDown={(event) => {
	                      if (event.key === "Escape" && sourceButtonOpen) {
	                        event.preventDefault();
	                        closeSourceButtonMenu();
	                        return;
	                      }
                      if (sourceButtonOpen && DATA_SOURCE_MENU_NAVIGATION_KEYS.has(event.key)) {
                        handleSourceButtonMenuKeyDown(event);
                        return;
                      }
                      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
                      event.preventDefault();
                      openSourceButtonMenuAndFocusItem(event.key === "ArrowUp" ? filteredTools.length - 1 : 0);
                    }}
                  >
                    @数据源
                    <ChevronDown className={`h-3.5 w-3.5 transition ${sourceButtonOpen ? "rotate-180" : ""}`} />
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  align="start"
                  side={sourceMenuSide}
                  sideOffset={10}
                  onOpenAutoFocus={(event) => event.preventDefault()}
                  onCloseAutoFocus={(event) => event.preventDefault()}
	                  className="pointer-events-auto w-source-menu max-w-screen-gutter overflow-hidden rounded-popover border border-border bg-bg-surface p-0 shadow-menu-wide"
                >
		                  <div
		                    ref={sourceButtonListRef}
	                    role="listbox"
	                    aria-label="数据源列表"
                      tabIndex={-1}
	                    className="grid min-h-0 grid-source-menu overflow-hidden"
	                    style={{ height: activeSourceButtonMenuListboxHeight, maxHeight: 360 }}
	                    onKeyDown={handleSourceButtonMenuKeyDown}
	                    onWheel={(event) => event.stopPropagation()}
	                  >
	                    <div data-testid="task-composer-source-category-pane" className="h-full min-h-0 overflow-y-auto overscroll-contain border-r border-border-subtle bg-bg-surface p-2">
	                      {activeSourceButtonToolGroups.map((group, groupIndex) => {
	                        const active = group.items.some((item) => activeFilteredTools.findIndex((tool) => tool.id === item.id) === sourceButtonHighlightedIndex);
	                        return (
	                          <button
	                            key={group.id}
	                            ref={(node) => {
	                              sourceButtonCategoryRefs.current[groupIndex] = node;
	                            }}
	                            type="button"
	                            data-source-button-category-index={groupIndex}
	                            tabIndex={-1}
	                            onMouseEnter={() => updateSourceButtonGroupHighlight(groupIndex)}
	                            onMouseDown={(event) => event.preventDefault()}
	                            onKeyDown={(event) => {
	                              event.stopPropagation();
	                              handleSourceButtonMenuKeyDown(event);
	                            }}
	                            onClick={() => updateSourceButtonGroupHighlight(groupIndex, "item")}
	                            className={cn(
	                              "flex h-10 w-full items-center gap-2 rounded-control px-2 text-left text-body font-medium leading-5 text-text-tertiary transition hover:bg-fill-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20",
	                              active && "bg-fill-hover text-foreground",
	                            )}
	                          >
	                            <PlatformLogo name={group.icon} color={group.accent} className="h-4 w-4 shrink-0" />
	                            <span className="truncate">{group.label}</span>
	                          </button>
	                        );
	                      })}
	                    </div>
	                    <div ref={sourceButtonOptionPaneRef} data-testid="task-composer-source-option-pane" className="h-full min-h-0 overflow-y-auto overscroll-contain bg-bg-surface p-3">
		                      {activeSourceButtonToolGroups.map((group, groupIndex) => (
		                        <section
		                          key={group.id}
		                          ref={(node) => {
		                            sourceButtonGroupSectionRefs.current[groupIndex] = node;
		                          }}
		                          className="pb-5 last:pb-1"
		                        >
		                          <DataSourceGroupHeading label={group.label} />
		                          <div className="grid grid-cols-2 gap-2.5">
	                            {group.items.map((item) => {
	                              const index = activeFilteredTools.findIndex((tool) => tool.id === item.id);
	                              return (
	                                <button
	                                  key={item.id}
	                                  ref={(node) => {
	                                    if (index >= 0) sourceButtonItemRefs.current[index] = node;
	                                  }}
	                                  type="button"
	                                  role="option"
	                                  aria-selected={index === sourceButtonHighlightedIndex}
	                                  data-source-button-option-index={index}
	                                  tabIndex={index === sourceButtonHighlightedIndex ? 0 : -1}
	                                  onMouseEnter={() => updateSourceButtonHighlightedIndex(index)}
	                                  onKeyDown={(event) => {
	                                    event.stopPropagation();
	                                    handleSourceButtonMenuKeyDown(event);
	                                  }}
		                                  onPointerDown={stopDataSourceOptionPointerDown}
		                                  onClick={(event) => handleDataSourceOptionClick(event, item.id, "button")}
	                                  className={cn(
	                                    "flex min-h-source-option cursor-pointer items-center gap-3 rounded-field border bg-bg-surface px-3 py-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20",
	                                    index === sourceButtonHighlightedIndex
	                                      ? "border-border-strong bg-fill-hover"
	                                      : "border-border-subtle hover:border-border-strong hover:bg-fill-hover",
	                                  )}
	                                >
	                                  <PlatformLogo name={item.icon} color={item.accent} className="h-4 w-4 shrink-0" />
	                                  <span className="min-w-0 flex-1">
	                                    <span className="block truncate text-body font-medium leading-5 text-foreground">
	                                      {item.label}
	                                    </span>
	                                    <span className="mt-1 line-clamp-1 block text-caption leading-5 text-text-secondary">
	                                      {item.promptHint}
	                                    </span>
	                                  </span>
	                                  <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-text-tertiary" />
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

              {showPromptLibraryButton ? (
                <PromptLibraryPicker
                  isHeroMinimal={isHeroMinimal}
	                  onBeforeOpen={() => {
	                    closeSourceButtonMenu();
	                    closeMentionMenu();
	                    setModeOpen(false);
                  }}
                  onPromptUse={handlePromptLibraryUse}
                />
              ) : null}

              {showAttachmentButton ? (
                <>
                  <input
                    ref={fileInputRef}
                    id={fileInputId}
                    type="file"
                    className="sr-only"
                    multiple
                    onChange={(event) => {
                      if (event.target.files?.length) {
                        const selectedFiles = Array.from(event.target.files);
                        appendAttachmentFiles(selectedFiles);
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
                      "h-8 rounded-control border px-3 text-body font-medium",
                      isHeroMinimal
                        ? "border-transparent text-foreground hover:border-border hover:bg-fill-hover hover:text-foreground"
                        : "border-transparent text-text-tertiary hover:border-border hover:bg-bg-subtle hover:text-foreground",
                    )}
	                    onClick={() => {
	                      closeSourceButtonMenu();
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
                      "h-8 rounded-control bg-bg-surface px-2.5 text-caption shadow-none",
                      isHeroMinimal
                        ? "border-border text-text-tertiary hover:bg-bg-subtle"
                        : "border-border text-text-secondary hover:bg-bg-page",
                    )}
                    type="button"
	                    onClick={() => {
	                      closeSourceButtonMenu();
	                      closeMentionMenu();
	                    }}
                  >
                    {composerModeLabel[mode]}
                    <ChevronDown className="h-3 w-3" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  align="end"
                  onOpenAutoFocus={(event) => event.preventDefault()}
                  onCloseAutoFocus={(event) => event.preventDefault()}
                  className="w-44 rounded-popover border-border p-2 shadow-popover"
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
                        className={`rounded-field px-3 py-3 text-left text-sm transition ${
                          mode === option ? "bg-fill-hover text-foreground" : "text-text-secondary hover:bg-fill-hover"
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
                  onClick={handleSubmit}
                  disabled={!showStop && !canSubmit}
                  size="icon"
                  aria-label={showStop ? "停止任务" : "发送任务"}
                  data-testid="task-composer-submit"
                  className={
                    showStop
                      ? cn(
                          resolvedSendButtonClassName,
                          "shrink-0 rounded-full border-transparent !bg-primary p-0 text-primary-foreground shadow-none transition hover:!bg-primary/85 focus-visible:ring-2 focus-visible:ring-primary/20",
                        )
                      : resolvedSendButtonClassName
                  }
                >
                  {showStop ? (
                    <span className="block h-4 w-4 rounded-xxs bg-bg-surface" aria-hidden />
                  ) : (
                    <ArrowUp className="h-4 w-4" strokeWidth={2.4} />
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
