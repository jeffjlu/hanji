import { Route, Routes } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import HomePage from '@/pages/Home';
import LoginPage from '@/pages/Login';
import RegisterPage from '@/pages/Register';
import AppPage from '@/pages/App';
import NotFoundPage from '@/pages/NotFound';

const queryClient = new QueryClient();
export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/app" element={<AppPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </QueryClientProvider>
  );
}
