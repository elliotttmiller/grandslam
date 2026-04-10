import * as React from "react"
import { ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"

type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement> & {
  onValueChange?: (value: string) => void
}

function Select({ children, onValueChange, onChange, className, ...props }: SelectProps) {
  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onValueChange?.(e.target.value)
    onChange?.(e)
  }
  return (
    <div className="relative w-full">
      <select
        className={cn(
          "flex h-9 w-full appearance-none items-center rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        onChange={handleChange}
        {...props}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 opacity-50" />
    </div>
  )
}

function SelectTrigger({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex items-center", className)} {...props}>{children}</div>
}

function SelectValue({ placeholder }: { placeholder?: string }) {
  return <span className="text-muted-foreground">{placeholder}</span>
}

function SelectContent({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}

function SelectItem({ value, children, ...props }: React.OptionHTMLAttributes<HTMLOptionElement>) {
  return <option value={value} {...props}>{children}</option>
}

function SelectGroup({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}

export {
  Select,
  SelectGroup,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectItem,
}
