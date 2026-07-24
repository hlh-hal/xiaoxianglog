import type { MonthlyEchoRenderPayload } from './monthlyEcho';

const occurrence = (date: string, scene: string, index: number) => ({
  date,
  scene,
  evidence: scene,
  text: scene,
  evidenceIds: [`mock-${index}`],
});

const emotion = (name: string, dates: string[], evidence: string, event: string, meaning: string, index: number) => ({
  emotion: name,
  dates,
  evidence,
  event,
  eventEvidence: event,
  eventEvidenceIds: [`mock-event-${index}`],
  meaning,
  text: name,
  evidenceIds: [`mock-emotion-${index}`],
});

export const monthlyEchoMockReport: MonthlyEchoRenderPayload = {
  schemaVersion: 2,
  monthKey: '2026-06',
  pages: {
    entrance: { contentState: 'ready', month: '六月', monthEn: 'June', diaryCount: 18 },
    overview: {
      contentState: 'ready',
      emotionArc: '你从一开始的紧绷和反复确认，慢慢走到愿意停下来听听自己的感受，也开始把注意力放回真正想守住的事情上。',
      emotionPattern: 'mixed',
      emotions: [
        emotion('疲惫', ['2026-06-08', '2026-06-10'], '这几天真的很累，只想先停一下。', '连续赶项目交付，还在整理搬家的物品。', '多件事情同时压在了一起。', 1),
        emotion('期待', ['2026-06-16'], '写到那段关系时，我还是有一点期待。', '和那个人重新聊起了周末见面的安排。', '靠近和保护自己的需要同时存在。', 2),
        emotion('迟疑', ['2026-06-21'], '我又在确认自己是不是做得不够。', '提交方案前反复检查了好几遍。', '对结果的在意让决定变得反复。', 3),
        emotion('松一口气', ['2026-06-24'], '重新做起那件事时，我松了一口气。', '搁置一周后重新打开了画稿。', '这一天的记录里出现了短暂的轻松。', 4),
        emotion('担心', ['2026-06-27'], '想到下个月的安排，我还是有些担心。', '房租续约和出差日期还没有确定。', '尚未确定的事情占据了一部分注意力。', 5),
      ],
      fallback: false,
      initialQuestion: '我是不是做得还不够？',
      occurrences: [
        occurrence('2026-06-05', '担心自己没有做好。', 1),
        occurrence('2026-06-14', '反复确认别人有没有失望。', 2),
        occurrence('2026-06-21', '又想让自己再努力一点。', 3),
      ],
      evolvedQuestion: '这真的是我想要的吗？',
      mainArc: '开始把注意力慢慢放回自己身上。',
      conclusion: '你开始看见自己真正想守住的东西。',
    },
    map: {
      contentState: 'ready',
      mainArc: '你在学习用不那么消耗自己的方式继续往前走。',
      sideThemes: [
        { ...occurrence('2026-06-06', '重新确认自己的节奏。', 4), title: '学习节奏', meaning: '减少消耗' },
        { ...occurrence('2026-06-16', '开始分辨期待与自我保护。', 5), title: '关系边界', meaning: '保护自己' },
        { ...occurrence('2026-06-24', '重新靠近想做的事。', 6), title: '重新开始', meaning: '找回方向' },
      ],
      summary: '这些支线都指向同一件事：你开始把注意力放回自己身上。',
    },
    moments: {
      contentState: 'ready',
      items: [
        { ...occurrence('2026-06-08', '你很累，但没有立刻责怪自己。', 7), title: '没有立刻否定自己', event: '很累的时候停了下来', meaning: '你允许自己慢一点' },
        { ...occurrence('2026-06-16', '写到那段关系时，你既想靠近又有克制。', 8), title: '看见关系里的期待', event: '写下那段关系', meaning: '开始寻找靠近和保护之间的位置' },
        { ...occurrence('2026-06-24', '你重新开始做那件小事。', 9), title: '重新靠近想做的事', event: '重新开始', meaning: '你没有放弃那个方向' },
      ],
      summary: '它们不算惊天动地，但说明你没有停在原地。',
    },
    actions: {
      contentState: 'ready',
      items: [
        { ...occurrence('2026-06-03', '那一次很小，但你表达了自己的感受。', 10), action: '表达了一次不舒服', meaning: '没有压下感受', iconHint: 'express' },
        { ...occurrence('2026-06-10', '很累时没有继续硬撑。', 11), action: '停下来休息', meaning: '允许自己慢一点', iconHint: 'pause' },
        { ...occurrence('2026-06-18', '把混乱的计划重新排了一遍。', 12), action: '重新整理计划', meaning: '事情变得可处理', iconHint: 'organize' },
        { ...occurrence('2026-06-22', '整理工作空间时。', 13), action: '清理桌面与待办，删除因不好意思拒绝而保留的任务', scene: '整理工作空间时', meaning: '换了一种回应', iconHint: 'boundary' },
        { ...occurrence('2026-06-27', '重新做起想做的小事。', 14), action: '重新开始', meaning: '靠近想去的方向', iconHint: 'restart' },
      ],
      summary: '这些行动都很小，但它们不是没有重量。',
    },
    recurring: {
      contentState: 'ready',
      lead: '当你很在意一段关系，或很想做好一件事时，你会很快开始问：',
      question: '我是不是做得还不够？',
      occurrences: [
        occurrence('2026-06-05', '担心自己没有做好。', 15),
        occurrence('2026-06-14', '确认别人有没有失望。', 16),
        occurrence('2026-06-21', '要求自己再努力一点。', 17),
      ],
      evolvedQuestion: '这真的是我想要的吗，还是我在回应别人的期待？',
      turnDate: '2026-06-26',
      conclusion: '问题没有立刻消失，但你已经开始不再完全被它带着走。',
    },
    letter: {
      contentState: 'ready',
      salutation: '亲爱的阿树：',
      paragraphs: [
        '回头看这个月，你开始走到自己以前没有留意的地方。',
        '小象记得，你很累的时候没有立刻责怪自己；写到那段关系时，也看见了期待和克制。',
        '你还重新开始靠近那件想做的事。它不大，却说明你仍在往自己想去的方向走。',
        '这个月没有解决所有问题，但你开始能停下来，看见它们，也看见自己真正想守住的东西。',
      ],
      finalInsight: '你不是在原地反复，而是在相似的日子里练习新的回应方式。',
      signature: '爱你的小象',
    },
  },
};
