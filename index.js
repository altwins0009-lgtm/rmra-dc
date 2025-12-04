const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, PermissionsBitField, Events, AttachmentBuilder } = require('discord.js');
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.json({ status: 'online', service: 'Discord Ticket Bot' });
});

app.get('/health', (req, res) => {
    res.json({ status: 'healthy' });
});

app.listen(PORT, () => {
    console.log(`🌐 Web server running on port ${PORT}`);
});

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

const CONFIG = {
    CUSTOM_ROLE_ID: process.env.CUSTOM_ROLE_ID || '123456789012345678',
    TICKET_CATEGORY_ID: process.env.TICKET_CATEGORY_ID || '123456789012345679',
    GUILD_ID: process.env.GUILD_ID,
    TRANSCRIPT_CHANNEL_ID: process.env.TRANSCRIPT_CHANNEL_ID || '123456789012345680',
    TICKETS_FILE: path.join(__dirname, 'tickets.json'),
    TRANSCRIPTS_DIR: path.join(__dirname, 'transcripts')
};

if (!fs.existsSync(CONFIG.TRANSCRIPTS_DIR)) {
    fs.mkdirSync(CONFIG.TRANSCRIPTS_DIR, { recursive: true });
}

let tickets = {};
if (fs.existsSync(CONFIG.TICKETS_FILE)) {
    tickets = JSON.parse(fs.readFileSync(CONFIG.TICKETS_FILE, 'utf8'));
}

function saveTickets() {
    fs.writeFileSync(CONFIG.TICKETS_FILE, JSON.stringify(tickets, null, 2));
}

function generateTicketId() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function createOrderEmbed() {
    return new EmbedBuilder()
        .setTitle('🎟️ Ticket System')
        .setDescription('To place an order or get support, click the button below to open a private ticket!')
        .setColor(0x884377)
        .setTimestamp()
        .setFooter({ text: 'Support System' });
}

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
        .setColor(8843775)
        .setTimestamp()
        .setFooter({ text: 'Support Ticket' });
}

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

async function generateTranscript(channel, ticket) {
    try {
        const now = new Date();
        const timestamp = now.toISOString().replace(/[:.]/g, '-');
        const filename = `ticket-${ticket.id}-${timestamp}.txt`;
        const filepath = path.join(CONFIG.TRANSCRIPTS_DIR, filename);
        
        let transcript = `Ticket ID: ${ticket.id}\n`;
        transcript += `User: ${ticket.username} (${ticket.userId})\n`;
        transcript += `Opened: ${new Date(ticket.openedAt).toLocaleString()}\n`;
        
        if (ticket.claimed) {
            transcript += `Claimed: ${new Date(ticket.claimedAt).toLocaleString()} by ${ticket.claimedBy}\n`;
        }
        
        if (ticket.closed) {
            transcript += `Closed: ${new Date(ticket.closedAt).toLocaleString()} by ${ticket.closedBy}\n`;
        }
        
        transcript += `\n========== MESSAGES ==========\n\n`;
        
        // Fetch messages more efficiently with smaller batch
        let messages = [];
        let lastId;
        
        for (let i = 0; i < 10; i++) { // Limit to 1000 messages max
            const options = { limit: 100 };
            if (lastId) options.before = lastId;
            
            const fetched = await channel.messages.fetch(options);
            if (fetched.size === 0) break;
            
            messages.push(...fetched.values());
            lastId = fetched.last().id;
            
            if (fetched.size < 100) break;
        }
        
        messages.reverse();
        
        messages.forEach(msg => {
            const timestamp = new Date(msg.createdAt).toLocaleString();
            const author = msg.author.tag;
            const content = msg.content || '(No text content)';
            
            transcript += `[${timestamp}] ${author}:\n`;
            transcript += `${content}\n`;
            
            if (msg.attachments.size > 0) {
                transcript += `[Attachments: ${msg.attachments.size}]\n`;
            }
            
            transcript += `\n`;
        });
        
        transcript += `\n========== END OF TRANSCRIPT ==========\n`;
        
        fs.writeFileSync(filepath, transcript, 'utf8');
        
        return { filepath, filename, transcript };
    } catch (error) {
        console.error('Error generating transcript:', error);
        return null;
    }
}

