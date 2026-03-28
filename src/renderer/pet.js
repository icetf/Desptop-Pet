const { ipcRenderer } = require('electron');
const { pathToFileURL } = require('url');

// State Machine
const PET_STATES = {
  IDLE: 'idle',
  INTERACT: 'interact',
  REMINDER: 'reminder'
};

let currentState = PET_STATES.IDLE;
const petShell = document.getElementById('pet-shell');
const bubble = document.getElementById('bubble');
const petImage = document.getElementById('pet-image');
const defaultMessage = '桌面宠物已启动，点我互动';
const defaultPetSrc = petImage.getAttribute('src');
const petStyleMap = {
  default: {
    filter: 'drop-shadow(0 10px 18px rgba(0, 0, 0, 0.25))',
    bubbleBg: '#ffffff',
    bubbleText: '#5b4300'
  },
  mint: {
    filter: 'hue-rotate(80deg) saturate(0.95) drop-shadow(0 12px 22px rgba(48, 155, 126, 0.28))',
    bubbleBg: '#f2fffb',
    bubbleText: '#1e6250'
  },
  berry: {
    filter: 'hue-rotate(220deg) saturate(1.15) drop-shadow(0 12px 22px rgba(154, 78, 177, 0.28))',
    bubbleBg: '#fff5ff',
    bubbleText: '#7b3a86'
  },
  night: {
    filter: 'grayscale(0.15) hue-rotate(160deg) brightness(0.9) drop-shadow(0 12px 22px rgba(74, 104, 173, 0.3))',
    bubbleBg: '#eef4ff',
    bubbleText: '#26415f'
  }
};
let dragging = false;
let dragStarted = false;
let suppressClick = false;
let dragStartPoint = { x: 0, y: 0 };

// Mock data for jokes/fortunes
const messages = [
  "今天也要元气满满哦！",
  "要不要喝杯水呢？",
  "代码写得怎么样了？",
  "不要总是盯着屏幕看哦！",
  "站起来走动一下吧~"
];

function setState(newState, message = '') {
  currentState = newState;
  
  if (newState === PET_STATES.REMINDER) {
    bubble.innerText = message || "该休息啦！";
    bubble.style.display = 'block';
    petShell.classList.add('with-bubble');
    petImage.style.animation = 'shake 0.5s infinite';
  } else if (newState === PET_STATES.INTERACT) {
    bubble.innerText = message || messages[Math.floor(Math.random() * messages.length)];
    bubble.style.display = 'block';
    petShell.classList.add('with-bubble');
    petImage.style.transform = 'scale(1.05)';
    
    setTimeout(() => {
      setState(PET_STATES.IDLE);
    }, 5000);
  } else {
    bubble.style.display = 'none';
    petShell.classList.remove('with-bubble');
    petImage.style.transform = 'scale(1)';
    petImage.style.animation = 'none';
  }
}

function applyPetStyle(appearance = 'default') {
  const styleName = typeof appearance === 'string' ? appearance : appearance?.styleName || 'default';
  const customPetPath = typeof appearance === 'object' ? appearance?.customPetPath || '' : '';
  const style = petStyleMap[styleName] || petStyleMap.default;
  document.documentElement.style.setProperty('--pet-filter', style.filter);
  document.documentElement.style.setProperty('--bubble-bg', style.bubbleBg);
  document.documentElement.style.setProperty('--bubble-text', style.bubbleText);

  if (styleName === 'custom' && customPetPath) {
    petImage.src = `${pathToFileURL(customPetPath).href}?v=${Date.now()}`;
    return;
  }

  petImage.src = defaultPetSrc;
}

function handlePetClick() {
  if (suppressClick) {
    suppressClick = false;
    return;
  }

  if (currentState !== PET_STATES.REMINDER) {
    setState(PET_STATES.INTERACT);
  } else {
    ipcRenderer.send('trigger-break', 'immediate');
    setState(PET_STATES.IDLE);
  }
}

async function openPetMenu(event) {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }

  suppressClick = true;
  stopDragging();
  await ipcRenderer.invoke('show-pet-context-menu');
}

function stopDragging() {
  if (!dragStarted) {
    return;
  }

  window.removeEventListener('mousemove', handleDragMove);
  window.removeEventListener('mouseup', stopDragging);
  window.removeEventListener('blur', stopDragging);
  petShell.classList.remove('dragging');
  ipcRenderer.send('pet-drag-end');

  if (dragging) {
    suppressClick = true;
  }

  dragging = false;
  dragStarted = false;
}

function handleDragMove(event) {
  const offsetX = Math.abs(event.screenX - dragStartPoint.x);
  const offsetY = Math.abs(event.screenY - dragStartPoint.y);

  if (!dragging && (offsetX > 3 || offsetY > 3)) {
    dragging = true;
    petShell.classList.add('dragging');
  }

  if (dragging) {
    ipcRenderer.send('pet-drag-move', {
      screenX: event.screenX,
      screenY: event.screenY
    });
  }
}

petShell.addEventListener('mousedown', (event) => {
  if (event.button === 2) {
    openPetMenu(event);
    return;
  }

  if (event.button !== 0) {
    return;
  }

  event.preventDefault();
  dragStarted = true;
  dragging = false;
  dragStartPoint = {
    x: event.screenX,
    y: event.screenY
  };

  ipcRenderer.send('pet-drag-start', {
    screenX: event.screenX,
    screenY: event.screenY
  });

  window.addEventListener('mousemove', handleDragMove);
  window.addEventListener('mouseup', stopDragging);
  window.addEventListener('blur', stopDragging);
});

petShell.addEventListener('click', () => {
  handlePetClick();
});

petShell.addEventListener('contextmenu', openPetMenu);
bubble.addEventListener('contextmenu', openPetMenu);
window.addEventListener('contextmenu', openPetMenu);
petImage.addEventListener('error', () => {
  petImage.src = defaultPetSrc;
});

// Periodic idle animation
setInterval(() => {
  if (currentState === PET_STATES.IDLE) {
    petImage.style.transform = 'translateY(-10px)';
    setTimeout(() => {
      petImage.style.transform = 'translateY(0)';
    }, 500);
  }
}, 10000);

// Add CSS animation dynamically
const style = document.createElement('style');
style.innerHTML = `
@keyframes shake {
  0% { transform: translate(1px, 1px) rotate(0deg); }
  10% { transform: translate(-1px, -2px) rotate(-1deg); }
  20% { transform: translate(-3px, 0px) rotate(1deg); }
  30% { transform: translate(3px, 2px) rotate(0deg); }
  40% { transform: translate(1px, -1px) rotate(1deg); }
  50% { transform: translate(-1px, 2px) rotate(-1deg); }
  60% { transform: translate(-3px, 1px) rotate(0deg); }
  70% { transform: translate(3px, 1px) rotate(-1deg); }
  80% { transform: translate(-1px, -1px) rotate(1deg); }
  90% { transform: translate(1px, 2px) rotate(0deg); }
  100% { transform: translate(1px, -2px) rotate(-1deg); }
}
`;
document.head.appendChild(style);

// Example listener from Main process
ipcRenderer.on('show-reminder', (e, msg) => {
  setState(PET_STATES.REMINDER, msg);
});

ipcRenderer.on('apply-pet-style', (event, styleName) => {
  applyPetStyle(styleName);
});

window.addEventListener('load', () => {
  applyPetStyle('default');
  setState(PET_STATES.IDLE, defaultMessage);
});
