## Charlie Bot

### Getting Started

- You will need to setup a service account with access to the google speech to text api. This should take the form of a json key file. This is expected to be found at `keys/key.json`
- Set up variables in `.env` (see `.env.example` for an example)
- Use `permissions=35186522721280&scope=bot` for the invite link. This is more permissive than required, but I didn't find the minimal working permissions.
- Go clone [coqui-ai/tts](https://github.com/coqui-ai/TTS) and install the package. (use python 3.10.11) Make sure and have gpu support enabled.
- Instal node dependencies (`npm install`) and build the bot (`tsc`)
- `npm run start` to run the bot.
- Use ctrl-z followed by `./kill.sh` to kill the bot if ctrl-c causes it to hang.

### Creating Packages

- I have create one tool that can do this: [fandom wiki packager](https://github.com/floomby/fandom-wiki-packager)

### Short Term Roadmap

- Refactoring conversation stuff
- Context detection
- Multi guild support
- Work on writing some more regression tests against the prompts to get better coverage
