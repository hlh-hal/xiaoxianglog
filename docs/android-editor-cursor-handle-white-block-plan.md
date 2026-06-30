# Android 编辑器光标 / 选区下坠白底修复实施计划

日期：2026-06-24

## 1. 问题描述

在小象日志 Android 移动端编辑页中，输入光标下方会出现系统用于定位光标的“下坠”手柄。这个下坠本身可以保留，但它周围出现白色矩形底块，会覆盖日记背景。

从用户截图看：

- 白色块会跟随光标或选区手柄移动；
- 更换任意日记背景后仍然出现；
- 网页端没有同样问题；
- 问题集中在移动端编辑器 / Android WebView / 输入选区层；
- 现有 CSS 透明化尝试没有完全消除。

## 2. 初步判断

该问题大概率不是普通 DOM 元素背景，而是 Android WebView 或系统输入法绘制的光标 / 选区手柄层在透明背景上合成时露出了默认浅色底。

可能链路：

```text
日记主题背景层
  ↓
透明编辑器滚动层
  ↓
Tiptap / ProseMirror contenteditable
  ↓
Android WebView 原生光标 / 选区手柄层
  ↓
手柄透明区域没有正确透出页面背景，露出白色或 WebView 默认底色
```

当前代码中已经存在的相关点：

- `src/pages/Editor.tsx`：编辑页主逻辑，使用 Tiptap / ProseMirror；
- `src/index.css`：包含 `.ProseMirror`、`::selection`、透明背景相关样式；
- `android/app/src/main/java/com/xiaoxiang/diary/MainActivity.java`：WebView 背景和 ForceDark / AlgorithmicDarkening 设置；
- `android/app/src/main/res/values/styles.xml`：Android App 主题，目前尚未自定义原生文字选区手柄 drawable；
- `android/app/src/main/res/values/colors.xml`：小象主色和 app surface 色。

## 3. 修复目标

保留 Android 系统光标下坠 / 选区手柄的功能，但去掉它周围的白色矩形底块。

验收标准：

1. 单点输入时，光标下方手柄可以显示，但周围不再出现白色矩形；
2. 长按选中文字时，左右两个选区手柄不再出现白色底块；
3. 纯色主题、深色主题、图片主题都不破坏背景；
4. 中文输入法组合输入正常；
5. 复制、粘贴、全选菜单正常；
6. 编辑器滚动、软键盘弹出、底部工具栏不回退；
7. 网页端表现不受影响。

## 4. 实施原则

- 优先最小改动，不大改 `Editor.tsx`；
- 优先修复 Android 原生选区手柄层，而不是用 React 自己重写光标；
- CSS 只在编辑页作用域内兜底，不全局透明化所有 ProseMirror 子元素；
- 不禁用文字选择，不破坏复制 / 粘贴 / 全选；
- 不修改月度报告、AI、同步、导出等无关模块；
- 先验证、再实现、再真机回归。

## 5. 推荐实施路径

### 阶段一：定位验证

先在真机 Android APK 中确认白块来源。

验证场景：

- 普通点击输入位置，观察单光标下坠；
- 长按拖选文字，观察左右选区手柄；
- 中文输入法输入拼音 / 中文组合文本；
- 分别切换纯色浅色主题、深色主题、图片主题；
- 对比 Android App 与手机浏览器 / 桌面网页端。

建议使用 Chrome 远程调试临时改样式，不写入项目文件：

- 临时把 `.ProseMirror` 背景改成红色；
- 临时把编辑页 scrollport 背景改成绿色；
- 临时把 `html/body/#root` 背景改成蓝色；
- 如果白块仍然是白色，说明不是普通 DOM 背景；
- 如果白块跟着某一层变色，说明是该层背景穿透。

### 阶段二：Android 原生 textSelectHandle 修复

优先尝试自定义 Android 原生文字选择手柄。

涉及文件：

```text
android/app/src/main/res/values/styles.xml
android/app/src/main/res/values/colors.xml
android/app/src/main/res/drawable/text_select_handle.xml
android/app/src/main/res/drawable/text_select_handle_left.xml
android/app/src/main/res/drawable/text_select_handle_right.xml
```

计划：

1. 在 `res/drawable/` 新增透明背景的 text select handle drawable；
2. 手柄只绘制小象主色或系统强调色形状；
3. drawable viewport 保持透明，不带白色矩形底；
4. 在 `AppTheme.NoActionBar` 中绑定：

```xml
<item name="android:textSelectHandle">@drawable/text_select_handle</item>
<item name="android:textSelectHandleLeft">@drawable/text_select_handle_left</item>
<item name="android:textSelectHandleRight">@drawable/text_select_handle_right</item>
```

