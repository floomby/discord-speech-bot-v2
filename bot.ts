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
import {
  conversation,
  initConversationDaemon,
  latentConversation,
} from "./conversation";
import { bot_name } from "./config";
import { v1p1beta1 as speech } from "@google-cloud/speech";
import { inspect } from "util";

dotenv.config();

const { TOKEN } = process.env;

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildVoiceStates,
  ],
});

const recentCalls = new Map<string, number>();

const isRecentDuplicate = (text: string) => {
  const now = Date.now();
  const lastCall = recentCalls.get(text);
  if (lastCall && now - lastCall < 1000 * 30) {
    return true;
  }
  recentCalls.set(text, now);
  return false;
};

// const utteranceCallbackBuilder =
//   (
//     id: string,
//     name: string,
//     conversationContext: ConversationContext,
//     callback: () => void
//   ) =>
//   async (text: string) => {
//     console.log(`Utterance ${id} received: ${text}`);

//     // FIXME - problem when moving to multi guild
//     const dispatcher = new TTSDispatcher(conversation);

//     const response = await finalPrompt(
//       text,
//       dispatcher,
//       conversationContext,
//       name,
//       conversation.transformConversationOrGetCachedSynopsis(4)
//     );

//     callback();
//     return response;
//   };

initTTS();
initConversationDaemon();

const keyFilename = "./keys/key.json";
const speechClient = new speech.SpeechClient({
  keyFilename,
});

// This code is development specific and will go away/change depending on how you have the bot deployed
const fixNames = (name: string) => {
  if (["Charlie_Bot", "Charlie-Bot", "oracle", "oracle-v2"].includes(name)) {
    return bot_name;
  }
  return name;
};

const activeStreams = new Map<
  string,
  Map<
    string,
    ReturnType<typeof speech.SpeechClient.prototype.streamingRecognize>
  >
>();

const getActiveStream = (guildID: string, userID: string) => {
  const guildStreams = activeStreams.get(guildID);
  if (!guildStreams) {
    return null;
  }
  return guildStreams.get(userID);
};

const setActiveStream = (
  guildID: string,
  userID: string,
  stream: ReturnType<typeof speech.SpeechClient.prototype.streamingRecognize>
) => {
  let guildStreams = activeStreams.get(guildID);
  if (!guildStreams) {
    guildStreams = new Map<
      string,
      ReturnType<typeof speech.SpeechClient.prototype.streamingRecognize>
    >();
    activeStreams.set(guildID, guildStreams);
  }
  guildStreams.set(userID, stream);
};

const destroyActiveStream = (guildID: string, userID: string) => {
  const guildStreams = activeStreams.get(guildID);
  if (!guildStreams) {
    return;
  }
  const stream = guildStreams.get(userID);
  guildStreams.delete(userID);
  if (stream) {
    stream.destroy();
  }
};

client.on("ready", () => {
  console.log("Discord client ready!");

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

          const encoder = new OpusEncoder(48000, 1);
          receiver.speaking.on("start", async (userID) => {
            const userName =
              client.users.cache.get(userID)?.username ?? "<unknown>";

            let recognizeStream = getActiveStream(guild.id, userID);
            if (!recognizeStream) {
              // console.log("creating new speech stream");
              recognizeStream = speechClient
                .streamingRecognize({
                  config: {
                    encoding: "LINEAR16",
                    sampleRateHertz: 48000,
                    languageCode: "en-US",
                    speechContexts: [
                      {
                        phrases: [bot_name],
                        boost: 8.0,
                      },
                    ],
                  },
                  interimResults: false,
                })
                .on("error", (error) => {
                  console.log("error", error);
                  destroyActiveStream(guild.id, userID);
                })
                .on("data", async (data) => {
                  const result = data.results[0]?.alternatives[0]?.transcript;
                  if (!result) {
                    console.log("speech transcription timeout or empty");
                    return;
                  }
                  console.log(`Transcription: ${result}`);

                  if (isRecentDuplicate(result)) {
                    console.log("duplicate");
                    return;
                  }

                  const hotRegex = new RegExp(bot_name, "i");
                  if (hotRegex.test(result)) {
                    conversation.addUtterance({
                      who: userName,
                      utterance: result,
                      time: new Date(),
                    });

                    const dispatcher = new TTSDispatcher(conversation);

                    const response = await finalPrompt(
                      result,
                      dispatcher,
                      {
                        usersInChannel: channel.members.map((member) =>
                          fixNames(member.user.username)
                        ),
                      },
                      userName,
                      conversation.transformConversationOrGetCachedSynopsis(4)
                    );
                  } else {
                    latentConversation.addUtterance({
                      who: userName,
                      utterance: result,
                      time: new Date(),
                    });
                  }
                })
                .on("end", () => {
                  // console.log("speech stream ended");
                  destroyActiveStream(guild.id, userID);
                });

              setActiveStream(guild.id, userID, recognizeStream);

              let subscription = receiver.subscriptions.get(userID);
              if (!subscription) {
                subscription = receiver.subscribe(userID, {
                  end: {
                    behavior: EndBehaviorType.AfterSilence,
                    duration: 1000,
                  },
                });
              }

              // Create a recognize stream
              const audio = subscription
                .pipe(new OpusDecodingStream({}, encoder))
                .pipe(recognizeStream);

              // console.log("audio stream listener count: ", subscription.listenerCount("data"));

              audio.on("error", console.error);
              audio.on("finish", () => {
                audio.destroy();
                destroyActiveStream(guild.id, userID);
                // remove the event listeners to the "data" event
                subscription?.removeAllListeners("data");
              });
            }
          });
        });
        break;
      }
    }
  });
});

initPrompting()
  .then(() => client.login(TOKEN))
  .catch(console.error);

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
