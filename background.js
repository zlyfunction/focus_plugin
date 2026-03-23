/**
 * Focus Reader - Background Service Worker
 * 负责处理安装事件和默认状态初始化
 */

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  if (reason === 'install') {
    // 首次安装：写入默认设置
    await chrome.storage.local.set({
      focusReaderEnabled: true,
      focusReaderSettings: {
        mode: 'both',
        color: 'yellow',
        opacity: 'medium',
      },
    });
  }
});
