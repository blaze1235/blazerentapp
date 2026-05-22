import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './store/auth'
import Layout from './components/layout/Layout'
import Auth from './pages/Auth'
import Home from './pages/Home'
import Rent from './pages/Rent'
import Sessions from './pages/Sessions'
import Wallet from './pages/Wallet'
import Profile from './pages/Profile'
import AdminDashboard from './pages/admin/Dashboard'
import AdminClients from './pages/admin/Clients'
import AdminFinance from './pages/admin/Finance'
import AdminStats from './pages/admin/Stats'
import AdminOperations from './pages/admin/Operations'
import AdminInventory from './pages/admin/Inventory'

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { token } = useAuthStore()
  if (!token) return <Navigate to="/auth" replace />
  return <>{children}</>
}

function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { token, isAdmin } = useAuthStore()
  if (!token) return <Navigate to="/auth" replace />
  if (!isAdmin) return <Navigate to="/app/home" replace />
  return <>{children}</>
}

function RootRedirect() {
  const { token, isAdmin } = useAuthStore()
  if (!token) return <Navigate to="/auth" replace />
  if (isAdmin) return <Navigate to="/app/admin/dashboard" replace />
  return <Navigate to="/app/home" replace />
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<RootRedirect />} />
        <Route path="/auth" element={<Auth />} />

        <Route
          path="/app"
          element={
            <RequireAuth>
              <Layout />
            </RequireAuth>
          }
        >
          {/* Client routes */}
          <Route index element={<Navigate to="home" replace />} />
          <Route path="home" element={<Home />} />
          <Route path="rent" element={<Rent />} />
          <Route path="sessions" element={<Sessions />} />
          <Route path="wallet" element={<Wallet />} />
          <Route path="profile" element={<Profile />} />

          {/* Admin routes */}
          <Route path="admin/dashboard" element={<RequireAdmin><AdminDashboard /></RequireAdmin>} />
          <Route path="admin/clients" element={<RequireAdmin><AdminClients /></RequireAdmin>} />
          <Route path="admin/finance" element={<RequireAdmin><AdminFinance /></RequireAdmin>} />
          <Route path="admin/stats" element={<RequireAdmin><AdminStats /></RequireAdmin>} />
          <Route path="admin/operations" element={<RequireAdmin><AdminOperations /></RequireAdmin>} />
          <Route path="admin/inventory" element={<RequireAdmin><AdminInventory /></RequireAdmin>} />
        </Route>

        {/* Catch-all */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
