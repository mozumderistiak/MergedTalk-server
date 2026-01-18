// server.js
const io = require("socket.io")(process.env.PORT || 10000, {
  cors: { origin: "*" }
});

console.log("MergedTalk Server running on port", process.env.PORT || 10000);

// Store channels and users
const channels = {
  exo1: {},
  apollo2: {},
  luna3: {},
  nova4: {},
  cosmo5: {} // password-protected
};

// Password for cosmo5
const PASSWORDS = {
  cosmo5: "1016"
};

io.on("connection", socket => {
  console.log("New socket connected:", socket.id);

  // User joins a channel
  socket.on("joinChannel", ({ channel, name, photo, password }) => {
    // Check password for cosmo5
    if(channel === "cosmo5" && password !== PASSWORDS.cosmo5){
      socket.emit("password-failed");
      return;
    }

    socket.join(channel);
    socket.channel = channel;
    socket.userName = name;
    socket.userPhoto = photo;

    // Save user in the channel
    channels[channel][socket.id] = { name, photo };

    // Notify all other users in the channel
    socket.to(channel).emit("user-joined", {
      socketId: socket.id,
      name,
      photo
    });

    // Send existing users in the channel to the new user
    for(let id in channels[channel]){
      if(id !== socket.id){
        socket.emit("user-joined", {
          socketId: id,
          name: channels[channel][id].name,
          photo: channels[channel][id].photo
        });
      }
    }

    console.log(`${name} joined channel: ${channel}`);
  });

  // User leaves a channel
  socket.on("leaveChannel", ({ channel }) => {
    if(channel && channels[channel] && channels[channel][socket.id]){
      delete channels[channel][socket.id];
      socket.to(channel).emit("user-left", { socketId: socket.id });
      console.log(`${socket.userName} left channel: ${channel}`);
    }
    socket.leave(channel);
  });

  // WebRTC signaling
  socket.on("signal", msg => {
    const targetId = msg.to;
    if(targetId && io.sockets.sockets.get(targetId)){
      io.to(targetId).emit("signal", { from: socket.id, data: msg.data });
    }
  });

  // Handle disconnect
  socket.on("disconnect", () => {
    const channel = socket.channel;
    if(channel && channels[channel] && channels[channel][socket.id]){
      delete channels[channel][socket.id];
      socket.to(channel).emit("user-left", { socketId: socket.id });
      console.log(`${socket.userName} disconnected from channel: ${channel}`);
    }
  });
});
