import {
  AudioPlayer,
  AudioResource,
  VoiceConnection,
  createAudioPlayer,
  createAudioResource,
} from "@discordjs/voice";
import fs from "fs";
import net from "net";
import { CondensedConversation, conversation } from "./conversation";
import { bot_name, mocking } from "./config";
import { LoadedPackage } from "./packageLoader";

const socket_file = "socket";

// FIXME: Problematic global state
const playingQueue: TTSDispatcher[] = [];
let chronoIndex = 0;

// FIXME: This needs a re-imagining. It is going to be problematic if not addressed as the project grows.
export class TTSDispatcher {
  streamChronoIndex: number | null = null;
  totalUtterances: number | null = null;
  utterancesReceived = 0;
  utterances: string[] = [];
  hasErrored = false;
  nextToQueue = 0;
  children: Promise<undefined | TTSDispatcher>[] = [];
  mocking = false;

  frozenConversation: CondensedConversation | null = null;
  activity: LoadedPackage | null = null;

  constructor(
    conversation?: CondensedConversation,
    activity?: LoadedPackage
  ) {
    playingQueue.push(this);
    this.streamChronoIndex = chronoIndex;
    chronoIndex++;
    if (!conversation) {
      this.frozenConversation = null;
    } else {
      this.frozenConversation = conversation.clone();
    }
    this.activity = activity || null;
  }

  addUtterance(utterance: string) {
    if (this.totalUtterances !== null) {
      throw new Error("TTSDispatcher has already been finalized");
    }

    utterance = utterance.trim();

    // if the utterance starts with ${bot_name}: or ${bot_name} bot: we should remove it
    const regex = new RegExp(`^${bot_name} *(bot)?: ?`, "i");
    utterance = utterance.replace(regex, "").trim();

    // add a space after every number in the utterance
    utterance = utterance.replace(/(\d+)([^!?.,"'\s])/g, "$1 $2");

    if (utterance.length === 0) {
      return;
    }

    this.utterances.push(utterance);

    if (!mocking.tts) {
      const client = net.createConnection(socket_file, () => {});

      client.write(
        `${this.streamChronoIndex}:${this.utterancesReceived} ${utterance}`,
        () => {
          client.end();
        }
      );
    }

    conversation.addUtterance({
      who: bot_name,
      utterance: utterance,
      time: new Date(),
    });

    this.utterancesReceived++;
  }

  finalize() {
    this.totalUtterances = this.utterancesReceived;
  }

  isFinalized() {
    return this.totalUtterances !== null;
  }

  addChild(child: Promise<undefined | TTSDispatcher>) {
    this.children.push(child);
  }
}

type TTSMetadata = {
  title: string;
};
// Creates a client
const output_dir = "tts_output";

// FIXME: Problematic global state
let connection: null | VoiceConnection = null;
let player: null | AudioPlayer = null;

const setConnection = (newConnection: VoiceConnection) => {
  connection = newConnection;
  player = createAudioPlayer();
  connection.subscribe(player);

  player.on("error", (error) => {
    console.error(
      "Error:",
      error.message,
      "with track",
      (error.resource.metadata as TTSMetadata).title
    );
    playNext();
  });

  player.on("stateChange", (oldState, newState) => {
    if (newState.status === "idle") {
      playNext();
    }
  });
};

// FIXME: Problematic global state
let resourceQueue: AudioResource[] = [];

const playNext = () => {
  if (resourceQueue.length === 0) {
    return;
  }

  if (!player) {
    console.warn("No player found");
    return;
  }

  if (player.state.status === "playing") {
    return;
  }

  const resource = resourceQueue.shift();

  player.play(resource);
};

// FIXME: Problematic global state
const resourceMap = new Map<string, AudioResource>();

// FIXME: Problematic global state
let lastQueuedChronoIndex: number | null = null;
let lastQueuedTime = new Date().getTime();

const playQueuer = () => {
  if (playingQueue.length === 0) {
    return;
  }

  const currentChronoIndex = playingQueue[0].streamChronoIndex;
  const isFinalized = playingQueue[0].totalUtterances !== null;
  const isErrored = playingQueue[0].hasErrored;
  const nextToQueue = playingQueue[0].nextToQueue;

  if (currentChronoIndex === null) {
    throw new Error("TTSDispatcher has not been initialized");
  }

  const isDone = isFinalized && nextToQueue >= playingQueue[0].totalUtterances;

  if (isDone || isErrored) {
    playingQueue.shift();
    playQueuer();
    playNext();
    return;
  }

  const resourceName = `${currentChronoIndex}:${nextToQueue}`;
  if (resourceMap.has(resourceName)) {
    resourceQueue.push(resourceMap.get(resourceName)!);
    playingQueue[0].nextToQueue++;

    lastQueuedChronoIndex = currentChronoIndex;
    lastQueuedTime = new Date().getTime();
  }

  // if too much time has passed we should declare the dispatcher errored
  if (
    lastQueuedChronoIndex === currentChronoIndex &&
    new Date().getTime() - lastQueuedTime > 20000
  ) {
    playingQueue[0].hasErrored = true;
  }

  playNext();
};

const init = () => {
  // FIXME: Problematic global state
  setInterval(playQueuer, 100);

  fs.watch(output_dir, (eventType, filename) => {
    if (eventType === "rename" && filename) {
      const name = filename.split(".")[0];

      const resource = createAudioResource(`${output_dir}/${filename}`, {
        metadata: {
          title: `text to speech response: ${filename}`,
        },
      });

      // resource.playStream.on("end", () => {
      //   fs.unlink(`${output_dir}/${filename}`, (err) => {
      //     if (err) {
      //       console.error(err);
      //     }
      //   });
      // });

      resource.playStream.on("error", (error) => {
        console.error(
          "Error:",
          error.message,
          "with track",
          resource.metadata.title
        );
      });

      resourceMap.set(name, resource);
    }
  });
};

export { init as initTTS, setConnection, connection };
