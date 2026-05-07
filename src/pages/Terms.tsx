import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function Terms() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-surface font-body">
      <header className="sticky top-0 z-40 flex items-center px-4 h-14 bg-surface border-b border-surface-container-high/50">
        <button onClick={() => navigate(-1)} className="p-2 -ml-2 rounded-full hover:bg-surface-container transition-colors">
          <ArrowLeft className="w-6 h-6 text-on-surface" />
        </button>
        <h1 className="text-lg font-headline font-semibold text-on-surface mx-auto pr-8">用户协议</h1>
      </header>
      <main className="px-6 py-8 max-w-[800px] mx-auto prose dark:prose-invert text-on-surface-variant">
        <h2>1. 服务说明</h2>
        <p>小象日志是一款为用户提供个人日记记录、云端同步以及社区分享功能的应用程序。在使用本服务前，请您务必仔细阅读本协议。</p>

        <h2>2. 用户行为规范</h2>
        <p>您在使用小象日志时，必须遵守当地法律法规。您在“日志圈”发布的任何内容，不得包含以下信息：</p>
        <ul>
          <li>违反国家法律法规、危害国家安全的内容；</li>
          <li>煽动民族仇恨、民族歧视，破坏民族团结的内容；</li>
          <li>散布谣言，扰乱社会秩序，破坏社会稳定的内容；</li>
          <li>散布淫秽、色情、赌博、暴力、凶杀、恐怖或者教唆犯罪的内容；</li>
          <li>侮辱或者诽谤他人，侵害他人合法权益的内容；</li>
        </ul>
        <p>如果发现违规内容，我们有权对相关内容进行隐藏或删除，并有权封停严重违规的账号。</p>

        <h2>3. 知识产权</h2>
        <p>您在小象日志上记录的原创日记内容，版权归您个人所有。小象日志仅提供存储和展示的服务平台。</p>

        <h2>4. 服务变更、中断或终止</h2>
        <p>我们致力于为您提供持续稳定的服务，但可能因为服务器升级、维护或其他不可抗力因素导致服务中断。我们将尽量提前通过公告等方式告知您。您也可以随时自行决定停止使用我们的服务，并注销您的账户。</p>

        <h2>5. 免责声明</h2>
        <p>对于您因不可抗力或非由于小象日志的过错导致的个人数据丢失，小象日志将在能力范围内协助恢复，但不承担直接的法律责任。我们强烈建议您定期使用“导出日记”功能将数据备份至本地。</p>

        <p className="mt-8 text-sm opacity-70">最后更新日期：2026年05月05日</p>
      </main>
    </div>
  );
}
