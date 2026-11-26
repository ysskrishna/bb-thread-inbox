import { BbIcon, THREAD_ACTION_GROUPS as GROUPS, useThreadActions, useSidebarThreads } from "./bb-sdk";
import { Fragment, useRef, useState, type ReactNode, type RefObject } from "react";
import * as ContextMenu from "@radix-ui/react-context-menu";
import { useBbNavigate, useRpc, type PluginSidebarThread, type PluginThreadActionEntry } from "@get-bb/plugin-sdk/app";
import { errorDetail, toast } from "./lib/toast";
import type { threadInboxRpcContract } from "./contract";
import { ParentThreadMenu } from "./ParentThreadMenu";
import { ThreadActionChoices } from "./ThreadActionChoices";
import { notifiesParent, ParentNotificationsMenu } from "./ParentNotificationsMenu";
import { DeleteThreadDialog } from "./DeleteThreadDialog";
import { SnoozePickerDialog } from "./SnoozePickerDialog";
import { Icon, type IconName } from "./components/Icon";
import { cn } from "./lib/utils";
import { usePortalScopeProps } from "./lib/portal-scope";
import { formatSnoozeWakeTime, resolveConfiguredSnoozePreset, type ConfiguredSnoozePreset } from "./lifecycle";

type RowContextMenuProps = {
  thread: PluginSidebarThread;
  children: ReactNode;
  canSnooze?: boolean;
  canArchive?: boolean;
  snoozePresets?: readonly ConfiguredSnoozePreset[];
  onSnooze?: (snoozedUntil: number) => void;
  onResume?: () => void;
  onSettle?: () => void;
  onUnsettle?: () => void;
  onWake?: () => void;
  onRename?: () => void;
};

/** Keep the plugin's menus, but build their actions and dialogs only on first open. */
export function RowContextMenu({ children, ...props }: RowContextMenuProps) {
  const [activated, setActivated] = useState(false);
  // True from opening until the menu has handed focus back.
  const shown = useRef(false);
  return (
    <ContextMenu.Root
      onOpenChange={(open) => {
        if (!open) return;
        shown.current = true;
        setActivated(true);
      }}
    >
      <ContextMenu.Trigger asChild>{children}</ContextMenu.Trigger>
      {activated ? <RowMenuContents {...props} shown={shown} /> : null}
    </ContextMenu.Root>
  );
}

