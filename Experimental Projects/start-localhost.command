#!/bin/bash
cd "$(dirname "$0")"
open "http://localhost:8000/Light-and-Shadow.html" 2>/dev/null || xdg-open "http://localhost:8000/Light-and-Shadow.html" 2>/dev/null
python3 -m http.server 8000
