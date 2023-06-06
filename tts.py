from TTS.api import TTS
import socket
import os
import subprocess

model_name = "tts_models/en/jenny/jenny"

tts = TTS(model_name, gpu=True)
# tts.tts_to_file("Hello world! I am charlie the ai assistant", file_path="out.wav", emotion="Happy")

output_dir = "tts_output"

# ensure output directory exists
if not os.path.exists(output_dir):
  os.makedirs(output_dir)

# Create a Unix socket
sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)

# Bind the socket to a file path
socket_file = "socket"
if os.path.exists(socket_file):
  os.remove(socket_file)
sock.bind(socket_file)

# Listen for incoming connections
sock.listen()

# now we just want to launch the bot with node bot.js
command = "node bot.js"
bot_process = subprocess.Popen(command, shell=True)

# Accept incoming connections and receive messages
while True:
  conn, addr = sock.accept()
  data = conn.recv(16384)
  if not data:
    break
  message = data.decode("utf-8")
  # the nonce is the first number at the start of the message
  nonce = int(message.split(" ")[0])
  message = message[len(str(nonce)) + 1:]
  print(f"Received message: {message}")
  tts.tts_to_file(message, file_path=f"{output_dir}/{nonce}.wav", emotion="Neutral")
  conn.close()

# Close the socket
sock.close()
bot_process.wait()