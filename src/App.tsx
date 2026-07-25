import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { NotificationProvider } from './context/NotificationContext';
import ProtectedRoute from './components/auth/ProtectedRoute';
import LandingPage from './pages/LandingPage';
import Welcome from './components/auth/Welcome';
import SignUp from './components/auth/SignUp';
import Login from './components/auth/Login';
import ChooseVoiceID from './components/auth/ChooseVoiceID';
import ConfirmPage from './pages/auth/ConfirmPage';
import AuthCallbackPage from './pages/auth/AuthCallbackPage';
import ForgotPasswordPage from './pages/auth/ForgotPasswordPage';
import ResetPasswordPage from './pages/auth/ResetPasswordPage';
import DashboardPage from './pages/DashboardPage';
import HomePage from './pages/HomePage';
import SearchPage from './pages/SearchPage';
import UserProfilePage from './pages/UserProfilePage';
import EditProfilePage from './pages/EditProfilePage';
import NotificationsPage from './pages/NotificationsPage';
import ConversationsPage from './pages/ConversationsPage';
import ChatPage from './pages/ChatPage';
import SettingsPage from './pages/SettingsPage';

export default function App() {
  return (
    <AuthProvider>
      <NotificationProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/auth/welcome" element={<Welcome />} />
            <Route path="/auth/signup" element={<SignUp />} />
            <Route path="/auth/login" element={<Login />} />
            <Route path="/auth/callback" element={<AuthCallbackPage />} />
            <Route path="/auth/confirm" element={<ConfirmPage />} />
            <Route path="/auth/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/auth/reset-password" element={<ResetPasswordPage />} />
            <Route path="/auth/choose-id" element={<ChooseVoiceID />} />
            <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>}>
              <Route index element={<HomePage />} />
              <Route path="search" element={<SearchPage />} />
              <Route path="profile/:id" element={<UserProfilePage />} />
              <Route path="profile/edit" element={<EditProfilePage />} />
              <Route path="messages" element={<ConversationsPage />} />
              <Route path="chat/:id" element={<ChatPage />} />
              <Route path="notifications" element={<NotificationsPage />} />
              <Route path="settings" element={<SettingsPage />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </NotificationProvider>
    </AuthProvider>
  );
}
