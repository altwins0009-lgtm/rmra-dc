const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, PermissionsBitField } = require('discord.js');
const { token } = require('dotenv').config().parsed;
const fs = require('fs');
const path = require('path');

// Bot client setup
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

// Configuration
const CONFIG = {
    CUSTOM_ROLE_ID: process.env.CUSTOM_ROLE_ID,
    TICKET_CATEGORY_ID: process.env.TICKET_CATEGORY_ID,
    GUILD_ID: process.env.GUILD_ID,
    TICKETS_FILE: path.join(__dirname, 'tickets.json')
};

// Load tickets data
let tickets = {};
if (fs.existsSync(CONFIG.TICKETS_FILE)) {
    tickets = JSON.parse(fs.readFileSync(CONFIG.TICKETS_FILE, 'utf8'));
}

// Save tickets data
function saveTickets() {
    fs.writeFileSync(CONFIG.TICKETS_FILE, JSON.stringify(tickets, null, 2));
}

// Generate random ticket ID
function generateTicketId() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// Purple embed for ticket ordering
function createOrderEmbed() {
    return new EmbedBuilder()
        .setTitle('🎟️ Ticket System')
        .setDescription('To place an order or get support, click the button below to open a private ticket!')
        .setColor(0x8843775) // Purple color
        .setTimestamp()
        .setFooter({ text: 'Support System', iconURL: client.user?.displayAvatarURL() });
}

// Ticket embed
function createTicketEmbed() {
    return new EmbedBuilder()
        .setTitle('<:overli:1445849710039531611>  Rumora Support System')
        .setDescription(`Welcome to your support ticket! You might be here to order something, ask a question, or file a complaint.  
Please state the following:

**Your reason for opening:**  
\`[Enter your reason here]\`

**Any additional information:**  
\`Roblox Username:\` 
\`Group:\`  
\`Rank: \`
\`Other details:\``)
        .setColor(8843775);
}

// Open ticket button
function createOpenTicketButton() {
    return new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('open_ticket')
                .setLabel('Open a Ticket')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('🎫')
        );
}

// Ticket management buttons (Claim/Close)
function createTicketButtons(ticketId) {
    return new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(`claim_${ticketId}`)
                .setLabel('Claim')
                .setStyle(ButtonStyle.Success)
                .setEmoji('✅'),
            new ButtonBuilder()
                .setCustomId(`close_${ticketId}`)
                .setLabel('Close')
                .setStyle(ButtonStyle.Danger)
                .setEmoji('🔒')
        );
}

client.once('ready', () => {
    console.log(`✅ Logged in as ${client.user.tag}!`);
    
    // Register slash commands
    const guild = client.guilds.cache.get(CONFIG.GUILD_ID);
    if (guild) {
        guild.commands.create({
            name: 'x',
            description: 'Admin only: Send ticket order embed'
        });
    }
});

// Slash command handler
client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === 'x') {
        // Check if user has admin permissions
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return interaction.reply({ 
                content: '❌ This command is for administrators only!', 
                ephemeral: true 
            });
        }

        await interaction.deferReply({ ephemeral: true });
        
        // Send embed with button
        await interaction.channel.send({
            embeds: [createOrderEmbed()],
            components: [createOpenTicketButton()]
        });

        await interaction.editReply({ content: '✅ Ticket embed sent!' });
    }
});

