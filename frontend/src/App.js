import React, { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, useLocation, Navigate } from "react-router-dom";
import { Toaster } from "sonner";
import { AuthProvider, useAuth } from "@/lib/auth";
import { CartProvider } from "@/lib/cart";
import { CompanyProvider, useCompany } from "@/lib/company";
import api from "@/lib/api";
import "@/App.css";

import AuthCallback from "@/pages/AuthCallback";
import Login from "@/pages/Login";
import AdminLogin from "@/pages/AdminLogin";
import Register from "@/pages/Register";
import Setup from "@/pages/Setup";
import Home from "@/pages/storefront/Home";
import Shop from "@/pages/storefront/Shop";
import ProductDetail from "@/pages/storefront/ProductDetail";
import Checkout from "@/pages/storefront/Checkout";
import OrderConfirm from "@/pages/storefront/OrderConfirm";
import Account from "@/pages/storefront/Account";
import StaticPage from "@/pages/storefront/StaticPage";
import StorefrontLayout from "@/components/storefront/StorefrontLayout";

import AdminLayout from "@/pages/admin/AdminLayout";
import Dashboard from "@/pages/admin/Dashboard";
import AdminProducts from "@/pages/admin/Products";
import AdminCategories from "@/pages/admin/Categories";
import AdminInventory from "@/pages/admin/Inventory";
import AdminOrders from "@/pages/admin/Orders";
import AdminCustomers from "@/pages/admin/Customers";
import AdminPOS from "@/pages/admin/POS";
import AdminStores from "@/pages/admin/Stores";
import AdminCoupons from "@/pages/admin/CouponsAndDiscounts";
import AdminExpenses from "@/pages/admin/Expenses";
import AdminPayroll from "@/pages/admin/Payroll";
import AdminStaff from "@/pages/admin/Staff";
import AdminReports from "@/pages/admin/Reports";
import AdminMarketing from "@/pages/admin/Marketing";
import AdminNotifications from "@/pages/admin/Notifications";
import AdminBuilder from "@/pages/admin/Builder";
import AdminSettings from "@/pages/admin/Settings";
import AdminSuppliers from "@/pages/admin/Suppliers";
import AdminIncExp from "@/pages/admin/IncomeExpense";
import AdminCashAccounts from "@/pages/admin/CashAccounts";
import AdminCsvImport from "@/pages/admin/CsvImport";
import AdminPaymentsShipping from "@/pages/admin/PaymentsShipping";
import Receipt from "@/pages/storefront/Receipt";
import Dashboard_Redirect from "@/pages/DashboardRouter";

function SetupGate() {
  const [status, setStatus] = useState(null);
  const location = useLocation();
  useEffect(() => {
    api.get("/setup/status").then(({ data }) => setStatus(data)).catch(() => setStatus({ setup_complete: true }));
  }, []);
  if (status === null) return null;
  if (!status.setup_complete && location.pathname !== "/setup") {
    return <Navigate to="/setup" replace />;
  }
  if (status.setup_complete && location.pathname === "/setup") {
    return <Navigate to="/" replace />;
  }
  return null;
}

function AppRouter() {
  const location = useLocation();
  if (location.hash?.includes("session_id=")) return <AuthCallback />;

  return (
    <>
      <SetupGate />
      <Routes>
        <Route path="/setup" element={<Setup />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/admin/login" element={<AdminLogin />} />
        <Route path="/dashboard" element={<Dashboard_Redirect />} />
        <Route path="/receipt/:orderNumber" element={<Receipt />} />

        <Route element={<StorefrontLayout />}>
          <Route path="/" element={<Home />} />
          <Route path="/shop" element={<Shop />} />
          <Route path="/shop/:slug" element={<ProductDetail />} />
          <Route path="/checkout" element={<Checkout />} />
          <Route path="/order/:orderNumber" element={<OrderConfirm />} />
          <Route path="/account" element={<Account />} />
          <Route path="/page/:slug" element={<StaticPage />} />
        </Route>

        <Route element={<AdminLayout />}>
          <Route path="/admin" element={<Dashboard />} />
          <Route path="/admin/builder" element={<AdminBuilder />} />
          <Route path="/admin/products" element={<AdminProducts />} />
          <Route path="/admin/categories" element={<AdminCategories />} />
          <Route path="/admin/inventory" element={<AdminInventory />} />
          <Route path="/admin/orders" element={<AdminOrders />} />
          <Route path="/admin/customers" element={<AdminCustomers />} />
          <Route path="/admin/pos" element={<AdminPOS />} />
          <Route path="/admin/stores" element={<AdminStores />} />
          <Route path="/admin/coupons" element={<AdminCoupons />} />
          <Route path="/admin/expenses" element={<AdminIncExp />} />
          <Route path="/admin/suppliers" element={<AdminSuppliers />} />
          <Route path="/admin/cash-accounts" element={<AdminCashAccounts />} />
          <Route path="/admin/import" element={<AdminCsvImport />} />
          <Route path="/admin/payments-shipping" element={<AdminPaymentsShipping />} />
          <Route path="/admin/payroll" element={<AdminPayroll />} />
          <Route path="/admin/staff" element={<AdminStaff />} />
          <Route path="/admin/reports" element={<AdminReports />} />
          <Route path="/admin/marketing" element={<AdminMarketing />} />
          <Route path="/admin/notifications" element={<AdminNotifications />} />
          <Route path="/admin/settings" element={<AdminSettings />} />
        </Route>
      </Routes>
    </>
  );
}

function App() {
  return (
    <CompanyProvider>
      <AuthProvider>
        <CartProvider>
          <BrowserRouter>
            <Toaster theme="dark" position="top-right" richColors closeButton />
            <AppRouter />
          </BrowserRouter>
        </CartProvider>
      </AuthProvider>
    </CompanyProvider>
  );
}

export default App;