async function sendTranscriptToChannel(guild, ticket, transcriptData) {
    try {
        const transcriptChannel = guild.channels.cache.get(CONFIG.TRANSCRIPT_CHANNEL_ID);
        if (!transcriptChannel) {
            console.error('Transcript channel not found');
            return false;
        }
        
        const attachment = new AttachmentBuilder(transcriptData.filepath, { 
            name: transcriptData.filename 
        });
        
        const transcriptEmbed = new EmbedBuilder()
            .setTitle('📄 Ticket Transcript')
            .setDescription(`Transcript for ticket **${ticket.id}**`)
            .setColor(0x3498db)
            .addFields(
                { name: 'User', value: `<@${ticket.userId}>`, inline: true },
                { name: 'Ticket ID', value: ticket.id, inline: true },
                { name: 'Status', value: 'Closed', inline: true }
            )
            .setTimestamp()
            .setFooter({ text: `Ticket Transcript` });
        
        await transcriptChannel.send({
            embeds: [transcriptEmbed],
            files: [attachment]
        });
        
        console.log(`Transcript sent for ticket ${ticket.id}`);
        return true;
    } catch (error) {
        console.error('Error sending transcript:', error);
        return false;
    }
}

client.once(Events.ClientReady, () => {
    console.log(`✅ Logged in as ${client.user.tag}!`);
    
    if (CONFIG.GUILD_ID) {
        const guild = client.guilds.cache.get(CONFIG.GUILD_ID);
        if (guild) {
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

client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === 'x') {
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return interaction.reply({ 
                content: '❌ This command is for administrators only!',
                flags: 64
            });
        }

        await interaction.channel.send({
            embeds: [createOrderEmbed()],
            components: [createOpenTicketButton()]
        });

        await interaction.reply({ 
            content: '✅ Ticket embed sent!',
            flags: 64
        });
    }
});

