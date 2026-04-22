import * as React from "react"
import { cn } from "@/lib/utils"

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {}

const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          "rounded-xl border border-border bg-card/70 backdrop-blur-sm shadow-sm",
          className
        )}
        {...props}
      >
        {children}
      </div>
    )
  }
)
Card.displayName = "Card"

const CardContent = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, children, ...props }, ref) => (
    <div ref={ref} className={cn("p-0", className)} {...props}>
      {children}
    </div>
  )
)
CardContent.displayName = "CardContent"

const CardHeader = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, children, ...props }, ref) => (
    <div ref={ref} className={cn("p-3 border-b border-border/20", className)} {...props}>
      {children}
    </div>
  )
)
CardHeader.displayName = "CardHeader"

const CardFooter = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, children, ...props }, ref) => (
    <div ref={ref} className={cn("p-2 border-t border-border/10", className)} {...props}>
      {children}
    </div>
  )
)
CardFooter.displayName = "CardFooter"

export { Card, CardContent, CardHeader, CardFooter }
