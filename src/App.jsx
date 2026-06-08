import { Toaster } from "@/components/ui/toaster"
import { ThemeProvider } from "@/lib/ThemeContext"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import { AnimatePresence } from "framer-motion";
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import SubmitExpense from './pages/SubmitExpense';
import MyExpenses from './pages/MyExpenses';
import AllExpenses from './pages/AllExpenses';
import Reimbursements from './pages/Reimbursements';
import ClientReport from './pages/ClientReport';
import MileageLog from './pages/MileageLog';
import Accounts from './pages/Accounts';
import AdminRoute from './components/AdminRoute';
import HomeRedirect from './pages/HomeRedirect';
import ReceiptInbox from './pages/ReceiptInbox';
import Help from './pages/Help';

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();

  // Show loading spinner while checking app public settings or auth
  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  // Handle authentication errors
  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      // Redirect to login automatically
      navigateToLogin();
      return null;
    }
  }

  // Render the main app
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<HomeRedirect />} />
        <Route path="/dashboard" element={<AdminRoute><Dashboard /></AdminRoute>} />
        <Route path="/submit-expense" element={<SubmitExpense />} />
        <Route path="/my-expenses" element={<MyExpenses />} />
        <Route path="/all-expenses" element={<AdminRoute><AllExpenses /></AdminRoute>} />
        <Route path="/reimbursements" element={<AdminRoute><Reimbursements /></AdminRoute>} />
        <Route path="/client-report" element={<AdminRoute><ClientReport /></AdminRoute>} />
        <Route path="/receipt-inbox" element={<ReceiptInbox />} />
        <Route path="/mileage-log" element={<MileageLog />} />
        <Route path="/accounts" element={<AdminRoute><Accounts /></AdminRoute>} />
        <Route path="/help" element={<Help />} />
        <Route path="*" element={<PageNotFound />} />
      </Route>
    </Routes>
  );
};


function App() {

  return (
    <ThemeProvider>
      <AuthProvider>
        <QueryClientProvider client={queryClientInstance}>
          <Router>
            <AuthenticatedApp />
          </Router>
          <Toaster />
        </QueryClientProvider>
      </AuthProvider>
    </ThemeProvider>
  )
}

export default App