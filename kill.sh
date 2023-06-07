#!/bin/bash

# kill all node and python processes in this shell

kill -9 $(ps | grep 'node' | awk '{print $1}')
kill -9 $(ps | grep 'python' | awk '{print $1}')
