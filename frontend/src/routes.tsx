import { lazy, Suspense, type ReactNode } from 'react'
import { Route, Routes } from 'react-router-dom'
import { AppShell } from '@/components/layout/AppShell'
import { FullPageSpinner, RequireAdmin, RequireAuth } from '@/components/RouteGuards'
import { LandingPage } from '@/pages/Landing'
import { NotFoundPage } from '@/pages/NotFound'

// Everything except the landing page loads on demand, keeping the first download small.
const LoginPage = lazy(() => import('@/pages/Login').then((m) => ({ default: m.LoginPage })))
const RegisterPage = lazy(() => import('@/pages/Register').then((m) => ({ default: m.RegisterPage })))
const ForgotPasswordPage = lazy(() => import('@/pages/PasswordReset').then((m) => ({ default: m.ForgotPasswordPage })))
const ResetPasswordPage = lazy(() => import('@/pages/PasswordReset').then((m) => ({ default: m.ResetPasswordPage })))
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
      <Route path="login" element={page(<LoginPage />)} />
      <Route path="register" element={page(<RegisterPage />)} />
      <Route path="forgot-password" element={page(<ForgotPasswordPage />)} />
      <Route path="reset-password" element={page(<ResetPasswordPage />)} />
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
