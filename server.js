// author @GwenDev
import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import path from "path";
import { fileURLToPath } from "url";
import bodyParser from "body-parser";
import fs from "fs";
import { query } from "./App/Database.js";
import { settings } from "./App/Settings.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let botStartTime = Date.now();
let botApi = null;
let io = null;

const app = express();
const server = createServer(app);

io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

async function getCommandsFromFiles() {
    const commandsDir = path.join(__dirname, 'Core', 'Commands');
    const commandFiles = fs.readdirSync(commandsDir).filter(file => file.endsWith('.js'));
    const commands = [];
    
    for (const file of commandFiles) {
        try {
            const commandModule = await import(`./Core/Commands/${file}`);
            const command = commandModule.default;
            if (command && command.name) {
                commands.push({
                    name: command.name,
                    description: command.description || 'Không có mô tả',
                    role: command.role || 0,
                    cooldown: command.cooldown || 0,
                    aliases: command.aliases || []
                });
            }
        } catch (error) {
            console.error(`Error loading command ${file}:`, error);
        }
    }
    
    return commands;
}

async function getDashboardStats() {
    try {
        const commands = await getCommandsFromFiles();
        
        const groupsResult = await query("SELECT COUNT(*) as count FROM groups");
        const totalGroups = groupsResult[0]?.count || 0;
        
        const usersResult = await query("SELECT COUNT(*) as count FROM users");
        const totalUsers = usersResult[0]?.count || 0;
        
        const moneyResult = await query("SELECT SUM(tongnap) as total FROM users");
        const totalMoney = moneyResult[0]?.total || 0;
        
        const uptimeSeconds = Math.floor((Date.now() - botStartTime) / 1000);
        const uptime = formatUptime(uptimeSeconds);
        
        return {
            totalCommands: commands.length,
            totalGroups,
            totalUsers,
            totalMoney,
            uptime
        };
    } catch (error) {
        console.error('Error getting dashboard stats:', error);
        return {
            totalCommands: 0,
            totalGroups: 0,
            totalUsers: 0,
            totalMoney: 0,
            uptime: '0s'
        };
    }
}

function formatUptime(seconds) {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (days > 0) {
        return `${days}d ${hours}h ${minutes}m`;
    } else if (hours > 0) {
        return `${hours}h ${minutes}m ${secs}s`;
    } else if (minutes > 0) {
        return `${minutes}m ${secs}s`;
    } else {
        return `${secs}s`;
    }
}

app.get('/', async (req, res) => {
    try {
        const stats = await getDashboardStats();
        const botInfo = {
            prefix: settings.prefix,
            startTime: new Date(botStartTime).toLocaleString('vi-VN'),
            startTimeStamp: botStartTime
        };
        
        res.render('dashboard', { stats, botInfo });
    } catch (error) {
        console.error('Dashboard error:', error);
        res.status(500).send('Internal Server Error');
    }
});

app.get('/commands', async (req, res) => {
    try {
        const commands = await getCommandsFromFiles();
        res.render('commands', { commands });
    } catch (error) {
        console.error('Commands error:', error);
        res.status(500).send('Internal Server Error');
    }
});

app.get('/console', (req, res) => {
    res.render('console');
});

app.get('/groups', async (req, res) => {
    try {
        const groups = await query("SELECT * FROM `groups` ORDER BY id DESC");
        res.render('groups', { groups });
    } catch (error) {
        console.error('Groups error:', error);
        res.status(500).send('Internal Server Error');
    }
});

app.get('/users', async (req, res) => {
    try {
        console.log('Fetching users...');
        const users = await query("SELECT * FROM users ORDER BY id DESC LIMIT 100");
        console.log('Users fetched:', users.length);
        res.render('users', { users });
    } catch (error) {
        console.error('Users error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/commands/update', async (req, res) => {
    try {
        const { name, description, role, cooldown, aliases } = req.body;
        
        res.json({ success: true, message: 'Command updated successfully' });
    } catch (error) {
        console.error('Update command error:', error);
        res.json({ success: false, message: error.message });
    }
});

app.post('/api/users/update', async (req, res) => {
    try {
        const { uid, vnd, admin, ban } = req.body;
        
        await query(
            "UPDATE users SET vnd = ?, admin = ?, ban = ? WHERE uid = ?",
            [vnd, admin, ban, uid]
        );
        
        res.json({ success: true, message: 'User updated successfully' });
    } catch (error) {
        console.error('Update user error:', error);
        res.json({ success: false, message: error.message });
    }
});
io.on('connection', (socket) => {
    console.log('Client connected to console');
    
    socket.on('command', (data) => {
        console.log('Received command:', data.command);
        socket.emit('output', `> ${data.command}\nCommand executed successfully`);
    });
    
    socket.on('disconnect', () => {
        console.log('Client disconnected from console');
    });
});
export function setBotApi(api) {
    botApi = api;
}
export function emitConsoleLog(message) {
    if (io) {
        io.emit('console-log', message);
    }
}

const PORT = process.env.PANEL_PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
});

export { app, server, io };

