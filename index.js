const { Client, WebEmbed } = require("discord.js-selfbot-v13");
const client = new Client();
const express = require("express");
const fs = require("fs").promises;
const path = require("path");
require("dotenv").config();

const app = express();
const port = process.env.PORT || 3000;

// ANSI color codes for basic terminal styling
const colors = {
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  reset: "\x1b[0m",
  bright: "\x1b[1m",
};

// Add a simple health check endpoint
app.get("/", (req, res) => {
  res.json({
    status: "Bot is running",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

app.listen(port, () => {
  console.log(`Web server running on port ${port}`);
});

// Keep-alive function to prevent Render from sleeping
function keepAlive() {
  const url = process.env.RENDER_EXTERNAL_URL || `http://localhost:${port}`;

  setInterval(() => {
    fetch(url)
      .then((response) => {
        console.log(`Keep-alive ping successful: ${response.status}`);
      })
      .catch((err) => {
        console.log("Keep-alive ping failed:", err.message);
      });
  }, 14 * 60 * 1000); // 14 minutes
}

// File to store monitored servers
const DATA_FILE = path.join(__dirname, "monitored_servers.json");
let monitoredServers = new Set();

// Load monitored servers from file
async function loadMonitoredServers() {
  try {
    const data = await fs.readFile(DATA_FILE, "utf8");
    const servers = JSON.parse(data);
    monitoredServers = new Set(servers);
    console.log(`Loaded ${monitoredServers.size} monitored servers from file`);
  } catch (error) {
    if (error.code === "ENOENT") {
      // File doesn't exist yet, start with empty set
      monitoredServers = new Set();
      await saveMonitoredServers();
      console.log("Created new monitored servers file");
    } else {
      console.error("Error loading monitored servers:", error);
    }
  }
}

// Save monitored servers to file
async function saveMonitoredServers() {
  try {
    const serversArray = Array.from(monitoredServers);
    await fs.writeFile(DATA_FILE, JSON.stringify(serversArray, null, 2));
  } catch (error) {
    console.error("Error saving monitored servers:", error);
  }
}

// Add all servers to monitoring
async function addAllServersToMonitoring() {
  console.log("🔍 Adding all servers to monitoring...");
  console.log(`Total servers bot is in: ${client.guilds.cache.size}`);

  // Clear existing monitoring list to start fresh
  monitoredServers.clear();

  let processedCount = 0;
  for (const [guildId, guild] of client.guilds.cache) {
    console.log(
      `Processing ${++processedCount}/${client.guilds.cache.size}: ${
        guild.name
      }`
    );

    // Add all servers to monitoring
    monitoredServers.add(guild.id);
    console.log(
      `✅ Added server to monitoring: ${guild.name} (ID: ${guild.id})`
    );

    // Add small delay to avoid rate limiting
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  await saveMonitoredServers();
  console.log(
    `🎯 Setup complete! Monitoring all ${monitoredServers.size} servers`
  );
}

client.on("ready", async () => {
  console.log(
    `${colors.green}Logged in as ${colors.bright}${client.user.username}${colors.reset}${colors.green} | ID: ${client.user.id}${colors.reset}`
  );
  console.log(
    `${colors.cyan}Target user IDs: ${process.env.userID}, ${process.env.userID2}${colors.reset}`
  );

  await loadMonitoredServers();

  // Wait a bit for Discord to populate guild caches
  console.log("Waiting 3 seconds for Discord to populate caches...");
  await new Promise((resolve) => setTimeout(resolve, 3000));

  // Add all servers to monitoring
  await addAllServersToMonitoring();

  // Start keep-alive pings to prevent Render from sleeping
  console.log("Starting keep-alive service...");
  keepAlive();
});

client.on("messageCreate", async (message) => {
  if (message.author.id === client.user.id) return;
  // Accept commands from both users
  if (
    message.author.id !== process.env.userID &&
    message.author.id !== process.env.userID2
  )
    return;

  // List command to show monitored servers
  if (message.content.toLowerCase().startsWith("list")) {
    if (monitoredServers.size === 0) {
      return message.reply(
        "I'm not monitoring any servers yet. Use the 'refresh' command to add all servers to monitoring!"
      );
    }

    let serverList = "";
    for (const serverId of monitoredServers) {
      const guild = client.guilds.cache.get(serverId);
      if (guild) {
        serverList += `• ${guild.name} (ID: ${serverId})\n`;
      } else {
        serverList += `• Unknown Server (ID: ${serverId}) - I may have been removed\n`;
      }
    }

    message.reply(`**Servers I'm monitoring:**\n${serverList}`);
  }

  // Refresh command to manually trigger adding all servers
  if (message.content.toLowerCase().startsWith("refresh")) {
    message.reply("🔄 Adding all servers to monitoring...");
    await addAllServersToMonitoring();
    message.reply(
      `✅ Complete! Now monitoring all ${monitoredServers.size} servers.`
    );
  }

  // New command to copy user info (simplified)
  if (message.content.toLowerCase().startsWith("copy")) {
    const args = message.content.split(" ");
    if (args.length < 3) {
      return message.reply(
        "Usage: `copy <username> <userId>` - Sends formatted user info"
      );
    }

    const username = args[1];
    const userId = args[2];

    message.reply(`📋 **User Info:**
    
👤 **Username:** \`${username}\`
🆔 **User ID:** \`${userId}\`

💡 *Tap and hold the gray text above to copy*`);
  }

  if (message.content.toLowerCase().startsWith("help")) {
    const helpText = `
**Available Commands:**
• **list** - Show all servers I'm monitoring
• **refresh** - Manually add all servers to monitoring
• **copy <username> <userId>** - Display formatted user info for copying
• **help** - Show this help message

**Note:** I automatically monitor ALL servers where I'm present!
When users join, I'll send you a DM with copyable username and user ID.
    `;

    message.reply(helpText);
  }
});

// Listen for joins - monitor all servers with enhanced copyable display
client.on("guildMemberAdd", async (member) => {
  // Monitor member joins in all monitored servers
  if (!monitoredServers.has(member.guild.id)) return;

  try {
    const username = member.user.username;
    const userId = member.user.id;
    const guildName = member.guild.name;

    // Get current date and time
    const now = new Date();
    const date = now.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      timeZone: "Africa/Lagos", // Your timezone (Port Harcourt, Nigeria)
    });
    const time = now.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      timeZone: "Africa/Lagos", // Your timezone
    });
    console.log(time);

    const notificationMessage = `🎉 **New Member Joined!**
     
📆 **Date:** ${date}
🕐 **Time:** ${time}
👤 **Username:** \`${username}\`
🆔 **User ID:** \`${userId}\`
🏠 **Server:** ${guildName}`;

    // Send to first user
    try {
      const user1 = await client.users.fetch(process.env.userID);
      await user1.send({ content: notificationMessage });
      console.log(`✅ Notification sent to user 1: ${process.env.userID}`);
    } catch (err) {
      console.error(
        `${colors.yellow}Failed to send DM to user 1:${colors.reset}`,
        err
      );
    }

    // Send to second user
    try {
      const user2 = await client.users.fetch(process.env.userID2);
      await user2.send({ content: notificationMessage });
      console.log(`✅ Notification sent to user 2: ${process.env.userID2}`);
    } catch (err) {
      console.error(
        `${colors.yellow}Failed to send DM to user 2:${colors.reset}`,
        err
      );
    }
  } catch (err) {
    console.error(
      `${colors.yellow}Failed to process member join:${colors.reset}`,
      err
    );
  }
});

// When bot joins a new server, automatically add it to monitoring
client.on("guildCreate", async (guild) => {
  console.log(
    `${colors.green}Joined new server: ${colors.bright}${guild.name}${colors.reset}${colors.green} (ID: ${guild.id})${colors.reset}`
  );

  // Automatically add new server to monitoring
  monitoredServers.add(guild.id);
  await saveMonitoredServers();
  console.log(
    `✅ Auto-added new server to monitoring: ${guild.name} (ID: ${guild.id})`
  );

  const notificationText = `🤖 I've joined and started monitoring **${guild.name}**. I'll notify you of new members joining.`;

  // Notify both users
  try {
    const user1 = await client.users.fetch(process.env.userID);
    await user1.send(notificationText);
  } catch (err) {
    console.error("Failed to notify user 1 about new server:", err);
  }

  try {
    const user2 = await client.users.fetch(process.env.userID2);
    await user2.send(notificationText);
  } catch (err) {
    console.error("Failed to notify user 2 about new server:", err);
  }
});

// When bot is removed from a server, stop monitoring
client.on("guildDelete", async (guild) => {
  if (monitoredServers.has(guild.id)) {
    monitoredServers.delete(guild.id);
    await saveMonitoredServers();
    console.log(
      `${colors.yellow}Removed server from monitoring: ${colors.bright}${guild.name}${colors.reset}${colors.yellow} (ID: ${guild.id}) - Bot was removed${colors.reset}`
    );

    const removalText = `❌ I was removed from server: **${guild.name}** (ID: ${guild.id}) and stopped monitoring it`;

    // Notify both users
    try {
      const user1 = await client.users.fetch(process.env.userID);
      await user1.send(removalText);
    } catch (err) {
      console.error("Failed to notify user 1 about server removal:", err);
    }

    try {
      const user2 = await client.users.fetch(process.env.userID2);
      await user2.send(removalText);
    } catch (err) {
      console.error("Failed to notify user 2 about server removal:", err);
    }
  }
});

client.login(process.env.token);
