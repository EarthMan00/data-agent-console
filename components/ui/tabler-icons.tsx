import type { SVGProps } from "react";

export {
  IconAlarmFilled as AlarmFilled,
  IconAlertCircle as AlertCircle,
  IconArrowDown as ArrowDown,
  IconArrowLeft as ArrowLeft,
  IconArrowRight as ArrowRight,
  IconArrowUp as ArrowUp,
  IconArrowsExchange as ArrowRightLeft,
  IconArrowUpRight as ArrowUpRight,
  IconBell as Bell,
  IconBookmark as Bookmark,
  IconBook as BookOpen,
  IconRobot as Bot,
  IconBox as Box,
  IconCheck as Check,
  IconCircleCheck as CheckCircle2,
  IconChevronDown as ChevronDown,
  IconChevronLeft as ChevronLeft,
  IconClock as Clock,
  IconClockHour3 as Clock3,
  IconCornerDownLeft as CornerDownLeft,
  IconCopy as Copy,
  IconDatabase as Database,
  IconDownload as Download,
  IconDots as Ellipsis,
  IconDotsVertical as EllipsisVertical,
  IconArrowsMaximize as Expand,
  IconEye as Eye,
  IconJson as FileJson,
  IconFileSpreadsheet as FileSpreadsheet,
  IconFileText as FileText,
  IconFolderHeart as FolderHeart,
  IconFolderShare as FolderInput,
  IconWorld as Globe,
  IconHelpCircle as HelpCircle,
  IconHome as Home,
  IconInfoCircle as InfoCircle,
  IconLayersIntersect as Layers,
  IconLayoutDashboard as Layout,
  IconLayoutGrid as LayoutGrid,
  IconList as List,
  IconRefresh as ListRestart,
  IconLoader as Loader2,
  IconLoader2 as LoaderCircle,
  IconLogout as LogOut,
  IconMail as Mail,
  IconMenu2 as Menu,
  IconMessageCircle as MessageCircleMore,
  IconMinimize as Minimize2,
  IconDotsVertical as MoreVertical,
  IconPackage as Package,
  IconPackageOff as PackageOpen,
  IconLayoutSidebarLeftCollapse as PanelLeft,
  IconLayoutSidebarLeftExpand as PanelLeftExpand,
  IconPaperclip as Paperclip,
  IconPencil as Pencil,
  IconPlayerPlay as Play,
  IconPlus as Plus,
  IconCirclePlus as PlusCircle,
  IconPower as Power,
  IconSearch as Search,
  IconSend as Send,
  IconServer as Server,
  IconSettings as Settings,
  IconShare2 as Share2,
  IconShield as Shield,
  IconSparkles as Sparkles,
  IconSquare as Square,
  IconStar as Star,
  IconStarOff as StarOff,
  IconTable as Table,
  IconThumbDown as ThumbsDown,
  IconThumbUp as ThumbsUp,
  IconTrash as Trash2,
  IconUserCircle as UserRound,
  IconUsers as Users,
  IconX as X,
  IconCircleX as XCircle,
  IconBolt as Zap,
} from "@tabler/icons-react";

export function SparkleHighlight({ strokeWidth = 2, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path stroke="none" d="M0 0h24v24H0z" fill="none" />
      <path d="M14.504 8.522l-1.758 -4.032a.814 .814 0 0 0 -1.492 0l-1.759 4.032c-.19 .436 -.537 .784 -.973 .973l-4.032 1.759a.814 .814 0 0 0 0 1.492l4.033 1.758c.436 .19 .784 .538 .973 .974l1.759 4.033a.814 .814 0 0 0 1.492 0l1.758 -4.033c.19 -.436 .538 -.784 .974 -.974l4.033 -1.758a.814 .814 0 0 0 0 -1.492l-4.033 -1.759a1.88 1.88 0 0 1 -.974 -.973" />
      <path d="M3 3l2 2" />
      <path d="M21 3l-2 2" />
      <path d="M3 21l2 -2" />
      <path d="M21 21l-2 -2" />
    </svg>
  );
}

export function PlusThin(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="icon icon-tabler icons-tabler-outline icon-tabler-plus"
      {...props}
    >
      <path stroke="none" d="M0 0h24v24H0z" fill="none" />
      <path d="M12 5l0 14" />
      <path d="M5 12l14 0" />
    </svg>
  );
}

export function EyeFilled(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="currentColor"
      {...props}
    >
      <path stroke="none" d="M0 0h24v24H0z" fill="none" />
      <path d="M12 4c4.29 0 7.863 2.429 10.665 7.154l.22 .379l.045 .1l.03 .083l.014 .055l.014 .082l.011 .1v.11l-.014 .111a.992 .992 0 0 1 -.026 .11l-.039 .108l-.036 .075l-.016 .03c-2.764 4.836 -6.3 7.38 -10.555 7.499l-.313 .004c-4.396 0 -8.037 -2.549 -10.868 -7.504a1 1 0 0 1 0 -.992c2.831 -4.955 6.472 -7.504 10.868 -7.504zm0 5a3 3 0 1 0 0 6a3 3 0 0 0 0 -6" />
    </svg>
  );
}

export function UserCircle({ strokeWidth = 2, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path stroke="none" d="M0 0h24v24H0z" fill="none" />
      <path d="M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0" />
      <path d="M9 10a3 3 0 1 0 6 0a3 3 0 1 0 -6 0" />
      <path d="M6.168 18.849a4 4 0 0 1 3.832 -2.849h4a4 4 0 0 1 3.834 2.855" />
    </svg>
  );
}