function RowMenuContents({
  thread,
  canSnooze = false,
  canArchive = true,
  snoozePresets = [],
  onSnooze,
  onResume,
  onSettle,
  onUnsettle,
  onWake,
  onRename,
  shown,
}: Omit<RowContextMenuProps, "children"> & { shown: RefObject<boolean> }) {
  // The rename to start once the menu has released focus.
  const renameAfterClose = useRef<(() => void) | null>(null);
  const actions = useThreadActions(thread, {
    // A plugin action that renames from the open menu waits for it to release focus.
    requestRename: () => {
      if (shown.current) renameAfterClose.current = () => onRename?.();
      else onRename?.();
    },
  });
  const pluginGroups = groupPluginActions(actions);
  const navigate = useBbNavigate();
  // bb 0.46 always supplies pin/read/rename/archive for sidebar rows, and bb
  // 0.49 copyLink. Split is omitted in compact mode and for the focused pane;
  // navigation handles both.
  const run = (key: string) => {
    const entry = actions.find((entry) => entry.key === `bb--core/${key}`);
    if (!entry && key === "split") return navigate.toThread(thread.id, { split: true });
    return entry?.action.run();
  };
  const { projects, threads } = useSidebarThreads();
  const project = projects.find((project) => project.id === thread.projectId);
  const portalScope = usePortalScopeProps();
  const rpc = useRpc<typeof threadInboxRpcContract>();
  const leavingForSettings = useRef(false);
  // Outlives the portaled submenu, which unmounts when a choice closes the menu.
  const pendingNotificationSave = useRef<Promise<void> | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [pickingSnooze, setPickingSnooze] = useState(false);
  const hasPinLifecycleItems = !!(
    thread.isPinned ||
    thread.parentThreadId == null ||
    onResume ||
    onSettle ||
    onUnsettle ||
    onWake ||
    (canSnooze && onSnooze && snoozePresets.length > 0) ||
    pluginGroups.has(GROUPS.state)
  );
  const togglePin = async () => {
    if (thread.isPinned) {
      await run("pin");
      return;
    }
    if (thread.parentThreadId != null) return;
    try {
      await rpc.call("pin", { threadId: thread.id });
    } catch (error) {
      toast.error("Could not pin thread", { description: errorDetail(error) });
    }
  };

  return (
    <>
      <ContextMenu.Portal>
        <ContextMenu.Content
          {...portalScope}
          aria-label="Thread actions"
          onCloseAutoFocus={(event) => {
            shown.current = false;
            if (leavingForSettings.current) event.preventDefault();
            leavingForSettings.current = false;
            // A dialog takes focus next; do not pull it back to the row.
            if (confirmingDelete || pickingSnooze) event.preventDefault();
            const rename = renameAfterClose.current;
            if (!rename) return;
            renameAfterClose.current = null;
            // Hand focus to the editor after the menu releases its focus scope.
            event.preventDefault();
            rename();
          }}
          className="z-50 min-w-44 rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-md"
        >
          <PluginGroups groups={pluginGroups} before={GROUPS.open} />
          <PluginItems entries={pluginGroups.get(GROUPS.open)?.leading} />
          <Item onSelect={() => void run("split")}>Open in split</Item>
          <ParentThreadMenu thread={thread} />
          {notifiesParent(thread) ? (
            <ParentNotificationsMenu thread={thread} pendingSave={pendingNotificationSave} />
          ) : null}
          {project && !project.isPersonal ? (
            <ContextMenu.Sub>
              <ContextMenu.SubTrigger className="flex cursor-pointer items-center rounded-md px-2 py-[0.3125rem] text-xs outline-none data-[state=open]:bg-accent data-[highlighted]:bg-accent">
                Project
                <Icon name="ChevronRight" className="ml-auto size-4 opacity-60" />
              </ContextMenu.SubTrigger>
              <ContextMenu.Portal>
                <ContextMenu.SubContent
                  {...portalScope}
                  aria-label="Project actions"
                  sideOffset={4}
                  className="z-50 min-w-44 rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-md"
                >
                  <ContextMenu.Label className="max-w-64 truncate px-2 py-1 text-xs text-muted-foreground">
                    {project?.name}
                  </ContextMenu.Label>
                  <ContextMenu.Item
                    asChild
                    onSelect={() => {
                      leavingForSettings.current = true;
                    }}
                    className="cursor-pointer rounded-md px-2 py-[0.3125rem] text-xs outline-none data-[highlighted]:bg-accent"
                  >
                    <a href={project.settingsHref}>Project settings</a>
                  </ContextMenu.Item>
                </ContextMenu.SubContent>
              </ContextMenu.Portal>
            </ContextMenu.Sub>
          ) : null}
          <PluginItems entries={pluginGroups.get(GROUPS.open)?.trailing} />
          <PluginGroups groups={pluginGroups} after={GROUPS.open} before={GROUPS.state} />
          {hasPinLifecycleItems ? <Separator /> : null}
          <PluginItems entries={pluginGroups.get(GROUPS.state)?.leading} />
          {thread.isPinned || thread.parentThreadId == null ? (
            <Item icon={thread.isPinned ? "PinOff" : "Pin"} onSelect={() => void togglePin()}>
              {thread.isPinned ? "Unpin" : "Pin"}
            </Item>
          ) : null}
          {canSnooze && onSnooze && snoozePresets.length > 0 ? (
            <SnoozeSubmenu presets={snoozePresets} onSnooze={onSnooze} onPick={() => setPickingSnooze(true)} />
          ) : null}
          {onWake ? (
            <Item icon="Pulse" onSelect={onWake}>
              Wake now
            </Item>
          ) : null}
          {onResume ? (
            <Item icon="Pulse" onSelect={onResume}>
              Resume
            </Item>
          ) : null}
          {onSettle ? (
            <Item icon="Meditation" onSelect={onSettle}>
              Settle
            </Item>
          ) : null}
          {onUnsettle ? (
            <Item icon="Pulse" onSelect={onUnsettle}>
              Un-settle
            </Item>
          ) : null}
          <PluginItems entries={pluginGroups.get(GROUPS.state)?.trailing} />
          <PluginGroups groups={pluginGroups} after={GROUPS.state} before={GROUPS.organize} />
          <Separator />
          <PluginItems entries={pluginGroups.get(GROUPS.organize)?.leading} />
          {onRename ? (
            <Item
              onSelect={() => {
                renameAfterClose.current = () => void run("rename");
              }}
            >
              Rename
            </Item>
          ) : null}
          <Item onSelect={() => void run("read")}>{thread.isUnread ? "Mark read" : "Mark unread"}</Item>
          <PluginItems entries={pluginGroups.get(GROUPS.organize)?.trailing} />
          <Separator />
          <CopySubmenu thread={thread} onCopyLink={() => void run("copyLink")} />
          <PluginGroups groups={pluginGroups} after={GROUPS.organize} before={GROUPS.lifecycle} />
          <Separator />
          <PluginItems entries={pluginGroups.get(GROUPS.lifecycle)?.leading} />
          <Item disabled={!canArchive} onSelect={() => void run("archive")}>
            Archive
          </Item>
          <Item destructive onSelect={() => setConfirmingDelete(true)}>
            Delete
          </Item>
          <PluginItems entries={pluginGroups.get(GROUPS.lifecycle)?.trailing} />
          <PluginGroups groups={pluginGroups} after={GROUPS.lifecycle} />
        </ContextMenu.Content>
      </ContextMenu.Portal>
      <DeleteThreadDialog thread={thread} open={confirmingDelete} onOpenChange={setConfirmingDelete} />
      {onSnooze ? (
        <SnoozePickerDialog open={pickingSnooze} onOpenChange={setPickingSnooze} onSnooze={onSnooze} />
      ) : null}
    </>
  );
}

