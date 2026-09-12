#!/usr/bin/env python3
import sys
import cv2

if len(sys.argv) != 2:
    raise SystemExit(2)
image = cv2.imread(sys.argv[1])
if image is None:
    raise SystemExit(3)
gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
cascade_path = cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
cascade = cv2.CascadeClassifier(cascade_path)
faces = cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5, minSize=(36, 36))
if len(faces) < 1:
    raise SystemExit(4)
print("face-region-found")
