import { useState } from 'react';
import { Bell, CheckCheck, TrendingUp, TrendingDown, ShieldAlert, Bot, Activity } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useNavigate } from 'react-router-dom';
import { useNotifications, type AppNotification } from '@/hooks/useNotifications';
import { cn } from '@/lib/utils';

const ICONS: Record<AppNotification['kind'], typeof Bell> = {
  trade: Activity,
  profit: TrendingUp,
  loss: TrendingDown,
  risk: ShieldAlert,
  ai: Bot,
};

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

export function NotificationsPanel() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { notifications, unreadCount, isLoading, markAllRead, lastRead } = useNotifications();

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next && unreadCount > 0) markAllRead();
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="tap relative" aria-label="Notifications">
          <Bell className="w-5 h-5" />
          {unreadCount > 0 && (
            <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 text-[10px] font-bold flex items-center justify-center bg-primary text-primary-foreground rounded-full ring-2 ring-background">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[calc(100vw-1.5rem)] sm:w-96 p-0">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div>
            <p className="font-semibold text-sm">Notifications</p>
            <p className="text-xs text-muted-foreground">Last 72 hours</p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="gap-1 text-xs"
            onClick={markAllRead}
            disabled={unreadCount === 0}
          >
            <CheckCheck className="w-3.5 h-3.5" />
            Mark read
          </Button>
        </div>

        <ScrollArea className="max-h-[60vh]">
          {isLoading ? (
            <p className="p-6 text-sm text-muted-foreground text-center">Loading activity...</p>
          ) : notifications.length === 0 ? (
            <div className="p-6 text-center">
              <Bell className="w-6 h-6 mx-auto mb-2 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">No activity yet</p>
              <p className="text-xs text-muted-foreground mt-1">
                Trade, risk and agent alerts will appear here.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {notifications.map((n) => {
                const Icon = ICONS[n.kind];
                const unread = new Date(n.createdAt).getTime() > new Date(lastRead).getTime();
                return (
                  <li key={n.id}>
                    <button
                      className={cn(
                        'w-full text-left px-4 py-3 flex gap-3 hover:bg-secondary/60 transition-colors',
                        unread && 'bg-primary/5'
                      )}
                      onClick={() => {
                        markAllRead();
                        setOpen(false);
                        navigate(n.link);
                      }}
                    >
                      <span
                        className={cn(
                          'mt-0.5 shrink-0 w-7 h-7 rounded-lg flex items-center justify-center',
                          n.severity === 'success' && 'bg-success/15 text-success',
                          n.severity === 'warning' && 'bg-warning/15 text-warning',
                          n.severity === 'critical' && 'bg-destructive/15 text-destructive',
                          n.severity === 'info' && 'bg-primary/15 text-primary'
                        )}
                      >
                        <Icon className="w-4 h-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline justify-between gap-2">
                          <span className="text-sm font-medium truncate">{n.title}</span>
                          <span className="text-[11px] text-muted-foreground shrink-0">
                            {timeAgo(n.createdAt)}
                          </span>
                        </span>
                        <span className="block text-xs text-muted-foreground line-clamp-2">
                          {n.description}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