client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isButton()) return;

    // Handle opening ticket - RESPOND IMMEDIATELY
    if (interaction.customId === 'open_ticket') {
        // Respond immediately
        await interaction.reply({ 
            content: '⏳ Creating your ticket...',
            flags: 64
        });

        const ticketId = generateTicketId();
        const guild = interaction.guild;
        const member = interaction.member;
        
        const customRoleId = CONFIG.CUSTOM_ROLE_ID;
        const categoryId = CONFIG.TICKET_CATEGORY_ID;
        
        const category = guild.channels.cache.get(categoryId);

        if (!category) {
            return interaction.editReply({ 
                content: '❌ Ticket category not found.' 
            });
        }

        try {
            const ticketChannel = await guild.channels.create({
                name: `${member.user.username}-${ticketId}`.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
                type: ChannelType.GuildText,
                parent: category.id,
                permissionOverwrites: [
                    {
                        id: guild.id,
                        deny: [PermissionsBitField.Flags.ViewChannel]
                    },
                    {
                        id: member.id,
                        allow: [
                            PermissionsBitField.Flags.ViewChannel,
                            PermissionsBitField.Flags.SendMessages,
                            PermissionsBitField.Flags.ReadMessageHistory
                        ]
                    },
                    {
                        id: customRoleId,
                        allow: [
                            PermissionsBitField.Flags.ViewChannel,
                            PermissionsBitField.Flags.SendMessages,
                            PermissionsBitField.Flags.ReadMessageHistory,
                            PermissionsBitField.Flags.ManageMessages
                        ]
                    }
                ]
            });

            tickets[ticketId] = {
                id: ticketId,
                channelId: ticketChannel.id,
                userId: member.id,
                username: member.user.username,
                openedAt: new Date().toISOString(),
                claimed: false,
                closed: false
            };
            saveTickets();

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
                content: '❌ Failed to create ticket.' 
            });
        }
    }

    // Handle claim/close buttons
    if (interaction.customId.startsWith('claim_') || interaction.customId.startsWith('close_')) {
        // RESPOND IMMEDIATELY to avoid timeout
        await interaction.deferReply();
        
        const ticketId = interaction.customId.split('_')[1];
        const ticket = tickets[ticketId];

        if (!interaction.member.roles.cache.has(CONFIG.CUSTOM_ROLE_ID)) {
            return interaction.editReply({ 
                content: '❌ Only support staff can interact with these buttons.'
            });
        }

        if (!ticket) {
            return interaction.editReply({ 
                content: '❌ Ticket not found.'
            });
        }

        if (interaction.customId.startsWith('claim_')) {
            if (ticket.claimed) {
                return interaction.editReply({ 
                    content: '❌ This ticket is already claimed.'
                });
            }

            ticket.claimed = true;
            ticket.claimedBy = interaction.user.id;
            ticket.claimedAt = new Date().toISOString();
            saveTickets();

            await interaction.editReply({ 
                content: `✅ Ticket claimed by ${interaction.user.tag}` 
            });

            const channel = interaction.guild.channels.cache.get(ticket.channelId);
            if (channel) {
                await channel.setName(`claimed-${channel.name}`);
            }

        } else if (interaction.customId.startsWith('close_')) {
            if (ticket.closed) {
                return interaction.editReply({ 
                    content: '❌ This ticket is already closed.'
                });
            }

            // Mark as closed immediately
            ticket.closed = true;
            ticket.closedAt = new Date().toISOString();
            ticket.closedBy = interaction.user.id;
            saveTickets();

            // Disable buttons immediately
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
            
            await interaction.editReply({ 
                content: '🔒 Closing ticket and generating transcript...' 
            });

            // Generate transcript in background
            const channel = interaction.guild.channels.cache.get(ticket.channelId);
            if (channel) {
                try {
                    // Let user know transcript is being generated
                    await channel.send({
                        embeds: [
                            new EmbedBuilder()
                                .setTitle('📄 Generating Transcript')
                                .setDescription(`This ticket is being closed. Generating transcript...`)
                                .setColor(0xf39c12)
                                .setTimestamp()
                        ]
                    });

                    // Generate transcript
                    const transcriptData = await generateTranscript(channel, ticket);
                    if (transcriptData) {
                        await sendTranscriptToChannel(interaction.guild, ticket, transcriptData);
                        
                        await channel.send({
                            embeds: [
                                new EmbedBuilder()
                                    .setTitle('✅ Transcript Generated')
                                    .setDescription(`Ticket transcript has been saved.`)
                                    .setColor(0x2ecc71)
                                    .setTimestamp()
                            ]
                        });
                        
                        await interaction.editReply({ 
                            content: '✅ Ticket closed and transcript generated!' 
                        });
                    } else {
                        await interaction.editReply({ 
                            content: '✅ Ticket closed (failed to generate transcript)' 
                        });
                    }
                } catch (error) {
                    console.error('Failed to generate transcript:', error);
                    await interaction.editReply({ 
                        content: '✅ Ticket closed (transcript generation failed)' 
                    });
                }
            }

            // Delete channel after delay
            setTimeout(async () => {
                try {
                    const channel = interaction.guild.channels.cache.get(ticket.channelId);
                    if (channel) {
                        await channel.delete('Ticket closed');
                        delete tickets[ticketId];
                        saveTickets();
                    }
                } catch (error) {
                    console.error('Error deleting channel:', error);
                }
            }, 10000); // Give 10 seconds for transcript
        }
    }
});

client.on('error', error => {
    console.error('Discord client error:', error);
});

process.on('unhandledRejection', error => {
    console.error('Unhandled promise rejection:', error);
});

client.login(process.env.DISCORD_TOKEN).catch(error => {
    console.error('Failed to login:', error);
    process.exit(1);
});
