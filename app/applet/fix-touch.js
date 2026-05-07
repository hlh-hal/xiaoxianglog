const fs = require('fs');
const glob = require('glob'); // Not available? No, I'll just hardcode the 4 files

const files = [
  './src/components/diary-lists/MagazineList.tsx',
  './src/components/diary-lists/BriefingList.tsx',
  './src/components/diary-lists/TimelineList.tsx',
  './src/components/diary-lists/CardFlowList.tsx'
];

files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  content = content.replace(/\s*onTouchStart=\{[^\}]+\}/g, '');
  content = content.replace(/\s*onTouchMove=\{[^\}]+\}/g, '');
  content = content.replace(/\s*onTouchEnd=\{[^\}]+\}/g, '');
  content = content.replace(/\s*onTouchCancel=\{[^\}]+\}/g, '');
  fs.writeFileSync(file, content);
  console.log('Fixed', file);
});
