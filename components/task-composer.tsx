"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowUp, ArrowUpRight, ChevronDown, LibraryBig, Paperclip } from "lucide-react";

import { homeCapabilityItems } from "@/lib/mock/demo-data";
import type { Template } from "@/lib/mock/store";
import { PlatformLogo } from "@/components/platform-logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type ComposerMode = "普通模式" | "深度模式";

const composerModeLabel: Record<ComposerMode, string> = {
  "普通模式": "普通模式",
  "深度模式": "专业模式",
};

type TaskComposerProps = {
  value: string;
  onValueChange: (value: string) => void;
  placeholder: string;
  mode: ComposerMode;
  onModeChange: (mode: ComposerMode) => void;
  templates: Template[];
  selectedSourceIds?: string[];
  onToolSelect: (capabilityId: string) => void;
  onSourceRemove: (capabilityId: string) => void;
  onTemplateSelect: (templateId: string) => void;
  onFilesSelected: (files: FileList) => void;
  onSubmit: () => void;
  visualStyle?: "default" | "heroMinimal";
  containerClassName?: string;
  textareaClassName?: string;
  sendButtonClassName?: string;
};

function getSelectionOffsets(container: HTMLElement) {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  if (!container.contains(range.startContainer) || !container.contains(range.endContainer)) return null;

  const getRangeTextLength = (targetRange: Range) => {
    const fragment = targetRange.cloneContents();
    fragment.querySelectorAll?.("[data-tool-token='true']").forEach((node) => node.remove());
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
  let rect = range.getClientRects()[0];

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
    if (node.parentElement?.closest("[data-tool-token='true']")) {
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
    .filter((node) => !(node instanceof HTMLElement && node.dataset.toolToken === "true"))
    .map((node) => node.textContent ?? "")
    .join("");
}

function getTokenIds(container: HTMLElement) {
  return Array.from(container.querySelectorAll<HTMLElement>("[data-tool-token='true'][data-tool-id]")).map(
    (node) => node.dataset.toolId ?? "",
  );
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

function createToolTokenNode({
  capabilityId,
  label,
  accent,
  onRemove,
}: {
  capabilityId: string;
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
    "group mx-0.5 inline-flex h-7 items-center gap-1.5 rounded-[10px] border border-[#dbe7ff] bg-[#f4f8ff] px-2.5 align-middle text-[12px] font-medium text-[#2f5fb8]";
  button.setAttribute("contenteditable", "false");
  button.setAttribute("aria-label", `移除数据源 ${label}`);

  const iconWrap = document.createElement("span");
  iconWrap.className = "inline-flex h-3 w-3 items-center justify-center";
  iconWrap.setAttribute("aria-hidden", "true");
  const iconNode = document.createElement("span");
  iconNode.className = "inline-flex h-3 w-3 items-center justify-center rounded-full";
  iconNode.style.background = `${accent}22`;
  const dotNode = document.createElement("span");
  dotNode.className = "block h-1.5 w-1.5 rounded-full";
  dotNode.style.background = accent;
  iconNode.appendChild(dotNode);
  iconWrap.appendChild(iconNode);

  const labelNode = document.createElement("span");
  labelNode.textContent = `@${label}`;

  const closeNode = document.createElement("span");
  closeNode.className = "inline-flex h-3 w-3 items-center justify-center text-[#86a3da] opacity-0 transition group-hover:opacity-100";
  closeNode.innerHTML =
    '<svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true"><path d="M2 2L8 8" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/><path d="M8 2L2 8" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>';
  closeNode.setAttribute("aria-hidden", "true");

  button.appendChild(iconWrap);
  button.appendChild(labelNode);
  button.appendChild(closeNode);
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
  mode,
  onModeChange,
  templates,
  selectedSourceIds = [],
  onToolSelect,
  onSourceRemove,
  onTemplateSelect,
  onFilesSelected,
  onSubmit,
  visualStyle = "default",
  containerClassName,
  textareaClassName,
  sendButtonClassName,
}: TaskComposerProps) {
  const isHeroMinimal = visualStyle === "heroMinimal";
  const fileInputId = useId();
  const textboxRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const toolItemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const toolListRef = useRef<HTMLDivElement | null>(null);
  const highlightedToolIndexRef = useRef(-1);
  const suppressExternalSyncRef = useRef(false);

  const [sourceButtonOpen, setSourceButtonOpen] = useState(false);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionRange, setMentionRange] = useState<{ start: number; end: number } | null>(null);
  const [mentionAnchorTop, setMentionAnchorTop] = useState(36);
  const [mentionMenuStyle, setMentionMenuStyle] = useState<{ top: number; left: number; width: number; maxHeight: number }>({
    top: 0,
    left: 0,
    width: 520,
    maxHeight: 312,
  });
  const [templateOpen, setTemplateOpen] = useState(false);
  const [modeOpen, setModeOpen] = useState(false);
  const [highlightedToolIndex, setHighlightedToolIndex] = useState(-1);
  const [attachmentNames, setAttachmentNames] = useState<string[]>([]);
  const [editorFocused, setEditorFocused] = useState(false);
  const blurTimeoutRef = useRef<number | null>(null);

  const filteredTools = useMemo(() => homeCapabilityItems.filter((item) => item.id !== "scenarios"), []);

  const selectedSources = useMemo(
    () =>
      selectedSourceIds
        .map((id) => filteredTools.find((item) => item.id === id))
        .filter((item): item is (typeof filteredTools)[number] => Boolean(item)),
    [filteredTools, selectedSourceIds],
  );

  const mentionQuery = useMemo(() => {
    if (!mentionRange) return "";
    return value.slice(mentionRange.start + 1, mentionRange.end);
  }, [mentionRange, value]);

  const mentionTools = useMemo(() => {
    const query = mentionQuery.trim().toLowerCase();
    if (!query) return filteredTools;
    return filteredTools.filter((item) => item.label.toLowerCase().includes(query) || item.id.includes(query));
  }, [filteredTools, mentionQuery]);

  useEffect(() => {
    return () => {
      if (blurTimeoutRef.current) {
        window.clearTimeout(blurTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!mentionOpen) return;
    const container = toolListRef.current;
    const item = toolItemRefs.current[highlightedToolIndex];
    if (!container || !item || highlightedToolIndex < 0) return;

    requestAnimationFrame(() => {
      const itemTop = item.offsetTop;
      const itemBottom = itemTop + item.offsetHeight;
      const viewportTop = container.scrollTop;
      const viewportBottom = viewportTop + container.clientHeight;

      if (itemTop < viewportTop) {
        container.scrollTop = Math.max(0, itemTop - 8);
      } else if (itemBottom > viewportBottom) {
        container.scrollTop = Math.max(0, itemBottom - container.clientHeight + 8);
      }
    });
  }, [highlightedToolIndex, mentionOpen]);

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
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(editor);
      range.collapse(false);
      selection?.removeAllRanges();
      selection?.addRange(range);
    });
  };

  const closeMentionMenu = () => {
    setMentionOpen(false);
    setMentionRange(null);
    setMentionAnchorTop(36);
    highlightedToolIndexRef.current = -1;
    setHighlightedToolIndex(-1);
  };

  const updateHighlightedToolIndex = (nextIndex: number) => {
    highlightedToolIndexRef.current = nextIndex;
    setHighlightedToolIndex(nextIndex);
  };

  const updateMentionMenuPosition = useCallback((anchorTop: number) => {
    const textbox = textboxRef.current;
    const editor = editorRef.current;
    if (!textbox || !editor || typeof window === "undefined") return;

    const rect = textbox.getBoundingClientRect();
    const viewportPadding = 16;
    const gap = 10;
    const width = Math.min(Math.max(rect.width, 420), 620, window.innerWidth - viewportPadding * 2);
    const left = Math.min(Math.max(rect.left, viewportPadding), window.innerWidth - width - viewportPadding);
    const estimatedMenuHeight = Math.min(360, Math.round(window.innerHeight * 0.42));
    const belowTop = rect.top + anchorTop + gap;
    const belowSpace = window.innerHeight - belowTop - viewportPadding;
    const aboveSpace = rect.top - viewportPadding - gap;
    const placeBottom = belowSpace >= estimatedMenuHeight || belowSpace >= aboveSpace;
    const maxHeight = Math.max(180, Math.min(placeBottom ? belowSpace : aboveSpace, 360));
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
    updateMentionMenuPosition(anchorTop);
    setSourceButtonOpen(false);
    setTemplateOpen(false);
    setModeOpen(false);
    setMentionRange({ start: prefix.lastIndexOf("@"), end: caret });
    setMentionAnchorTop(anchorTop);
    setMentionOpen(true);
    updateHighlightedToolIndex(-1);
  };

  useEffect(() => {
    if (!mentionOpen) return;
    const handleReposition = () => updateMentionMenuPosition(mentionAnchorTop);
    window.addEventListener("resize", handleReposition);
    window.addEventListener("scroll", handleReposition, true);
    return () => {
      window.removeEventListener("resize", handleReposition);
      window.removeEventListener("scroll", handleReposition, true);
    };
  }, [mentionAnchorTop, mentionOpen, updateMentionMenuPosition]);

  const removeLastSource = () => {
    const lastSource = selectedSources[selectedSources.length - 1];
    if (!lastSource) return;
    removeToolFromEditor(lastSource.id);
  };

  const syncEditorValue = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return "";
    const nextValue = getPlainText(editor).replace(/\u00a0/g, " ");
    onValueChange(nextValue);
    return nextValue;
  }, [onValueChange]);

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
    requestAnimationFrame(() => focusEditor(false));
  }, [onSourceRemove, syncEditorValue]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const currentText = getPlainText(editor);
    const currentTokenIds = getTokenIds(editor);
    const tokensMatch =
      currentTokenIds.length === selectedSourceIds.length &&
      currentTokenIds.every((id, index) => id === selectedSourceIds[index]);

    if (suppressExternalSyncRef.current && currentText === value && tokensMatch) {
      suppressExternalSyncRef.current = false;
    } else if (currentText !== value || !tokensMatch) {
      editor.innerHTML = "";
      selectedSources.forEach((source) => {
        editor.appendChild(
          createToolTokenNode({
            capabilityId: source.id,
            label: source.label,
            accent: source.accent,
            onRemove: removeToolFromEditor,
          }),
        );
        editor.appendChild(document.createTextNode(" "));
      });
      editor.appendChild(document.createTextNode(value));
      normalizeEditorContent(editor);
    }
  }, [removeToolFromEditor, selectedSourceIds, selectedSources, value]);

  const selectDataSource = (capabilityId: string, origin: "button" | "mention") => {
    const tool = filteredTools.find((item) => item.id === capabilityId);
    const editor = editorRef.current;
    if (!tool || !editor) return;

    editor.focus();
    suppressExternalSyncRef.current = true;

    if (origin === "mention" && mentionRange) {
      setSelectionByOffsets(editor, mentionRange.start, mentionRange.end);
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

  const openSourceButtonMenu = () => {
    closeMentionMenu();
    setTemplateOpen(false);
    setModeOpen(false);
    setSourceButtonOpen(true);
  };

  return (
    <Card
      data-task-composer-root
      className={
        containerClassName ??
        cn(
          "relative z-30 w-full bg-white",
          isHeroMinimal
            ? "rounded-[20px] border-[#dfe3ea] shadow-[0_10px_28px_rgba(15,23,42,0.045)]"
            : "rounded-[28px] border-[#e7e5e4] shadow-[0_18px_40px_rgba(15,23,42,0.06)]",
        )
      }
    >
      <CardContent className="p-0">
          <div className={cn(isHeroMinimal ? "px-4 pb-2.5 pt-2.5" : "px-4 pb-3 pt-3")}>
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
            <div className={cn(isHeroMinimal ? "min-h-[92px]" : "min-h-[88px]")}>
              <div className={cn("relative", isHeroMinimal ? "min-h-[80px]" : "min-h-[72px]")}>
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
                  className={cn("relative overflow-visible", isHeroMinimal ? "min-h-[96px]" : "min-h-[84px]")}
                >
                  <div className={cn("flex flex-wrap items-start gap-1.5", isHeroMinimal ? "min-h-[96px]" : "min-h-[84px]")}>
                    <div
                      ref={editorRef}
                      data-testid="task-composer-editor"
                      aria-label="任务输入编辑器"
                      contentEditable
                      suppressContentEditableWarning
                      onBeforeInput={(event) => {
                        normalizeSelectionOutsideToolToken(event.currentTarget);
                      }}
                      onInput={(event) => {
                        const nextValue = syncEditorValue();
                        const offsets = getSelectionOffsets(event.currentTarget);
                        syncMentionState(nextValue, offsets?.start ?? nextValue.length);
                      }}
                      onKeyDown={(event) => {
                        normalizeSelectionOutsideToolToken(event.currentTarget);
                        const nearbyToken =
                          event.key === "Backspace"
                            ? getToolTokenNearCaret(event.currentTarget, "backward")
                            : event.key === "Delete"
                              ? getToolTokenNearCaret(event.currentTarget, "forward")
                              : null;
                        if (mentionOpen && mentionTools.length > 0 && event.key === "ArrowDown") {
                          event.preventDefault();
                          updateHighlightedToolIndex(
                            highlightedToolIndexRef.current < 0
                              ? 0
                              : (highlightedToolIndexRef.current + 1) % mentionTools.length,
                          );
                          return;
                        }
                        if (mentionOpen && mentionTools.length > 0 && event.key === "ArrowUp") {
                          event.preventDefault();
                          updateHighlightedToolIndex(
                            highlightedToolIndexRef.current < 0
                              ? mentionTools.length - 1
                              : (highlightedToolIndexRef.current - 1 + mentionTools.length) % mentionTools.length,
                          );
                          return;
                        }
                        if (mentionOpen && mentionTools.length > 0 && event.key === "Enter") {
                          if (highlightedToolIndexRef.current < 0) {
                            event.preventDefault();
                            return;
                          }
                          event.preventDefault();
                          const selectedTool = mentionTools[highlightedToolIndexRef.current];
                          if (selectedTool) selectDataSource(selectedTool.id, "mention");
                          return;
                        }
                        if (mentionOpen && event.key === "Escape") {
                          event.preventDefault();
                          closeMentionMenu();
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
                        if (event.key === "Enter" && !event.shiftKey) {
                          event.preventDefault();
                          onSubmit();
                        }
                      }}
                      onClick={(event) => {
                        normalizeSelectionOutsideToolToken(event.currentTarget);
                        const offsets = getSelectionOffsets(event.currentTarget);
                        syncMentionState(value, offsets?.start ?? value.length);
                      }}
                      onFocus={() => {
                        if (blurTimeoutRef.current) {
                          window.clearTimeout(blurTimeoutRef.current);
                          blurTimeoutRef.current = null;
                        }
                        setEditorFocused(true);
                      }}
                      onBlur={() => {
                        setEditorFocused(false);
                        blurTimeoutRef.current = window.setTimeout(() => {
                          const activeElement = document.activeElement;
                          const insideComposer =
                            activeElement instanceof HTMLElement &&
                            Boolean(activeElement.closest("[data-task-composer-root]"));
                          if (!insideComposer) {
                            closeMentionMenu();
                          }
                        }, 0);
                      }}
                      className={cn(
                        textareaClassName ??
                          (isHeroMinimal
                            ? "min-h-[28px] max-h-[10em] min-w-[180px] flex-1 overflow-y-auto whitespace-pre-wrap break-words bg-transparent px-0 py-1.5 pr-2 text-[15px] leading-7 text-[#1c1c1c] outline-none scrollbar-thin scrollbar-thumb-transparent hover:scrollbar-thumb-zinc-300"
                            : "min-h-[28px] max-h-[10em] min-w-[180px] flex-1 overflow-y-auto whitespace-pre-wrap break-words bg-transparent px-0 py-1 pr-2 text-[14px] leading-7 text-[#1c1c1c] outline-none scrollbar-thin scrollbar-thumb-transparent hover:scrollbar-thumb-zinc-300"),
                      )}
                    />
                  </div>
                  {!value && selectedSources.length === 0 && !editorFocused ? (
                    <div className={cn(
                      "pointer-events-none absolute left-[1px] max-w-[520px] leading-7",
                      isHeroMinimal ? "top-[8px] text-[14px] text-[#b7bcc5]" : "top-[4px] text-[13px] text-[#a1a1aa]",
                    )}>
                      {placeholder}
                    </div>
                  ) : null}

                  {mentionOpen && typeof document !== "undefined"
                    ? createPortal(
                    <div
                      data-testid="task-composer-mention-menu"
                      className="fixed z-[140] overflow-hidden rounded-[18px] border border-[#ece8e1] bg-white shadow-[0_20px_48px_rgba(24,24,27,0.14)]"
                      style={{
                        top: mentionMenuStyle.top,
                        left: mentionMenuStyle.left,
                        width: mentionMenuStyle.width,
                      }}
                    >
                      <div className="flex items-center justify-between border-b border-[#f2efe9] px-4 py-3">
                        <div>
                          <div className="text-[12px] font-medium text-[#18181b]">@数据源</div>
                          <div className="mt-0.5 text-[12px] text-[#a8a29e]">通过 @ 插入数据源，不会影响首页下方提示词卡片</div>
                        </div>
                        <div className="rounded-full border border-[#ede9e1] bg-[#faf9f7] px-2 py-1 text-[12px] text-[#8f8a80]">
                          已收录 {filteredTools.length}+ 数据源
                        </div>
                      </div>
                      <div ref={toolListRef} className="grid gap-1 overflow-y-auto p-2.5" style={{ maxHeight: mentionMenuStyle.maxHeight }}>
                        {mentionTools.map((item, index) => (
                          <button
                            key={item.id}
                            ref={(node) => {
                              toolItemRefs.current[index] = node;
                            }}
                            type="button"
                            onMouseEnter={() => updateHighlightedToolIndex(index)}
                            onMouseDown={(event) => {
                              event.preventDefault();
                              selectDataSource(item.id, "mention");
                            }}
                            className={`flex min-h-[54px] items-start gap-3 rounded-[14px] border px-3 py-2.5 text-left transition ${
                              index === highlightedToolIndex
                                ? "border-[#d8e2f6] bg-[#f7faff]"
                                : "border-transparent hover:border-[#ebe7df] hover:bg-[#faf9f7]"
                            }`}
                          >
                            <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] border border-[#ece8df] bg-white">
                              <PlatformLogo name={item.icon} color={item.accent} className="h-4 w-4" />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="flex items-center gap-2">
                                <span className="truncate text-[13px] font-medium text-[#27272a]">{item.label}</span>
                                <span className="rounded-full bg-[#f5f5f4] px-1.5 py-0.5 text-[12px] text-[#8b8b91]">
                                  数据源
                                </span>
                              </span>
                              <span className="mt-1 line-clamp-2 block text-[12px] leading-4 text-[#8a8f98]">
                                {item.promptHint}
                              </span>
                            </span>
                            <ArrowUpRight className="mt-1 h-3.5 w-3.5 shrink-0 text-[#b0b3ba]" />
                          </button>
                        ))}
                      </div>
                    </div>,
                    document.body,
                  ) : null}
                </div>
              </div>
            </div>

            {attachmentNames.length > 0 ? (
            <div className="mt-2.5 flex flex-wrap gap-1.5">
                {attachmentNames.slice(0, 3).map((name) => (
                  <span
                    key={name}
                    className="inline-flex h-7 items-center rounded-full border border-[#e7e5e4] bg-[#fafaf9] px-2.5 text-[12px] text-[#52525b]"
                  >
                    {name}
                  </span>
                ))}
                {attachmentNames.length > 3 ? (
                  <span className="inline-flex h-7 items-center rounded-full border border-[#e7e5e4] bg-[#fafaf9] px-2.5 text-[12px] text-[#52525b]">
                    +{attachmentNames.length - 3}
                  </span>
                ) : null}
              </div>
            ) : null}
          </div>

          <div
            className={cn(
              "mt-2.5 flex flex-wrap items-center justify-between gap-3 pt-2.5",
              isHeroMinimal ? "border-t border-[#eceef2]" : "border-t border-[#f1eeea]",
            )}
          >
            <div className="flex flex-wrap items-center gap-1.5">
              <Popover open={sourceButtonOpen} onOpenChange={setSourceButtonOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className={cn(
                      "h-[30px] rounded-[10px] bg-white px-[11px] text-[12px] font-medium shadow-none",
                      isHeroMinimal
                        ? "border-[#e5e7eb] text-[#4b5563] hover:border-[#d1d5db] hover:bg-[#fafafa]"
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
                  >
                    @数据源
                    <ChevronDown className={`h-[13px] w-[13px] transition ${sourceButtonOpen ? "rotate-180" : ""}`} />
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  align="start"
                  sideOffset={10}
                  onOpenAutoFocus={(event) => event.preventDefault()}
                  onCloseAutoFocus={(event) => event.preventDefault()}
                  className="w-[520px] rounded-[16px] border-[#ece8e1] bg-[rgba(255,255,255,0.98)] p-2 shadow-[0_12px_28px_rgba(24,24,27,0.08)]"
                >
                  <div className="mb-1 flex items-center justify-between px-2 py-1">
                    <div>
                      <div className="text-[12px] font-medium text-[#18181b]">@数据源</div>
                      <div className="mt-0.5 text-[12px] text-[#a8a29e]">选择后会以内联数据源节点加入输入框</div>
                    </div>
                    <span className="rounded-full border border-[#ede9e1] bg-[#faf9f7] px-2 py-1 text-[12px] text-[#8f8a80]">
                      全部分组
                    </span>
                  </div>
                  <div className="grid max-h-[320px] gap-1 overflow-y-auto pr-1">
                    {filteredTools.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => selectDataSource(item.id, "button")}
                        className="flex min-h-[52px] items-start gap-3 rounded-[12px] border border-transparent px-3 py-2.5 text-left transition hover:border-[#ebe7df] hover:bg-[#faf9f7]"
                      >
                        <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] border border-[#ece8df] bg-white">
                          <PlatformLogo name={item.icon} color={item.accent} className="h-[13px] w-[13px]" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[12px] font-medium text-[#1f1f1f]">{item.label}</span>
                          <span className="mt-1 line-clamp-2 block text-[12px] leading-4 text-[#8a8f98]">
                            {item.promptHint}
                          </span>
                        </span>
                        <ArrowUpRight className="mt-1 h-[13px] w-[13px] shrink-0 text-[#b8b2a8]" />
                      </button>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>

              <Popover open={templateOpen} onOpenChange={setTemplateOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className={cn(
                      "h-[30px] rounded-[10px] border px-[11px] text-[12px] font-medium",
                      isHeroMinimal
                        ? "border-transparent text-[#6b7280] hover:border-[#e5e7eb] hover:bg-[#fafafa] hover:text-[#27272a]"
                        : "border-transparent text-[#6f7783] hover:border-[#e8e2d8] hover:bg-[#faf8f4] hover:text-[#27272a]",
                    )}
                    type="button"
                    onClick={() => {
                      setSourceButtonOpen(false);
                      closeMentionMenu();
                      setModeOpen(false);
                    }}
                    aria-label="打开任务指令库"
                  >
                    <LibraryBig className="h-[13px] w-[13px]" />
                    指令
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  align="start"
                  onOpenAutoFocus={(event) => event.preventDefault()}
                  onCloseAutoFocus={(event) => event.preventDefault()}
                  className="w-[360px] rounded-[20px] border-[#e7e5e4] p-2 shadow-[0_16px_34px_rgba(24,24,27,0.08)]"
                >
                  <div className="px-2 pb-2 pt-1">
                    <div className="text-sm font-medium text-[#18181b]">任务指令库</div>
                  </div>
                  <div className="grid gap-1">
                    {templates.slice(0, 6).map((template) => (
                      <button
                        key={template.id}
                        type="button"
                        onClick={() => {
                          onTemplateSelect(template.id);
                          setTemplateOpen(false);
                          focusEditor();
                        }}
                        className="rounded-[12px] px-3 py-3 text-left transition hover:bg-[#f5f5f4]"
                      >
                        <div className="text-sm font-medium text-[#27272a]">{template.title}</div>
                        <div className="mt-1 line-clamp-2 text-xs leading-5 text-[#71717a]">{template.body}</div>
                      </button>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>

              <input
                ref={fileInputRef}
                id={fileInputId}
                type="file"
                className="sr-only"
                accept=".xlsx,.csv,.jpg,.jpeg,.png,.pdf,.zip,.json"
                multiple
                onChange={(event) => {
                  if (event.target.files?.length) {
                    setAttachmentNames(Array.from(event.target.files).map((file) => file.name));
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
                  "h-[30px] rounded-[10px] border px-[11px] text-[12px] font-medium",
                  isHeroMinimal
                    ? "border-transparent text-[#6b7280] hover:border-[#e5e7eb] hover:bg-[#fafafa] hover:text-[#27272a]"
                    : "border-transparent text-[#6f7783] hover:border-[#e8e2d8] hover:bg-[#faf8f4] hover:text-[#27272a]",
                )}
                onClick={() => {
                  setSourceButtonOpen(false);
                  closeMentionMenu();
                  setTemplateOpen(false);
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
                <Paperclip className="h-[13px] w-[13px]" />
                附件
              </Button>
            </div>

            <div className="flex items-center gap-2.5">
              <Popover open={modeOpen} onOpenChange={setModeOpen}>
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
                      setTemplateOpen(false);
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
              </Popover>

              <Button
                type="button"
                onClick={onSubmit}
                size="icon"
                aria-label="发送任务"
                data-testid="task-composer-submit"
                className={
                  sendButtonClassName ??
                  (isHeroMinimal
                    ? "h-[34px] w-[34px] rounded-[12px] border border-[#e2e5ea] bg-[#f3f4f6] text-[#9ca3af] shadow-none transition hover:border-[#d1d5db] hover:bg-[#eceef1] hover:text-[#4b5563]"
                    : "h-[38px] w-[38px] rounded-[14px] border border-[#111111] bg-[linear-gradient(180deg,#1b1b1d,#111113)] text-white shadow-[0_12px_24px_rgba(15,15,18,0.18)] transition hover:-translate-y-0.5 hover:bg-[linear-gradient(180deg,#26262a,#121214)] hover:shadow-[0_16px_30px_rgba(15,15,18,0.24)]")
                }
              >
                <ArrowUp className="h-[14px] w-[14px]" />
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
