import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Users, UserPlus, Activity, TrendingUp, Calendar, Clock, RefreshCw, CreditCard, Tag, Plus, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { format, formatDistanceToNow } from 'date-fns';

interface AdminStats {
  totalUsers: number;
  signupsToday: number;
  signupsThisWeek: number;
  signupsThisMonth: number;
  activeToday: number;
  activeThisWeek: number;
  totalTrades: number;
  totalPositions: number;
  recentUsers: {
    id: string;
    email: string;
    created_at: string;
    last_sign_in_at: string | null;
    email_confirmed_at: string | null;
  }[];
}

interface ReferralStats {
  code: string;
  marketer_name: string;
  signup_count: number;
}

export default function AdminDashboard() {
  const navigate = useNavigate();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { isAdmin, isLoading: adminLoading } = useIsAdmin();
  const { toast } = useToast();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Referral tracking state
  const [referralStats, setReferralStats] = useState<ReferralStats[]>([]);
  const [referralLoading, setReferralLoading] = useState(true);
  const [newCode, setNewCode] = useState('');
  const [newMarketerName, setNewMarketerName] = useState('');
  const [creatingCode, setCreatingCode] = useState(false);

  // Wait for both auth and admin checks to complete before any redirect
  useEffect(() => {
    // Don't do anything while still loading
    if (authLoading || adminLoading) return;
    
    // Not authenticated - go to auth
    if (!isAuthenticated) {
      navigate('/auth');
      return;
    }
    
    // Authenticated but not admin - go to dashboard
    if (!isAdmin) {
      navigate('/dashboard');
    }
  }, [authLoading, adminLoading, isAuthenticated, isAdmin, navigate]);

  useEffect(() => {
    async function fetchStats() {
      if (adminLoading || !isAdmin) return;
      
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;

        const response = await supabase.functions.invoke('admin-stats', {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        });

        if (response.error) {
          throw new Error(response.error.message);
        }

        setStats(response.data);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    if (!adminLoading && isAdmin) {
      fetchStats();
      fetchReferralStats();
    }
  }, [isAdmin, adminLoading]);

  async function fetchReferralStats() {
    setReferralLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_referral_stats');
      if (error) throw error;
      setReferralStats(data || []);
    } catch (err: any) {
      console.error('Failed to fetch referral stats:', err);
    } finally {
      setReferralLoading(false);
    }
  }

  const handleCreateReferralCode = async () => {
    if (!newCode.trim() || !newMarketerName.trim()) {
      toast({
        title: 'Missing information',
        description: 'Please enter both a code and marketer name.',
        variant: 'destructive',
      });
      return;
    }

    setCreatingCode(true);
    try {
      const { error } = await supabase
        .from('referral_codes')
        .insert({
          code: newCode.trim().toUpperCase(),
          marketer_name: newMarketerName.trim(),
        });

      if (error) {
        if (error.code === '23505') {
          throw new Error('This code already exists');
        }
        throw error;
      }

      toast({
        title: 'Referral code created',
        description: `Code "${newCode.toUpperCase()}" created for ${newMarketerName}`,
      });
      setNewCode('');
      setNewMarketerName('');
      fetchReferralStats();
    } catch (err: any) {
      toast({
        title: 'Failed to create code',
        description: err.message,
        variant: 'destructive',
      });
    } finally {
      setCreatingCode(false);
    }
  };

  const handleSyncToStripe = async () => {
    setSyncing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const response = await supabase.functions.invoke('sync-users-to-stripe', {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (response.error) {
        throw new Error(response.error.message);
      }

      const { created, existing, failed, total } = response.data;
      toast({
        title: 'Stripe sync complete',
        description: `${created} new customers created, ${existing} already existed, ${failed} failed out of ${total} users.`,
      });
    } catch (err: any) {
      toast({
        title: 'Sync failed',
        description: err.message,
        variant: 'destructive',
      });
    } finally {
      setSyncing(false);
    }
  };

  // Show loading while checking auth/admin status
  if (authLoading || adminLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      </div>
    );
  }

  // Don't render if not admin (redirect will happen via useEffect)
  if (!isAdmin) {
    return null;
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Admin Dashboard</h1>
        <div className="flex items-center gap-3">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleSyncToStripe}
            disabled={syncing}
          >
            {syncing ? (
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <CreditCard className="h-4 w-4 mr-2" />
            )}
            {syncing ? 'Syncing...' : 'Sync to Stripe'}
          </Button>
          <Badge variant="outline" className="text-xs">
            Admin Only
          </Badge>
        </div>
      </div>

      {error && (
        <Card className="border-destructive">
          <CardContent className="pt-6">
            <p className="text-destructive">{error}</p>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      ) : stats && (
        <>
          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Users</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.totalUsers}</div>
                <p className="text-xs text-muted-foreground">All registered accounts</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Today</CardTitle>
                <UserPlus className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-500">{stats.signupsToday}</div>
                <p className="text-xs text-muted-foreground">New signups today</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">This Week</CardTitle>
                <Calendar className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.signupsThisWeek}</div>
                <p className="text-xs text-muted-foreground">Signups (7 days)</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">This Month</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.signupsThisMonth}</div>
                <p className="text-xs text-muted-foreground">Signups (30 days)</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Active Today</CardTitle>
                <Activity className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-blue-500">{stats.activeToday}</div>
                <p className="text-xs text-muted-foreground">Logged in today</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Active Week</CardTitle>
                <Clock className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.activeThisWeek}</div>
                <p className="text-xs text-muted-foreground">Active (7 days)</p>
              </CardContent>
            </Card>
          </div>

          {/* Referral Tracking Section */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Create New Referral Code */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Tag className="h-5 w-5" />
                  Create Referral Code
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-3">
                  <Input
                    placeholder="Code (e.g. JOHN2024)"
                    value={newCode}
                    onChange={(e) => setNewCode(e.target.value.toUpperCase())}
                    className="uppercase"
                    maxLength={20}
                  />
                  <Input
                    placeholder="Marketer name"
                    value={newMarketerName}
                    onChange={(e) => setNewMarketerName(e.target.value)}
                  />
                  <Button onClick={handleCreateReferralCode} disabled={creatingCode}>
                    {creatingCode ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Referral Stats */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  Referral Signups
                </CardTitle>
              </CardHeader>
              <CardContent>
                {referralLoading ? (
                  <Skeleton className="h-20" />
                ) : referralStats.length === 0 ? (
                  <p className="text-muted-foreground text-sm">No referral codes created yet</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Code</TableHead>
                        <TableHead>Marketer</TableHead>
                        <TableHead className="text-right">Signups</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {referralStats.map((ref) => (
                        <TableRow key={ref.code}>
                          <TableCell className="font-mono font-medium">{ref.code}</TableCell>
                          <TableCell>{ref.marketer_name}</TableCell>
                          <TableCell className="text-right">
                            <Badge variant={ref.signup_count > 0 ? 'default' : 'secondary'}>
                              {ref.signup_count}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Recent Users Table */}
          <Card>
            <CardHeader>
              <CardTitle>Recent Signups</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Signed Up</TableHead>
                    <TableHead>Last Active</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stats.recentUsers.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell className="font-medium">{user.email}</TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="text-sm">{format(new Date(user.created_at), 'MMM d, yyyy')}</span>
                          <span className="text-xs text-muted-foreground">
                            {formatDistanceToNow(new Date(user.created_at), { addSuffix: true })}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {user.last_sign_in_at ? (
                          <span className="text-sm">
                            {formatDistanceToNow(new Date(user.last_sign_in_at), { addSuffix: true })}
                          </span>
                        ) : (
                          <span className="text-muted-foreground text-sm">Never</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {user.email_confirmed_at ? (
                          <Badge variant="default" className="bg-green-500/20 text-green-500 border-green-500/30">
                            Verified
                          </Badge>
                        ) : (
                          <Badge variant="secondary">Pending</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
