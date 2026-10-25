import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { Toaster } from 'sonner'
import { ApiError } from '@/lib/api'
import { AuthProvider } from '@/lib/auth'
import { AppRoutes } from './routes'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      refetchOnWindowFocus: false,
      // Never retry auth/permission/validation failures.
      retry: (count, error) => !(error instanceof ApiError && error.status >= 400 && error.status < 500) && count < 2,
    },
  },
})

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/*" element={<AppRoutes />} />
          </Routes>
          <Toaster
            theme="system"
            position="bottom-right"
            toastOptions={{
              classNames: {
                toast: '!rounded-none !border !border-border-strong !bg-surface !text-fg !font-sans',
                description: '!text-muted',
              },
            }}
          />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
