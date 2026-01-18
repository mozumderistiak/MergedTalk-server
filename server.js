// server.js
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const channels = {}; // Keep track of users per channel

io.on("connection", socket => {
  console.log("User connected:", socket.id);

  socket.on("joinChannel", ({ channel }) => {
    if (!channels[channel]) channels[channel] = [];
    channels[channel].push(socket.id);
    socket.join(channel);

    // Notify existing users in the channel
    socket.to(channel).emit("user-joined", { socketId: socket.id });

    // Relay WebRTC signals
    socket.on("signal", msg => {
      io.to(msg.to).emit("signal", { from: socket.id, data: msg.data });
    });

    // Handle leaving
    socket.on("leaveChannel", () => {
      socket.leave(channel);
      channels[channel] = channels[channel].filter(id => id !== socket.id);
      socket.to(channel).emit("user-left", { socketId: socket.id });
    });

    // Disconnect handling
    socket.on("disconnect", () => {
      channels[channel] = channels[channel].filter(id => id !== socket.id);
      socket.to(channel).emit("user-left", { socketId: socket.id });
      console.log("User disconnected:", socket.id);
    });
  });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
