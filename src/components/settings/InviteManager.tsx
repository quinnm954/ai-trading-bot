import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useInvites } from '@/hooks/useInvites';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { Share2, Copy, Plus, Users, Check, Clock } from 'lucide-react';
import { format } from 'date-fns';

export const InviteManager = () => {
  const { isAdmin, isLoading: adminLoading } = useIsAdmin();
  const { invites, loading, generateInviteCode, shareInvite, getInviteLink } = useInvites();
  const [generating, setGenerating] = useState(false);

  // Show loading state while checking admin status
  if (adminLoading) {
    return (
      <Card className="border-border/50 bg-card/50 backdrop-blur">
        <CardContent className="p-6">
          <p className="text-muted-foreground">Checking admin status...</p>
        </CardContent>
      </Card>
    );
  }

  if (!isAdmin) {
    return null;
  }

  const handleGenerate = async () => {
    setGenerating(true);
    await generateInviteCode();
    setGenerating(false);
  };

  const activeInvites = invites.filter(i => !i.used_by && new Date(i.expires_at) > new Date());
  const usedInvites = invites.filter(i => i.used_by);

  return (
    <Card className="border-border/50 bg-card/50 backdrop-blur">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              Invite Management
            </CardTitle>
            <CardDescription>
              Generate invite links to give users full free access
            </CardDescription>
          </div>
          <Button onClick={handleGenerate} disabled={generating}>
            <Plus className="h-4 w-4 mr-2" />
            {generating ? 'Creating...' : 'New Invite'}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Active Invites */}
        <div>
          <h3 className="text-sm font-medium text-muted-foreground mb-3">
            Active Invites ({activeInvites.length})
          </h3>
          {activeInvites.length === 0 ? (
            <p className="text-sm text-muted-foreground">No active invites. Generate one above.</p>
          ) : (
            <div className="space-y-2">
              {activeInvites.map((invite) => (
                <div
                  key={invite.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-background/50 border border-border/30"
                >
                  <div className="flex items-center gap-3">
                    <Badge variant="outline" className="font-mono">
                      {invite.code}
                    </Badge>
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      Expires {format(new Date(invite.expires_at), 'MMM d, yyyy')}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => navigator.clipboard.writeText(getInviteLink(invite.code))}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => shareInvite(invite.code)}
                    >
                      <Share2 className="h-4 w-4 mr-2" />
                      Share
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Used Invites */}
        {usedInvites.length > 0 && (
          <div>
            <h3 className="text-sm font-medium text-muted-foreground mb-3">
              Used Invites ({usedInvites.length})
            </h3>
            <div className="space-y-2">
              {usedInvites.map((invite) => (
                <div
                  key={invite.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-background/30 border border-border/20 opacity-60"
                >
                  <div className="flex items-center gap-3">
                    <Badge variant="secondary" className="font-mono">
                      {invite.code}
                    </Badge>
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Check className="h-3 w-3 text-green-500" />
                      Used {invite.used_at ? format(new Date(invite.used_at), 'MMM d, yyyy') : ''}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
