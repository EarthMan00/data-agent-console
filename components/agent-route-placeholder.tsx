/** 与 SSR 首帧一致的空占位，避免认证/URL 参数在客户端就绪前导致 hydration mismatch */
export function AgentRoutePlaceholder() {
  return <div className="min-h-0 flex-1" aria-hidden />;
}
