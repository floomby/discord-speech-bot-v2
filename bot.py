from TTS.api import TTS
import socket
import os
import signal
import subprocess

model_name = "tts_models/en/jenny/jenny"

tts = TTS(model_name, gpu=True)

output_dir = "tts_output"

# ensure output directory exists
if not os.path.exists(output_dir):
  os.makedirs(output_dir)

# remove all files in output directory
for file in os.listdir(output_dir):
  os.remove(os.path.join(output_dir, file))

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
command = "node --trace-warnings bot.js"
bot_process = subprocess.Popen(command, shell=True)

# Define a signal handler function
def signal_handler(sig, frame):
  print("Received signal, cleaning up...")
  # Terminate the subprocess
  bot_process.terminate()
  # Close the socket
  sock.close()
  # Exit the script
  exit(0)

# Register the signal handler function
signal.signal(signal.SIGINT, signal_handler)

# Accept incoming connections and receive messages
while True:
  conn, addr = sock.accept()
  data = conn.recv(16384)
  if not data:
    break
  message = data.decode("utf-8")
  # the nonce is the first part of the message before the first space
  nonce = message.split(" ")[0]
  message = message[len(nonce) + 1:]
  print(f"Received message: {message}")
  tts.tts_to_file(message, file_path=f"{output_dir}/{nonce}.wav", emotion="Neutral")
  conn.close()

# Close the socket
sock.close()
bot_process.wait()
