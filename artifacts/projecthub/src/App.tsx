import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Route, Switch, Router as WouterRouter } from 'wouter';
import { AppLayout } from '@/components/layout/AppLayout';

// Pages
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

const queryClient = new QueryClient();

function Router() {
  return (
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
        <Route component={NotFound} />
      </Switch>
    </AppLayout>
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
