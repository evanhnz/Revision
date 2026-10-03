#!/usr/bin/env python3
"""
Synthèse vocale locale des scripts de podcast.

Appelé par « scripts/podcasts.mjs ». Rien ne sort de la machine : le modèle de
voix est un fichier ONNX local, la synthèse tourne sur le processeur, et aucun
service tiers n'est sollicité.

Deux moteurs, tous deux gratuits :

  - « kokoro » (par défaut) : modèle multilingue Kokoro v1.0, voix française
    « ff_siwis ». Diction nettement plus naturelle, mais plus lente à produire.
  - « piper » : modèle VITS de Piper. Environ cinq fois plus rapide, diction
    plus mécanique — utile pour un essai, ou sur une machine modeste.

Chaque script est découpé en paragraphes ; une courte respiration les sépare,
une plus courte sépare les phrases. Le résultat est encodé en MP3 mono à bas
débit — de la parole, pas de la musique.
"""
import argparse
import json
import os
import re
import subprocess
import sys
import tempfile
import wave

# Un processus de synthèse par cœur, chacun mono-thread. Par défaut,
# onnxruntime ouvre autant de threads qu'il y a de cœurs : quatre processus se
# disputeraient alors seize threads sur quatre cœurs, et l'ensemble irait plus
# lentement qu'un seul.
import onnxruntime

_OPTIONS = onnxruntime.SessionOptions


def _options_mono():
    options = _OPTIONS()
    options.intra_op_num_threads = 1
    options.inter_op_num_threads = 1
    return options


def identifiant_de_voix(modele: str, nom: str) -> int:
    """
    Traduit un nom de voix Kokoro (« ff_siwis ») en identifiant de locuteur.
    La table est publiée dans les métadonnées du modèle : la lire évite de
    recopier ici une numérotation qui peut changer d'une version à l'autre.
    """
    session = onnxruntime.InferenceSession(modele, providers=["CPUExecutionProvider"])
    table = session.get_modelmeta().custom_metadata_map.get("speaker2id", "")
    for paire in table.split(","):
        if "->" in paire:
            voix, identifiant = paire.split("->")
            if voix.strip() == nom:
                return int(identifiant)
    raise SystemExit(f"Voix « {nom} » absente du modèle. Voix connues : {table[:300]}")


def lire_script(chemin: str) -> list[str]:
    """Paragraphes d'un fichier « .podcast.md », front-matter écarté."""
    with open(chemin, encoding="utf8") as f:
        brut = f.read()
    if brut.startswith("---"):
        fin = brut.find("\n---", 3)
        if fin != -1:
            brut = brut[brut.find("\n", fin + 1) + 1 :]
    return [p.strip() for p in re.split(r"\n\s*\n", brut) if p.strip()]


def silence(secondes: float, taux: int) -> bytes:
    return b"\x00\x00" * int(secondes * taux)


class MoteurPiper:
    """Piper : un modèle VITS par voix, rapide, diction un peu mécanique."""

    def __init__(self, args):
        onnxruntime.SessionOptions = _options_mono
        from piper import PiperVoice, SynthesisConfig

        self.voix = PiperVoice.load(args.modele)
        # Chez Piper, « length_scale » allonge les phonèmes : au-dessus de 1,
        # la diction ralentit. C'est l'inverse de la vitesse demandée.
        self.config = SynthesisConfig(length_scale=1.0 / args.vitesse)
        self.taux = self.voix.config.sample_rate

    def phrases(self, paragraphe):
        for bloc in self.voix.synthesize(paragraphe, self.config):
            yield bloc.audio_int16_bytes


class MoteurKokoro:
    """
    Kokoro : un seul modèle multilingue, une voix par identifiant de locuteur.

    sherpa-onnx découpe lui-même le texte en phrases ; on lui en laisse le
    soin, phrase par phrase, pour intercaler nos propres respirations.
    """

    def __init__(self, args):
        import numpy as np
        import sherpa_onnx

        self.np = np
        dossier = os.path.dirname(args.modele)
        config = sherpa_onnx.OfflineTtsConfig(
            model=sherpa_onnx.OfflineTtsModelConfig(
                kokoro=sherpa_onnx.OfflineTtsKokoroModelConfig(
                    model=args.modele,
                    voices=os.path.join(dossier, "voices.bin"),
                    tokens=os.path.join(dossier, "tokens.txt"),
                    data_dir=os.path.join(dossier, "espeak-ng-data"),
                    dict_dir=os.path.join(dossier, "dict"),
                    lexicon=",".join(
                        os.path.join(dossier, nom)
                        for nom in ("lexicon-us-en.txt", "lexicon-zh.txt")
                    ),
                    lang="fr",
                ),
                num_threads=1,
                provider="cpu",
            ),
            max_num_sentences=1,
        )
        self.tts = sherpa_onnx.OfflineTts(config)
        self.locuteur = identifiant_de_voix(args.modele, args.voix)
        self.vitesse = args.vitesse
        self.taux = self.tts.sample_rate

    def phrases(self, paragraphe):
        son = self.tts.generate(paragraphe, sid=self.locuteur, speed=self.vitesse)
        yield (self.np.array(son.samples) * 32767).astype("<i2").tobytes()


