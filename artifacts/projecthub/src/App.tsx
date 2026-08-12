import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Route, Switch, Router as WouterRouter, useLocation, Redirect } from 'wouter';
import { AppLayout } from '@/components/layout/AppLayout';
import { isTeamAuthenticated, isTeamAdmin, clearTeamAuth } from '@/lib/team-auth';
import { useEffect } from 'react';

// Public pages
import LoginPage from '@/pages/login';
import RegisterPage from '@/pages/register';
import ForgotPasswordPage from '@/pages/forgot-password';
import ResetPasswordPage from '@/pages/reset-password';

// Protected pages
import Dashboard from '@/pages/dashboard';
import Projects from '@/pages/projects';
import ProjectDetail from '@/pages/project-detail';
import Tasks from '@/pages/tasks';
import Team from '@/pages/team';
import AiMonitor from '@/pages/ai-monitor';
import ImpactPage from '@/pages/impact';
import AlisonFeedbackPage from '@/pages/alison-feedback';
// Team Horizon pages
import Contacts from '@/pages/contacts';
import Notifications from '@/pages/notifications';
import SystemStatus from '@/pages/system-status';
import WebhookTester from '@/pages/webhook-tester';
import OrdersPage from '@/pages/orders';
// Admin pages
import AdminUsersPage from '@/pages/admin/users';

const queryClient = new QueryClient();

/**
 * Redirects unauthenticated users to /login and handles mid-session 401 events.
 */
function AuthGuard({ children }: { children: React.ReactNode }) {
  const [location, navigate] = useLocation();

  useEffect(() => {
    function onUnauthorized() {
      clearTeamAuth();
      const next = encodeURIComponent(location);
      navigate(`/login?next=${next}`, { replace: true });
    }
    window.addEventListener('projecthub:unauthorized', onUnauthorized);
    return () => window.removeEventListener('projecthub:unauthorized', onUnauthorized);
  }, [location, navigate]);

  if (!isTeamAuthenticated()) {
    const next = encodeURIComponent(location);
    return <Redirect to={`/login?next=${next}`} />;
  }

  return <>{children}</>;
}

/**
 * Requires admin role in addition to authentication.
 */
function AdminGuard({ children }: { children: React.ReactNode }) {
  if (!isTeamAdmin()) {
    return <Redirect to="/" />;
  }
  return <>{children}</>;
}

function Router() {
  return (
    <Switch>
      {/* Public routes — outside auth guard and layout */}
      <Route path="/login" component={LoginPage} />
      <Route path="/register" component={RegisterPage} />
      <Route path="/forgot-password" component={ForgotPasswordPage} />
      <Route path="/reset-password" component={ResetPasswordPage} />

      {/* All other routes require authentication */}
      <Route>
        <AuthGuard>
          <AppLayout>
            <Switch>
              <Route path="/" component={Dashboard} />
              <Route path="/projects" component={Projects} />
              <Route path="/projects/:id" component={ProjectDetail} />
              <Route path="/tasks" component={Tasks} />
              <Route path="/team" component={Team} />
              <Route path="/ai-monitor" component={AiMonitor} />
              <Route path="/impact" component={ImpactPage} />
              <Route path="/alison-feedback" component={AlisonFeedbackPage} />
              {/* Team Horizon */}
              <Route path="/contacts" component={Contacts} />
              <Route path="/notifications" component={Notifications} />
              <Route path="/system" component={SystemStatus} />
              <Route path="/webhook" component={WebhookTester} />
              <Route path="/orders" component={OrdersPage} />
              {/* Admin-only */}
              <Route path="/admin/users">
                <AdminGuard><AdminUsersPage /></AdminGuard>
              </Route>
              <Route component={NotFound} />
            </Switch>
          </AppLayout>
        </AuthGuard>
      </Route>
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
