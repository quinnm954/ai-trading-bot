import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link, useLocation } from 'react-router-dom';
import { z } from 'zod';
import { Brain, Mail, Lock, Loader2, ArrowRight, ArrowLeft, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useRateLimiter } from '@/hooks/useRateLimiter';

// Enhanced password validation - requires complexity
const passwordValidation = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number');

// Login uses simpler validation (user may have old password)
const loginPasswordValidation = z.string().min(6, 'Password must be at least 6 characters');

const emailValidation = z
  .string()
  .trim()
  .email('Please enter a valid email address')
  .max(255, 'Email must be less than 255 characters');

const authSchema = z.object({
  email: emailValidation,
  password: passwordValidation,
});

const loginSchema = z.object({
  email: emailValidation,
  password: loginPasswordValidation,
});

const emailSchema = z.object({
  email: emailValidation,
});

const passwordSchema = z.object({
  password: passwordValidation,
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
  const location = useLocation();
  const { toast } = useToast();
  const { signIn, signUp, resetPassword, updatePassword, isAuthenticated, isLoading } = useAuth();
  const { isLocked, getLockoutRemaining, getAttemptsRemaining, recordFailedAttempt, resetAttempts } = useRateLimiter();

  const redirectTo = (location.state as { from?: string } | null)?.from;

  useEffect(() => {
    if (isAuthenticated && !isLoading && mode !== 'reset') {
      navigate(redirectTo || '/dashboard', { replace: true });
    }
  }, [isAuthenticated, isLoading, navigate, mode, redirectTo]);

  // Update mode if reset param changes
  useEffect(() => {
    if (isResetMode) {
      setMode('reset');
    }
  }, [isResetMode]);

  const validateForm = () => {
    try {
      if (mode === 'forgot') {
        emailSchema.parse({ email: email.trim() });
      } else if (mode === 'reset') {
        passwordSchema.parse({ password });
      } else if (mode === 'login') {
        // Use simpler validation for login (user may have old password)
        loginSchema.parse({ email: email.trim(), password });
      } else {
        // Signup requires strong password
        authSchema.parse({ email: email.trim(), password });
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
    
    // Check rate limiting for login attempts
    if (mode === 'login' && isLocked()) {
      const remaining = getLockoutRemaining();
      toast({
        title: 'Too many attempts',
        description: `Account temporarily locked. Try again in ${remaining} minute${remaining !== 1 ? 's' : ''}.`,
        variant: 'destructive',
      });
      return;
    }
    
    if (!validateForm()) return;
    
    setIsSubmitting(true);

    try {
      if (mode === 'forgot') {
        const { error } = await resetPassword(email.trim());
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
          navigate('/dashboard', { replace: true });
        }
      } else if (mode === 'login') {
        const { error } = await signIn(email.trim(), password);
        if (error) {
          // Record failed attempt for rate limiting
          const nowLocked = recordFailedAttempt();
          const attemptsLeft = getAttemptsRemaining();
          
          if (nowLocked) {
            toast({
              title: 'Account locked',
              description: 'Too many failed attempts. Please try again in 15 minutes.',
              variant: 'destructive',
            });
          } else if (error.message.includes('Invalid login credentials')) {
            toast({
              title: 'Login failed',
              description: `Invalid email or password. ${attemptsLeft} attempt${attemptsLeft !== 1 ? 's' : ''} remaining.`,
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
          // Reset rate limiter on successful login
          resetAttempts();
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

          {/* Lockout warning */}
          {mode === 'login' && isLocked() && (
            <div className="mb-4 p-3 rounded-lg bg-loss/10 border border-loss/20 flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-loss flex-shrink-0" />
              <p className="text-sm text-loss">
                Too many failed attempts. Try again in {getLockoutRemaining()} minute{getLockoutRemaining() !== 1 ? 's' : ''}.
              </p>
            </div>
          )}

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