def synthetiser(moteur, paragraphes, args):
    """Concatène les phrases synthétisées, avec les silences intercalaires."""
    morceaux = []
    for i, paragraphe in enumerate(paragraphes):
        if i:
            morceaux.append(silence(args.silence_paragraphe / 1000, moteur.taux))
        for j, bloc in enumerate(moteur.phrases(paragraphe)):
            if j:
                morceaux.append(silence(args.silence_phrase / 1000, moteur.taux))
            morceaux.append(bloc)
    return b"".join(morceaux)


# Réglages d'encodage, par format. Opus : le débit demandé est une moyenne
# (VBR), les silences ne coûtent donc presque rien ; « compression_level 10 »
# est le plus lent et le plus efficace, ce qui n'a pas d'importance à côté du
# temps de synthèse.
ENCODAGE = {
    "opus": ["-c:a", "libopus", "-vbr", "on", "-compression_level", "10",
             "-application", "audio", "-f", "ogg"],
    "mp3": ["-c:a", "libmp3lame", "-f", "mp3"],
}


def encoder(ffmpeg: str, brut: bytes, taux: int, sortie: str, debit: str, format_: str) -> None:
    """WAV en mémoire -> fichier compressé mono. Passe par un fichier
    temporaire : le fichier définitif n'apparaît qu'une fois complet."""
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        chemin_wav = tmp.name
    try:
        with wave.open(chemin_wav, "wb") as w:
            w.setnchannels(1)
            w.setsampwidth(2)
            w.setframerate(taux)
            w.writeframes(brut)
        provisoire = sortie + ".part"
        subprocess.run(
            [ffmpeg, "-y", "-loglevel", "error", "-i", chemin_wav,
             "-ac", "1", "-b:a", debit, *ENCODAGE[format_], provisoire],
            check=True,
        )
        os.replace(provisoire, sortie)
    finally:
        os.unlink(chemin_wav)


def main() -> int:
    a = argparse.ArgumentParser()
    a.add_argument("--moteur", choices=("kokoro", "piper"), default="kokoro")
    a.add_argument("--modele", required=True, help="fichier .onnx de la voix")
    a.add_argument("--voix", default="ff_siwis", help="nom de la voix (kokoro)")
    a.add_argument("--taches", required=True, help="fichier JSON des tâches")
    a.add_argument("--part", type=int, default=0)
    a.add_argument("--parts", type=int, default=1)
    a.add_argument("--vitesse", type=float, default=1.0)
    a.add_argument("--silence-paragraphe", type=float, default=520)
    a.add_argument("--silence-phrase", type=float, default=170)
    a.add_argument("--bitrate", default="16k")
    a.add_argument("--format", default="opus", choices=tuple(ENCODAGE))
    a.add_argument("--ffmpeg", default="ffmpeg")
    args = a.parse_args()

    with open(args.taches, encoding="utf8") as f:
        taches = [t for i, t in enumerate(json.load(f)) if i % args.parts == args.part]
    if not taches:
        return 0

    moteur = MoteurKokoro(args) if args.moteur == "kokoro" else MoteurPiper(args)

    for tache in taches:
        try:
            brut = synthetiser(moteur, lire_script(tache["script"]), args)
            encoder(args.ffmpeg, brut, moteur.taux, tache["sortie"], args.bitrate, args.format)
            print(json.dumps({
                "id": tache["id"],
                "secondes": round(len(brut) / 2 / moteur.taux, 1),
                "octets": os.path.getsize(tache["sortie"]),
            }), flush=True)
        except Exception as erreur:  # une fiche en échec n'arrête pas les autres
            print(json.dumps({"id": tache["id"], "erreur": str(erreur)}), flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
