import {
  joinVoiceChannel,
  EndBehaviorType,
  VoiceConnectionStatus,
} from "@discordjs/voice";
import { Client, GatewayIntentBits, ChannelType } from "discord.js";
import { OpusEncoder } from "@discordjs/opus";
import { Transform, Writable } from "stream";
import dotenv from "dotenv";
import { initTTS, playText } from "./tts";
import { QuiescenceMonitor } from "./quiescenceMonitor";
import { initPrompting, interumPrompt, finalPrompt } from "./prompting";

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

const utterances = new Map<string, QuiescenceMonitor<string>>();

const conversation: {
  who: string;
  utterance: string;
  time: Date;
}[] = [];

const utteranceCallbackBuilder = (id: string, name: string, player: (textToPlay: string) => void) => async (text: string[]) => {
  const fullText = text.join(" ");
  console.log(`Utterance ${id} received: ${fullText}`);
  conversation.push({
    who: name,
    utterance: fullText,
    time: new Date()
  });
  const response = await finalPrompt(fullText);
  player(response);
};

initTTS();
initPrompting();

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
          console.log("audio connection ready");

          const encoder = new OpusEncoder(16000, 1);
          receiver.speaking.on("start", async (userID) => {
            let utterance = utterances.get(userID);

            if (!utterance) {
              const userName = client.users.cache.get(userID)?.username ?? "<unknown>";

              utterance = new QuiescenceMonitor<string>(
                3000,
                utteranceCallbackBuilder(userID, userName, (text) => playText(text, connection)),
                (val: string) => /charlie/i.test(val)
              );
              utterances.set(userID, utterance);
            }

            const callback = (...args) => {
              utterance.activity(args[0] as string);
              if (utterance.hot) {
                interumPrompt(utterance.acm);
              }
            };

            let whisper = ASRUnits.get(userID);

            if (!whisper) {
              whisper = WhisperWrapper.createASRUnit(callback, userID);
              ASRUnits.set(userID, whisper);
            }

            const asrWritableStream = new Writable();
            asrWritableStream._write = (chunk, encoding, next) => {
              whisper.process(chunk);
              next();
            };

            // Create a recognize stream
            const audio = receiver
              .subscribe(userID, {
                end: {
                  behavior: EndBehaviorType.AfterSilence,
                  duration: 1000,
                },
              })
              .pipe(new OpusDecodingStream({}, encoder))
              .pipe(asrWritableStream);

            audio.on("error", console.error);
            audio.on("finish", () => {
              // console.log("audio stream finished");
              asrWritableStream.end();
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
