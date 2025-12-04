const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, PermissionsBitField, Events } = require('discord.js');
require('dotenv').config();
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

// Configuration - use process.env directly
const CONFIG = {
    CUSTOM_ROLE_ID: process.env.CUSTOM_ROLE_ID || '123456789012345678',
    TICKET_CATEGORY_ID: process.env.TICKET_CATEGORY_ID || '123456789012345679',
    GUILD_ID: process.env.GUILD_ID,
    TICKETS_FILE: path.join(__dirname, 'tickets.json')
};

// Log config for debugging
console.log('Config loaded:', {
    CUSTOM_ROLE_ID: CONFIG.CUSTOM_ROLE_ID,
    TICKET_CATEGORY_ID: CONFIG.TICKET_CATEGORY_ID,
    GUILD_ID: CONFIG.GUILD_ID
});

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

// Purple embed for ticket ordering - FIXED COLOR VALUE
function createOrderEmbed() {
    return new EmbedBuilder()
        .setTitle('🎟️ Ticket System')
        .setDescription('To place an order or get support, click the button below to open a private ticket!')
        .setColor(0x884377) // FIXED: Removed extra digit, purple color
        .setTimestamp()
        .setFooter({ text: 'Support System' });
}

// Ticket embed - FIXED COLOR VALUE
function createTicketEmbed() {
    return new EmbedBuilder()
        .setTitle('Rumora Support System')
        .setDescription(`Welcome to your support ticket! You might be here to order something, ask a question, or file a complaint.  
Please state the following:

**Your reason for opening:**  
\`[Enter your reason here]\`

**Any additional information:**  
\`Roblox Username:\` 
\`Group:\`  
\`Rank: \`
\`Other details:\``)
        .setColor(8843775) // This is decimal, which is valid
        .setTimestamp()
        .setFooter({ text: 'Support Ticket' });
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

// Use the correct event name for Discord.js v14
client.once(Events.ClientReady, () => {
    console.log(`✅ Logged in as ${client.user.tag}!`);
    
    // Register slash commands
    if (CONFIG.GUILD_ID) {
        const guild = client.guilds.cache.get(CONFIG.GUILD_ID);
        if (guild) {
            // Register the /x command
            guild.commands.create({
                name: 'x',
                description: 'Admin only: Send ticket order embed',
                default_member_permissions: PermissionsBitField.Flags.Administrator.toString()
            }).then(() => {
                console.log('✅ Slash command /x registered');
            }).catch(console.error);
        }
    }
});

// Slash command handler
client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === 'x') {
        // Check if user has admin permissions
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return interaction.reply({ 
                content: '❌ This command is for administrators only!',
                flags: 64 // Ephemeral flag
            });
        }

        // Send embed with button
        await interaction.channel.send({
            embeds: [createOrderEmbed()],
            components: [createOpenTicketButton()]
        });

        await interaction.reply({ 
            content: '✅ Ticket embed sent!',
            flags: 64, // Ephemeral flag - fixed deprecation warning
            ephemeral: true // Keep for backward compatibility
        });
    }
});

// Button interactions
client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isButton()) return;

    // Handle opening ticket
    if (interaction.customId === 'open_ticket') {
        await interaction.deferReply({ ephemeral: true });

        const ticketId = generateTicketId();
        const guild = interaction.guild;
        const member = interaction.member;
        
        // Convert string IDs to proper types
        const customRoleId = CONFIG.CUSTOM_ROLE_ID;
        const categoryId = CONFIG.TICKET_CATEGORY_ID;
        
        const category = guild.channels.cache.get(categoryId);

        if (!category) {
            console.log('Category not found with ID:', categoryId);
            console.log('Available channels:', guild.channels.cache.map(c => `${c.name}: ${c.id}`));
            return interaction.editReply({ 
                content: '❌ Ticket category not found. Please contact an administrator.' 
            });
        }

        try {
            // Create ticket channel
            const ticketChannel = await guild.channels.create({
                name: `${member.user.username}-${ticketId}`.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
                type: ChannelType.GuildText,
                parent: category.id,
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
                        id: customRoleId, // Custom role
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
                username: member.user.username,
                openedAt: new Date().toISOString(),
                claimed: false,
                closed: false
            };
            saveTickets();

            console.log(`Ticket created: ${ticketId} for ${member.user.username}`);

            // Send ticket embed
            await ticketChannel.send({
                content: `<@${member.id}> <@&${customRoleId}>`,
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
                flags: 64 // Ephemeral
            });
        }

        if (!ticket) {
            return interaction.reply({ 
                content: '❌ Ticket not found.',
                flags: 64 // Ephemeral
            });
        }

        if (interaction.customId.startsWith('claim_')) {
            if (ticket.claimed) {
                return interaction.reply({ 
                    content: '❌ This ticket is already claimed.',
                    flags: 64 // Ephemeral
                });
            }

            ticket.claimed = true;
            ticket.claimedBy = interaction.user.id;
            ticket.claimedAt = new Date().toISOString();
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
                    flags: 64 // Ephemeral
                });
            }

            ticket.closed = true;
            ticket.closedAt = new Date().toISOString();
            ticket.closedBy = interaction.user.id;
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

            // Add closing message
            await interaction.followUp({ 
                content: `Ticket will be archived in 5 seconds...` 
            });

            // Archive or delete channel after delay
            setTimeout(async () => {
                try {
                    const channel = interaction.guild.channels.cache.get(ticket.channelId);
                    if (channel) {
                        await channel.delete('Ticket closed');
                        delete tickets[ticketId];
                        saveTickets();
                        console.log(`Ticket ${ticketId} closed and channel deleted`);
                    }
                } catch (error) {
                    console.error('Error deleting channel:', error);
                }
            }, 5000);
        }
    }
});

// Handle errors
client.on('error', error => {
    console.error('Discord client error:', error);
});

// Handle process errors
process.on('unhandledRejection', error => {
    console.error('Unhandled promise rejection:', error);
});

// Start bot
client.login(process.env.DISCORD_TOKEN).catch(error => {
    console.error('Failed to login:', error);
    process.exit(1);
});