5. 必要时同步 `AppTheme.NoActionBarLaunch`，但优先只改运行态主题，避免影响启动屏。

预期效果：

- 如果白底来自系统默认 text select handle 资源，自定义 drawable 后会直接消失；
- 这是最接近截图问题根因的修复路径。

### 阶段三：编辑页 CSS 局部兜底

如果阶段二后仍然有局部白块，再补编辑页作用域 CSS。

涉及文件：

```text
src/index.css
src/pages/Editor.tsx
```

计划：

1. 给编辑页根节点增加明确作用域类名，例如：

```tsx
<div className="diary-editor-page min-h-screen ...">
```

2. 在 `src/index.css` 中只添加编辑页作用域规则：

```css
.diary-editor-page .ProseMirror,
.diary-editor-page .ProseMirror p,
.diary-editor-page .ProseMirror span {
  background-color: transparent;
  -webkit-tap-highlight-color: transparent;
}
```

3. 不使用高风险全局规则：

```css
.ProseMirror * {
  background: transparent !important;
}
```

原因：这会破坏高亮、引用块、导出样式和用户富文本背景。

### 阶段四：WebView 背景兜底

如果自定义 textSelectHandle 和 CSS 兜底仍无法完全解决，再考虑 WebView 背景策略。

涉及文件：

```text
android/app/src/main/java/com/xiaoxiang/diary/MainActivity.java
android/app/src/main/res/values/colors.xml
android/app/src/main/res/values/styles.xml
```

备选方向：

1. 测试将 WebView 背景设置为透明：

```java
webView.setBackgroundColor(Color.TRANSPARENT);
```

2. 同时检查 window / decorView / root 背景，避免启动白屏或滚动露底；
3. 如果透明 WebView 影响启动或页面切换，再回退为接近主题的默认底色；
4. 对图片主题，WebView 固定底色只能缓解，不能 1:1 还原背景图，因此不作为第一优先级。

## 6. 不建议采用的方案

不建议做以下高风险方案：

```text
1. 自己用 React 画假光标或假选区手柄；
2. 禁用系统文字选择；
3. 禁用长按复制 / 粘贴 / 全选；
4. 全局透明化 ProseMirror 所有子元素背景；
5. 大面积重构 Editor.tsx；
6. 为了解决白块而回退软键盘滚动修复；
7. 顺手修改无关功能。
```

## 7. 回归测试清单

### Android 真机测试

- [ ] 点击正文任意位置，光标和下坠显示正常；
- [ ] 光标下坠周围无白色矩形；
- [ ] 长按文字后，左右选区手柄无白底；
- [ ] 拖动选区手柄不卡顿；
- [ ] 复制 / 粘贴 / 全选菜单正常；
- [ ] 中文输入法组合输入正常；
- [ ] 日文 / 英文输入正常；
- [ ] 回车、删除、撤销、重做正常；
- [ ] 底部编辑工具栏位置正常；
- [ ] 软键盘弹出后滚动正常；
- [ ] 图片主题背景不被白块破坏；
- [ ] 深色纯色主题不被白块破坏；
- [ ] 浅色纯色主题无明显回退。

### Web 端测试

- [ ] 桌面网页端编辑器选区颜色正常；
- [ ] 移动浏览器网页端不出现新的布局问题；
- [ ] 日记高亮、引用块、标题、列表样式正常；
- [ ] 导出图片样式不受影响。

## 8. 建议验证命令

实施后再运行：

```bash
npm run lint
npm run build
npm run android:sync
```

如需发版，再按 Android 发布流程执行打包、安装、真机验证和更新公告。

## 9. 风险与回退

### 主要风险

- 不同 Android 版本 / WebView 版本对 `textSelectHandle` 支持不一致；
- 自定义手柄尺寸不合适，可能导致触摸拖动区域变小；
- 透明 WebView 可能导致启动、切页或滚动时露出 Activity 背景；
- CSS 兜底过强可能破坏高亮和引用样式。

### 回退方案

- 如果自定义 drawable 导致选区拖动异常，先只回退 drawable 绑定；
- 如果 WebView 透明导致闪屏或露底，回退为 `APP_SURFACE_COLOR`；
- 如果 CSS 影响富文本样式，保留 Android drawable 修复，移除 CSS 兜底；
- 每一步都保持小 diff，方便单独回退。

## 10. 推荐优先级总结

```text
优先级 1：Android 原生 textSelectHandle 透明 drawable
优先级 2：编辑页局部 CSS 背景透明兜底
优先级 3：WebView 背景透明 / 背景色兜底
优先级 4：仅在确认为 ProseMirror gapcursor/dropcursor 时处理对应扩展样式
```

最终推荐先实施优先级 1，因为截图中的白色块最像 Android 原生光标 / 选区手柄资源的透明区域合成问题。