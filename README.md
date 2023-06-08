## New Discord Bot Project

### Getting Started

- Build whisper.cpp then place `libwhisper.so` and `whisper.h` in the `deps` folder. You should build with cuda support for the best results.
- Put `ggml-base.en.bin` in the models folder. (this file can be downloaded with a script in the whisper.cpp repo)
- Build the addon with `node-gyp build`
- Set discord token in `.env` file.
- Use `permissions=35186522721280&scope=bot` for the invite link. This is more permisive than required, but I didn't find the minimal working permisions.
- Go clone [coqui-ai/tts](https://github.com/coqui-ai/TTS) and install the package. (use python 3.10.11) Make sure and have gpu support enabled.
- Instal node dependencies (`npm install`) and build the bot (`tsc`)
- `python bot.py` to run the bot.
- Use ctrl-z followed by `./kill.sh` to kill the bot if ctrl-c causes it to hang.

### Notes / Thoughts

- I would like to explore other tts options that support local models with emotions.
- Assuming we keep using coqui-tts, I will fix the patch so that it properly allows bypassing the sentencizer.
- It might remove a small amount of latency to not use the filesystem to get the tts generation results to the bot. (not worth the effort until we know that we are for sure using coqui-tts)
