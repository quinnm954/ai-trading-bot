import { Bell, Search, User, LogOut, Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';

interface HeaderProps {
  onMenuClick: () => void;
}

export function Header({ onMenuClick }: HeaderProps) {
  const { user, signOut } = useAuth();
  const { toast } = useToast();

  const handleSignOut = async () => {
    const { error } = await signOut();
    if (error) {
      toast({
        title: 'Error',
        description: 'Failed to sign out. Please try again.',
        variant: 'destructive',
      });
    } else {
      toast({
        title: 'Signed out',
        description: 'You have been successfully signed out.',
      });
    }
  };

  return (
    <header
      className="sticky top-0 z-30 flex h-14 lg:h-16 items-center justify-between border-b border-border bg-background/80 backdrop-blur-xl px-4 lg:px-6"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden"
          onClick={onMenuClick}
        >
          <Menu className="w-5 h-5" />
        </Button>

        <h1 className="lg:hidden text-base font-semibold truncate">Titan AI</h1>

        <div className="relative w-80 hidden md:block">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search symbols, strategies..."
            className="pl-10 bg-secondary border-border"
          />
        </div>
      </div>
      
      <div className="flex items-center gap-2 lg:gap-3">
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="w-5 h-5" />
          <span className="absolute top-2 right-2 w-2 h-2 bg-primary rounded-full" />
        </Button>
        
        <div className="flex items-center gap-2 lg:gap-3 pl-2 lg:pl-3 border-l border-border">
          {/* User info - hidden on mobile */}
          <div className="text-right hidden sm:block">
            <p className="text-sm font-medium truncate max-w-[150px]">
              {user?.email?.split('@')[0] || 'Trader'}
            </p>
            <p className="text-xs text-muted-foreground">Paper Trading</p>
          </div>
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="rounded-full bg-secondary">
                <User className="w-5 h-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <div className="px-2 py-1.5">
                <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleSignOut} className="text-loss cursor-pointer">
                <LogOut className="w-4 h-4 mr-2" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}