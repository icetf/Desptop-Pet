# 桌面健康助手 (DesktopPet) 扩展 API 文档

本系统提供了一套基于 IPC (Inter-Process Communication) 的 API 接口，供第三方开发者或插件编写者调用。通过这些接口，您可以开发自定义的交互逻辑或内容抓取脚本。

## 1. 核心状态通信 (IPC Channels)

### 1.1 触发休息提醒 (`trigger-break`)
向主进程发送强制休息或延迟休息指令。

- **通道**: `trigger-break`
- **参数**: 
  - `type` (String): `'immediate'` | `'snooze'`
- **示例 (Renderer)**:
  ```javascript
  const { ipcRenderer } = require('electron');
  // 立即触发强制黑屏
  ipcRenderer.send('trigger-break', 'immediate');
  // 稍后提醒 (延迟 15 分钟)
  ipcRenderer.send('trigger-break', 'snooze');
  ```

### 1.2 获取系统空闲时间 (`get-idle-time`)
获取用户当前未操作键盘/鼠标的时长（秒）。

- **通道**: `get-idle-time`
- **返回值**: `Promise<Number>`
- **示例 (Renderer)**:
  ```javascript
  const idleSeconds = await ipcRenderer.invoke('get-idle-time');
  console.log(`用户已空闲 ${idleSeconds} 秒`);
  ```

### 1.3 接收提醒事件 (`show-reminder`)
监听主进程发来的定时提醒事件，用于更新前端 UI。

- **通道**: `show-reminder`
- **回调参数**: `message` (String)
- **示例 (Renderer)**:
  ```javascript
  ipcRenderer.on('show-reminder', (event, message) => {
    // 更新宠物气泡状态
    showBubble(message);
  });
  ```

## 2. 本地数据库接口 (SQLite + AES-256)

第三方脚本若需直接操作数据库（Node 环境），可引入主进程的 `db.js` 模块：

```javascript
const dbManager = require('./src/main/db.js');

// 1. 初始化数据库
dbManager.init();

// 2. 加密写入设置
dbManager.setSetting('customKey', 'customValue');

// 3. 解密读取设置
dbManager.getSettings().then(settings => {
  console.log(settings.customKey); // 输出 'customValue'
});

// 4. 工具函数
const ciphertext = dbManager.encrypt('Hello World');
const plaintext = dbManager.decrypt(ciphertext);
```

## 3. 插件开发规范
1. **存放目录**: 所有第三方插件应置于 `src/plugins/` 目录下。
2. **加载机制**: 在 `src/main/index.js` 中使用 `require` 动态加载。
3. **安全性**: 插件在 Node 进程中运行，拥有最高权限，请确保插件来源可靠。为保护用户隐私，插件读写数据库必须通过 `db.js` 提供的加解密封装层。
