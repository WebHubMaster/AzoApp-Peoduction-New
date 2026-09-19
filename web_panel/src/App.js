import CityPage from "@/pages/customer/CityPage";
import "@/App.css";
import { Suspense, lazy } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "sonner";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { ThemeProvider } from "@/context/ThemeContext";
import { SiteConfigProvider } from "@/context/SiteConfigContext";
import { CartProvider } from "@/context/CartContext";
import MaintenanceBanner from "@/components/MaintenanceBanner";
import { RealtimeProvider } from "@/context/RealtimeContext";
import PushRegistrar, { PushNudge } from "@/components/PushRegistrar";
import InstallPrompt from "@/components/pwa/InstallPrompt";
import MerchantRefCatcher from "@/components/MerchantRefCatcher";
import CustomJobFAB from "@/components/customer/CustomJobFAB";
// Landing stays eager — it is the primary public entry (fast first paint, no flash).
import Landing from "@/pages/customer/Landing";
import PosterDevTest from "@/pages/PosterDevTest";

// Everything else is code-split so each visitor only downloads the panel/page
// they actually open (customer, partner, merchant and admin panels ship as
// separate chunks — heavy libs like antd/recharts/jspdf load on demand only).
const Services = lazy(() => import("@/pages/customer/Services"));
const ServiceDetail = lazy(() => import("@/pages/customer/ServiceDetail"));
const Checkout = lazy(() => import("@/pages/customer/Checkout"));
const PaymentReturn = lazy(() => import("@/pages/customer/PaymentReturn"));
const StaticPage = lazy(() => import("@/pages/customer/StaticPage"));
const Membership = lazy(() => import("@/pages/customer/Membership"));
const Blog = lazy(() => import("@/pages/customer/Blog"));
const BlogDetail = lazy(() => import("@/pages/customer/BlogDetail"));
const CustomerDashboard = lazy(() => import("@/pages/customer/CustomerDashboard"));
const Login = lazy(() => import("@/pages/auth/Login"));
const PartnerDashboard = lazy(() => import("@/pages/partner/PartnerRoot"));
const MerchantDashboard = lazy(() => import("@/pages/merchant/MerchantRoot"));
const AdminDashboard = lazy(() => import("@/pages/admin/AdminDashboard"));
const UserDetail = lazy(() => import("@/pages/admin/UserDetail"));
const AgentQR = lazy(() => import("@/pages/agent/AgentQR"));

const RouteFallback = () => (
  <div className="min-h-screen flex items-center justify-center text-slate-400" data-testid="route-loading">
    <div className="h-8 w-8 rounded-full border-2 border-slate-300 border-t-[#0D47A1] animate-spin" />
  </div>
);

const Protected = ({ role, children }) => {
  const { user, loading } = useAuth();
  if (loading) return <RouteFallback />;
  if (!user) return <Navigate to="/login" replace />;
  if (role && user.role !== role) return <Navigate to="/login" replace />;
  return children;
};

function App() {
  return (
    <div className="App">
      <AuthProvider>
        <ThemeProvider>
        <RealtimeProvider>
        <SiteConfigProvider>
        <CartProvider>
        <BrowserRouter>
          <MaintenanceBanner />
          <MerchantRefCatcher />
          <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/services" element={<Services />} />
            <Route path="/city/:slug" element={<CityPage />} />
            <Route path="/service/:id" element={<ServiceDetail />} />
            <Route path="/category/:slug" element={<Services />} />
            <Route path="/book" element={<Checkout />} />
            <Route path="/payment/return" element={<PaymentReturn />} />
            <Route path="/membership" element={<Membership />} />
            <Route path="/blog" element={<Blog />} />
            <Route path="/blog/:slug" element={<BlogDetail />} />
            <Route path="/about" element={<StaticPage pageKey="about" />} />
            <Route path="/contact" element={<StaticPage pageKey="contact" />} />
            <Route path="/privacy" element={<StaticPage pageKey="privacy" />} />
            <Route path="/terms" element={<StaticPage pageKey="terms" />} />
            <Route path="/refund" element={<StaticPage pageKey="refund" />} />
            <Route path="/login" element={<Login />} />
            <Route path="/__poster_dev" element={<PosterDevTest />} />
            <Route path="/account" element={<Protected role="customer"><CustomerDashboard /></Protected>} />
            <Route path="/partner" element={<Protected role="partner"><PartnerDashboard /></Protected>} />
            <Route path="/merchant" element={<Protected role="merchant"><MerchantDashboard /></Protected>} />
            <Route path="/admin" element={<Protected role="admin"><AdminDashboard /></Protected>} />
            <Route path="/agent" element={<Protected role="agent"><AgentQR /></Protected>} />
            <Route path="/admin/user/:id" element={<Protected role="admin"><UserDetail /></Protected>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          </Suspense>
          <CustomJobFAB />
        </BrowserRouter>
        </CartProvider>
        </SiteConfigProvider>
        <PushRegistrar />
        <PushNudge />
        <InstallPrompt />
        <Toaster position="top-center" richColors />
        </RealtimeProvider>
        </ThemeProvider>
      </AuthProvider>
    </div>
  );
}

export default App;
