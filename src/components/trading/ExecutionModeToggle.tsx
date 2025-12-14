import { Bot, UserCheck, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface ExecutionModeToggleProps {
  mode: 'autonomous' | 'user_confirmed';
  onChange: (mode: 'autonomous' | 'user_confirmed') => void;
  disabled?: boolean;
}

/**
 * Patent Claim: Selectable Execution Control Modes
 * 
 * This component implements the patent's claim for "selectable execution control modes"
 * allowing users to choose between:
 * - Autonomous execution: AI executes trades automatically
 * - User-confirmed execution: Users review and approve each trade before execution
 */
export function ExecutionModeToggle({ mode, onChange, disabled }: ExecutionModeToggleProps) {
  return (
    <div className="glass-panel p-6 gradient-border">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className={cn(
            'p-3 rounded-xl transition-all',
            mode === 'autonomous' ? 'bg-primary/20' : 'bg-warning/20'
          )}>
            {mode === 'autonomous' ? (
              <Bot className="w-6 h-6 text-primary" />
            ) : (
              <UserCheck className="w-6 h-6 text-warning" />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold text-foreground">Execution Mode</h2>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger>
                    <Info className="w-4 h-4 text-muted-foreground" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    <p className="font-medium mb-1">Patent: Selectable Execution Control Modes</p>
                    <p className="text-sm">Choose how the AI executes trades - automatically or with your approval for each trade.</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <p className="text-sm text-muted-foreground">
              {mode === 'autonomous' 
                ? 'AI executes trades automatically based on analysis'
                : 'Review and approve each trade before execution'
              }
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1 bg-secondary/50 p-1 rounded-lg">
          <button
            onClick={() => onChange('autonomous')}
            disabled={disabled}
            className={cn(
              'px-4 py-2 rounded-md text-sm font-medium transition-all flex items-center gap-2',
              mode === 'autonomous' 
                ? 'bg-primary text-primary-foreground shadow-md' 
                : 'text-muted-foreground hover:text-foreground',
              disabled && 'opacity-50 cursor-not-allowed'
            )}
          >
            <Bot className="w-4 h-4" />
            Autonomous
          </button>
          <button
            onClick={() => onChange('user_confirmed')}
            disabled={disabled}
            className={cn(
              'px-4 py-2 rounded-md text-sm font-medium transition-all flex items-center gap-2',
              mode === 'user_confirmed' 
                ? 'bg-warning text-warning-foreground shadow-md' 
                : 'text-muted-foreground hover:text-foreground',
              disabled && 'opacity-50 cursor-not-allowed'
            )}
          >
            <UserCheck className="w-4 h-4" />
            User-Confirmed
          </button>
        </div>
      </div>

      {mode === 'user_confirmed' && (
        <div className="mt-4 p-3 rounded-lg bg-warning/10 border border-warning/20 flex items-start gap-2">
          <UserCheck className="w-4 h-4 text-warning mt-0.5 flex-shrink-0" />
          <div className="text-sm">
            <p className="font-medium text-warning">User-Confirmed Mode Active</p>
            <p className="text-muted-foreground">
              All trade proposals will appear in the pending approvals queue. You must approve each trade before it executes.
              Proposals expire after 15 minutes if not reviewed.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
