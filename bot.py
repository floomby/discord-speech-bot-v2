from TTS.api import TTS
import socket
import os
import signal
import subprocess

model_name = "tts_models/en/jenny/jenny"

tts = TTS(model_name, gpu=True)

output_dir = "tts_output"
canned_responses_dir = "canned_responses"

if not os.path.exists(canned_responses_dir):
  os.makedirs(canned_responses_dir)

canned_responses = {}
canned_responses["think_0"] = "Hmm, I need a moment to think about that."
canned_responses["think_1"] = "Let me think about that for a moment."
canned_responses["think_2"] = "Give me a moment to think about that."
canned_responses["think_3"] = "Allow me to consider that for a moment."
canned_responses["think_4"] = "I need a moment to think."
canned_responses["think_5"] = "Let me think about that."
canned_responses["think_6"] = "Give me a moment to think."
canned_responses["think_7"] = "Allow me to consider that."
canned_responses["think_8"] = "This is a tough one, let me think about that."
canned_responses["think_9"] = "Hmm, this is a tough one, let me think about that."

canned_responses["sensors_0"] = "I'm not sure, let me check my sensors."
canned_responses["sensors_1"] = "I am going to use my sensors."
canned_responses["sensors_2"] = "I need to use my sensors."
canned_responses["sensors_3"] = "I will check my sensors."
canned_responses["sensors_4"] = "I will use my sensors to find out."
canned_responses["sensors_5"] = "I will use my sensors to figure that out."
canned_responses["sensors_6"] = "I am going to use my sensors to find the answer."
canned_responses["sensors_7"] = "I will use my sensors to figure out the answer."
canned_responses["sensors_8"] = "I will use my sensors to find the solution."
canned_responses["sensors_9"] = "My sensors will help me find the solution."

canned_responses["consult_0"] = "I need to consult my encyclopedia."
canned_responses["consult_1"] = "I will consult my encyclopedia."
canned_responses["consult_2"] = "My encyclopedia will help me find the answer."
canned_responses["consult_3"] = "Encyclopedias are elucidating, I will consult mine."
canned_responses["consult_4"] = "I will consult my encyclopedia to find the answer."
canned_responses["consult_5"] = "An encyclopedia may help me find the answer, I will consult mine."
canned_responses["consult_6"] = "I will consult my encyclopedia to find the solution."
canned_responses["consult_7"] = "An encyclopedia may guide me to the solution, I will consult mine."
canned_responses["consult_8"] = "I will consult my encyclopedia to help me find the solution."
canned_responses["consult_9"] = "I have a good encyclopedia, I will consult it to find the solution."

for response in canned_responses:
  if not os.path.exists(f"{canned_responses_dir}/{response}.wav"):
    tts.tts_to_file(canned_responses[response], file_path=f"{canned_responses_dir}/{response}.wav", emotion="Neutral")

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
