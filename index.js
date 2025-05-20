require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, Partials, Collection, REST, Routes, SlashCommandBuilder } = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel],
});

const CHANNELS_FILE = path.join(__dirname, 'channels.json');
const forwardingMap = new Map();
const TARGET_CHANNEL_IDS = [
  '1366634832540602408', // 運営委員会より
  '1366635200792105010', // 開発者より
  '1366638510207008838', // 人事部より
];

// JSONファイルから読み込む
function loadForwardingMap() {
  if (!fs.existsSync(CHANNELS_FILE)) return;
  try {
    const data = JSON.parse(fs.readFileSync(CHANNELS_FILE, 'utf-8'));
    for (const [guildId, channelId] of Object.entries(data)) {
      forwardingMap.set(guildId, channelId);
    }
  } catch (err) {
    console.error('❌ チャンネル設定の読み込み失敗', err);
  }
}

// JSONファイルに保存
function saveForwardingMap() {
  const obj = Object.fromEntries(forwardingMap.entries());
  fs.writeFileSync(CHANNELS_FILE, JSON.stringify(obj, null, 2));
}

// スラッシュコマンド登録
client.once('ready', async () => {
  console.log(`🤖 Bot起動: ${client.user.tag}`);
  loadForwardingMap();

  const commands = [
    new SlashCommandBuilder()
      .setName('setup')
      .setDescription('このサーバーで転送先にするチャンネルを設定する'),
  ].map(cmd => cmd.toJSON());

  const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
  try {
    const guilds = client.guilds.cache.map(g => g.id);
    for (const guildId of guilds) {
      await rest.put(
        Routes.applicationGuildCommands(client.user.id, guildId),
        { body: commands }
      );
    }
    console.log('✅ スラッシュコマンド登録完了');
  } catch (err) {
    console.error('❌ スラッシュコマンド登録失敗', err);
  }
});

// スラッシュコマンド処理
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName === 'setup') {
    forwardingMap.set(interaction.guildId, interaction.channel.id);
    saveForwardingMap();
    await interaction.reply('✅ このチャンネルを転送先に設定しました（永続化済）');
  }
});

// メッセージ転送処理
client.on('messageCreate', async message => {
  if (
    message.author.bot ||
    !TARGET_CHANNEL_IDS.includes(message.channel.id) ||
    !message.guild
  ) return;

  const destChannelId = forwardingMap.get(message.guild.id);
  if (!destChannelId) return;

  const destChannel = await message.guild.channels.fetch(destChannelId).catch(() => null);
  if (!destChannel) return;

  const sourceName = message.channel.name || `#${message.channel.id}`;
  const content = `📨 **${sourceName}** より:\n${message.content}`;

  destChannel.send({ content }).catch(console.error);
});

client.login(process.env.TOKEN);
