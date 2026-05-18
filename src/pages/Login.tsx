import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Mail, Lock, Eye, EyeOff } from 'lucide-react';
import { authService } from '../services/authService';
import { useAuth } from '../contexts/AuthContext';

export default function Login() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError('请输入邮箱和密码');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const session = await authService.login(email, password); // Using password as hash for prototype
      login(session);
      navigate('/profile', { replace: true });
    } catch (err: any) {
      const message = String(err?.message || '');
      if (message.includes('app_session') || message.includes('QuotaExceededError') || message.includes('exceeded the quota')) {
        localStorage.removeItem('app_session');
        setError('本地缓存已清理，请再点一次登录');
      } else {
        setError(message || '登录失败');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FAF9F5] flex flex-col font-sans">
      <header className="w-full flex items-center px-6 h-14 shrink-0 bg-[#FAF9F5]">
        <button 
          onClick={() => {
            if (window.history.length > 1) {
              navigate(-1);
            } else {
              navigate('/', { replace: true });
            }
          }}
          className="p-2 -ml-2 rounded-full active:bg-black/5 transition-colors relative z-10"
        >
          <ArrowLeft className="w-6 h-6 text-[#1C1C1E]" />
        </button>
      </header>

      <main className="flex-1 px-6 flex flex-col">
        <div style={{ textAlign: 'center', padding: '40px 0 36px' }}>
          <div style={{
            width: '64px', height: '64px',
            borderRadius: '18px',
            backgroundColor: '#F0F7EB',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 14px',
          }}>
            <span style={{ fontSize: '36px' }}>🐘</span>
          </div>
          <h1 style={{ fontSize: '22px', fontWeight: '700', color: '#1C1C1E', marginBottom: '6px' }}>
            小象日志
          </h1>
          <p style={{ fontSize: '13px', color: '#A1A1A6' }}>
            静心书写，认识自己
          </p>
        </div>

        <form onSubmit={handleLogin} className="flex flex-col gap-4">
          <div className="relative">
            <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
              <Mail className="w-5 h-5 text-[#A1A1A6]" />
            </div>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="邮箱"
              className="w-full h-14 pl-12 pr-4 bg-black/5 rounded-[16px] text-[#1C1C1E] text-[16px] outline-none focus:bg-black/10 transition-colors placeholder:text-[#A1A1A6]"
            />
          </div>

          <div className="relative">
            <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
              <Lock className="w-5 h-5 text-[#A1A1A6]" />
            </div>
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="密码"
              className="w-full h-14 pl-12 pr-12 bg-black/5 rounded-[16px] text-[#1C1C1E] text-[16px] outline-none focus:bg-black/10 transition-colors placeholder:text-[#A1A1A6]"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute inset-y-0 right-4 flex items-center text-[#A1A1A6] active:text-[#6E6E73]"
            >
              {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            </button>
          </div>

          {error && (
            <p className="text-red-500 text-[13px] px-2">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full h-14 mt-4 bg-[#446733] text-white rounded-[16px] text-[16px] font-medium active:scale-[0.98] transition-transform disabled:opacity-50"
          >
            {loading ? '登录中...' : '登录'}
          </button>
        </form>

        <div className="mt-6 flex justify-between items-center px-2">
          <button 
            onClick={() => navigate('/forgot-password')}
            className="text-[14px] text-[#6E6E73] active:text-[#1C1C1E] transition-colors"
          >
            忘记密码
          </button>
          <button 
            onClick={() => navigate('/register')}
            className="text-[14px] text-[#6E6E73] active:text-[#1C1C1E] transition-colors"
          >
            注册账号
          </button>
        </div>
      </main>
    </div>
  );
}
