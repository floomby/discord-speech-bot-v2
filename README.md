## New Discord Bot Project

### Getting Started

- If you are not using the whisper module for asr (you aren't unless you changed it in the code) you will need to setup a service account with access to the google speech to text api. This should take the form of a json key file. This is expected to be found at `keys/key.json`
- Set up variables in `.env` (see `.env.example` for an example)
- Use `permissions=35186522721280&scope=bot` for the invite link. This is more permissive than required, but I didn't find the minimal working permissions.
- Go clone [coqui-ai/tts](https://github.com/coqui-ai/TTS) and install the package. (use python 3.10.11) Make sure and have gpu support enabled.
- Instal node dependencies (`npm install`) and build the bot (`tsc`)
- `npm run start` to run the bot.
- Use ctrl-z followed by `./kill.sh` to kill the bot if ctrl-c causes it to hang.

### Creating Packages

- TODO: Document this process

### Short Term Roadmap

- Context detection
- Multi guild support
- Regression testing against the prompts/agents

### Notes / Thoughts

- I would like to explore other tts options that support local models with emotions.
- Assuming we keep using coqui-tts, I will fix the patch so that it properly allows bypassing the sentencizer.
- It might remove a small amount of latency to not use the filesystem to get the tts generation results to the bot. (not worth the effort until we know that we are for sure using coqui-tts)
- If you want to build the old whisper module you can with the following
  - Build whisper.cpp then place `libwhisper.so` and `whisper.h` in the `deps` folder. You should build with cuda support for the best results.
  - Put `ggml-base.en.bin` in the models folder. (this file can be downloaded with a script in the whisper.cpp repo)
  - Build the addon with `node-gyp build`