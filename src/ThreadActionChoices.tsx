import * as ContextMenu from "@radix-ui/react-context-menu";
import type { PluginBoundThreadAction } from "@get-bb/plugin-sdk/app";
import { BbIcon } from "./bb-sdk";
import { Icon } from "./components/Icon";
import { cn } from "./lib/utils";
import { usePortalScopeProps } from "./lib/portal-scope";

const itemClassName = cn(
  "flex cursor-pointer items-center gap-2 rounded-md px-2 py-[0.3125rem] text-xs outline-none",
  "data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground",
  "data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50",
);

/** A plugin's thread action with `choices`: a submenu that marks the current ones, as bb's menu does. */
export function ThreadActionChoices({ action }: { action: PluginBoundThreadAction }) {
  const portalScope = usePortalScopeProps();
  return (
    <ContextMenu.Sub>
      <ContextMenu.SubTrigger
        disabled={action.disabled}
        title={action.detail}
        className={cn(itemClassName, "data-[state=open]:bg-accent")}
      >
        <BbIcon name={action.icon} className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
        {action.label}
        <Icon name="ChevronRight" className="ml-auto size-4 opacity-60" />
      </ContextMenu.SubTrigger>
      <ContextMenu.Portal>
        <ContextMenu.SubContent
          {...portalScope}
          aria-label={action.label}
          sideOffset={4}
          className="z-50 min-w-40 max-w-64 rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-md"
        >
          {action.choices?.items.map((choice) => (
            <ContextMenu.Item
              key={choice.id}
              aria-current={choice.selected ? "true" : undefined}
              disabled={choice.disabled}
              onSelect={() => void action.run(choice.id)}
              className={itemClassName}
            >
              {choice.icon ? (
                <BbIcon name={choice.icon} className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
              ) : null}
              {choice.label}
              {choice.selected ? <Icon name="Check" className="ml-auto size-3.5" aria-hidden="true" /> : null}
            </ContextMenu.Item>
          ))}
          {action.choices?.hint ? (
            <p className="px-2 py-1 text-xs text-muted-foreground">{action.choices.hint}</p>
          ) : null}
        </ContextMenu.SubContent>
      </ContextMenu.Portal>
    </ContextMenu.Sub>
  );
}
