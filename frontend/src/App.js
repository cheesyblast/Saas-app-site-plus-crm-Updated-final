import React, { useEffect } from "react";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { Toaster } from "sonner";
import { AuthProvider } from "@/lib/auth";
import { CartProvider } from "@/lib/cart";
import "@/App.css";

import AuthCallback from "@/pages/AuthCallback";
import Login from "@/pages/Login";
import Home from "@/pages/storefront/Home";
import Shop from "@/pages/storefront/Shop";
import ProductDetail from "@/pages/storefront/ProductDetail";
import Checkout from "@/pages/storefront/Checkout";
import OrderConfirm from "@/pages/storefront/OrderConfirm";
import Account from "@/pages/storefront/Account";
import StorefrontLayout from "@/components/storefront/StorefrontLayout";

import AdminLayout from "@/pages/admin/AdminLayout";
import AdminLogin from "@/pages/AdminLogin";
import Dashboard from "@/pages/admin/Dashboard";
import AdminProducts from "@/pages/admin/Products";
import AdminCategories from "@/pages/admin/Categories";
import AdminInventory from "@/pages/admin/Inventory";
import AdminOrders from "@/pages/admin/Orders";
import AdminCustomers from "@/pages/admin/Customers";
import AdminPOS from "@/pages/admin/POS";
import AdminStores from "@/pages/admin/Stores";
import AdminCoupons from "@/pages/admin/Coupons";
import AdminExpenses from "@/pages/admin/Expenses";
import AdminPayroll from "@/pages/admin/Payroll";
import AdminStaff from "@/pages/admin/Staff";
import AdminReports from "@/pages/admin/Reports";
import AdminMarketing from "@/pages/admin/Marketing";
import AdminNotifications from "@/pages/admin/Notifications";
import AdminBuilder from "@/pages/admin/Builder";
import Dashboard_Redirect from "@/pages/DashboardRouter";

function AppRouter() {
  const location = useLocation();
  // CRITICAL: detect session_id synchronously BEFORE routes mount
  if (location.hash?.includes("session_id=")) return <AuthCallback />;

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/admin/login" element={<AdminLogin />} />
      <Route path="/dashboard" element={<Dashboard_Redirect />} />

      <Route element={<StorefrontLayout />}>
        <Route path="/" element={<Home />} />
        <Route path="/shop" element={<Shop />} />
        <Route path="/shop/:slug" element={<ProductDetail />} />
        <Route path="/checkout" element={<Checkout />} />
        <Route path="/order/:orderNumber" element={<OrderConfirm />} />
        <Route path="/account" element={<Account />} />
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
        <Route path="/admin/expenses" element={<AdminExpenses />} />
        <Route path="/admin/payroll" element={<AdminPayroll />} />
        <Route path="/admin/staff" element={<AdminStaff />} />
        <Route path="/admin/reports" element={<AdminReports />} />
        <Route path="/admin/marketing" element={<AdminMarketing />} />
        <Route path="/admin/notifications" element={<AdminNotifications />} />
      </Route>
    </Routes>
  );
}

function App() {
  return (
    <AuthProvider>
      <CartProvider>
        <BrowserRouter>
          <Toaster theme="dark" position="top-right" richColors closeButton />
          <AppRouter />
        </BrowserRouter>
      </CartProvider>
    </AuthProvider>
  );
}

export default App;
