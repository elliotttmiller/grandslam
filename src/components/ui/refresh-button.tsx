import * as React from 'react';
import { RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button, type ButtonProps } from '@/components/ui/button';

export interface RefreshButtonProps extends Omit<ButtonProps, 'children'> {
  loading?: boolean;
  label?: string;
}

const RefreshButton = React.forwardRef<HTMLButtonElement, RefreshButtonProps>(
  ({ className, loading = false, label = 'Refresh', variant = 'outline', size = 'sm', ...props }, ref) => (
    <Button
      ref={ref}
      variant={variant}
      size={size}
      className={cn(
        'rounded-full transition-all',
        loading ? 'cursor-wait' : '',
        className,
      )}
      aria-label={props['aria-label'] ?? (loading ? 'Requesting refresh' : label)}
      {...props}
    >
      {loading ? (
        <span className="inline-flex items-center justify-center rounded-full border-2 border-current border-t-transparent text-current h-4 w-4 animate-spin" aria-hidden="true" />
      ) : (
        <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
      )}
      <span className={cn('ml-2 hidden sm:inline-flex items-center', loading ? 'text-slate-400' : '')}>
        {loading ? 'Requesting…' : label}
      </span>
    </Button>
  )
);

RefreshButton.displayName = 'RefreshButton';

export { RefreshButton };
