require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v9');
const { Client, Collection, GatewayIntentBits } = require('discord.js');

// Typeorm
const typeOrmConnection = require('./src/database/db');

const token = process.env.TOKEN;
const clientId = process.env.CLIENT_ID;
const guildId = process.env.GUILD_ID;

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
});

// Load events from event files.
const eventsPath = path.join(__dirname, 'src', 'events');
const eventFiles = fs
    .readdirSync(eventsPath)
    .filter((file) => file.endsWith('.js'));

for (const file of eventFiles) {
    const filePath = path.join(eventsPath, file);
    const event = require(filePath);
    if (event.once) {
        client.once(event.name, (...args) => event.execute(...args));
    } else {
        client.on(event.name, (...args) => event.execute(...args));
    }
}

// Load commands from command files.
client.commands = new Collection();
const commands = [];
const commandsPath = path.join(__dirname, 'src', 'commands');
const commandFiles = fs
    .readdirSync(commandsPath)
    .filter((file) => file.endsWith('.js'));

for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);

    client.commands.set(command.data.name, command);
    commands.push(command.data.toJSON());
}

// Register commands with Discord's API.
const rest = new REST({ version: '10' }).setToken(token);

(async () => {
    try {
        await rest.put(Routes.applicationGuildCommands(clientId, guildId), {
            body: commands,
        });
        console.log('Successfully registered commands!');
    } catch (err) {
        console.error(err);
    }
})();

client.once('ready', () => {
    console.log('Ready!');

    typeOrmConnection.initialize().then(() => {
        typeOrmConnection
            .createQueryBuilder()
            .insert()
            .orIgnore(`("name") DO NOTHING`)
            .into('configuration')
            .values([
                { name: 'NEW_MAPS_CHANNEL_ID' },
                { name: 'BAN_APPEAL_CHANNEL_ID' },
                { name: 'SOURCEJUMP_API_KEY' },
                { name: 'SOURCEJUMP_API_URL' },
                { name: 'DATABASE_ISSUES_CHANNEL_ID' },
                { name: 'DATABASE_MANAGER_ROLE_ID' },
            ])
            .execute()
            .then(() => {
                console.log('Initialized Database!');
                client.emit('gamebanana_watcher', client);
            });
    });
});

client.on('interactionCreate', async (interaction) => {
    if (!interaction.isCommand()) {
        return;
    }

    const command = client.commands.get(interaction.commandName);

    if (!command) {
        return;
    }

    try {
        await command.execute(interaction);
    } catch (error) {
        await interaction.reply({
            content: 'There was an error while executing this command!',
            ephemeral: true,
        });
        console.error(error);
    }
});

client.login(token);
