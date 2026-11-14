import { Link, Route, Routes } from 'react-router-dom'

import { Layout } from '@/components/Layout'
import { ToastProvider } from '@/components/Toast'
import { Button, EmptyState } from '@/components/ui'
import AdminBlocks from '@/features/admin/AdminBlocks'
import AdminCatalog from '@/features/admin/AdminCatalog'
import AdminSettings from '@/features/admin/AdminSettings'
import AdminLayout from '@/features/admin/AdminLayout'
import AdminOrders from '@/features/admin/AdminOrders'
import AdminOverview from '@/features/admin/AdminOverview'
import AdminRequests from '@/features/admin/AdminRequests'
import AdminTickets from '@/features/admin/AdminTickets'
import AdminUsers from '@/features/admin/AdminUsers'
import OrdersPage from '@/features/account/OrdersPage'
import SupportPage from '@/features/account/SupportPage'
import ReceiptPage from '@/features/account/ReceiptPage'
import WalletPage from '@/features/account/WalletPage'
import { AuthProvider } from '@/features/auth/AuthContext'
import SignInPage from '@/features/auth/SignInPage'
import SignUpPage from '@/features/auth/SignUpPage'
import VerifyPage from '@/features/auth/VerifyPage'
import CartPage from '@/features/cart/CartPage'
import { CartProvider } from '@/features/cart/CartContext'
import CheckoutPage from '@/features/checkout/CheckoutPage'
import { MarketProvider } from '@/features/market/MarketContext'
import HomePage from '@/features/home/HomePage'
import MerchantLayout from '@/features/merchant/MerchantLayout'
import MerchantOffers from '@/features/merchant/MerchantOffers'
import MerchantOverview from '@/features/merchant/MerchantOverview'
import MerchantRequests from '@/features/merchant/MerchantRequests'
import ProductPage from '@/features/product/ProductPage'
import StorePage from '@/features/store/StorePage'

export default function App() {
  return (
    <MarketProvider>
      <AuthProvider>
      <ToastProvider>
        <CartProvider>
          <Routes>
            {/* Receipt lives outside Layout: printing should not include the site chrome. */}
            <Route path="/account/orders/:id/receipt" element={<ReceiptPage />} />
            <Route element={<Layout />}>
              <Route index element={<HomePage />} />
              <Route path="store" element={<StorePage />} />
              <Route path="products/:slug" element={<ProductPage />} />
              <Route path="cart" element={<CartPage />} />
              <Route path="checkout" element={<CheckoutPage />} />
              <Route path="sign-in" element={<SignInPage />} />
              <Route path="sign-up" element={<SignUpPage />} />
              <Route path="verify" element={<VerifyPage />} />
              <Route path="account/orders" element={<OrdersPage />} />
              <Route path="account/support" element={<SupportPage />} />
              <Route path="account/wallet" element={<WalletPage />} />

              <Route path="merchant" element={<MerchantLayout />}>
                <Route index element={<MerchantOverview />} />
                <Route path="offers" element={<MerchantOffers />} />
                <Route path="requests" element={<MerchantRequests />} />
              </Route>

              <Route path="admin" element={<AdminLayout />}>
                <Route index element={<AdminOverview />} />
                <Route path="users" element={<AdminUsers />} />
                <Route path="requests" element={<AdminRequests />} />
                <Route path="orders" element={<AdminOrders />} />
                <Route path="tickets" element={<AdminTickets />} />
                <Route path="catalog" element={<AdminCatalog />} />
                <Route path="blocks" element={<AdminBlocks />} />
                <Route path="settings" element={<AdminSettings />} />
              </Route>

              <Route
                path="*"
                element={
                  <div className="container-page py-16">
                    <EmptyState
                      title="Page not found"
                      description="That link does not exist in this store."
                      action={<Link to="/store"><Button>Browse the store</Button></Link>}
                    />
                  </div>
                }
              />
            </Route>
          </Routes>
        </CartProvider>
      </ToastProvider>
      </AuthProvider>
    </MarketProvider>
  )
}