/** bb's groups that this menu's own sections stand for, in menu order. */
const SECTION_GROUPS: readonly string[] = [GROUPS.open, GROUPS.state, GROUPS.organize, GROUPS.lifecycle];

/** bb's native thread list moves threads between its sections, which this sidebar does not draw. */
const MOVE_TO_SECTION = "thread-list/move";

/**
 * Other plugins' thread actions in one group, in bb's menu order: those bb
 * sorts before the group's first own action, and those after it.
 */
interface PluginSection {
  leading: PluginThreadActionEntry[];
  trailing: PluginThreadActionEntry[];
}

/** bb's own actions are this menu's items; the rest go to the section of their group. */
function groupPluginActions(actions: readonly PluginThreadActionEntry[]) {
  const groups = new Map<string, PluginSection>();
  const groupsWithCore = new Set<string>();
  for (const entry of actions) {
    if (entry.key === MOVE_TO_SECTION) continue;
    const section = groups.get(entry.group);
    if (entry.pluginId === "bb--core") {
      if (section && !groupsWithCore.has(entry.group)) section.leading = section.trailing.splice(0);
      groupsWithCore.add(entry.group);
    } else if (section) section.trailing.push(entry);
    else groups.set(entry.group, { leading: [], trailing: [entry] });
  }
  return groups;
}

/**
 * Groups that are not one of this menu's sections, each a section of its own
 * between `after` and `before`, as bb places a group where it sorts.
 */
function PluginGroups({
  groups,
  after,
  before,
}: {
  groups: ReadonlyMap<string, PluginSection>;
  after?: string;
  before?: string;
}) {
  return [...groups]
    .filter(
      ([group]) =>
        !SECTION_GROUPS.includes(group) &&
        (after === undefined || group > after) &&
        (before === undefined || group < before),
    )
    .map(([group, { leading, trailing }]) => (
      <Fragment key={group}>
        {after === undefined ? null : <Separator />}
        <PluginItems entries={[...leading, ...trailing]} />
        {after === undefined ? <Separator /> : null}
      </Fragment>
    ));
}

function PluginItems({ entries = [] }: { entries?: readonly PluginThreadActionEntry[] }) {
  return entries.map(({ key, action }) =>
    action.choices ? (
      <ThreadActionChoices key={key} action={action} />
    ) : (
      <Item
        key={key}
        bbIcon={action.icon}
        destructive={action.variant === "destructive"}
        disabled={action.disabled}
        onSelect={() => void action.run()}
      >
        <span className="flex min-w-0 flex-col">
          <span>{action.label}</span>
          {action.detail ? <span className="text-muted-foreground">{action.detail}</span> : null}
        </span>
      </Item>
    ),
  );
}

