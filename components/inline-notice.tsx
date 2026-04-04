"use client";

type InlineNoticeProps = {
  message: string;
};

export function InlineNotice({ message }: InlineNoticeProps) {
  return (
    <div className="rounded-[14px] border border-[#e5e7eb] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(250,250,250,0.98))] px-4 py-3 text-sm text-[#3f3f46] shadow-[0_14px_28px_rgba(24,24,27,0.06)]">
      {message}
    </div>
  );
}
