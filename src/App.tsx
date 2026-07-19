import { useEffect } from 'react';
import { BrowserRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import Layout from './components/Layout';
import Home from './pages/Home';
import Editor from './pages/Editor';
import Community from './pages/Community';
import Profile from './pages/Profile';
import EditProfile from './pages/EditProfile';
import Settings from './pages/Settings';
import InsightDraftSettings from './pages/InsightDraftSettings';
import Gallery from './pages/Gallery';
import Walk from './pages/Walk';
import OnThisDay from './pages/OnThisDay';
import AnnualEcho from './pages/AnnualEcho';
import MonthlyEcho from './pages/MonthlyEcho';
import MonthlyEchoDesignDemo from './pages/MonthlyEchoDesignDemo';
import MonthlyEchoStoryDesignDemo from './pages/MonthlyEchoStoryDesignDemo';
import MonthlyEchoMapDesignDemo from './pages/MonthlyEchoMapDesignDemo';
import MonthlyEchoMomentsDesignDemo from './pages/MonthlyEchoMomentsDesignDemo';
import MonthlyEchoActionsDesignDemo from './pages/MonthlyEchoActionsDesignDemo';
import MonthlyEchoThemeDesignDemo from './pages/MonthlyEchoThemeDesignDemo';
import MonthlyEchoLetterDesignDemo from './pages/MonthlyEchoLetterDesignDemo';
import MonthlyEchoV2DesignDemo from './pages/MonthlyEchoV2DesignDemo';
import Trash from './pages/Trash';
import Search from './pages/Search';
import Login from './pages/Login';
import Register from './pages/Register';
import WechatRegister from './pages/WechatRegister';
import ForgotPassword from './pages/ForgotPassword';
import FirstRunVaultOnboarding from './pages/FirstRunVaultOnboarding';
import AIChat from './pages/AIChat';
import Leaderboard from './pages/Leaderboard';
import FriendList from './pages/FriendList';
import PostDetail from './pages/PostDetail';
import Help from './pages/Help';
import Inbox from './pages/Inbox';
import Privacy from './pages/Privacy';
import Terms from './pages/Terms';
import { AuthProvider } from './contexts/AuthContext';
import { firstInstallVaultOnboardingService } from './services/firstInstallVaultOnboardingService';
import { useAppBootstrap } from './features/app-shell/useAppBootstrap';

if ('scrollRestoration' in history) {
  history.scrollRestoration = 'manual';
}

function FirstInstallVaultOnboardingGate() {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const check = () => {
      if (
        firstInstallVaultOnboardingService.shouldShow()
        && location.pathname !== '/first-run/local-vault'
      ) {
        navigate('/first-run/local-vault', { replace: true });
      }
    };

    check();
    window.addEventListener(firstInstallVaultOnboardingService.stateChangedEvent, check);
    return () => {
      window.removeEventListener(firstInstallVaultOnboardingService.stateChangedEvent, check);
    };
  }, [location.pathname, navigate]);

  return null;
}

export default function App() {
  useAppBootstrap();

  return (
    <AuthProvider>
      <BrowserRouter>
        <FirstInstallVaultOnboardingGate />
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Home />} />
            <Route path="community" element={<Community />} />
            <Route path="profile" element={<Profile />} />
            <Route path="profile/edit" element={<EditProfile />} />
            <Route path="gallery" element={<Gallery />} />
            <Route path="walk" element={<Walk />} />
            <Route path="on-this-day" element={<OnThisDay />} />
            <Route path="annual-echo" element={<AnnualEcho />} />
            <Route path="monthly-echo" element={<MonthlyEcho />} />
            <Route path="trash" element={<Trash />} />
            <Route path="settings" element={<Settings />} />
            <Route path="settings/insight-draft" element={<InsightDraftSettings />} />
            <Route path="help" element={<Help />} />
            <Route path="search" element={<Search />} />
            <Route path="login" element={<Login />} />
            <Route path="register" element={<Register />} />
            <Route path="wechat-register" element={<WechatRegister />} />
            <Route path="forgot-password" element={<ForgotPassword />} />
            <Route path="ai-chat" element={<AIChat />} />
            <Route path="leaderboard" element={<Leaderboard />} />
            <Route path="inbox" element={<Inbox />} />
            <Route path="privacy" element={<Privacy />} />
            <Route path="terms" element={<Terms />} />
          </Route>
          <Route path="/post/:id" element={<PostDetail />} />
          <Route path="/editor" element={<Editor />} />
          <Route path="/friends" element={<FriendList />} />
          <Route path="/first-run/local-vault" element={<FirstRunVaultOnboarding />} />
          <Route path="/monthly-echo-design-demo" element={<MonthlyEchoDesignDemo />} />
          <Route path="/monthly-echo-story-design-demo" element={<MonthlyEchoStoryDesignDemo />} />
          <Route path="/monthly-echo-map-design-demo" element={<MonthlyEchoMapDesignDemo />} />
          <Route path="/monthly-echo-moments-design-demo" element={<MonthlyEchoMomentsDesignDemo />} />
          <Route path="/monthly-echo-actions-design-demo" element={<MonthlyEchoActionsDesignDemo />} />
          <Route path="/monthly-echo-theme-design-demo" element={<MonthlyEchoThemeDesignDemo />} />
          <Route path="/monthly-echo-letter-design-demo" element={<MonthlyEchoLetterDesignDemo />} />
          <Route path="/monthly-echo-v2-design-demo" element={<MonthlyEchoV2DesignDemo />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
