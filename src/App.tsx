import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { VoiceCallProvider } from './context/VoiceCallContext';
import { PresenceProvider } from './context/PresenceContext';
import { NotificationProvider } from './context/NotificationContext';
import ProtectedRoute from './components/auth/ProtectedRoute';
import PageLoader from './components/common/PageLoader';

// Every route is code-split into its own chunk. This is purely a loading
// strategy change: component behavior, props, and logic are untouched.
// Landing/marketing pages
const LandingPage = lazy(() => import('./pages/LandingPage'));
const Careers = lazy(() => import('./pages/Careers'));
const Blog = lazy(() => import('./pages/Blog'));
const PrivacyPolicy = lazy(() => import('./pages/PrivacyPolicy'));
const TermsOfService = lazy(() => import('./pages/TermsOfService'));
const ContactPage = lazy(() => import('./pages/ContactPage'));

// Auth flow
const Welcome = lazy(() => import('./components/auth/Welcome'));
const SignUp = lazy(() => import('./components/auth/SignUp'));
const Login = lazy(() => import('./components/auth/Login'));
const AuthCallbackPage = lazy(() => import('./pages/auth/AuthCallbackPage'));
const ConfirmPage = lazy(() => import('./pages/auth/ConfirmPage'));
const ForgotPasswordPage = lazy(() => import('./pages/auth/ForgotPasswordPage'));
const ResetPasswordPage = lazy(() => import('./pages/auth/ResetPasswordPage'));
const ChooseVoiceID = lazy(() => import('./components/auth/ChooseVoiceID'));

// App / dashboard
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const HomePage = lazy(() => import('./pages/HomePage'));
const SearchPage = lazy(() => import('./pages/SearchPage'));
const UserProfilePage = lazy(() => import('./pages/UserProfilePage'));
const EditProfilePage = lazy(() => import('./pages/EditProfilePage'));
const NotificationsPage = lazy(() => import('./pages/NotificationsPage'));
const ConversationsPage = lazy(() => import('./pages/ConversationsPage'));
const ChatPage = lazy(() => import('./pages/ChatPage'));
const CallHistoryPage = lazy(() => import('./pages/CallHistoryPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));

export default function App() {
  return (
    <AuthProvider>
      <PresenceProvider>
        <VoiceCallProvider>
          <NotificationProvider>
            <BrowserRouter>
              <Suspense fallback={<PageLoader />}>
                <Routes>
                  <Route path="/" element={<LandingPage />} />
                  <Route path="/careers" element={<Careers />} />
                  <Route path="/blog" element={<Blog />} />
                  <Route path="/privacy-policy" element={<PrivacyPolicy />} />
                  <Route path="/terms-of-service" element={<TermsOfService />} />
                  <Route path="/contact" element={<ContactPage />} />
                  <Route path="/auth/welcome" element={<Welcome />} />
                  <Route path="/auth/signup" element={<SignUp />} />
                  <Route path="/auth/login" element={<Login />} />
                  <Route path="/auth/callback" element={<AuthCallbackPage />} />
                  <Route path="/auth/confirm" element={<ConfirmPage />} />
                  <Route path="/auth/forgot-password" element={<ForgotPasswordPage />} />
                  <Route path="/auth/reset-password" element={<ResetPasswordPage />} />
                  <Route path="/auth/choose-id" element={<ChooseVoiceID />} />
                  <Route path="/profile/:id" element={<UserProfilePage />} />
                  <Route path="/u/:username" element={<UserProfilePage />} />
                  <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>}>
                    <Route index element={<HomePage />} />
                    <Route path="search" element={<SearchPage />} />
                    <Route path="profile/:id" element={<UserProfilePage />} />
                    <Route path="profile/edit" element={<EditProfilePage />} />
                    <Route path="messages" element={<ConversationsPage />} />
                    <Route path="chat/:id" element={<ChatPage />} />
                    <Route path="calls" element={<CallHistoryPage />} />
                    <Route path="notifications" element={<NotificationsPage />} />
                    <Route path="settings" element={<SettingsPage />} />
                  </Route>
                </Routes>
              </Suspense>
            </BrowserRouter>
          </NotificationProvider>
        </VoiceCallProvider>
      </PresenceProvider>
    </AuthProvider>
  );
}
