## New Discord Bot Project

### Getting Started

- Build whisper.cpp then place `libwhisper.so` and `whisper.h` in the `deps` folder.
- Put `ggml-base.en.bin` in the models folder. (this file can be downloaded with a script in the whisper.cpp repo)
- `node-gyp build`
- Set discord token in `.env` file
- `permissions=35186522721280&scope=bot` for the invite link
- `tsc && node bot.js`
