const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

const PORT = process.env.PORT || 3000;

// Serve static files
app.use(express.static('public'));

// Timer state
let timerState = {
  totalSeconds: 0,
  remainingSeconds: 0,
  isRunning: false,
  timerName: 'Simulation Timer',
  message: { text: '', color: 'black' },
  isBlackedOut: false
};

// Server-side timer interval
let serverTimerInterval = null;

function startServerTimer() {
  if (serverTimerInterval) {
    clearInterval(serverTimerInterval);
  }

  serverTimerInterval = setInterval(() => {
    if (timerState.isRunning && timerState.remainingSeconds > 0) {
      timerState.remainingSeconds--;
      io.emit('timerState', timerState);
    } else if (timerState.remainingSeconds <= 0) {
      timerState.isRunning = false;
      clearInterval(serverTimerInterval);
      serverTimerInterval = null;
      io.emit('timerState', timerState);
    }
  }, 1000);
}

function stopServerTimer() {
  if (serverTimerInterval) {
    clearInterval(serverTimerInterval);
    serverTimerInterval = null;
  }
}

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/controller', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'controller.html'));
});

app.get('/endpoint', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'endpoint.html'));
});

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  // Send current state to newly connected client
  socket.emit('timerState', timerState);

  // Handle password authentication
  socket.on('authenticate', (password) => {
    const correctPassword = process.env.CONTROLLER_PASSWORD || 'Belmont1900!';
    const isAuthenticated = password === correctPassword;
    socket.emit('authResult', isAuthenticated);
  });

  // Handle timer controls from controller
  socket.on('setTimer', (seconds) => {
    timerState.totalSeconds = seconds;
    timerState.remainingSeconds = seconds;
    timerState.isRunning = false;
    io.emit('timerState', timerState);
  });

  socket.on('startTimer', () => {
    timerState.isRunning = true;
    startServerTimer();
    io.emit('timerState', timerState);
  });

  socket.on('pauseTimer', () => {
    timerState.isRunning = false;
    stopServerTimer();
    io.emit('timerState', timerState);
  });

  socket.on('resetTimer', () => {
    timerState.remainingSeconds = timerState.totalSeconds;
    timerState.isRunning = false;
    stopServerTimer();
    io.emit('timerState', timerState);
  });

  socket.on('updateTimerName', (name) => {
    timerState.timerName = name;
    io.emit('timerState', timerState);
  });

  socket.on('sendMessage', (messageData) => {
    timerState.message = messageData;
    io.emit('timerState', timerState);
  });

  socket.on('clearMessage', () => {
    timerState.message = { text: '', color: 'black' };
    io.emit('timerState', timerState);
  });

  socket.on('toggleBlackout', (isBlackedOut) => {
    timerState.isBlackedOut = isBlackedOut;
    io.emit('timerState', timerState);
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
