import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function Privacy() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-surface font-body">
      <header className="app-safe-header sticky top-0 z-40 flex items-center px-4 bg-surface border-b border-surface-container-high/50">
        <button onClick={() => navigate(-1)} className="p-2 -ml-2 rounded-full hover:bg-surface-container transition-colors">
          <ArrowLeft className="w-6 h-6 text-on-surface" />
        </button>
        <h1 className="text-lg font-headline font-semibold text-on-surface mx-auto pr-8">隐私政策</h1>
      </header>
      <main className="app-reading-container py-8 prose dark:prose-invert text-on-surface-variant">
        <h2>1. 信息收集</h2>
        <p>我们收集的信息仅限于您主动提供的邮箱地址、昵称，以及您在使用小象日志过程中创建的日记、上传的图片和相关互动数据。这些数据仅用于为您提供核心的日记记录、社区分享和多设备同步功能。</p>
        <p>当您主动选择微信登录或绑定微信时，我们会从微信获取并保存用于识别账号的 OpenID、UnionID（如微信提供），以及您授权提供的微信昵称和头像。微信不会向我们提供您的邮箱；邮箱账号关联只会在您完成小象日志邮箱验证后进行。</p>
        
        <h2>2. 信息的存储与保护</h2>
        <p>您的所有数据均保存在安全可靠的云服务器中，您的账号密码会经过加密处理，即便是系统管理员也无法得知您的真实密码。我们将采取业内标准的安全措施来保护您的数据不被泄露或非法访问。</p>
        
        <h2>3. 信息使用限制</h2>
        <p>我们承诺不会将您的个人数据和私密日记用于任何商业营销行为，也绝不会出售给任何第三方。除非您主动分享至“日志圈”，否则您的日记对其他人是完全不可见的。</p>
        
        <h2>4. AI 服务数据处理</h2>
        <p>如果您使用了小象日志内置的 AI 分析功能，我们会将您请求分析的日记文本发送至 AI 服务端进行处理。该数据仅作单次计算分析，不会被留存或用于模型训练。</p>

        <h2>5. 您的权利</h2>
        <p>{'您有权随时查看、修改或彻底删除您的个人信息。您可以随时通过“设置 -> 注销账户”功能清除您在小象日志上的所有数据。账号注销后，数据将不可恢复。'}</p>
        <p>您可以在“个人信息”中查看微信绑定状态，并在验证当前账号邮箱后解除绑定。解除绑定会删除微信登录身份，不会删除邮箱账号或日记；注销账号时，相关微信身份信息会一并删除。</p>

        <p className="mt-8 text-sm opacity-70">最后更新日期：2026年07月17日</p>
      </main>
    </div>
  );
}
