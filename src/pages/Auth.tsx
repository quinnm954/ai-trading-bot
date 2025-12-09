import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { z } from 'zod';
import { Brain, Mail, Lock, Loader2, ArrowRight, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';

const authSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

const emailSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
});

const passwordSchema = z.object({
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

type AuthMode = 'login' | 'signup' | 'forgot' | 'reset';

export default function Auth() {
  const [searchParams] = useSearchParams();
  const isResetMode = searchParams.get('reset') === 'true';
  
  const [mode, setMode] = useState<AuthMode>(isResetMode ? 'reset' : 'login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  
  const navigate = useNavigate();
  const { toast } = useToast();
  const { signIn, signUp, resetPassword, updatePassword, isAuthenticated, isLoading } = useAuth();

  useEffect(() => {
    if (isAuthenticated && !isLoading && mode !== 'reset') {
      navigate('/', { replace: true });
    }
  }, [isAuthenticated, isLoading, navigate, mode]);

  // Update mode if reset param changes
  useEffect(() => {
    if (isResetMode) {
      setMode('reset');
    }
  }, [isResetMode]);

  const validateForm = () => {
    try {
      if (mode === 'forgot') {
        emailSchema.parse({ email });
      } else if (mode === 'reset') {
        passwordSchema.parse({ password });
      } else {
        authSchema.parse({ email, password });
      }
      setErrors({});
      return true;
    } catch (error) {
      if (error instanceof z.ZodError) {
        const fieldErrors: { email?: string; password?: string } = {};
        error.errors.forEach((err) => {
          if (err.path[0] === 'email') fieldErrors.email = err.message;
          if (err.path[0] === 'password') fieldErrors.password = err.message;
        });
        setErrors(fieldErrors);
      }
      return false;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) return;
    
    setIsSubmitting(true);

    try {
      if (mode === 'forgot') {
        const { error } = await resetPassword(email);
        if (error) {
          toast({
            title: 'Reset failed',
            description: error.message,
            variant: 'destructive',
          });
        } else {
          toast({
            title: 'Check your email',
            description: 'We sent you a password reset link.',
          });
          setMode('login');
        }
      } else if (mode === 'reset') {
        const { error } = await updatePassword(password);
        if (error) {
          toast({
            title: 'Update failed',
            description: error.message,
            variant: 'destructive',
          });
        } else {
          toast({
            title: 'Password updated!',
            description: 'You can now log in with your new password.',
          });
          navigate('/', { replace: true });
        }
      } else if (mode === 'login') {
        const { error } = await signIn(email, password);
        if (error) {
          if (error.message.includes('Invalid login credentials')) {
            toast({
              title: 'Login failed',
              description: 'Invalid email or password. Please try again.',
              variant: 'destructive',
            });
          } else {
            toast({
              title: 'Login failed',
              description: error.message,
              variant: 'destructive',
            });
          }
        } else {
          toast({
            title: 'Welcome back!',
            description: 'Successfully logged in.',
          });
        }
      } else {
        const { error } = await signUp(email, password);
        if (error) {
          if (error.message.includes('User already registered')) {
            toast({
              title: 'Sign up failed',
              description: 'This email is already registered. Please log in instead.',
              variant: 'destructive',
            });
          } else {
            toast({
              title: 'Sign up failed',
              description: error.message,
              variant: 'destructive',
            });
          }
        } else {
          toast({
            title: 'Account created!',
            description: 'You have been automatically logged in.',
          });
        }
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const getTitle = () => {
    switch (mode) {
      case 'forgot': return 'Reset Password';
      case 'reset': return 'Set New Password';
      case 'signup': return 'Create Account';
      default: return 'Welcome Back';
    }
  };

  const getSubtitle = () => {
    switch (mode) {
      case 'forgot': return 'Enter your email to receive a reset link';
      case 'reset': return 'Enter your new password';
      case 'signup': return 'Sign up to start trading with AI';
      default: return 'Enter your credentials to access your dashboard';
    }
  };

  const getButtonText = () => {
    if (isSubmitting) {
      switch (mode) {
        case 'forgot': return 'Sending...';
        case 'reset': return 'Updating...';
        case 'signup': return 'Creating account...';
        default: return 'Signing in...';
      }
    }
    switch (mode) {
      case 'forgot': return 'Send Reset Link';
      case 'reset': return 'Update Password';
      case 'signup': return 'Create Account';
      default: return 'Sign In';
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="p-3 rounded-xl bg-primary/20">
            <Brain className="w-8 h-8 text-primary" />
          </div>
          <span className="text-2xl font-bold text-foreground">
            Titan<span className="text-primary">AI</span>
          </span>
        </div>

        {/* Auth Card */}
        <div className="glass-panel p-8 gradient-border">
          {/* Back button for forgot/reset modes */}
          {(mode === 'forgot' || mode === 'reset') && (
            <button
              type="button"
              onClick={() => {
                setMode('login');
                setErrors({});
              }}
              className="flex items-center gap-1 text-muted-foreground hover:text-foreground mb-4 text-sm"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to login
            </button>
          )}

          <h1 className="text-2xl font-bold text-foreground text-center mb-2">
            {getTitle()}
          </h1>
          <p className="text-muted-foreground text-center mb-6">
            {getSubtitle()}
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email field - shown for login, signup, forgot */}
            {mode !== 'reset' && (
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-10"
                    disabled={isSubmitting}
                  />
                </div>
                {errors.email && (
                  <p className="text-sm text-loss">{errors.email}</p>
                )}
              </div>
            )}

            {/* Password field - shown for login, signup, reset */}
            {mode !== 'forgot' && (
              <div className="space-y-2">
                <Label htmlFor="password">
                  {mode === 'reset' ? 'New Password' : 'Password'}
                </Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-10"
                    disabled={isSubmitting}
                  />
                </div>
                {errors.password && (
                  <p className="text-sm text-loss">{errors.password}</p>
                )}
              </div>
            )}

            {/* Forgot password link - only on login */}
            {mode === 'login' && (
              <div className="text-right">
                <button
                  type="button"
                  onClick={() => {
                    setMode('forgot');
                    setErrors({});
                  }}
                  className="text-sm text-primary hover:underline"
                >
                  Forgot password?
                </button>
              </div>
            )}

            <Button
              type="submit"
              variant="glow"
              className="w-full gap-2"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {getButtonText()}
                </>
              ) : (
                <>
                  {getButtonText()}
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </Button>
          </form>

          {/* Toggle between login/signup */}
          {(mode === 'login' || mode === 'signup') && (
            <div className="mt-6 text-center">
              <p className="text-muted-foreground">
                {mode === 'login' ? "Don't have an account?" : 'Already have an account?'}
                <button
                  type="button"
                  onClick={() => {
                    setMode(mode === 'login' ? 'signup' : 'login');
                    setErrors({});
                  }}
                  className="ml-2 text-primary hover:underline font-medium"
                  disabled={isSubmitting}
                >
                  {mode === 'login' ? 'Sign up' : 'Sign in'}
                </button>
              </p>
            </div>
          )}
        </div>

        {/* Pricing Link */}
        <div className="mt-8 text-center">
          <Link 
            to="/pricing" 
            className="text-sm text-muted-foreground hover:text-primary transition-colors"
          >
            View pricing plans →
          </Link>
        </div>
      </div>
    </div>
  );
}
