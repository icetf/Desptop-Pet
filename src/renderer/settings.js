const { ipcRenderer } = require('electron');
const axios = require('axios');
const path = require('path');
const dialogOverlay = document.getElementById('dialog-overlay');
const dialogMessage = document.getElementById('dialog-message');
const dialogConfirm = document.getElementById('dialog-confirm');
const dialogTitle = document.getElementById('dialog-title');
const uploadCustomPetButton = document.getElementById('upload-custom-pet');
const customPetStatus = document.getElementById('custom-pet-status');
const remindAtInput = document.getElementById('todo-remind-at');
const datetimeTrigger = document.getElementById('datetime-trigger');
const datetimeTriggerLabel = document.getElementById('datetime-trigger-label');
const datetimePopover = document.getElementById('datetime-popover');
const datetimeTitle = document.getElementById('datetime-title');
const calendarGrid = document.getElementById('calendar-grid');
const datetimePrev = document.getElementById('datetime-prev');
const datetimeNext = document.getElementById('datetime-next');
const datetimeHour = document.getElementById('datetime-hour');
const datetimeMinute = document.getElementById('datetime-minute');
const datetimeNow = document.getElementById('datetime-now');
const datetimeApply = document.getElementById('datetime-apply');
const JOKE_ENDPOINT = 'https://v2.jokeapi.dev/joke/Any?type=single';

document.querySelectorAll('.sidebar-item').forEach((item) => {
  item.addEventListener('click', () => {
    document.querySelectorAll('.sidebar-item').forEach((current) => current.classList.remove('active'));
    document.querySelectorAll('.panel').forEach((panel) => panel.classList.remove('active'));

    item.classList.add('active');
    document.getElementById(item.dataset.target).classList.add('active');
  });
});

let todos = [];
let currentCustomPetPath = '';
let selectedReminderDate = null;
let currentCalendarMonth = null;

function openDialog(message, title = '设置已保存') {
  dialogTitle.innerText = title;
  dialogMessage.innerText = message;
  dialogOverlay.classList.add('open');
  dialogOverlay.setAttribute('aria-hidden', 'false');
  dialogConfirm.focus();
}

function closeDialog() {
  dialogOverlay.classList.remove('open');
  dialogOverlay.setAttribute('aria-hidden', 'true');
}

function getPriorityLabel(priority) {
  const map = {
    'important-urgent': '重要紧急',
    'important-not-urgent': '重要不紧急',
    'not-important-urgent': '不重要紧急',
    'not-important-not-urgent': '不重要不紧急'
  };

  return map[priority] || '普通';
}

