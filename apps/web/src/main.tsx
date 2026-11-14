import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';
import { PeriodProvider } from '@/app/period';
import { AuthProvider } from '@/auth/auth-provider';
import { router } from '@/app/router';
import { Toaster } from '@/components/Toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ThemeProvider } from '@/theme/theme-provider';
import './index.css';

const queryClient = new QueryClient();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <PeriodProvider>
            <TooltipProvider delayDuration={300}>
              <RouterProvider router={router} />
              <Toaster />
            </TooltipProvider>
          </PeriodProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ThemeProvider>
  </StrictMode>,
);
