import type { LucideIcon } from "lucide-react";
import type { PageKey, ParentPageKey, Tone } from "../../types/app";

type TopbarPanel = "search" | "notifications" | "activity" | "help" | "user" | null;

type TopbarMenuPanel = Exclude<TopbarPanel, "search" | null>;

type TopbarChrome = {
  white: boolean;
  showBreadcrumb: boolean;
  showCompactSearch: boolean;
  showStatus: boolean;
  showActivity: boolean;
};

type HelpDrawerState = { id: string; title: string; detail: string } | null;

type TopbarSearchResult = { id: string; label: string; detail: string; page: PageKey; kind: string };

type TopbarNotification = { id: string; title: string; detail: string; tone: Tone; time: string };

type TopbarActivity = { id: string; title: string; detail: string; time: string };

type NavChild = { id: string; label: string; meta: string; page?: PageKey; badge?: string };

type NavItem = {
  key: ParentPageKey;
  label: string;
  icon: LucideIcon;
  badge?: string;
  children: NavChild[];
};

export type { TopbarPanel, TopbarMenuPanel, TopbarChrome, HelpDrawerState, TopbarSearchResult, TopbarNotification, TopbarActivity, NavChild, NavItem };
