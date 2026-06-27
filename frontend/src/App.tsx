import { Switch, Route } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "@/context/auth-context";

import Landing from "@/pages/landing";
import Login from "@/pages/login";
import Onboarding from "@/pages/onboarding";
import Dashboard from "@/pages/dashboard";
import Subjects from "@/pages/subjects";
import SubjectDetail from "@/pages/subject-detail";
import SubjectAi from "@/pages/subject-ai";
import Papers from "@/pages/papers";
import Notes from "@/pages/notes";
import Questions from "@/pages/questions";
import AiTutor from "@/pages/ai-tutor";
import Progress from "@/pages/progress";
import Admin from "@/pages/admin";
import PaperViewer from "@/pages/paper-viewer";
import PaperAnalytics from "@/pages/paper-analytics";
import PaperTesting from "@/pages/paper-testing";
import AiAssistantTesting from "@/pages/ai-assistant-testing";
import AdminResources from "@/pages/admin-resources";
import AdminProcessing from "@/pages/admin-processing";
import TopicMapManager from "@/pages/topic-map-manager";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000,
      retry: 1,
    },
  },
});

function Router() {
  return (
    <Switch>
      <Route path="/" component={Landing} />
      <Route path="/login" component={Login} />
      <Route path="/onboarding" component={Onboarding} />
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/subjects" component={Subjects} />
      <Route path="/subject/:id/ai" component={SubjectAi} />
      <Route path="/subject/:id" component={SubjectDetail} />
      <Route path="/papers" component={Papers} />
      <Route path="/papers/:id/view" component={PaperViewer} />
      <Route path="/analytics/papers" component={PaperAnalytics} />
      <Route path="/notes" component={Notes} />
      <Route path="/questions" component={Questions} />
      <Route path="/ai" component={AiTutor} />
      <Route path="/progress" component={Progress} />
      <Route path="/admin" component={Admin} />
      <Route path="/admin/testing" component={PaperTesting} />
      <Route path="/admin/ai-testing" component={AiAssistantTesting} />
      <Route path="/admin/resources" component={AdminResources} />
      <Route path="/admin/processing" component={AdminProcessing} />
      <Route path="/admin/topic-maps" component={TopicMapManager} />
      <Route component={NotFound} />
    </Switch>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Router />
      </AuthProvider>
    </QueryClientProvider>
  );
}
