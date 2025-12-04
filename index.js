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
        
        let transcript = `╔══════════════════════════════════════════════════════════╗\n`;
        transcript += `║                      TICKET TRANSCRIPT                       ║\n`;
        transcript += `╠══════════════════════════════════════════════════════════╣\n`;
        transcript += `║                                                          ║\n`;
        transcript += `║  Ticket ID: ${ticket.id.padEnd(44)}║\n`;
        transcript += `║  User: ${ticket.username.padEnd(47)}║\n`;
        transcript += `║  User ID: ${ticket.userId.padEnd(45)}║\n`;
        transcript += `║  Opened: ${new Date(ticket.openedAt).toLocaleString().padEnd(43)}║\n`;
        
        if (ticket.claimed) {
            transcript += `║  Claimed: ${new Date(ticket.claimedAt).toLocaleString().padEnd(43)}║\n`;
            transcript += `║  Claimed by: ${ticket.claimedBy.padEnd(41)}║\n`;
        }
        
        if (ticket.closed) {
            transcript += `║  Closed: ${new Date(ticket.closedAt).toLocaleString().padEnd(43)}║\n`;
            transcript += `║  Closed by: ${ticket.closedBy.padEnd(41)}║\n`;
        }
        
        transcript += `║                                                          ║\n`;
        transcript += `╠══════════════════════════════════════════════════════════╣\n`;
        transcript += `║                       MESSAGES                           ║\n`;
        transcript += `╠══════════════════════════════════════════════════════════╣\n\n`;
        
        let messages = [];
        let lastId;
        
        while (true) {
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
                transcript += `[Attachments: ${msg.attachments.map(a => a.name).join(', ')}]\n`;
            }
            
            if (msg.embeds.length > 0) {
                transcript += `[Embeds: ${msg.embeds.length}]\n`;
            }
            
            transcript += `\n${'-'.repeat(60)}\n\n`;
        });
        
        transcript += `\n╔══════════════════════════════════════════════════════════╗\n`;
        transcript += `║                     END OF TRANSCRIPT                      ║\n`;
        transcript += `╚══════════════════════════════════════════════════════════╝\n`;
        
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
                { name: 'User', value: `<@${ticket.userId}> (${ticket.username})`, inline: true },
                { name: 'Ticket ID', value: ticket.id, inline: true },
                { name: 'Status', value: ticket.closed ? 'Closed' : 'Open', inline: true },
                { name: 'Opened', value: `<t:${Math.floor(new Date(ticket.openedAt).getTime() / 1000)}:R>`, inline: true },
                { name: 'Closed', value: ticket.closedAt ? `<t:${Math.floor(new Date(ticket.closedAt).getTime() / 1000)}:R>` : 'N/A', inline: true }
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

    if (interaction.customId === 'open_ticket') {
        await interaction.deferReply({ ephemeral: true });

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

    if (interaction.customId.startsWith('claim_') || interaction.customId.startsWith('close_')) {
        const ticketId = interaction.customId.split('_')[1];
        const ticket = tickets[ticketId];

        if (!interaction.member.roles.cache.has(CONFIG.CUSTOM_ROLE_ID)) {
            return interaction.reply({ 
                content: '❌ Only support staff can interact with these buttons.',
                flags: 64
            });
        }

        if (!ticket) {
            return interaction.reply({ 
                content: '❌ Ticket not found.',
                flags: 64
            });
        }

        if (interaction.customId.startsWith('claim_')) {
            if (ticket.claimed) {
                return interaction.reply({ 
                    content: '❌ This ticket is already claimed.',
                    flags: 64
                });
            }

            ticket.claimed = true;
            ticket.claimedBy = interaction.user.id;
            ticket.claimedAt = new Date().toISOString();
            saveTickets();

            await interaction.reply({ 
                content: `✅ Ticket claimed by ${interaction.user.tag}` 
            });

            const channel = interaction.guild.channels.cache.get(ticket.channelId);
            if (channel) {
                await channel.setName(`claimed-${channel.name}`);
            }

        } else if (interaction.customId.startsWith('close_')) {
            if (ticket.closed) {
                return interaction.reply({ 
                    content: '❌ This ticket is already closed.',
                    flags: 64
                });
            }

            ticket.closed = true;
            ticket.closedAt = new Date().toISOString();
            ticket.closedBy = interaction.user.id;
            saveTickets();

            const channel = interaction.guild.channels.cache.get(ticket.channelId);
            if (channel) {
                try {
                    const transcriptData = await generateTranscript(channel, ticket);
                    if (transcriptData) {
                        await sendTranscriptToChannel(interaction.guild, ticket, transcriptData);
                        
                        await channel.send({
                            embeds: [
                                new EmbedBuilder()
                                    .setTitle('📄 Transcript Generated')
                                    .setDescription(`A transcript of this ticket has been saved.`)
                                    .setColor(0x2ecc71)
                                    .setTimestamp()
                            ]
                        });
                    }
                } catch (error) {
                    console.error('Failed to generate transcript:', error);
                }
            }

            await interaction.reply({ 
                content: '🔒 Closing ticket... Transcript generated.' 
            });

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

            setTimeout(async () => {
                try {
                    const channel = interaction.guild.channels.cache.get(ticket.channelId);
                    if (channel) {
                        await channel.delete('Ticket closed - transcript saved');
                        delete tickets[ticketId];
                        saveTickets();
                    }
                } catch (error) {
                    console.error('Error deleting channel:', error);
                }
            }, 5000);
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
