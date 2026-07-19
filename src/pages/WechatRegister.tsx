import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Eye, EyeOff, KeyRound, Lock, Mail, User } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { authService } from '../services/authService';
import { wechatAuthService } from '../services/wechatAuthService';

export default function WechatRegister() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const draft = useMemo(() => wechatAuthService.getRegistrationDraft(), []);
  const [step, setStep] = useState(1);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [verificationToken, setVerificationToken] = useState('');
  const [nickname, setNickname] = useState(
    draft?.wechatProfile.nickname ? Array.from(draft.wechatProfile.nickname).slice(0, 16).join('') : '',
  );
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = window.setTimeout(() => setCountdown(value => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [countdown]);

  if (!draft) {
    return (
      <div className="min-h-screen bg-[#FAF9F5] flex items-center justify-center px-8 text-center">
        <div className="max-w-sm">
          <div className="text-5xl mb-5">🐘</div>
          <h1 className="text-xl font-bold text-[#1C1C1E] mb-2">微信授权已过期</h1>
          <p className="text-sm text-[#6E6E73] mb-6">请返回登录页，重新完成微信授权。</p>
          <button
            onClick={() => navigate('/login', { replace: true })}
            className="w-full h-12 rounded-2xl bg-[#446733] text-white font-medium"
          >
            返回登录
          </button>
        </div>
      </div>
    );
  }

  const sendCode = async () => {
    if (!agreed) {
      setError('请先阅读并同意用户协议与隐私政策');
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      setError('请输入有效的邮箱地址');
      return;
    }
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      const result = await authService.requestEmailCode(email, 'register');
      setCountdown(60);
      setSuccess(result.devCode ? `开发环境验证码：${result.devCode}` : '验证码已发送到邮箱');
    } catch (err: any) {
      setError(err?.status === 409
        ? '该邮箱已注册，请先使用邮箱登录，再到个人信息绑定微信'
        : (err?.message || '验证码发送失败'));
    } finally {
      setLoading(false);
    }
  };

  const verifyCode = async () => {
    if (!agreed || !/^\d{6}$/.test(code)) {
      setError(!agreed ? '请先阅读并同意用户协议与隐私政策' : '请输入 6 位邮箱验证码');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const token = await authService.verifyEmailCode(email, code, 'register');
      setVerificationToken(token);
      setStep(2);
    } catch (err: any) {
      setError(err?.message || '邮箱验证失败');
    } finally {
      setLoading(false);
    }
  };

  const continueWithNickname = () => {
    const length = Array.from(nickname.trim()).length;
    if (length < 2 || length > 16) {
      setError('昵称长度需在 2-16 个字符之间');
      return;
    }
    setError('');
    setStep(3);
  };

  const completeRegistration = async () => {
    if (password.length < 6) {
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
      const session = await wechatAuthService.register({
        registrationToken: draft.registrationToken,
        email,
        nickname: nickname.trim(),
        password,
        verificationToken,
      });
      login(session);
      navigate('/profile', { replace: true });
    } catch (err: any) {
      setError(err?.message || '微信注册失败，请重新尝试');
    } finally {
      setLoading(false);
    }
  };

  const goBack = () => {
    if (step > 1) {
      setStep(value => value - 1);
      setError('');
      return;
    }
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-[#FAF9F5] flex flex-col font-sans">
      <header className="app-safe-header flex items-center px-6 shrink-0">
        <button onClick={goBack} className="p-2 -ml-2 rounded-full active:bg-black/5">
          <ArrowLeft className="w-6 h-6 text-[#1C1C1E]" />
        </button>
      </header>

      <main className="flex-1 px-6 pt-6 pb-12">
        <div className="flex items-center gap-3 mb-8 rounded-2xl bg-[#07C160]/10 p-3">
          {draft.wechatProfile.avatarUrl ? (
            <img src={draft.wechatProfile.avatarUrl} alt="微信头像" className="w-12 h-12 rounded-full object-cover" />
          ) : (
            <div className="w-12 h-12 rounded-full bg-[#07C160]/15 flex items-center justify-center text-2xl">微信</div>
          )}
          <div>
            <p className="text-xs text-[#16843D]">已完成微信授权</p>
            <p className="font-semibold text-[#1C1C1E]">{draft.wechatProfile.nickname || '微信用户'}</p>
          </div>
        </div>

        <h1 className="text-2xl font-bold text-[#1C1C1E] mb-2">
          {step === 1 ? '验证邮箱' : step === 2 ? '确认昵称' : '设置邮箱密码'}
        </h1>
        <p className="text-sm text-[#6E6E73] mb-8">
          {step === 1
            ? '邮箱将作为账号找回和另一种登录方式'
            : step === 2
              ? '微信昵称仅作为新账号的默认昵称'
              : '以后可以使用邮箱和微信登录同一个账号'}
        </p>

        <div className="flex flex-col gap-4">
          {step === 1 && (
            <>
              <Field icon={<Mail className="w-5 h-5" />}>
                <input
                  type="email"
                  value={email}
                  onChange={event => setEmail(event.target.value)}
                  placeholder="邮箱"
                  className="w-full h-14 pl-12 pr-4 bg-transparent outline-none text-[16px]"
                />
              </Field>
              <Field icon={<KeyRound className="w-5 h-5" />}>
                <input
                  value={code}
                  onChange={event => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                  inputMode="numeric"
                  placeholder="验证码"
                  className="w-full h-14 pl-12 pr-28 bg-transparent outline-none text-[16px]"
                />
                <button
                  type="button"
                  onClick={sendCode}
                  disabled={loading || countdown > 0}
                  className="absolute right-4 inset-y-0 text-sm font-medium text-[#446733] disabled:opacity-50"
                >
                  {countdown > 0 ? `${countdown}s` : '获取验证码'}
                </button>
              </Field>
              <label className="flex items-start gap-2 px-1 text-[13px] text-[#6E6E73]">
                <input
                  type="checkbox"
                  checked={agreed}
                  onChange={event => setAgreed(event.target.checked)}
                  className="mt-0.5 w-4 h-4"
                />
                <span>
                  我已阅读并同意 <Link to="/terms" className="text-[#446733]">《用户协议》</Link> 和{' '}
                  <Link to="/privacy" className="text-[#446733]">《隐私政策》</Link>
                </span>
              </label>
              <PrimaryButton onClick={verifyCode} loading={loading}>下一步</PrimaryButton>
            </>
          )}

          {step === 2 && (
            <>
              <Field icon={<User className="w-5 h-5" />}>
                <input
                  value={nickname}
                  onChange={event => setNickname(event.target.value)}
                  maxLength={16}
                  placeholder="昵称（2-16 个字符）"
                  className="w-full h-14 pl-12 pr-4 bg-transparent outline-none text-[16px]"
                />
              </Field>
              <PrimaryButton onClick={continueWithNickname}>下一步</PrimaryButton>
            </>
          )}

          {step === 3 && (
            <>
              {[{ value: password, setValue: setPassword, placeholder: '密码（至少 6 位）' },
                { value: confirmPassword, setValue: setConfirmPassword, placeholder: '再次输入密码' }].map((field) => (
                <Field key={field.placeholder} icon={<Lock className="w-5 h-5" />}>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={field.value}
                    onChange={event => field.setValue(event.target.value)}
                    placeholder={field.placeholder}
                    className="w-full h-14 pl-12 pr-12 bg-transparent outline-none text-[16px]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(value => !value)}
                    className="absolute right-4 inset-y-0 text-[#A1A1A6]"
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </Field>
              ))}
              <PrimaryButton onClick={completeRegistration} loading={loading}>完成注册</PrimaryButton>
            </>
          )}

          {error && <p className="text-red-500 text-[13px] px-2">{error}</p>}
          {success && <p className="text-[#446733] text-[13px] px-2">{success}</p>}
        </div>
      </main>
    </div>
  );
}

function Field({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="relative bg-black/5 rounded-[16px]">
      <div className="absolute left-4 inset-y-0 flex items-center text-[#A1A1A6] pointer-events-none">{icon}</div>
      {children}
    </div>
  );
}

function PrimaryButton({
  children,
  onClick,
  loading = false,
}: {
  children: React.ReactNode;
  onClick: () => void;
  loading?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className="w-full h-14 mt-3 bg-[#446733] text-white rounded-[16px] text-[16px] font-medium active:scale-[0.98] disabled:opacity-50"
    >
      {loading ? '处理中...' : children}
    </button>
  );
}
