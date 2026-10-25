import { lazy, Suspense, type ReactNode } from 'react'
import { Route, Routes } from 'react-router-dom'
import { AppShell } from '@/components/layout/AppShell'
import { FullPageSpinner, RequireAdmin, RequireAuth } from '@/components/RouteGuards'
import { LandingPage } from '@/pages/Landing'
import { LoginPage } from '@/pages/Login'
import { NotFoundPage } from '@/pages/NotFound'
import { ForgotPasswordPage, ResetPasswordPage } from '@/pages/PasswordReset'
import { RegisterPage } from '@/pages/Register'

// Authenticated screens (and Recharts) load on demand, keeping the public bundle small.
const DashboardPage = lazy(() => import('@/pages/Dashboard').then((m) => ({ default: m.DashboardPage })))
const LabPage = lazy(() => import('@/pages/Lab').then((m) => ({ default: m.LabPage })))
const SettingsPage = lazy(() => import('@/pages/Settings').then((m) => ({ default: m.SettingsPage })))
const UsersPage = lazy(() => import('@/pages/admin/Users').then((m) => ({ default: m.UsersPage })))
const MonitoringPage = lazy(() => import('@/pages/admin/Monitoring').then((m) => ({ default: m.MonitoringPage })))

const page = (node: ReactNode) => <Suspense fallback={<FullPageSpinner />}>{node}</Suspense>

export function AppRoutes() {
  return (
    <Routes>
      <Route index element={<LandingPage />} />
      <Route path="login" element={<LoginPage />} />
      <Route path="register" element={<RegisterPage />} />
      <Route path="forgot-password" element={<ForgotPasswordPage />} />
      <Route path="reset-password" element={<ResetPasswordPage />} />
      <Route
        element={
          <RequireAuth>
            <AppShell />
          </RequireAuth>
        }
      >
        <Route path="dashboard" element={page(<DashboardPage />)} />
        <Route path="lab" element={page(<LabPage />)} />
        <Route path="settings" element={page(<SettingsPage />)} />
        <Route path="admin/users" element={<RequireAdmin>{page(<UsersPage />)}</RequireAdmin>} />
        <Route path="admin/monitoring" element={<RequireAdmin>{page(<MonitoringPage />)}</RequireAdmin>} />
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}
