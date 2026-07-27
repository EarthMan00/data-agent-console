export type AgentAttachmentStatus = "queued" | "accepted" | "referenced";
export type AgentAttachmentFileType =
  | "image"
  | "video"
  | "audio"
  | "pdf"
  | "doc"
  | "ppt"
  | "txt";

export type AgentAttachment = {
  id: string;
  name: string;
  size?: number;
  fileType?: AgentAttachmentFileType;
  extension?: string;
  status: AgentAttachmentStatus;
};

/** 与 Alice 后端服务 TaskResponse.artifacts 对齐，供任务结果区拉取预览。 */
export type PlatformTaskArtifactRef = {
  artifact_id: string;
  artifact_type: string;
  original_name: string;
  download_api: string;
};
