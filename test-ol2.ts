import { stripMarkdown } from './src/utils/textUtils';
const content = `<h2 dir="auto">开心的事：</h2><ol dir="auto"><li dir="auto">今天和龙哥一起上下课，挺开心的，很日常的场景，去东区、吃饭、跑校园跑，他很温柔，很幽默，很有耐心，和他相处非常舒服</li><li dir="auto">有一个女生很可爱，我也能感觉到她喜欢我，她会往我身边靠，和我有肢体接触，是这种被人喜欢让我开心呢还是她让我开心呢，应该是她真的很可爱吧，哈哈哈，但很奇怪我没有心动，只是很开心有人喜欢</li></ol>`;
console.log(stripMarkdown(content, true));
