import {
  joinVoiceChannel,
  EndBehaviorType,
  VoiceConnectionStatus,
} from "@discordjs/voice";
import { Client, GatewayIntentBits, ChannelType } from "discord.js";
import { OpusEncoder } from "@discordjs/opus";
import { Transform, Writable } from "stream";
import dotenv from "dotenv";
import {
  TTSDispatcher,
  initTTS,
  connection as ttsConnection,
  setConnection as setTTSConnection,
} from "./tts";
import { QuiescenceMonitor } from "./quiescenceMonitor";
import {
  initPrompting,
  interimPrompt,
  finalPrompt,
  ConversationContext,
} from "./prompting";
import { conversation, initConversationDaemon } from "./conversation";
import { bot_name } from "./config";

dotenv.config();

const { TOKEN } = process.env;

const WhisperWrapper = require("./build/Release/whisper_wrapper");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildVoiceStates,
  ],
});

const ASRUnits = new Map<string, any>();

const utterances = new Map<string, QuiescenceMonitor>();

const utteranceCallbackBuilder =
  (
    id: string,
    name: string,
    conversationContext: ConversationContext,
    callback: () => void
  ) =>
  async (text: string) => {
    console.log(`Utterance ${id} received: ${text}`);

    const dispatcher = new TTSDispatcher();

    const response = await finalPrompt(
      text,
      dispatcher,
      conversationContext,
      name,
      conversation.transformConversationOrGetCachedSynopsis(4)
    );
    
    callback();
    return response;
  };

initTTS();
initPrompting();
initConversationDaemon();

// This code is development specific and will go away/change depending on how you have the bot deployed
const fixNames = (name: string) => {
  if (["Charlie_Bot", "Charlie-Bot", "oracle", "oracle-v2"].includes(name)) {
    return bot_name;
  }
  return name;
};

client.on("ready", () => {
  console.log("Client ready!");

  // list all channels
  client.guilds.cache.forEach((guild) => {
    for (const [channelID, channel] of guild.channels.cache) {
      if (channel.type === ChannelType.GuildVoice) {
        console.log(` - ${channel.name} ${channel.type} ${channel.id}`);

        const connection = joinVoiceChannel({
          channelId: channelID,
          guildId: guild.id,
          adapterCreator: guild.voiceAdapterCreator,
          selfDeaf: false,
        });

        connection.once(VoiceConnectionStatus.Disconnected, () =>
          connection?.destroy()
        );

        connection.on("error", (error: any) => {
          console.error(error);
        });

        connection.on("debug", (message: string) => {
          console.log(message);
        });

        const { receiver } = connection;

        connection.on(VoiceConnectionStatus.Ready, () => {
          if (ttsConnection !== connection) {
            setTTSConnection(connection);
          }
          console.log("audio connection ready");

          const encoder = new OpusEncoder(16000, 1);
          receiver.speaking.on("start", async (userID) => {
            
            const callback = (text: string) => {
              let utterance = utterances.get(userID);
  
              if (!utterance) {
                const userName =
                  client.users.cache.get(userID)?.username ?? "<unknown>";
  
                utterance = new QuiescenceMonitor(
                  1700,
                  utteranceCallbackBuilder(
                    userID,
                    userName,
                    {
                      usersInChannel: channel.members.map((member) =>
                        fixNames(member.user.username)
                      ),
                    },
                    () => {
                      utterances.delete(userID);
                    }
                  ),
                  (val: string) => {
                    const regex = new RegExp(bot_name, "i");
                    return regex.test(val); 
                  },
                  userName
                );
                utterances.set(userID, utterance);
              }

              console.log(`Utterance ${userID} received: ${text}`);
              text = text.replace(/harley/gi, bot_name);
              text = text.replace(/[^h]arlie/gi, bot_name);
              utterance.activity(text);
              // if (utterance.hot) {
              //   interimPrompt(utterance.acm);
              // }
            };

            let whisper = ASRUnits.get(userID);

            if (!whisper) {
              whisper = WhisperWrapper.createASRUnit(callback, userID);
              ASRUnits.set(userID, whisper);
            }
            // TODO I leak asr units (I need to run an ASRUnit.destroy() and remove it from the map)
            const asrWritableStream = new Writable();
            asrWritableStream._write = (chunk, encoding, next) => {
              whisper.process(chunk);
              next();
            };

            let subscription = receiver.subscriptions.get(userID);
            if (!subscription) {
              subscription = receiver.subscribe(userID, {
                end: {
                  behavior: EndBehaviorType.AfterSilence,
                  duration: 1500,
                },
              });
            }

            // Create a recognize stream
            const audio = subscription
              .pipe(new OpusDecodingStream({}, encoder))
              .pipe(asrWritableStream);

            audio.on("error", console.error);
            audio.on("finish", () => {
              asrWritableStream.end();
              audio.destroy();
              // remove the event listeners to the "data" event
              subscription?.removeAllListeners("data");
            });
          });
        });
        break;
      }
    }
  });
});

client.login(TOKEN);

class OpusDecodingStream extends Transform {
  encoder: OpusEncoder;

  constructor(options, encoder: OpusEncoder) {
    super(options);
    this.encoder = encoder;
  }

  _transform(data, encoding, callback) {
    this.push(this.encoder.decode(data));
    callback();
  }
}