// Button interactions
client.on('interactionCreate', async interaction => {
    if (!interaction.isButton()) return;

    // Handle opening ticket
    if (interaction.customId === 'open_ticket') {
        await interaction.deferReply({ ephemeral: true });

        const ticketId = generateTicketId();
        const guild = interaction.guild;
        const member = interaction.member;
        const category = guild.channels.cache.get(CONFIG.TICKET_CATEGORY_ID);

        if (!category) {
            return interaction.editReply({ 
                content: '❌ Ticket category not found. Please contact an administrator.' 
            });
        }

        try {
            // Create ticket channel
            const ticketChannel = await guild.channels.create({
                name: `${member.user.username}-${ticketId}`.toLowerCase(),
                type: ChannelType.GuildText,
                parent: category,
                permissionOverwrites: [
                    {
                        id: guild.id, // @everyone
                        deny: [PermissionsBitField.Flags.ViewChannel]
                    },
                    {
                        id: member.id, // Ticket creator
                        allow: [
                            PermissionsBitField.Flags.ViewChannel,
                            PermissionsBitField.Flags.SendMessages,
                            PermissionsBitField.Flags.ReadMessageHistory
                        ]
                    },
                    {
                        id: CONFIG.CUSTOM_ROLE_ID, // Custom role
                        allow: [
                            PermissionsBitField.Flags.ViewChannel,
                            PermissionsBitField.Flags.SendMessages,
                            PermissionsBitField.Flags.ReadMessageHistory,
                            PermissionsBitField.Flags.ManageMessages
                        ]
                    }
                ]
            });

            // Store ticket info
            tickets[ticketId] = {
                channelId: ticketChannel.id,
                userId: member.id,
                openedAt: new Date().toISOString(),
                claimed: false,
                closed: false
            };
            saveTickets();

            // Send ticket embed
            await ticketChannel.send({
                content: `<@${member.id}> <@&${CONFIG.CUSTOM_ROLE_ID}>`,
                embeds: [createTicketEmbed()],
                components: [createTicketButtons(ticketId)]
            });

            await interaction.editReply({ 
                content: `✅ Ticket created: ${ticketChannel}` 
            });

        } catch (error) {
            console.error('Error creating ticket:', error);
            await interaction.editReply({ 
                content: '❌ Failed to create ticket. Please try again later.' 
            });
        }
    }

    // Handle claim/close buttons
    if (interaction.customId.startsWith('claim_') || interaction.customId.startsWith('close_')) {
        const ticketId = interaction.customId.split('_')[1];
        const ticket = tickets[ticketId];

        // Check if user has custom role
        if (!interaction.member.roles.cache.has(CONFIG.CUSTOM_ROLE_ID)) {
            return interaction.reply({ 
                content: '❌ Only support staff can interact with these buttons.', 
                ephemeral: true 
            });
        }

        if (!ticket) {
            return interaction.reply({ 
                content: '❌ Ticket not found.', 
                ephemeral: true 
            });
        }

        if (interaction.customId.startsWith('claim_')) {
            if (ticket.claimed) {
                return interaction.reply({ 
                    content: '❌ This ticket is already claimed.', 
                    ephemeral: true 
                });
            }

            ticket.claimed = true;
            ticket.claimedBy = interaction.user.id;
            saveTickets();

            await interaction.reply({ 
                content: `✅ Ticket claimed by ${interaction.user.tag}` 
            });

            // Update channel name
            const channel = interaction.guild.channels.cache.get(ticket.channelId);
            if (channel) {
                await channel.setName(`claimed-${channel.name}`);
            }

        } else if (interaction.customId.startsWith('close_')) {
            if (ticket.closed) {
                return interaction.reply({ 
                    content: '❌ This ticket is already closed.', 
                    ephemeral: true 
                });
            }

            ticket.closed = true;
            saveTickets();

            await interaction.reply({ 
                content: '🔒 Closing ticket...' 
            });

            // Disable buttons
            const disabledButtons = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`claim_${ticketId}`)
                        .setLabel('Claimed')
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(true),
                    new ButtonBuilder()
                        .setCustomId(`close_${ticketId}`)
                        .setLabel('Closed')
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(true)
                );

            await interaction.message.edit({ components: [disabledButtons] });

            // Archive or delete channel after delay
            setTimeout(async () => {
                const channel = interaction.guild.channels.cache.get(ticket.channelId);
                if (channel) {
                    await channel.delete('Ticket closed');
                    delete tickets[ticketId];
                    saveTickets();
                }
            }, 5000);
        }
    }
});

// Start bot
client.login(process.env.DISCORD_TOKEN);
