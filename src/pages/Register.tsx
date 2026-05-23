import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Mail, Lock, User, KeyRound, Eye, EyeOff } from 'lucide-react';
import { authService } from '../services/authService';
import { useAuth } from '../contexts/AuthContext';

export default function Register() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [step, setStep] = useState(1);
  
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [nickname, setNickname] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [verificationToken, setVerificationToken] = useState('');
  
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [countdown, setCountdown] = useState(0);
  const [agreed, setAgreed] = useState(false);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (countdown > 0) {
      timer = setTimeout(() => setCountdown(countdown - 1), 1000);
    }
    return () => clearTimeout(timer);
  }, [countdown]);

  const handleSendCode = async () => {
    if (!agreed) {
      setError('请先阅读并同意用户协议与隐私政策');
      return;
    }
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
      setError('请输入有效的邮箱地址');
      return;
    }
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      const { devCode } = await authService.requestEmailCode(email, 'register');
      setCountdown(60);
      setSuccess(devCode ? `开发环境验证码：${devCode}` : '验证码已发送到您的邮箱，请查收');
    } catch (err: any) {
      setError(err.message || '发送失败');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyCode = async () => {
    if (!agreed) {
      setError('请先阅读并同意用户协议与隐私政策');
      return;
    }
    if (!code) {
      setError('请输入验证码');
      return;
    }
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      const token = await authService.verifyEmailCode(email, code, 'register');
      setVerificationToken(token);
      setStep(3);
    } catch (err: any) {
      setError(err.message || '验证失败');
    } finally {
      setLoading(false);
    }
  };

  const handleNextToPassword = () => {
    if (!nickname || nickname.length < 2 || nickname.length > 16) {
      setError('昵称长度需在 2-16 个字符之间');
      return;
    }
    setError('');
    setStep(4);
  };

  const handleRegister = async () => {
    if (!password || password.length < 6) {
      setError('密码长度至少为 6 位');
      return;
    }
    if (password !== confirmPassword) {
      setError('两次输入的密码不一致');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const session = await authService.register(email, nickname, password, verificationToken);
      login(session);
      navigate('/profile', { replace: true });
    } catch (err: any) {
      setError(err.message || '注册失败');
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    if (step > 1) {
      setStep(step - 1);
      setError('');
    } else {
      if (window.history.length > 1) {
        navigate(-1);
      } else {
        navigate('/login', { replace: true });
      }
    }
  };

  return (
    <div className="min-h-screen bg-[#FAF9F5] flex flex-col font-sans">
      <header className="app-safe-header w-full flex items-center px-6 shrink-0 bg-[#FAF9F5]">
        <button onClick={handleBack} className="p-2 -ml-2 rounded-full active:bg-black/5 transition-colors">
          <ArrowLeft className="w-6 h-6 text-[#1C1C1E]" />
        </button>
      </header>

      <main className="flex-1 px-6 flex flex-col pt-8">
        <h1 className="text-[24px] font-bold text-[#1C1C1E] mb-2">
          {step === 1 && '注册账号'}
          {step === 3 && '设置昵称'}
          {step === 4 && '设置密码'}
        </h1>
        <p className="text-[14px] text-[#6E6E73] mb-8">
          {step === 1 && '请输入你的邮箱地址并验证'}
          {step === 3 && '起一个好听的名字吧'}
          {step === 4 && '请设置登录密码'}
        </p>

        <div className="flex flex-col gap-4">
          {step === 1 && (
            <>
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
                  <KeyRound className="w-5 h-5 text-[#A1A1A6]" />
                </div>
                <input
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="验证码"
                  maxLength={6}
                  className="w-full h-14 pl-12 pr-28 bg-black/5 rounded-[16px] text-[#1C1C1E] text-[16px] outline-none focus:bg-black/10 transition-colors placeholder:text-[#A1A1A6]"
                />
                <button
                  type="button"
                  onClick={handleSendCode}
                  disabled={loading || countdown > 0 || !email || !agreed}
                  className="absolute inset-y-0 right-4 flex items-center text-[#446733] text-[14px] font-medium active:opacity-70 transition-opacity disabled:opacity-50"
                >
                  {countdown > 0 ? `${countdown}s` : '获取验证码'}
                </button>
              </div>
              
              <div className="flex items-start gap-2 px-1 mt-2">
                <input 
                  type="checkbox" 
                  id="agree" 
                  checked={agreed}
                  onChange={(e) => setAgreed(e.target.checked)}
                  className="mt-1 w-4 h-4 rounded text-[#446733] focus:ring-[#446733] border-gray-300"
                />
                <label htmlFor="agree" className="text-[13px] text-[#6E6E73] leading-tight">
                  我已阅读并同意 <Link to="/terms" className="text-[#446733]">《用户协议》</Link> 和 <Link to="/privacy" className="text-[#446733]">《隐私政策》</Link>
                </label>
              </div>

              {error && <p className="text-red-500 text-[13px] px-2">{error}</p>}
              {success && <p className="text-[#446733] text-[13px] px-2">{success}</p>}
              <button
                onClick={() => {
                  if (!agreed) {
                    setError('请先阅读并同意用户协议与隐私政策');
                    return;
                  }
                  if (!email) {
                    setError('请输入邮箱');
                    return;
                  }
                  if (!code) {
                    setError('请输入验证码');
                    return;
                  }
                  handleVerifyCode();
                }}
                className="w-full h-14 mt-4 bg-[#446733] text-white rounded-[16px] text-[16px] font-medium active:scale-[0.98] transition-transform"
              >
                下一步
              </button>
            </>
          )}

          {step === 3 && (
            <>
              <div className="relative">
                <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
                  <User className="w-5 h-5 text-[#A1A1A6]" />
                </div>
                <input
                  type="text"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  placeholder="昵称 (2-16个字符)"
                  maxLength={16}
                  className="w-full h-14 pl-12 pr-4 bg-black/5 rounded-[16px] text-[#1C1C1E] text-[16px] outline-none focus:bg-black/10 transition-colors placeholder:text-[#A1A1A6]"
                />
              </div>
              {error && <p className="text-red-500 text-[13px] px-2">{error}</p>}
              <button
                onClick={handleNextToPassword}
                className="w-full h-14 mt-4 bg-[#446733] text-white rounded-[16px] text-[16px] font-medium active:scale-[0.98] transition-transform"
              >
                下一步
              </button>
            </>
          )}

          {step === 4 && (
            <>
              <div className="relative">
                <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
                  <Lock className="w-5 h-5 text-[#A1A1A6]" />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="密码 (至少6位)"
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
              <div className="relative">
                <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
                  <Lock className="w-5 h-5 text-[#A1A1A6]" />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="确认密码"
                  className="w-full h-14 pl-12 pr-12 bg-black/5 rounded-[16px] text-[#1C1C1E] text-[16px] outline-none focus:bg-black/10 transition-colors placeholder:text-[#A1A1A6]"
                />
              </div>
              {error && <p className="text-red-500 text-[13px] px-2">{error}</p>}
              <button
                onClick={handleRegister}
                disabled={loading}
                className="w-full h-14 mt-4 bg-[#446733] text-white rounded-[16px] text-[16px] font-medium active:scale-[0.98] transition-transform disabled:opacity-50"
              >
                {loading ? '注册中...' : '完成注册'}
              </button>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
