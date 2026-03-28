const { powerMonitor } = require('electron');

let intervalId = null;
let breakInterval = 60;
let isBreaking = false;
let triggerBreakHandler = null;

function init(dbManager, triggerBreakCb) {
  triggerBreakHandler = triggerBreakCb;

  dbManager.getSettings().then(settings => {
    if (settings && settings.breakInterval) {
      breakInterval = parseInt(settings.breakInterval, 10) || 60;
    }
    startMonitoring();
  });
}

function startMonitoring() {
  if (intervalId) clearInterval(intervalId);

  intervalId = setInterval(() => {
    if (isBreaking) return;

    const idleTime = powerMonitor.getSystemIdleTime();

    if (idleTime < 5 * 60 && triggerBreakHandler) {
      triggerBreakHandler('time-to-rest');
    }
  }, breakInterval * 60 * 1000);
}

function setBreakingState(state) {
  isBreaking = state;
}

function updateInterval(newInterval) {
  breakInterval = parseInt(newInterval, 10) || 60;
  startMonitoring();
}

module.exports = {
  init,
  setBreakingState,
  updateInterval
};