/** Copy thread link is bb's own Copy link action: same URL, toasts and errors. */
function CopySubmenu({ thread, onCopyLink }: { thread: PluginSidebarThread; onCopyLink: () => void }) {
  const portalScope = usePortalScopeProps();
  const branchName = thread.environment?.branchName;
  const copy = (text: string) => {
    if (typeof navigator === "undefined" || !navigator.clipboard) return;
    void navigator.clipboard.writeText(text);
  };

  return (
    <ContextMenu.Sub>
      <ContextMenu.SubTrigger
        className={cn(
          "flex cursor-pointer items-center rounded-md px-2 py-[0.3125rem] text-xs outline-none",
          "data-[state=open]:bg-accent data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground",
        )}
      >
        Copy
        <Icon name="ChevronRight" className="ml-auto size-4 opacity-60" />
      </ContextMenu.SubTrigger>
      <ContextMenu.Portal>
        <ContextMenu.SubContent
          {...portalScope}
          aria-label="Copy thread data"
          sideOffset={4}
          className="z-50 min-w-40 rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-md"
        >
          <Item onSelect={onCopyLink}>Copy thread link</Item>
          {branchName ? <Item onSelect={() => copy(branchName)}>Copy branch</Item> : null}
          <Item onSelect={() => copy(thread.id)}>Copy thread ID</Item>
        </ContextMenu.SubContent>
      </ContextMenu.Portal>
    </ContextMenu.Sub>
  );
}

function SnoozeSubmenu({
  presets,
  onSnooze,
  onPick,
}: {
  presets: readonly ConfiguredSnoozePreset[];
  onSnooze: (snoozedUntil: number) => void;
  onPick: () => void;
}) {
  const portalScope = usePortalScopeProps();
  return (
    <ContextMenu.Sub>
      <ContextMenu.SubTrigger
        className={cn(
          "flex cursor-pointer items-center gap-2 rounded-md px-2 py-[0.3125rem] text-xs outline-none",
          "data-[state=open]:bg-accent data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground",
        )}
      >
        <Icon name="Clock" className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
        Snooze
        <Icon name="ChevronRight" className="ml-auto size-4 opacity-60" />
      </ContextMenu.SubTrigger>
      <ContextMenu.Portal>
        <ContextMenu.SubContent
          {...portalScope}
          aria-label="Snooze times"
          sideOffset={4}
          className="z-50 min-w-40 rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-md"
        >
          {presets.map((preset) => {
            const wake = resolveConfiguredSnoozePreset(preset);
            return (
              <Item
                key={preset.id}
                disabled={wake === null}
                title={wake === null ? "Today's time has passed" : formatSnoozeWakeTime(wake)}
                onSelect={() => {
                  const selectedWake = resolveConfiguredSnoozePreset(preset);
                  if (selectedWake !== null) onSnooze(selectedWake);
                }}
              >
                {preset.label}
              </Item>
            );
          })}
          <Separator />
          <Item icon="Calendar" onSelect={onPick}>
            Pick date & time…
          </Item>
        </ContextMenu.SubContent>
      </ContextMenu.Portal>
    </ContextMenu.Sub>
  );
}

function Item({
  children,
  icon,
  bbIcon,
  destructive = false,
  disabled = false,
  title,
  onSelect,
}: {
  children: ReactNode;
  icon?: IconName;
  /** A bb icon name, for another plugin's action. */
  bbIcon?: string;
  destructive?: boolean;
  disabled?: boolean;
  title?: string;
  onSelect: () => void;
}) {
  return (
    <ContextMenu.Item
      disabled={disabled}
      title={title}
      onSelect={onSelect}
      className={cn(
        "flex cursor-pointer items-center gap-2 rounded-md px-2 py-[0.3125rem] text-xs outline-none",
        "data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground",
        "data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50",
        destructive && "text-destructive-text",
      )}
    >
      {icon ? <Icon name={icon} className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" /> : null}
      {bbIcon ? <BbIcon name={bbIcon} className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" /> : null}
      {children}
    </ContextMenu.Item>
  );
}

function Separator() {
  return <ContextMenu.Separator className="my-1 h-px bg-border" />;
}