function formatTodoTime(value) {
  if (!value) {
    return '未设置提醒时间';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '提醒时间无效';
  }

  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function getDefaultReminderTime() {
  const next = new Date(Date.now() + 30 * 60 * 1000);
  next.setSeconds(0, 0);
  return toLocalInputValue(next);
}

function toLocalInputValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function parseReminderValue(value) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function updateReminderInputValue() {
  if (!selectedReminderDate) {
    remindAtInput.value = '';
    datetimeTriggerLabel.innerText = '请选择提醒时间';
    return;
  }

  remindAtInput.value = toLocalInputValue(selectedReminderDate);
  datetimeTriggerLabel.innerText = formatTodoTime(remindAtInput.value);
}

function ensureSelectedReminderDate() {
  if (!selectedReminderDate) {
    selectedReminderDate = parseReminderValue(remindAtInput.value) || parseReminderValue(getDefaultReminderTime()) || new Date();
  }

  if (!currentCalendarMonth) {
    currentCalendarMonth = new Date(selectedReminderDate.getFullYear(), selectedReminderDate.getMonth(), 1);
  }
}

function fillTimeOptions() {
  if (datetimeHour.options.length > 0 && datetimeMinute.options.length > 0) {
    return;
  }

  for (let hour = 0; hour < 24; hour += 1) {
    const option = document.createElement('option');
    option.value = String(hour).padStart(2, '0');
    option.textContent = `${String(hour).padStart(2, '0')} 时`;
    datetimeHour.appendChild(option);
  }

  for (let minute = 0; minute < 60; minute += 1) {
    const option = document.createElement('option');
    option.value = String(minute).padStart(2, '0');
    option.textContent = `${String(minute).padStart(2, '0')} 分`;
    datetimeMinute.appendChild(option);
  }
}

function syncTimeControls() {
  ensureSelectedReminderDate();
  datetimeHour.value = String(selectedReminderDate.getHours()).padStart(2, '0');
  datetimeMinute.value = String(selectedReminderDate.getMinutes()).padStart(2, '0');
}

function isSameDay(left, right) {
  return left.getFullYear() === right.getFullYear()
    && left.getMonth() === right.getMonth()
    && left.getDate() === right.getDate();
}

function renderCalendar() {
  ensureSelectedReminderDate();
  calendarGrid.innerHTML = '';
  datetimeTitle.innerText = `${currentCalendarMonth.getFullYear()}年${String(currentCalendarMonth.getMonth() + 1).padStart(2, '0')}月`;

  const year = currentCalendarMonth.getFullYear();
  const month = currentCalendarMonth.getMonth();
  const firstDay = new Date(year, month, 1);
  const startWeekday = (firstDay.getDay() + 6) % 7;
  const gridStart = new Date(year, month, 1 - startWeekday);
  const today = new Date();

  for (let index = 0; index < 42; index += 1) {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + index);

    const dayButton = document.createElement('button');
    dayButton.type = 'button';
    dayButton.className = 'calendar-day';
    dayButton.textContent = String(date.getDate());

    if (date.getMonth() !== month) {
      dayButton.classList.add('muted');
    }

    if (isSameDay(date, today)) {
      dayButton.classList.add('today');
    }

    if (selectedReminderDate && isSameDay(date, selectedReminderDate)) {
      dayButton.classList.add('selected');
    }

    dayButton.addEventListener('click', () => {
      ensureSelectedReminderDate();
      selectedReminderDate.setFullYear(date.getFullYear(), date.getMonth(), date.getDate());
      updateReminderInputValue();
      renderCalendar();
    });

    calendarGrid.appendChild(dayButton);
  }
}

function openDateTimePopover() {
  ensureSelectedReminderDate();
  syncTimeControls();
  renderCalendar();
  datetimePopover.classList.add('open');
  datetimeTrigger.classList.add('open');
}

function closeDateTimePopover() {
  datetimePopover.classList.remove('open');
  datetimeTrigger.classList.remove('open');
}

function setReminderDateTime(date) {
  selectedReminderDate = new Date(date);
  currentCalendarMonth = new Date(selectedReminderDate.getFullYear(), selectedReminderDate.getMonth(), 1);
  updateReminderInputValue();
  syncTimeControls();
  renderCalendar();
}

function getWeatherEndpoint() {
  const weatherCity = document.getElementById('weather-city').value.trim();

  if (!weatherCity) {
    return 'https://wttr.in/?format=j1';
  }

  return `https://wttr.in/${encodeURIComponent(weatherCity)}?format=j1`;
}

function updateCustomPetStatus() {
  const selectedStyle = document.getElementById('pet-style').value;

  if (!currentCustomPetPath) {
    customPetStatus.innerText = selectedStyle === 'custom'
      ? '当前未上传自定义图片，请先上传 PNG、JPG、GIF、WEBP 或 SVG。'
      : '当前未启用自定义图片，将继续使用内置笑脸样式。';
    return;
  }

  const fileName = path.basename(currentCustomPetPath);
  customPetStatus.innerText = selectedStyle === 'custom'
    ? `当前已启用自定义图片：${fileName}`
    : `已上传自定义图片：${fileName}，切换到“自定义上传”并保存后即可生效。`;
}

