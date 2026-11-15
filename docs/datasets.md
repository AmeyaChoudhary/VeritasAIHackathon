# Datasets

Every dataset the experiments use, with its licence and the paper to cite. `scripts/get_data.sh` downloads them all into `data/`, which git ignores. Every number we publish from them is an aggregate.

| Dataset | Used in | Licence | Cite |
| --- | --- | --- | --- |
| [College Experience Study](https://www.kaggle.com/datasets/subigyanepal/college-experience-dataset) (Dartmouth) | Experiments 1, 1b, 3, 4 | CC BY-NC-SA 4.0. Research and teaching only, no attempt to re-identify anyone | Nepal et al., IMWUT 2024 |
| [GoEmotions](https://huggingface.co/datasets/google-research-datasets/go_emotions) (Google) | Experiments 2, 2b | Apache-2.0 | Demszky et al., ACL 2020 |
| [Suicide and Depression Detection](https://www.kaggle.com/datasets/nikhileswarkomati/suicide-watch) | Experiment 5 | CC BY-SA 4.0 | Komati et al., IEEE 2021 |
| [Sentiment Analysis for Mental Health](https://www.kaggle.com/datasets/szegeelim/mental-health) | Experiment 5 | ODbL | Sze Gee Lim |
| [Reddit C-SSRS](https://zenodo.org/records/4543776) | Experiment 5b | CC BY 4.0 | Gaur et al., WWW 2019 |
| [Corona Health, adolescents](https://zenodo.org/records/15101756) (University of Wurzburg) | Experiment 6 | CC BY 4.0 | University of Wurzburg |
| [Depresjon](https://datasets.simula.no/depresjon/) (Simula) | Experiment 1b | See the dataset page | Garcia-Ceja et al., MMSys 2018 |
| [StudentLife](https://zenodo.org/records/3529253) | Experiment 1b | CC BY 4.0 | Wang et al., UbiComp 2014 |
| [Youth Risk Behavior Survey](https://www.cdc.gov/yrbs/data/index.html) 2023 and 2025, national high school (CDC) | Experiment 7 | Public domain | CDC |
| [NHANES](https://wwwn.cdc.gov/nchs/nhanes/) August 2021 to August 2023, PHQ-9 and demographics (CDC) | Experiment 7 | Public domain | CDC, NCHS |
| [Music & Mental Health survey](https://www.kaggle.com/datasets/catherinerasgaitis/mxmh-survey-results) | Experiment 8 | CC0 | Rasgaitis, 2022 |
| [Spotify Tracks Dataset](https://huggingface.co/datasets/maharshipandya/spotify-tracks-dataset) | Experiment 8; the app's music mood table | BSD | Pandya |
| [Online Gaming Anxiety Data](https://www.kaggle.com/datasets/divyansh22/online-gaming-anxiety-data) | Experiment 8 | As listed on Kaggle | Sauter and Draschkow survey |
| [Social Media and Mental Health](https://www.kaggle.com/datasets/souvikahmed071/social-media-and-mental-health) | Experiment 8 | As listed on Kaggle | Ahmed |
| [Dreaddit](https://huggingface.co/datasets/andreagasparini/dreaddit) | Experiment 8 | Research use | Turcan and McKeown, 2019 |

The app ships three things built from these: the ask model (`app/src/engine/ask_model.json`, from the College Experience Study), the tone and self-harm models (`app/public/models/tone.json` and `risk.json`), and the music mood table (`app/public/models/music_mood.json`, built by `scripts/build_music_mood.py` from the Spotify Tracks Dataset).
