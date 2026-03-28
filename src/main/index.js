const { app, BrowserWindow, Tray, Menu, Notification, dialog, ipcMain, powerMonitor, screen } = require('electron');
const fs = require('fs');
const path = require('path');
const dbManager = require('./db');
const reminder = require('./reminder');

let petWindow = null;
let tray = null;
let reminderWindow = null;
let settingsWindow = null;
let petDragState = null;
let todoReminderTimer = null;
const PET_VISIBLE_INSET = {
  left: 20,
  right: 20,
  top: 30,
  bottom: 30
};

const localUserDataPath = path.join(app.getAppPath(), '.user-data');

app.setPath('userData', localUserDataPath);
app.disableHardwareAcceleration();

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (petWindow) {
      if (petWindow.isMinimized()) petWindow.restore();
      petWindow.focus();
    }
  });

  app.whenReady().then(() => {
    // Initialize DB
    dbManager.init();

    createPetWindow();
    createTray();
    setupAutoStart();
    setupIpcHandlers();
    
    reminder.init(dbManager, (type) => {
      if (petWindow) {
        petWindow.webContents.send('show-reminder', '该休息啦！');
      }
    });

    startTodoReminderWatcher();
  });
}

function createPetWindow() {
  const display = screen.getPrimaryDisplay();
  const windowWidth = 220;
  const windowHeight = 240;
  const x = Math.max(display.workArea.x, display.workArea.x + display.workArea.width - windowWidth - 24);
  const y = Math.max(display.workArea.y, display.workArea.y + display.workArea.height - windowHeight - 24);

  petWindow = new BrowserWindow({
    width: windowWidth,
    height: windowHeight,
    x,
    y,
    show: false,
    backgroundColor: '#00000000',
    frame: false,
    thickFrame: false,
    roundedCorners: false,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    transparent: true,
    hasShadow: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  petWindow.loadFile(path.join(__dirname, '../renderer/pet.html'));
  petWindow.webContents.on('did-finish-load', async () => {
    const settings = await dbManager.getSettings();
    petWindow.webContents.send('apply-pet-style', getPetAppearancePayload(settings));
  });
  petWindow.once('ready-to-show', () => {
    petWindow.show();
  });

  petWindow.on('move', () => {
    if (petDragState && petDragState.isDragging) {
      return;
    }

    keepPetWindowInBounds();
  });
}

function createTray() {
  tray = new Tray(path.join(__dirname, '../assets/icon.png')); // Ensure this file exists
  const contextMenu = Menu.buildFromTemplate([
    { label: '显示/隐藏宠物', click: () => {
      petWindow.isVisible() ? petWindow.hide() : petWindow.show();
    }},
    { label: '设置', click: () => openSettings() },
    { type: 'separator' },
    { label: '退出', click: () => app.quit() }
  ]);
  tray.setToolTip('桌面健康助手');
  tray.setContextMenu(contextMenu);
}

function openSettings() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.show();
    settingsWindow.focus();
    return;
  }

  settingsWindow = new BrowserWindow({
    width: 800,
    height: 600,
    minWidth: 720,
    minHeight: 520,
    autoHideMenuBar: true,
    backgroundColor: '#FFF9EE',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  settingsWindow.loadFile(path.join(__dirname, '../renderer/settings.html'));
  settingsWindow.on('closed', () => {
    settingsWindow = null;
  });
}

function setupAutoStart() {
  dbManager.getSettings().then((settings) => {
    const openAtLogin = settings && settings.autoStart === 'true';
    updateAutoStart(openAtLogin);
  });
}

function setupIpcHandlers() {
  ipcMain.on('open-settings', () => {
    openSettings();
  });

  ipcMain.handle('show-pet-context-menu', () => {
    showPetContextMenu();
  });

  ipcMain.handle('get-pet-menu-state', () => {
    return {
      isAlwaysOnTop: petWindow ? petWindow.isAlwaysOnTop() : false
    };
  });

  ipcMain.on('toggle-pet-always-on-top', () => {
    togglePetAlwaysOnTop();
  });

  ipcMain.on('hide-pet', () => {
    if (petWindow) {
      petWindow.hide();
    }
  });

  ipcMain.on('quit-app', () => {
    app.quit();
  });

  ipcMain.on('pet-drag-start', (event, payload) => {
    if (!petWindow) {
      return;
    }

    const [x, y] = petWindow.getPosition();
    petDragState = {
      isDragging: true,
      windowX: x,
      windowY: y,
      startMouseX: payload.screenX,
      startMouseY: payload.screenY
    };
  });

  ipcMain.on('pet-drag-move', (event, payload) => {
    if (!petWindow || !petDragState || !petDragState.isDragging) {
      return;
    }

    const nextX = petDragState.windowX + (payload.screenX - petDragState.startMouseX);
    const nextY = petDragState.windowY + (payload.screenY - petDragState.startMouseY);
    const bounds = constrainToDisplay(nextX, nextY);
    petWindow.setPosition(bounds.x, bounds.y);
  });

  ipcMain.on('pet-drag-end', () => {
    if (!petWindow) {
      return;
    }

    petDragState = null;
    snapPetWindowToEdge();
  });

  ipcMain.on('trigger-break', (event, type) => {
    if (type === 'immediate') {
      triggerBlackScreen();
    } else if (type === 'snooze') {
      // delay 15 mins
      setTimeout(() => {
        triggerBlackScreen();
      }, 15 * 60 * 1000);
    }
  });

  ipcMain.handle('get-idle-time', () => {
    return powerMonitor.getSystemIdleTime();
  });

  ipcMain.handle('get-settings', async () => {
    return dbManager.getSettings();
  });

  ipcMain.handle('save-settings', async (event, payload) => {
    const nextSettings = {
      autoStart: payload.autoStart ? 'true' : 'false',
      breakInterval: String(payload.breakInterval || 60),
      petStyle: payload.petStyle || 'default',
      customPetPath: payload.customPetPath || '',
      weatherCity: (payload.weatherCity || '').trim()
    };

    Object.entries(nextSettings).forEach(([key, value]) => {
      dbManager.setSetting(key, value);
    });

    updateAutoStart(nextSettings.autoStart === 'true');
    reminder.updateInterval(parseInt(nextSettings.breakInterval, 10) || 60);

    if (petWindow && !petWindow.isDestroyed()) {
      petWindow.webContents.send('apply-pet-style', getPetAppearancePayload(nextSettings));
    }

    return dbManager.getSettings();
  });

  ipcMain.handle('get-todos', () => {
    return normalizeTodos(dbManager.getTodos());
  });

  ipcMain.handle('save-todos', (event, payload) => {
    const todos = normalizeTodos(payload);
    dbManager.saveTodos(todos);
    return todos;
  });

  ipcMain.handle('import-custom-pet', async () => {
    return importCustomPetAsset();
  });
}

function updateAutoStart(openAtLogin) {
  app.setLoginItemSettings({
    openAtLogin,
    path: app.getPath('exe')
  });
}

function togglePetAlwaysOnTop() {
  if (!petWindow) {
    return;
  }

  petWindow.setAlwaysOnTop(!petWindow.isAlwaysOnTop());
}

function showPetContextMenu() {
  if (!petWindow || petWindow.isDestroyed()) {
    return;
  }

  const contextMenu = Menu.buildFromTemplate([
    { label: '打开设置', click: () => openSettings() },
    {
      label: petWindow.isAlwaysOnTop() ? '取消置顶' : '保持置顶',
      click: () => togglePetAlwaysOnTop()
    },
    { type: 'separator' },
    { label: '隐藏宠物', click: () => petWindow.hide() },
    { label: '退出', click: () => app.quit() }
  ]);

  contextMenu.popup({
    window: petWindow
  });
}

function getPetAppearancePayload(settings) {
  return {
    styleName: settings?.petStyle || 'default',
    customPetPath: settings?.customPetPath || ''
  };
}

async function importCustomPetAsset() {
  const ownerWindow = settingsWindow && !settingsWindow.isDestroyed()
    ? settingsWindow
    : petWindow;
  const result = await dialog.showOpenDialog(ownerWindow, {
    title: '选择桌宠图片',
    properties: ['openFile'],
    filters: [
      {
        name: '图片文件',
        extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg']
      }
    ]
  });

  if (result.canceled || !result.filePaths[0]) {
    return {
      canceled: true
    };
  }

  const sourcePath = result.filePaths[0];
  const extension = path.extname(sourcePath).toLowerCase();
  const customPetDir = path.join(localUserDataPath, 'custom-pets');
  const targetPath = path.join(customPetDir, `custom-pet${extension}`);

  await fs.promises.mkdir(customPetDir, { recursive: true });
  await fs.promises.copyFile(sourcePath, targetPath);

  return {
    canceled: false,
    customPetPath: targetPath,
    fileName: path.basename(sourcePath)
  };
}

function normalizeTodos(todos) {
  if (!Array.isArray(todos)) {
    return [];
  }

  return todos.map((todo) => {
    const normalized = {
      id: todo.id || `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      title: String(todo.title || '').trim(),
      priority: todo.priority || 'important-urgent',
      status: todo.status === 'completed' ? 'completed' : 'pending',
      remindAt: todo.remindAt || '',
      reminderSent: Boolean(todo.reminderSent),
      remindedAt: todo.remindedAt || ''
    };

    if (!normalized.remindAt) {
      normalized.reminderSent = false;
      normalized.remindedAt = '';
    }

    if (normalized.status === 'completed') {
      normalized.reminderSent = true;
    }

    return normalized;
  }).filter((todo) => todo.title);
}

function startTodoReminderWatcher() {
  if (todoReminderTimer) {
    clearInterval(todoReminderTimer);
  }

  checkTodoReminders();
  todoReminderTimer = setInterval(checkTodoReminders, 20000);
}

function checkTodoReminders() {
  const todos = normalizeTodos(dbManager.getTodos());
  const now = Date.now();
  const dueTodos = [];
  let changed = false;

  const nextTodos = todos.map((todo) => {
    const remindAtTime = todo.remindAt ? new Date(todo.remindAt).getTime() : NaN;

    if (
      todo.status !== 'completed' &&
      !todo.reminderSent &&
      Number.isFinite(remindAtTime) &&
      remindAtTime <= now
    ) {
      changed = true;
      dueTodos.push(todo);
      return {
        ...todo,
        reminderSent: true,
        remindedAt: new Date().toISOString()
      };
    }

    return todo;
  });

  if (changed) {
    dbManager.saveTodos(nextTodos);
    dueTodos.forEach((todo) => {
      notifyTodoReminder(todo);
    });
  }
}

function notifyTodoReminder(todo) {
  const message = `待办提醒：${todo.title}`;

  if (petWindow && !petWindow.isDestroyed()) {
    if (!petWindow.isVisible()) {
      petWindow.show();
    }

    petWindow.webContents.send('show-reminder', message);
  }

  if (Notification.isSupported()) {
    new Notification({
      title: '桌宠待办提醒',
      body: todo.remindAt ? `${todo.title}\n提醒时间：${formatReminderTime(todo.remindAt)}` : todo.title
    }).show();
  }
}

function formatReminderTime(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function constrainToDisplay(x, y) {
  const targetDisplay = screen.getDisplayNearestPoint({ x, y });
  const area = targetDisplay.workArea;
  const bounds = petWindow.getBounds();
  const minX = area.x - PET_VISIBLE_INSET.left;
  const maxX = area.x + area.width - (bounds.width - PET_VISIBLE_INSET.right);
  const minY = area.y - PET_VISIBLE_INSET.top;
  const maxY = area.y + area.height - (bounds.height - PET_VISIBLE_INSET.bottom);

  return {
    x: Math.round(Math.min(Math.max(x, minX), maxX)),
    y: Math.round(Math.min(Math.max(y, minY), maxY))
  };
}

function snapPetWindowToEdge() {
  if (!petWindow) {
    return;
  }

  const bounds = petWindow.getBounds();
  const targetDisplay = screen.getDisplayNearestPoint({ x: bounds.x, y: bounds.y });
  const area = targetDisplay.workArea;
  const threshold = 24;

  const distances = {
    left: Math.abs(bounds.x - area.x),
    right: Math.abs(area.x + area.width - (bounds.x + bounds.width)),
    top: Math.abs(bounds.y - area.y),
    bottom: Math.abs(area.y + area.height - (bounds.y + bounds.height))
  };

  const nearestEdge = Object.entries(distances).sort((a, b) => a[1] - b[1])[0];
  const nextBounds = { x: bounds.x, y: bounds.y };

  if (nearestEdge[1] <= threshold) {
    if (nearestEdge[0] === 'left') {
      nextBounds.x = area.x;
    }

    if (nearestEdge[0] === 'right') {
      nextBounds.x = area.x + area.width - bounds.width;
    }

    if (nearestEdge[0] === 'top') {
      nextBounds.y = area.y;
    }

    if (nearestEdge[0] === 'bottom') {
      nextBounds.y = area.y + area.height - bounds.height;
    }
  }

  const constrained = constrainToDisplay(nextBounds.x, nextBounds.y);
  petWindow.setPosition(constrained.x, constrained.y);
}

function keepPetWindowInBounds() {
  if (!petWindow) {
    return;
  }

  const bounds = petWindow.getBounds();
  const constrained = constrainToDisplay(bounds.x, bounds.y);

  if (constrained.x !== bounds.x || constrained.y !== bounds.y) {
    petWindow.setPosition(constrained.x, constrained.y);
  }
}

function triggerBlackScreen() {
  if (reminderWindow) return;
  
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.workAreaSize;

  reminderWindow = new BrowserWindow({
    width,
    height,
    frame: false,
    alwaysOnTop: true,
    fullscreen: true,
    skipTaskbar: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  reminderWindow.loadFile(path.join(__dirname, '../renderer/break.html'));
  
  // Prevent closing easily
  reminderWindow.on('close', (e) => {
    // Only allow close if the break is over
    if (!reminderWindow.isClosableAllowed) {
      e.preventDefault();
    }
  });

  setTimeout(() => {
    reminderWindow.isClosableAllowed = true;
    reminderWindow.close();
    reminderWindow = null;
  }, 5 * 60 * 1000); // 5 minutes break
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
