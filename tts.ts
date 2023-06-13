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
import { bot_name } from "./config";
import { extractQuestion } from "./prompting";

const socket_file = "socket";

// FIXME: Problematic global state
const playingQueue: TTSDispatcher[] = [];
let chronoIndex = 0;

export class TTSDispatcher {
  streamChronoIndex: number | null = null;
  totalSegments: number | null = null;
  segmentsReceived = 0;
  hasErrored = false;
  nextToQueue = 0;

  frozenConversation: CondensedConversation | null = null;

  private client: net.Socket;

  constructor(conversation?: CondensedConversation) {
    playingQueue.push(this);
    this.streamChronoIndex = chronoIndex;
    chronoIndex++;
    if (!conversation) {
      this.frozenConversation = null;
    } else {
      this.frozenConversation = conversation.clone();
    }
  }

  addSentence(sentence: string) {
    if (this.totalSegments !== null) {
      throw new Error("TTSDispatcher has already been finalized");
    }

    sentence = sentence.trim();

    // if the sentence starts with ${bot_name}: or ${bot_name} bot: we should remove it
    const regex = new RegExp(`^${bot_name} *(bot)?: ?`, "i");
    sentence = sentence.replace(regex, "").trim();

    if (sentence.length === 0) {
      return;
    }

    this.client = net.createConnection(socket_file, () => {});

    this.client.write(
      `${this.streamChronoIndex}:${this.segmentsReceived} ${sentence}`,
      () => {
        this.client.end();
      }
    );

    conversation.addUtterance({
      who: bot_name,
      utterance: sentence,
      time: new Date(),
    });

    this.segmentsReceived++;

    if (this.frozenConversation) {
      // check if we need llm feedback (TODO I shouldn't do it here probably)
      const externalResourceRegex = /external resource/i;
      if (externalResourceRegex.test(sentence)) {
        extractQuestion(this.frozenConversation);
      }
    }
  }

  finalize() {
    this.totalSegments = this.segmentsReceived;
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
  const isFinalized = playingQueue[0].totalSegments !== null;
  const isErrored = playingQueue[0].hasErrored;
  const nextToQueue = playingQueue[0].nextToQueue;

  if (currentChronoIndex === null) {
    throw new Error("TTSDispatcher has not been initialized");
  }

  const isDone = isFinalized && nextToQueue >= playingQueue[0].totalSegments;

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
