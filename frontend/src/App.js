import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { Toaster } from "@/components/ui/sonner";
import Layout from "@/components/Layout";
import LoginPage from "@/pages/LoginPage";
import DashboardPage from "@/pages/DashboardPage";
import CustomersPage from "@/pages/CustomersPage";
import CustomerProfilePage from "@/pages/CustomerProfilePage";
import PaymentTrackerPage from "@/pages/PaymentTrackerPage";
import WhatsAppPage from "@/pages/WhatsAppPage";
import BrandSettingsPage from "@/pages/BrandSettingsPage";
import ReportsPage from "@/pages/ReportsPage";
import LayoutsPage from "@/pages/LayoutsPage";
import LayoutDetailPage from "@/pages/LayoutDetailPage";
import CashFlowPage from "@/pages/CashFlowPage";
import UsersPage from "@/pages/UsersPage";

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FAFAFA]">
        <div className="animate-pulse text-neutral-400 text-sm tracking-widest uppercase font-medium">Loading...</div>
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function AppRoutes() {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FAFAFA]">
        <div className="animate-pulse text-neutral-400 text-sm tracking-widest uppercase font-medium">Loading...</div>
      </div>
    );
  }
  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <LoginPage />} />
      <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route index element={<DashboardPage />} />
        <Route path="layouts" element={<LayoutsPage />} />
        <Route path="layouts/:id" element={<LayoutDetailPage />} />
        <Route path="cashflow" element={<CashFlowPage />} />
        <Route path="customers" element={<CustomersPage />} />
        <Route path="customers/:id" element={<CustomerProfilePage />} />
        <Route path="payments" element={<PaymentTrackerPage />} />
        <Route path="whatsapp" element={<WhatsAppPage />} />
        <Route path="brand" element={<BrandSettingsPage />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="users" element={<UsersPage />} />
      </Route>
    </Routes>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
        <Toaster position="top-right" richColors />
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
