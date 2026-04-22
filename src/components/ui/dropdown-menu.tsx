import * as React from "react"
import * as Radix from "@radix-ui/react-dropdown-menu"

import { cn } from "@/lib/utils"
import { ChevronRight, Check } from "lucide-react"

function DropdownMenu({ children, ...props }: Radix.DropdownMenuProps) {
  return <Radix.Root {...props}>{children}</Radix.Root>
}

function DropdownMenuPortal({ children, ...props }: Radix.DropdownMenuPortalProps) {
  return <Radix.Portal {...props}>{children}</Radix.Portal>
}

function DropdownMenuTrigger({ children, ...props }: Radix.DropdownMenuTriggerProps) {
  return <Radix.Trigger {...props}>{children}</Radix.Trigger>
}

function DropdownMenuContent({
  align = "start",
  sideOffset = 4,
  className,
  children,
  ...props
}: Radix.DropdownMenuContentProps) {
  return (
    <Radix.Portal>
      <Radix.Content
        align={align}
        sideOffset={sideOffset}
        className={cn(
          "z-50 min-w-35 rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10",
          className
        )}
        {...props}
      >
        {children}
      </Radix.Content>
    </Radix.Portal>
  )
}

function DropdownMenuGroup({ children, ...props }: Radix.DropdownMenuGroupProps) {
  return <Radix.Group {...props}>{children}</Radix.Group>
}

function DropdownMenuLabel({ className, inset, ...props }: any) {
  return (
    <div className={cn("px-2 py-1 text-xs font-medium text-muted-foreground", className)} {...props} />
  )
}

function DropdownMenuItem({ className, inset, children, ...props }: any) {
  return (
    <Radix.Item className={cn("flex items-center gap-2 rounded-md px-2 py-1 text-sm cursor-default select-none hover:bg-accent", className)} {...props}>
      {children}
    </Radix.Item>
  )
}

function DropdownMenuSub({ children, ...props }: any) {
  return <Radix.Sub {...props}>{children}</Radix.Sub>
}

function DropdownMenuSubTrigger({ children, className, ...props }: any) {
  return (
    <Radix.SubTrigger className={cn("flex items-center gap-2 px-2 py-1 text-sm rounded-md hover:bg-accent", className)} {...props}>
      {children}
      <ChevronRight className="ml-auto" />
    </Radix.SubTrigger>
  )
}

function DropdownMenuSubContent({ className, children, ...props }: any) {
  return (
    <Radix.SubContent className={cn("min-w-24 rounded-lg bg-popover p-1 shadow-lg ring-1 ring-foreground/10", className)} {...props}>
      {children}
    </Radix.SubContent>
  )
}

function DropdownMenuCheckboxItem({ children, checked, className, ...props }: any) {
  return (
    <Radix.CheckboxItem className={cn("relative flex items-center gap-2 px-2 py-1 text-sm rounded-md hover:bg-accent", className)} checked={checked} {...props}>
      <Radix.ItemIndicator className="absolute right-2 flex items-center justify-center"><Check className="size-4" /></Radix.ItemIndicator>
      {children}
    </Radix.CheckboxItem>
  )
}

function DropdownMenuRadioGroup({ children, ...props }: any) {
  return <Radix.RadioGroup {...props}>{children}</Radix.RadioGroup>
}

function DropdownMenuRadioItem({ children, className, ...props }: any) {
  return (
    <Radix.RadioItem className={cn("relative flex items-center gap-2 px-2 py-1 text-sm rounded-md hover:bg-accent", className)} {...props}>
      <Radix.ItemIndicator className="absolute right-2 flex items-center justify-center"><Check className="size-4" /></Radix.ItemIndicator>
      {children}
    </Radix.RadioItem>
  )
}

function DropdownMenuSeparator({ className, ...props }: any) {
  return <Radix.Separator className={cn("my-1 h-px bg-border", className)} {...props} />
}

function DropdownMenuShortcut({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("ml-auto text-xs tracking-widest text-muted-foreground", className)} {...props} />
}

export {
  DropdownMenu,
  DropdownMenuPortal,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
}
