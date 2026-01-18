// server.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  pingInterval: 25000,
  pingTimeout: 60000,
  transports: ['websocket', 'polling']
});

const PORT = process.env.PORT || 10000;

console.log(`MergedTalk Server starting on port ${PORT}...`);

// Store channels and users
const channels = {
  exo1: {},
  apollo2: {},
  luna3: {},
  nova4: {},
  cosmo5: {}
};

// Password for cosmo5
const PASSWORDS = {
  cosmo5: "1016"
};

// Track socket connections
const connections = new Map();

io.on("connection", socket => {
  console.log(`New socket connected: ${socket.id} (Total: ${connections.size + 1})`);
  connections.set(socket.id, { connectedAt: Date.now() });

  // User joins a channel
  socket.on("joinChannel", ({ channel, name, photo, password }) => {
    console.log(`joinChannel: ${socket.id} wants to join ${channel} as ${name}`);
    
    // Validate channel exists
    if (!channels[channel]) {
      socket.emit("error", { message: "Channel does not exist" });
      return;
    }

    // Password check for cosmo5
    if (channel === "cosmo5") {
      if (password !== PASSWORDS.cosmo5) {
        console.log(`Password failed for ${socket.id} on cosmo5`);
        socket.emit("password-failed");
        return;
      }
      console.log(`Password accepted for ${socket.id} on cosmo5`);
    }

    // Leave previous channel if any
    if (socket.channel) {
      const oldChannel = socket.channel;
      if (channels[oldChannel] && channels[oldChannel][socket.id]) {
        delete channels[oldChannel][socket.id];
        socket.to(oldChannel).emit("user-left", { socketId: socket.id });
        console.log(`${socket.userName} left channel: ${oldChannel}`);
      }
      socket.leave(oldChannel);
    }

    // Join new channel
    socket.join(channel);
    socket.channel = channel;
    socket.userName = name || "Anonymous";
    socket.userPhoto = photo || null;

    // Store user in channel
    channels[channel][socket.id] = { 
      name: socket.userName, 
      photo: socket.userPhoto,
      joinedAt: Date.now()
    };

    // Notify all others in the channel
    socket.to(channel).emit("user-joined", {
      socketId: socket.id,
      name: socket.userName,
      photo: socket.userPhoto
    });

    // Send all existing users to the new user
    const existingUsers = [];
    for (let id in channels[channel]) {
      if (id !== socket.id) {
        existingUsers.push({
          socketId: id,
          name: channels[channel][id].name,
          photo: channels[channel][id].photo
        });
      }
    }

    // Send existing users in batches to avoid message size issues
    if (existingUsers.length > 0) {
      console.log(`Sending ${existingUsers.length} existing users to ${socket.id}`);
      socket.emit("existing-users", existingUsers);
    }

    console.log(`${socket.userName} (${socket.id}) joined channel: ${channel} (Total in channel: ${Object.keys(channels[channel]).length})`);
  });

  // Handle existing-users event (frontend should handle this)
  socket.on("existing-users", (users) => {
    // This is just for logging, frontend should handle the event
    console.log(`Received ${users.length} existing users`);
  });

  // WebRTC signaling
  socket.on("signal", ({ to, data }) => {
    if (!to) {
      console.log(`Invalid signal: missing 'to' field from ${socket.id}`);
      return;
    }
    
    const targetSocket = io.sockets.sockets.get(to);
    if (targetSocket) {
      // Log signal type for debugging
      const signalType = data.sdp ? `${data.sdp.type} SDP` : "ICE candidate";
      console.log(`Signal from ${socket.id} to ${to}: ${signalType}`);
      
      io.to(to).emit("signal", { from: socket.id, data });
    } else {
      console.log(`Target socket ${to} not found for signal from ${socket.id}`);
    }
  });

  // User leaves a channel
  socket.on("leaveChannel", ({ channel }) => {
    console.log(`leaveChannel: ${socket.id} leaving ${channel}`);
    
    if (channel && channels[channel] && channels[channel][socket.id]) {
      delete channels[channel][socket.id];
      socket.to(channel).emit("user-left", { socketId: socket.id });
      console.log(`${socket.userName} left channel: ${channel} (Remaining: ${Object.keys(channels[channel]).length})`);
    }
    
    if (channel) {
      socket.leave(channel);
    }
  });

  // Health check
  socket.on("ping", () => {
    socket.emit("pong", { timestamp: Date.now() });
  });

  // Handle disconnect
  socket.on("disconnect", (reason) => {
    console.log(`Socket disconnected: ${socket.id} (Reason: ${reason})`);
    
    const channel = socket.channel;
    if (channel && channels[channel] && channels[channel][socket.id]) {
      delete channels[channel][socket.id];
      socket.to(channel).emit("user-left", { socketId: socket.id });
      console.log(`${socket.userName} disconnected from ${channel} (Remaining: ${Object.keys(channels[channel]).length})`);
    }
    
    connections.delete(socket.id);
    console.log(`Total connections: ${connections.size}`);
  });

  // Error handling
  socket.on("error", (error) => {
    console.error(`Socket error for ${socket.id}:`, error);
  });
});

// Server status endpoint
app.get('/status', (req, res) => {
  const status = {
    status: 'running',
    uptime: process.uptime(),
    timestamp: Date.now(),
    channels: {},
    totalConnections: connections.size
  };
  
  for (let channel in channels) {
    status.channels[channel] = {
      userCount: Object.keys(channels[channel]).length,
      users: Object.keys(channels[channel])
    };
  }
  
  res.json(status);
});

// Root endpoint
app.get('/', (req, res) => {
  res.send(`
    <html>
      <head><title>MergedTalk Server</title></head>
      <body>
        <h1>MergedTalk Server is running</h1>
        <p>Status: <a href="/status">/status</a></p>
        <p>Total Connections: ${connections.size}</p>
        <p>Channels: ${Object.keys(channels).join(', ')}</p>
      </body>
    </html>
  `);
});

server.listen(PORT, () => {
  console.log(`✅ Server is running on port ${PORT}`);
  console.log(`📡 WebSocket server ready for connections`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});
