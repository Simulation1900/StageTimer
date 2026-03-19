const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

const PORT = process.env.PORT || 3000;

app.use(express.static('public'));

const TIMER_IDS = ['timer-1', 'timer-2', 'timer-3'];

function createTimerState(name) {
  return {
    totalSeconds: 0,
    remainingSeconds: 0,
    isRunning: false,
    timerName: name,
    message: { text: '', color: 'black' },
    isBlackedOut: false
  };
}

const timers = {
  'timer-1': createTimerState('Timer 1'),
  'timer-2': createTimerState('Timer 2'),
  'timer-3': createTimerState('Timer 3')
};

const serverIntervals = {
  'timer-1': null,
  'timer-2': null,
  'timer-3': null
};

function broadcast(timerId) {
  io.to(timerId).emit('timerState', { timerId, state: timers[timerId] });
}

function startServerTimer(timerId) {
  if (serverIntervals[timerId]) clearInterval(serverIntervals[timerId]);
  serverIntervals[timerId] = setInterval(() => {
    const timer = timers[timerId];
    if (timer.isRunning && timer.remainingSeconds > 0) {
      timer.remainingSeconds--;
      broadcast(timerId);
    } else if (timer.remainingSeconds <= 0) {
      timer.isRunning = false;
      clearInterval(serverIntervals[timerId]);
      serverIntervals[timerId] = null;
      broadcast(timerId);
    }
  }, 1000);
}

function stopServerTimer(timerId) {
  if (serverIntervals[timerId]) {
    clearInterval(serverIntervals[timerId]);
    serverIntervals[timerId] = null;
  }
}

// Routes
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/controller', (req, res) => res.sendFile(path.join(__dirname, 'public', 'controller.html')));
app.get('/endpoint', (req, res) => res.sendFile(path.join(__dirname, 'public', 'endpoint.html')));
app.get('/director', (req, res) => res.sendFile(path.join(__dirname, 'public', 'director.html')));

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  // Send all current timer states on connection
  socket.emit('allTimerStates', timers);

  socket.on('authenticate', (password) => {
    const correctPassword = process.env.CONTROLLER_PASSWORD || 'Belmont1900!';
    socket.emit('authResult', password === correctPassword);
  });

  // Room management — clients subscribe to specific timer(s)
  socket.on('joinTimer', (timerId) => {
    if (TIMER_IDS.includes(timerId)) socket.join(timerId);
  });

  socket.on('leaveTimer', (timerId) => {
    if (TIMER_IDS.includes(timerId)) socket.leave(timerId);
  });

  socket.on('joinAll', () => {
    TIMER_IDS.forEach(id => socket.join(id));
  });

  // Timer control events — all require { timerId }
  socket.on('setTimer', ({ timerId, seconds }) => {
    if (!TIMER_IDS.includes(timerId)) return;
    timers[timerId].totalSeconds = seconds;
    timers[timerId].remainingSeconds = seconds;
    timers[timerId].isRunning = false;
    stopServerTimer(timerId);
    broadcast(timerId);
  });

  socket.on('startTimer', ({ timerId }) => {
    if (!TIMER_IDS.includes(timerId)) return;
    timers[timerId].isRunning = true;
    startServerTimer(timerId);
    broadcast(timerId);
  });

  socket.on('pauseTimer', ({ timerId }) => {
    if (!TIMER_IDS.includes(timerId)) return;
    timers[timerId].isRunning = false;
    stopServerTimer(timerId);
    broadcast(timerId);
  });

  socket.on('resetTimer', ({ timerId }) => {
    if (!TIMER_IDS.includes(timerId)) return;
    timers[timerId].remainingSeconds = timers[timerId].totalSeconds;
    timers[timerId].isRunning = false;
    stopServerTimer(timerId);
    broadcast(timerId);
  });

  socket.on('updateTimerName', ({ timerId, name }) => {
    if (!TIMER_IDS.includes(timerId)) return;
    timers[timerId].timerName = name;
    broadcast(timerId);
  });

  socket.on('sendMessage', ({ timerId, text, color }) => {
    if (!TIMER_IDS.includes(timerId)) return;
    timers[timerId].message = { text, color };
    broadcast(timerId);
  });

  socket.on('clearMessage', ({ timerId }) => {
    if (!TIMER_IDS.includes(timerId)) return;
    timers[timerId].message = { text: '', color: 'black' };
    broadcast(timerId);
  });

  socket.on('toggleBlackout', ({ timerId, isBlackedOut }) => {
    if (!TIMER_IDS.includes(timerId)) return;
    timers[timerId].isBlackedOut = isBlackedOut;
    broadcast(timerId);
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
