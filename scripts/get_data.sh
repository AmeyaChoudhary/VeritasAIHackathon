#!/usr/bin/env bash
# Downloads the open data the experiments use into data/ (which git ignores).
#   College Experience Study (Dartmouth), CC BY-NC-SA 4.0, about 560 MB of the 2.76 GB release.
#   GoEmotions (Google), Apache-2.0, about 3.5 MB.
# By downloading the College Experience Study you agree to its terms of use:
# academic, research or educational use only, and no attempt to re-identify anyone.
# https://www.kaggle.com/datasets/subigyanepal/college-experience-dataset
set -euo pipefail
cd "$(dirname "$0")/.."

KAGGLE="https://www.kaggle.com/api/v1/datasets/download/subigyanepal/college-experience-dataset"
CES_FILES=(
  "Readme.md"
  "Sensing/Data Dictionary (Daily).csv"
  "Sensing/Data Dictionary (Hourly).csv"
  "Sensing/steps.csv"
  "Sensing/sensing.csv"
  "EMA/general_ema.csv"
  "EMA/Data Dictionary (general EMA).csv"
  "Demographics/demographics.csv"
  "Demographics/Data Dictionary.csv"
)

for f in "${CES_FILES[@]}"; do
  out="data/ces/$f"
  mkdir -p "$(dirname "$out")"
  if [ -s "$out" ]; then echo "have  $out"; continue; fi
  # Kaggle wants the folder slash encoded as %2F; spaces and brackets are encoded too.
  enc=$(python3 -c 'import sys, urllib.parse; print(urllib.parse.quote(sys.argv[1], safe=""))' "$f")
  echo "get   $out"
  curl -sS -L --fail --retry 3 -A "Mozilla/5.0" -o "$out" "$KAGGLE/$enc"
done

HF="https://huggingface.co/datasets/google-research-datasets/go_emotions/resolve/main/simplified"
mkdir -p data/goemotions
for s in train validation test; do
  out="data/goemotions/$s.parquet"
  if [ -s "$out" ]; then echo "have  $out"; continue; fi
  echo "get   $out"
  curl -sS -L --fail --retry 3 -o "$out" "$HF/$s-00000-of-00001.parquet"
done

# External checks for Experiment 1b.
# Depresjon (Simula): cite Garcia-Ceja et al., MMSys 2018. About 5 MB.
mkdir -p data/depresjon
if [ ! -s data/depresjon/depresjon.zip ]; then
  echo "get   data/depresjon/depresjon.zip"
  curl -sS -L --fail --retry 3 -o data/depresjon/depresjon.zip "https://datasets.simula.no/downloads/depresjon.zip"
fi
[ -d data/depresjon/data ] || unzip -q -o data/depresjon/depresjon.zip -d data/depresjon

# StudentLife 2013, RData copy on Zenodo (record 3529253), CC BY 4.0: cite Wang et al., UbiComp 2014. About 230 MB.
mkdir -p data/studentlife
if [ ! -s data/studentlife/dataset_rds.zip ]; then
  echo "get   data/studentlife/dataset_rds.zip"
  curl -sS -L --fail --retry 3 -o data/studentlife/dataset_rds.zip "https://zenodo.org/records/3529253/files/dataset_rds.zip?download=1"
fi
[ -d data/studentlife/dataset_rds ] || unzip -q -o data/studentlife/dataset_rds.zip -d data/studentlife

echo "Done."
