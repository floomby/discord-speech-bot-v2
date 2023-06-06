// Imports the Google Cloud client library
import {
  VoiceConnection,
  createAudioPlayer,
  createAudioResource,
} from "@discordjs/voice";

// Import other required libraries
import fs from "fs";
import net from "net";

// Creates a client
const output_dir = "tts_output";

let connections = new Map<number, VoiceConnection>();

const init = () => {
  // make an empty directory for the outputs called "outputs"
  if (!fs.existsSync(output_dir)) {
    fs.mkdirSync(output_dir);
  }
  // remove all files from the outputs directory
  fs.readdir(output_dir, (err, files) => {
    if (err) throw err;
    for (const file of files) {
      fs.unlink(`${output_dir}/${file}`, (err) => {
        if (err) throw err;
      });
    }
  });

  fs.watch(output_dir, (eventType, filename) => {
    if (eventType === "rename" && filename) {
      const nonce = parseInt(filename.split(".")[0]);

      const connection = connections.get(nonce);
      if (!connection) {
        console.error(`No connection found for nonce ${nonce}`);
        return;
      }

      connections.delete(nonce);

      const player = createAudioPlayer();

      const resource = createAudioResource(`${output_dir}/${filename}`, {
        metadata: {
          title: "text to speech response",
        },
      });

      resource.playStream.on("error", (error) => {
        console.error(
          "Error:",
          error.message,
          "with track",
          resource.metadata.title
        );
      });

      connection.subscribe(player);
      player.play(resource);
    }
  });
};

const socket_file = "socket";

let nonce = 0;

// TODO Convert this to a stream if googles api supports it
const playText = async (text: string, connection: VoiceConnection) => {
  const client = net.createConnection(socket_file, () => {
    console.log("Connected to tts server");
  });

  // Send the text to the unix socket
  client.write(`${nonce} ${text}`, () => {
    // end the message
    client.end();
  });

  connections.set(nonce, connection);
  nonce++;
};

export { init as initTTS, playText };