function normalizeTodo(todo) {
  return {
    id: todo.id || `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    title: String(todo.title || '').trim(),
    priority: todo.priority || 'important-urgent',
    status: todo.status === 'completed' ? 'completed' : 'pending',
    remindAt: todo.remindAt || '',
    reminderSent: Boolean(todo.reminderSent),
    remindedAt: todo.remindedAt || ''
  };
}

async function persistTodos() {
  todos = await ipcRenderer.invoke('save-todos', todos.map((todo) => normalizeTodo(todo)));
}

function renderTodos() {
  const list = document.getElementById('todo-list');
  const count = document.getElementById('todo-count');
  list.innerHTML = '';
  count.innerText = String(todos.length);

  if (todos.length === 0) {
    const emptyState = document.createElement('li');
    emptyState.className = 'empty-state';
    emptyState.innerHTML = '还没有待办事项。<br>添加一条任务并设置提醒时间，到点后桌宠会主动提醒你。';
    list.appendChild(emptyState);
    return;
  }

  todos.forEach((todo, index) => {
    const li = document.createElement('li');
    li.className = `todo-item ${todo.status === 'completed' ? 'completed' : ''}`;
    li.innerHTML = `
      <div class="todo-main">
        <span class="todo-status"></span>
        <div class="todo-copy">
          <p class="todo-title">${escapeHtml(todo.title)}</p>
          <div class="todo-meta">
            <span class="priority-badge ${todo.priority}">${getPriorityLabel(todo.priority)}</span>
            <span>${todo.status === 'completed' ? '已完成' : '进行中'}</span>
            <span class="todo-remind">${formatTodoTime(todo.remindAt)}</span>
          </div>
        </div>
      </div>
      <div class="todo-actions">
        <button class="secondary-button" onclick="toggleTodo(${index})">${todo.status === 'completed' ? '撤销' : '完成'}</button>
        <button class="ghost-button" onclick="deleteTodo(${index})">删除</button>
      </div>
    `;
    list.appendChild(li);
  });
}

document.getElementById('new-todo').addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    window.addTodo();
  }
});

datetimeTrigger.addEventListener('click', () => {
  if (datetimePopover.classList.contains('open')) {
    closeDateTimePopover();
    return;
  }

  openDateTimePopover();
});

datetimePrev.addEventListener('click', () => {
  ensureSelectedReminderDate();
  currentCalendarMonth = new Date(currentCalendarMonth.getFullYear(), currentCalendarMonth.getMonth() - 1, 1);
  renderCalendar();
});

datetimeNext.addEventListener('click', () => {
  ensureSelectedReminderDate();
  currentCalendarMonth = new Date(currentCalendarMonth.getFullYear(), currentCalendarMonth.getMonth() + 1, 1);
  renderCalendar();
});

datetimeHour.addEventListener('change', () => {
  ensureSelectedReminderDate();
  selectedReminderDate.setHours(parseInt(datetimeHour.value, 10) || 0);
  updateReminderInputValue();
});

datetimeMinute.addEventListener('change', () => {
  ensureSelectedReminderDate();
  selectedReminderDate.setMinutes(parseInt(datetimeMinute.value, 10) || 0);
  updateReminderInputValue();
});

datetimeNow.addEventListener('click', () => {
  const next = parseReminderValue(getDefaultReminderTime()) || new Date();
  setReminderDateTime(next);
});

datetimeApply.addEventListener('click', () => {
  updateReminderInputValue();
  closeDateTimePopover();
});

window.addTodo = async () => {
  const input = document.getElementById('new-todo');
  const priority = document.getElementById('todo-priority').value;
  const remindAt = document.getElementById('todo-remind-at').value;

  if (!input.value.trim()) {
    return;
  }

  todos.unshift(normalizeTodo({
    title: input.value.trim(),
    priority,
    status: 'pending',
    remindAt,
    reminderSent: false
  }));

  await persistTodos();
  input.value = '';
  setReminderDateTime(parseReminderValue(getDefaultReminderTime()) || new Date());
  closeDateTimePopover();
  renderTodos();
};

window.toggleTodo = async (index) => {
  const current = todos[index];

  if (!current) {
    return;
  }

  const nextStatus = current.status === 'completed' ? 'pending' : 'completed';
  todos[index] = normalizeTodo({
    ...current,
    status: nextStatus,
    reminderSent: nextStatus === 'completed' ? true : false,
    remindedAt: nextStatus === 'completed' ? current.remindedAt || new Date().toISOString() : ''
  });

  await persistTodos();
  renderTodos();
};

window.deleteTodo = async (index) => {
  todos.splice(index, 1);
  await persistTodos();
  renderTodos();
};

window.fetchContent = async () => {
  document.getElementById('weather-text').innerText = '联网搜索天气中...';
  document.getElementById('joke-text').innerText = '联网加载笑话中...';

  const [weatherResult, jokeResult] = await Promise.allSettled([
    axios.get(getWeatherEndpoint(), {
      timeout: 10000
    }),
    axios.get(JOKE_ENDPOINT, {
      timeout: 10000
    })
  ]);

  if (weatherResult.status === 'fulfilled') {
    const weather = weatherResult.value.data || {};
    const areaName = weather.nearest_area?.[0]?.areaName?.[0]?.value || '本地';
    const current = weather.current_condition?.[0] || {};
    const weatherDesc = current.lang_zh?.[0]?.value || current.weatherDesc?.[0]?.value || '天气未知';
    const temperature = current.temp_C ? `${current.temp_C}°C` : '温度未知';
    const feelsLike = current.FeelsLikeC ? `，体感 ${current.FeelsLikeC}°C` : '';
    document.getElementById('weather-text').innerText = `${areaName} · ${weatherDesc} · ${temperature}${feelsLike}`;
  } else {
    console.error('Failed to fetch weather:', weatherResult.reason);
    document.getElementById('weather-text').innerText = '天气联网获取失败';
  }

  if (jokeResult.status === 'fulfilled') {
    document.getElementById('joke-text').innerText = jokeResult.value.data.joke || '暂无笑话';
  } else {
    console.error('Failed to fetch joke:', jokeResult.reason);
    document.getElementById('joke-text').innerText = '笑话加载失败';
  }
};

window.saveSettings = async () => {
  const autoStart = document.getElementById('auto-start').checked;
  const breakInterval = document.getElementById('break-interval').value;
  const petStyle = document.getElementById('pet-style').value;
  const weatherCity = document.getElementById('weather-city').value.trim();

  if (petStyle === 'custom' && !currentCustomPetPath) {
    openDialog('请先上传一张桌宠图片，再保存为自定义样式。', '需要上传图片');
    return;
  }

  await ipcRenderer.invoke('save-settings', {
    autoStart,
    breakInterval,
    petStyle,
    customPetPath: currentCustomPetPath,
    weatherCity
  });

  openDialog(`开机自启动：${autoStart ? '开启' : '关闭'}\n休息提醒：${breakInterval} 分钟\n天气城市：${weatherCity || '自动识别'}\n桌宠样式：${document.getElementById('pet-style').selectedOptions[0].textContent}`);
  fetchContent();
};

uploadCustomPetButton.addEventListener('click', async () => {
  const result = await ipcRenderer.invoke('import-custom-pet');

  if (!result || result.canceled) {
    return;
  }

  currentCustomPetPath = result.customPetPath || '';
  document.getElementById('pet-style').value = 'custom';
  updateCustomPetStatus();
  openDialog(`已导入图片：${result.fileName}\n保存设置后，桌宠会切换为你上传的样式。`, '上传成功');
});

document.getElementById('pet-style').addEventListener('change', () => {
  updateCustomPetStatus();
});

dialogConfirm.addEventListener('click', () => {
  closeDialog();
});

dialogOverlay.addEventListener('click', (event) => {
  if (event.target === dialogOverlay) {
    closeDialog();
  }
});

window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && dialogOverlay.classList.contains('open')) {
    closeDialog();
  }

  if (event.key === 'Escape' && datetimePopover.classList.contains('open')) {
    closeDateTimePopover();
  }
});

document.addEventListener('click', (event) => {
  if (!event.target.closest('.datetime-picker')) {
    closeDateTimePopover();
  }
});

async function loadTodos() {
  const storedTodos = await ipcRenderer.invoke('get-todos');
  todos = Array.isArray(storedTodos) ? storedTodos.map((todo) => normalizeTodo(todo)) : [];
  renderTodos();
}

async function loadSettings() {
  const settings = await ipcRenderer.invoke('get-settings');
  document.getElementById('auto-start').checked = settings.autoStart === 'true';
  document.getElementById('break-interval').value = settings.breakInterval || '60';
  document.getElementById('weather-city').value = settings.weatherCity || '';
  document.getElementById('pet-style').value = settings.petStyle || 'default';
  currentCustomPetPath = settings.customPetPath || '';
  updateCustomPetStatus();
}

async function init() {
  fillTimeOptions();
  setReminderDateTime(parseReminderValue(getDefaultReminderTime()) || new Date());
  await Promise.all([loadTodos(), loadSettings()]);
  fetchContent();
}

init();
